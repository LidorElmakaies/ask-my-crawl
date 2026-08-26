// DI injection tokens for the Job Manager Service app. Application-layer and Infrastructure-layer
// classes are only ever referenced by their interface + token — never imported by concrete class
// name outside job-manager.module.ts. See docs/specs/backend-architecture.md.

export const CREATE_JOB_USE_CASE = Symbol('ICreateJobUseCase');
export const SAVE_JOB_RESULT_USE_CASE = Symbol('ISaveJobResultUseCase');
export const JOB_REPOSITORY = Symbol('IJobRepository');
export const EVENT_PUBLISHER = Symbol('IEventPublisher');
