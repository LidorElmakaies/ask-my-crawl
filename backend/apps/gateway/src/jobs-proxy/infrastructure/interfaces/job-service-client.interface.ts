import type { ForwardQueryOptions, ProxyResponse } from '../../application/interfaces/jobs-proxy-service.interface';

/**
 * Infrastructure layer interface. Implemented by JobServiceHttpClient.
 */
export interface IJobServiceClient {
  forward(options: ForwardQueryOptions): Promise<ProxyResponse>;
}
