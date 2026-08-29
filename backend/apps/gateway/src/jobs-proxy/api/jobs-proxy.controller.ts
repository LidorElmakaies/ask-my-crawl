import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/auth-kernel';
import type { Request, Response } from 'express';
import { JOBS_PROXY_SERVICE } from '../../tokens';
import type { IJobsProxyService } from '../application/interfaces/jobs-proxy-service.interface';
import { CreateJobRequestDto } from './dto/create-job-request.dto';
import { writeJobsProxyResponse } from './write-jobs-proxy-response';

interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsProxyController {
  constructor(
    @Inject(JOBS_PROXY_SERVICE)
    private readonly jobsProxyService: IJobsProxyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(
    @Body() body: CreateJobRequestDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ status: string }> {
    return this.jobsProxyService.createJob(req.user.userId, body);
  }

  @Get()
  async getJobs(
    @Query('user_id') queryUserId: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser },
    @Res() res: Response,
  ): Promise<void> {
    const response = await this.jobsProxyService.forward({
      path: '/jobs',
      userId: req.user.userId,
      role: req.user.role,
      queryUserId,
      authorizationHeader: req.headers.authorization,
    });

    writeJobsProxyResponse(res, response);
  }

  @Get(':id')
  async getJobById(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
    @Res() res: Response,
  ): Promise<void> {
    const response = await this.jobsProxyService.forward({
      path: `/jobs/${id}`,
      userId: req.user.userId,
      role: req.user.role,
      authorizationHeader: req.headers.authorization,
    });

    writeJobsProxyResponse(res, response);
  }
}
