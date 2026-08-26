// Shared testcontainers-Postgres bootstrap for Infrastructure-integration and E2E tests. Extracted
// here per docs/specs (testing agent's "second app needing the same testcontainers-Postgres
// pattern" rule) — Job Manager Service is that second app (Auth Service was the first, with its
// own hand-rolled copy in apps/auth/test/app.e2e-spec.ts, left as-is rather than risking a
// refactor of an already-passing suite for this change).
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/** Same image across every app's Postgres-backed test — keep this the single place that pins it. */
export const POSTGRES_TEST_IMAGE = 'postgres:16-alpine';

export async function startPostgresTestContainer(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGRES_TEST_IMAGE).start();
}
