import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import type { Job } from '../../models/job';
import { GET_JOBS_USE_CASE, RETRY_JOB_USE_CASE } from '../../tokens';
import type { IGetJobsUseCase } from '../../application/interfaces/get-jobs-use-case.interface';
import type { IRetryJobUseCase } from '../../application/interfaces/retry-job-use-case.interface';

@Controller('jobs')
export class JobsController {
  constructor(
    @Inject(GET_JOBS_USE_CASE)
    private readonly getJobsUseCase: IGetJobsUseCase,
    @Inject(RETRY_JOB_USE_CASE)
    private readonly retryJobUseCase: IRetryJobUseCase,
  ) {}

  @Get()
  async getJobs(
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-role') role: string | undefined,
    @Query('user_id') filterUserId: string | undefined,
  ): Promise<Job[]> {
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    return this.getJobsUseCase.getJobs({
      userId,
      role: role ?? 'user',
      filterUserId,
    });
  }

  @Get(':id')
  async getJobById(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-role') role: string | undefined,
  ): Promise<Job | null> {
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    return this.getJobsUseCase.getJobById({
      jobId: id,
      userId,
      role: role ?? 'user',
    });
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryJob(
    @Param('id') id: string,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-role') role: string | undefined,
  ): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    await this.retryJobUseCase.handle({
      jobId: id,
      userId,
      role: role ?? 'user',
    });
  }
}
