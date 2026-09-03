// Dev-only debug tool — NOT part of any deployed app, NOT built by `npm run build`. Seeds a real
// crawl the exact same way the Gateway does (a real `job-requests` message, no shortcuts), then
// tails `job-created`/`page-scraped`/`crawl-complete` to pull down every saved SeaweedFS blob for
// that one job onto the local disk, so a page's raw HTML can be eyeballed without hand-running
// kafka-console-producer/consumer + aws s3 cp, like docs/planning/03-crawler-scraper-indexing-
// plan.md's own verification steps do manually.
//
// Requires the real stack to already be running (`devops/`'s docker compose — Kafka on
// localhost:9092, SeaweedFS's S3 API on localhost:8333, per devops/docker-compose.yml's host port
// mappings) and a real user_id already in the `users` table (this script never touches Postgres
// itself — that's Auth Service's table, not this tool's to read — so it can't look one up for you).
//
// Usage (from backend/):
//   npx ts-node -r tsconfig-paths/register scripts/debug-crawl.ts \
//     --url https://example.com --user-id <uuid> [--query "..."] [--depth N] [--out ./debug-crawls] [--timeout 180]
//
// The query sent on job-requests gets a `[debug-crawl:<nonce>]` tag prepended — that's what lets
// this script find its own job-created message on a topic it didn't produce job_id on (Job Manager
// Service generates job_id, not the caller), by exact (user_id, url, query) match, without
// depending on timing/ordering. The tag ends up stored in the real `jobs.query` column like any
// other job — a visible, intentional marker that a row came from this tool, not a side effect to
// work around.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import {
  KAFKA_TOPICS,
  type CrawlCompleteMessage,
  type JobCreatedMessage,
  type JobRequestsMessage,
  type PageScrapedMessage,
} from '@app/kafka-contracts';

// This script talks to Kafka directly, bypassing the Gateway — so the Gateway's depth ceiling
// doesn't apply here. Just a sane local default for this dev tool.
const DEFAULT_DEBUG_CRAWL_DEPTH = 10;

// --- tiny .env loader — no dotenv dependency in this project, and this script runs outside Nest's
// own ConfigModule wiring, so it reads backend/.env itself (KEY=VALUE per line, `#` comments, same
// file every app already reads).
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv(resolve(__dirname, '../.env'));

// --- CLI args
interface Args {
  url: string;
  userId: string;
  query: string;
  depth: number;
  outDir: string;
  timeoutSeconds: number;
  brokers: string[];
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const url = get('--url');
  const userId = get('--user-id');
  if (!url || !userId) {
    console.error(
      'Usage: ts-node scripts/debug-crawl.ts --url <url> --user-id <uuid> [--query "..."] [--out <dir>] [--timeout <seconds>]\n' +
        '  --user-id must already exist in the users table — this script does not create one.\n' +
        '  Find one with: docker exec devops-postgres-1 psql -U postgres -d askmycrawl -c "SELECT id, email FROM users;"',
    );
    process.exit(1);
  }

  const depth = Number(get('--depth') ?? DEFAULT_DEBUG_CRAWL_DEPTH);
  if (!Number.isInteger(depth) || depth < 1) {
    console.error(`--depth must be a positive integer, got: ${depth}`);
    process.exit(1);
  }

  return {
    url,
    userId,
    query: get('--query') ?? 'debug crawl',
    depth,
    outDir: resolve(get('--out') ?? join(__dirname, '../../debug-crawls')),
    timeoutSeconds: Number(get('--timeout') ?? '180'),
    brokers: (process.env.DEBUG_CRAWL_KAFKA_BROKERS ?? 'localhost:9092').split(','),
  };
}

