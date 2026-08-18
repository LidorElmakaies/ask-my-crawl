import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthKernelModule } from '@app/auth-kernel';
import { AdminUsersController } from './api/controllers/admin-users.controller';
import { AuthController } from './api/controllers/auth.controller';
import { UsersController } from './api/controllers/users.controller';
import { JwtAuthGuard } from './api/guards/jwt-auth.guard';
import { RolesGuard } from './api/guards/roles.guard';
import { AuthService } from './application/auth.service';
import { UserService } from './application/user.service';
import { SaltPepperSha256Hasher } from './infrastructure/hashing/salt-pepper-sha256.hasher';
import { RefreshTokenEntity } from './infrastructure/postgres/entities/refresh-token.entity';
import { UserEntity } from './infrastructure/postgres/entities/user.entity';
import { TypeOrmRefreshTokenRepository } from './infrastructure/postgres/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './infrastructure/postgres/typeorm-user.repository';
import { AdminSeedService } from './infrastructure/seed/admin-seed.service';
import {
  AUTH_SERVICE,
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
  USER_SERVICE,
} from './tokens';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthKernelModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        entities: [UserEntity, RefreshTokenEntity],
        // Simplest thing that works for the Docker Compose phase — see docs/specs/auth.md.
        // No migration framework yet; revisit before this ever runs against real prod data.
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
  ],
  controllers: [AuthController, UsersController, AdminUsersController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    AdminSeedService,
    { provide: AUTH_SERVICE, useClass: AuthService },
    { provide: USER_SERVICE, useClass: UserService },
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: TypeOrmRefreshTokenRepository,
    },
    { provide: PASSWORD_HASHER, useClass: SaltPepperSha256Hasher },
  ],
})
export class AuthModule {}
