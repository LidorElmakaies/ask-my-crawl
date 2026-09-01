/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import type { IRealtimeConnectionService } from '../application/interfaces/realtime-connection.interface';
import { JobUpdatesController } from './job-updates.controller';

describe('JobUpdatesController', () => {
  let controller: JobUpdatesController;
  let connectionService: jest.Mocked<IRealtimeConnectionService>;

  beforeEach(() => {
    connectionService = {
      handleConnect: jest.fn(),
      handleDisconnect: jest.fn(),
      pushToUser: jest.fn().mockReturnValue(true),
    };
    controller = new JobUpdatesController(connectionService);
  });

  it('pushes a formatted job.created event to the matching user connection', () => {
    controller.handleJobCreated({
      job_id: 'job-123',
      user_id: 'user-abc',
      url: 'https://example.com',
      query: 'What is this page?',
    });

    expect(connectionService.pushToUser).toHaveBeenCalledWith('user-abc', {
      type: 'job.created',
      job_id: 'job-123',
      user_id: 'user-abc',
      url: 'https://example.com',
      query: 'What is this page?',
    });
  });

  it('pushes a formatted job.completed event to the matching user connection', () => {
    controller.handleResultSaved({
      job_id: 'job-123',
      user_id: 'user-abc',
      result: 'The answer is 42',
      failed_reason: null,
    });

    expect(connectionService.pushToUser).toHaveBeenCalledWith('user-abc', {
      type: 'job.completed',
      job_id: 'job-123',
      result: 'The answer is 42',
      failed_reason: null,
    });
  });

  it('pushes a formatted job.completed event with failed_reason set when the job failed', () => {
    controller.handleResultSaved({
      job_id: 'job-123',
      user_id: 'user-abc',
      result: null,
      failed_reason: 'Failed after 5 attempts.',
    });

    expect(connectionService.pushToUser).toHaveBeenCalledWith('user-abc', {
      type: 'job.completed',
      job_id: 'job-123',
      result: null,
      failed_reason: 'Failed after 5 attempts.',
    });
  });
});
