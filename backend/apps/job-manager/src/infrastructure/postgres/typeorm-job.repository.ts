import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Job } from '../../models/job';
import type {
  CreateJobInput,
  IJobRepository,
} from '../interfaces/job-repository.interface';
import { JobEntity } from './entities/job.entity';

/**
 * Maps between JobEntity (persistence-specific, TypeORM decorators) and the plain Job domain
 * type — the Application layer never sees JobEntity or knows TypeORM exists.
 */
function toDomain(entity: JobEntity): Job {
  return {
    id: entity.id,
    user_id: entity.user_id,
    url: entity.url,
    query: entity.query,
    result: entity.result,
  };
}

@Injectable()
export class TypeOrmJobRepository implements IJobRepository {
  constructor(
    @InjectRepository(JobEntity) private readonly repo: Repository<JobEntity>,
  ) {}

  async create(input: CreateJobInput): Promise<Job> {
    const entity = this.repo.create({ ...input, result: null });
    return toDomain(await this.repo.save(entity));
  }

  async saveResult(jobId: string, result: string): Promise<Job | null> {
    const updateResult = await this.repo.update({ id: jobId }, { result });
    if (!updateResult.affected) {
      return null;
    }
    const entity = await this.repo.findOneBy({ id: jobId });
    return entity ? toDomain(entity) : null;
  }

  async findByUserId(userId: string): Promise<Job[]> {
    const entities = await this.repo.findBy({ user_id: userId });
    return entities.map(toDomain);
  }

  async findAll(filterUserId?: string): Promise<Job[]> {
    const entities = filterUserId
      ? await this.repo.findBy({ user_id: filterUserId })
      : await this.repo.find();
    return entities.map(toDomain);
  }

  async findById(jobId: string): Promise<Job | null> {
    const entity = await this.repo.findOneBy({ id: jobId });
    return entity ? toDomain(entity) : null;
  }
}

