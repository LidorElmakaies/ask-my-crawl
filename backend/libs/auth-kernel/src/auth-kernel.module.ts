import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthTokenService } from './auth-token.service';
import { JsonWebTokenService } from './jsonwebtoken.service';
import { AUTH_TOKEN_SERVICE, JWT_SERVICE } from './tokens';

/**
 * Shared across every app that needs to sign/verify the platform's JWTs — currently Gateway
 * (verifies, for the WS handshake) and Auth Service (signs on login/register, verifies on
 * protected routes). Import this instead of wiring JWT_SERVICE/AUTH_TOKEN_SERVICE by hand.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    { provide: JWT_SERVICE, useClass: JsonWebTokenService },
    { provide: AUTH_TOKEN_SERVICE, useClass: AuthTokenService },
  ],
  exports: [JWT_SERVICE, AUTH_TOKEN_SERVICE],
})
export class AuthKernelModule {}
