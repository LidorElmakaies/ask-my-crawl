import { Inject, Injectable } from '@nestjs/common';
import { AUTH_SERVICE_CLIENT } from '../../tokens';
import type { IAuthServiceClient } from '../infrastructure/interfaces/auth-service-client.interface';
import type {
  IAuthProxyService,
  ProxyRequest,
  ProxyResponse,
} from './interfaces/auth-proxy-service.interface';

@Injectable()
export class AuthProxyService implements IAuthProxyService {
  constructor(
    @Inject(AUTH_SERVICE_CLIENT) private readonly client: IAuthServiceClient,
  ) {}

  forward(request: ProxyRequest): Promise<ProxyResponse> {
    return this.client.forward(request);
  }
}
