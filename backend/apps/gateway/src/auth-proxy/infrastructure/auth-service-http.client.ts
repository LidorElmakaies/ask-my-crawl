import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { IAuthServiceClient } from './interfaces/auth-service-client.interface';
import type {
  ProxyRequest,
  ProxyResponse,
} from '../application/interfaces/auth-proxy-service.interface';

// Per docs/specs/services.md: internal service-to-service calls are plain HTTP via Nest's
// HttpModule (@nestjs/axios), not the TCP microservice transport.
@Injectable()
export class AuthServiceHttpClient implements IAuthServiceClient {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    // Container-network default (service name, not localhost — see devops.md's non-negotiables).
    // Override via env for local (non-Docker) `npx nest start gateway`.
    this.baseUrl = config.get<string>('AUTH_SERVICE_URL') ?? 'http://auth:8001';
  }

  async forward(request: ProxyRequest): Promise<ProxyResponse> {
    try {
      const response = await firstValueFrom(
        this.http.request({
          method: request.method,
          url: `${this.baseUrl}${request.path}`,
          data: request.body,
          headers: request.authorizationHeader
            ? { Authorization: request.authorizationHeader }
            : undefined,
          // Never reject on 4xx/5xx — this is a pass-through, every status Auth Service returns
          // (400/401/404/409/...) is a legitimate response to relay verbatim, not a client-side
          // error. Only a genuinely failed request (network/DNS/timeout) should hit the catch
          // below.
          validateStatus: () => true,
        }),
      );
      return { status: response.status, body: response.data as unknown };
    } catch (err) {
      const axiosErr = err as AxiosError;
      // Auth Service itself never produced a response — nothing to relay. 502 (bad gateway) is
      // the honest status for "the upstream we depend on didn't answer," not a guess at what
      // Auth Service would have said.
      return {
        status: 502,
        body: {
          error: { code: 'auth_service_unreachable', message: axiosErr.message },
        },
      };
    }
  }
}
