import type { Response } from 'express';
import type { ProxyResponse } from '../application/interfaces/auth-proxy-service.interface';

/**
 * Writes exactly what Auth Service returned — status and body, verbatim, no reshaping. Every
 * proxy controller's handlers use this instead of each hand-rolling res.status(...).json(...)/
 * end() — three controllers, up to four routes each, would otherwise repeat this five times over.
 */
export function writeProxyResponse(
  res: Response,
  response: ProxyResponse,
): void {
  res.status(response.status);
  if (response.body === undefined || response.body === '') {
    res.end();
  } else {
    res.json(response.body);
  }
}
