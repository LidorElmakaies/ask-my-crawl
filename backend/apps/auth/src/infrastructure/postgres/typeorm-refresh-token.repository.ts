import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RefreshToken } from '../../models/refresh-token';
import type { IRefreshTokenRepository } from '../interfaces/refresh-token-repository.interface';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

function toDomain(entity: RefreshTokenEntity): RefreshToken {
  return {
    id: entity.id,
    userId: entity.userId,
    tokenHash: entity.tokenHash,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    createdAt: entity.createdAt,
  };
}

@Injectable()
export class TypeOrmRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repo: Repository<RefreshTokenEntity>,
  ) {}

  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    const entity = this.repo.create({
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
    });
    return toDomain(await this.repo.save(entity));
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const entity = await this.repo.findOneBy({ tokenHash });
    return entity ? toDomain(entity) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update({ id }, { revokedAt: new Date() });
  }
}
