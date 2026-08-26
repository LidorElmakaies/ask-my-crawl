const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

// Infrastructure-integration tier: real dependency via testcontainers (Postgres, Kafka, ...),
// never mocked — distinct from jest.config.js's Application-layer unit tier (mocked interfaces,
// no I/O) per docs/specs/backend-architecture.md's layering. Colocated next to the adapter under
// test, suffixed `.integration-spec.ts` so `jest.config.js`'s `.spec.ts$` unit-test regex never
// picks these up and tries to run them without Docker.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.integration-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/',
  }),
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/', '<rootDir>/libs/'],
  // Starting real Postgres/Kafka containers takes longer than Jest's 5s default.
  testTimeout: 120000,
};
