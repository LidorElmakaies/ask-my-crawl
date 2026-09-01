import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { startPostgresTestContainer } from '@app/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { JobEntity } from './entities/job.entity';
import { TypeOrmJobRepository } from './typeorm-job.repository';

// Infrastructure-integration tier — real Postgres via testcontainers, no mocking. See
// jest-integration.config.js. Run via `npm run test:integration` (requires Docker).
describe('TypeOrmJobRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repo: Repository<JobEntity>;
  let jobRepository: TypeOrmJobRepository;

  beforeAll(async () => {
    container = await startPostgresTestContainer();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [JobEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    repo = dataSource.getRepository(JobEntity);
    jobRepository = new TypeOrmJobRepository(repo);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  afterEach(async () => {
    await repo.clear();
  });

  it('create() generates a uuid id and stores exactly the 3 fields plus result/failed_reason: null', async () => {
    const input = {
      user_id: randomUUID(),
      url: 'https://example.com/page',
      query: 'what is this page about?',
    };

    const job = await jobRepository.create(input);

    expect(job.id).toEqual(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
    );
    expect(job).toEqual({
      id: job.id,
      result: null,
      failed_reason: null,
      ...input,
    });

    const row = await repo.findOneBy({ id: job.id });
    expect(row).toMatchObject({ ...input, result: null, failed_reason: null });
  });

  it('saveResult() updates result, clears failed_reason, and returns the updated row', async () => {
    const created = await jobRepository.create({
      user_id: randomUUID(),
      url: 'https://example.com/other-page',
      query: 'another question',
    });

    const updated = await jobRepository.saveResult(created.id, 'the answer');

    expect(updated).toEqual({
      ...created,
      result: 'the answer',
      failed_reason: null,
    });
    const row = await repo.findOneBy({ id: created.id });
    expect(row?.result).toBe('the answer');
  });

  it('saveFailure() sets failed_reason and leaves result untouched', async () => {
    const created = await jobRepository.create({
      user_id: randomUUID(),
      url: 'https://example.com/failure-page',
      query: 'a question',
    });

    const updated = await jobRepository.saveFailure(created.id, 'boom');

    expect(updated).toEqual({ ...created, failed_reason: 'boom' });
    const row = await repo.findOneBy({ id: created.id });
    expect(row?.failed_reason).toBe('boom');
    expect(row?.result).toBeNull();
  });

  it('clearFailureForRetry() clears failed_reason', async () => {
    const created = await jobRepository.create({
      user_id: randomUUID(),
      url: 'https://example.com/retry-page',
      query: 'a question',
    });
    await jobRepository.saveFailure(created.id, 'boom');

    const updated = await jobRepository.clearFailureForRetry(created.id);

    expect(updated?.failed_reason).toBeNull();
    const row = await repo.findOneBy({ id: created.id });
    expect(row?.failed_reason).toBeNull();
  });

  it('saveResult() on an unknown id returns null', async () => {
    const result = await jobRepository.saveResult(
      '00000000-0000-0000-0000-000000000000',
      'nobody home',
    );

    expect(result).toBeNull();
  });
});
