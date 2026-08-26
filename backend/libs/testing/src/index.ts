// Shared testcontainers bootstrap helpers for Infrastructure-integration and E2E tests across
// every app in this monorepo. Test-only — never imported from application/production code.
export * from './postgres-test-container';
export * from './kafka-test-container';
