/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import { Logger } from '@nestjs/common';
import { KAFKA_TOPICS, type AnswerReadyMessage } from '@app/kafka-contracts';
import type { IEventPublisher } from '@app/kafka-client';
import type { IJobRepository } from '../infrastructure/interfaces/job-repository.interface';
import type { Job } from '../models/job';
import { SaveJobResultService } from './save-job-result.service';

function makeDeps() {
  const jobRepository: jest.Mocked<IJobRepository> = {
    create: jest.fn(),
    saveResult: jest.fn(),
  };
  const eventPublisher: jest.Mocked<IEventPublisher> = {
    publish: jest.fn(),
  };
  return { jobRepository, eventPublisher };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    user_id: 'user-1',
    url: 'https://example.com/page',
    query: 'what is this page about?',
    result: null,
    ...overrides,
  };
}

describe('SaveJobResultService', () => {
  const input: AnswerReadyMessage = {
    job_id: 'job-1',
    user_id: 'user-1',
    answer_text: 'The answer is 42.',
  };

  it('saves the result via (job_id, answer_text) and publishes result-saved with the exact payload/key', async () => {
    const { jobRepository, eventPublisher } = makeDeps();
    const savedJob = makeJob({ result: 'The answer is 42.' });
    jobRepository.saveResult.mockResolvedValue(savedJob);

    const service = new SaveJobResultService(jobRepository, eventPublisher);
    await service.handle(input);

    expect(jobRepository.saveResult).toHaveBeenCalledWith(
      'job-1',
      'The answer is 42.',
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      KAFKA_TOPICS.RESULT_SAVED,
      savedJob.user_id,
      {
        job_id: savedJob.id,
        user_id: savedJob.user_id,
        result: savedJob.result,
      },
    );
  });

  it('logs a warning and does not publish result-saved when the job_id has no matching row', async () => {
    const { jobRepository, eventPublisher } = makeDeps();
    jobRepository.saveResult.mockResolvedValue(null);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const service = new SaveJobResultService(jobRepository, eventPublisher);
    await service.handle(input);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toEqual(expect.stringContaining('job-1'));
    expect(eventPublisher.publish).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
