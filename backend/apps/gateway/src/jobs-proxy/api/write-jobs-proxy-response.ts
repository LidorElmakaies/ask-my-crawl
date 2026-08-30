import type { Response } from 'express';
import type { ProxyResponse } from '../application/interfaces/jobs-proxy-service.interface';

/**
 * Writes exactly what Job Manager Service returned — status and body, verbatim.
 */
export function writeJobsProxyResponse(
  res: Response,
  response: ProxyResponse,
): void {
  res.status(response.statusCode);
  if (response.data === undefined || response.data === '') {
    res.end();
  } else {
    res.json(response.data);
  }
}
