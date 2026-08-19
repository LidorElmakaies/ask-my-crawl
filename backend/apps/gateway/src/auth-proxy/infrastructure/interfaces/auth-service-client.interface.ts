import type { ProxyRequest, ProxyResponse } from '../../application/interfaces/auth-proxy-service.interface';

/** Implemented by AuthServiceHttpClient — the actual outbound HTTP call to Auth Service. */
export interface IAuthServiceClient {
  forward(request: ProxyRequest): Promise<ProxyResponse>;
}