// Matches this tool's own downloaded-file naming to the same scheme used when manually inspecting
// SeaweedFS blobs — pathname + query string, sanitized, `.html` appended.
function filenameFor(normalizedUrl: string): string {
  const u = new URL(normalizedUrl);
  const path = u.pathname === '/' ? 'index' : u.pathname.replace(/^\//, '').replace(/\//g, '_');
  const search = u.search ? '_' + u.search.replace(/[^a-zA-Z0-9]/g, '-') : '';
  return `${path || 'index'}${search}.html`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const seaweedEndpoint = process.env.SEAWEEDFS_ENDPOINT ?? 'http://localhost:8333';
  const bucket = process.env.SEAWEEDFS_BUCKET ?? 'askmycrawl-raw-html';
  const s3 = new S3Client({
    endpoint: seaweedEndpoint,
    forcePathStyle: true,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.SEAWEEDFS_ACCESS_KEY ?? '',
      secretAccessKey: process.env.SEAWEEDFS_SECRET_KEY ?? '',
    },
  });

  const nonce = randomBytes(4).toString('hex');
  const taggedQuery = `[debug-crawl:${nonce}] ${args.query}`;

  const runDir = join(
    args.outDir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}_${new URL(args.url).hostname}`,
  );
  mkdirSync(runDir, { recursive: true });

  const kafka = new Kafka({ clientId: `debug-crawl-${nonce}`, brokers: args.brokers });
  const producer: Producer = kafka.producer();
  const consumer: Consumer = kafka.consumer({ groupId: `debug-crawl-${nonce}` });

  let jobId: string | undefined;
  const pageScrapedBuffer: PageScrapedMessage[] = [];
  const completeBuffer: CrawlCompleteMessage[] = [];
  const downloaded = new Set<string>();
  const manifest: { url: string; blobKey: string; file: string; bytes: number }[] = [];
  let finished = false;
  let resolveFinished!: () => void;
  const finishedPromise = new Promise<void>((res) => {
    resolveFinished = res;
  });

  async function downloadBlob(msg: PageScrapedMessage): Promise<void> {
    if (downloaded.has(msg.blobKey)) return;
    downloaded.add(msg.blobKey);
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: msg.blobKey }),
    );
    const bytes = await obj.Body!.transformToByteArray();
    const filename = filenameFor(msg.normalizedUrl);
    writeFileSync(join(runDir, filename), Buffer.from(bytes));
    manifest.push({ url: msg.normalizedUrl, blobKey: msg.blobKey, file: filename, bytes: bytes.length });
    console.log(`  saved ${filename} (${bytes.length} bytes) <- ${msg.normalizedUrl}`);
  }

  async function processBuffers(): Promise<void> {
    if (!jobId) return;
    const readyPages = pageScrapedBuffer.filter((m) => m.job_id === jobId);
    for (const page of readyPages) {
      await downloadBlob(page);
    }
    const complete = completeBuffer.find((m) => m.job_id === jobId);
    if (complete && !finished) {
      // Grace period: crawl-complete can be consumed slightly ahead of a same-job page-scraped
      // message still sitting in a different partition, even though it was produced earlier — see
      // this file's own header comment. Re-scan once more before declaring done.
      await new Promise((res) => setTimeout(res, 3000));
      for (const page of pageScrapedBuffer.filter((m) => m.job_id === jobId)) {
        await downloadBlob(page);
      }
      finished = true;
      writeFileSync(
        join(runDir, 'manifest.json'),
        JSON.stringify({ job_id: jobId, crawl_complete: complete, files: manifest }, null, 2),
      );
      console.log(
        `\nDone. succeeded_count=${complete.succeeded_count} failed_count=${complete.failed_count} ` +
          `files_downloaded=${manifest.length}\nOutput: ${runDir}`,
      );
      resolveFinished();
    }
  }

  await producer.connect();
  await consumer.connect();
  // fromBeginning: false, not true — this consumer group is always brand-new (nonce-scoped
  // groupId), so "false" means "start from whatever's latest at join time," not "replay the
  // topic's full retention." These topics accumulate a lot of history across every prior test run
  // in this project — scanning all of it before reaching live traffic made the very first version
  // of this script falsely report 0 files downloaded (crawl-complete for our job got consumed
  // before this job's own page-scraped backlog was caught up to).
  await consumer.subscribe({ topic: KAFKA_TOPICS.JOB_CREATED, fromBeginning: false });
  await consumer.subscribe({ topic: KAFKA_TOPICS.PAGE_SCRAPED, fromBeginning: false });
  await consumer.subscribe({ topic: KAFKA_TOPICS.CRAWL_COMPLETE, fromBeginning: false });

  const runPromise = consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const value: unknown = JSON.parse(message.value.toString());

      if (topic === KAFKA_TOPICS.JOB_CREATED) {
        const m = value as JobCreatedMessage;
        if (m.user_id === args.userId && m.url === args.url && m.query === taggedQuery) {
          jobId = m.job_id;
          console.log(`job created: ${jobId}`);
          await processBuffers();
        }
      } else if (topic === KAFKA_TOPICS.PAGE_SCRAPED) {
        pageScrapedBuffer.push(value as PageScrapedMessage);
        await processBuffers();
      } else if (topic === KAFKA_TOPICS.CRAWL_COMPLETE) {
        completeBuffer.push(value as CrawlCompleteMessage);
        await processBuffers();
      }
    },
  });

  // Wait for the consumer group to actually finish joining/get partitions assigned before
  // producing — otherwise the job-requests send below can race ahead of consumer.run()'s
  // subscription setup and this script would sit waiting for a job-created it already missed.
  await new Promise<void>((res) => {
    consumer.on(consumer.events.GROUP_JOIN, () => res());
  });

  const seedMessage: JobRequestsMessage = {
    user_id: args.userId,
    url: args.url,
    query: taggedQuery,
    depth: args.depth,
  };
  await producer.send({
    topic: KAFKA_TOPICS.JOB_REQUESTS,
    messages: [{ key: args.userId, value: JSON.stringify(seedMessage) }],
  });
  console.log(`Seeded job-requests for ${args.url} (tag: debug-crawl:${nonce}). Waiting...`);

  const timeout = new Promise<void>((res) => {
    setTimeout(() => {
      if (!finished) {
        console.warn(
          `\nTimed out after ${args.timeoutSeconds}s — no crawl-complete seen yet` +
            (jobId ? ` for job ${jobId}` : ' (job-created not even seen — check user_id exists)') +
            `. ${manifest.length} file(s) downloaded so far in ${runDir}.`,
        );
      }
      resolveFinished();
    }, args.timeoutSeconds * 1000);
  });

  await Promise.race([finishedPromise, timeout]);

  await consumer.disconnect();
  await producer.disconnect();
  await runPromise.catch(() => undefined);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
