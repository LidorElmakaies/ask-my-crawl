import { readFileSync } from 'fs';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthKernelModule } from '@app/auth-kernel';
import { AdminAuthGateMiddleware } from './infrastructure/middleware/admin-auth-gate.middleware';
import { createGrafanaJwtMiddleware } from './infrastructure/middleware/grafana-jwt.middleware';
import { createToolProxyMiddleware } from './infrastructure/proxy/tool-proxy.factory';

// Gated reverse proxy fronting the admin-only tool UIs (Grafana, Kafka UI) — see
// docs/planning/02-admin-dashboard-plan.md and docs/planning/05-grafana-jwt-auth.md.
@Module({
  imports: [ConfigModule, AuthKernelModule],
})
export class ToolProxyModule implements NestModule {
  constructor(private readonly config: ConfigService) {}

  configure(consumer: MiddlewareConsumer): void {
    const grafanaTarget = this.config.get<string>('GRAFANA_URL');
    if (!grafanaTarget) {
      throw new Error('GRAFANA_URL is not configured');
    }
    const kafkaUiTarget = this.config.get<string>('KAFKA_UI_URL');
    if (!kafkaUiTarget) {
      throw new Error('KAFKA_UI_URL is not configured');
    }

    const grafanaKeyFile = this.config.get<string>(
      'GRAFANA_JWT_PRIVATE_KEY_FILE',
    );
    if (!grafanaKeyFile) {
      throw new Error('GRAFANA_JWT_PRIVATE_KEY_FILE is not configured');
    }
    const grafanaPrivateKey = readFileSync(grafanaKeyFile, 'utf8');

    consumer
      .apply(
        AdminAuthGateMiddleware,
        createGrafanaJwtMiddleware(grafanaPrivateKey),
        createToolProxyMiddleware(grafanaTarget, '/admin/grafana'),
      )
      .forRoutes({ path: 'admin/grafana{/*path}', method: RequestMethod.ALL });

    consumer
      .apply(
        AdminAuthGateMiddleware,
        createToolProxyMiddleware(kafkaUiTarget, '/admin/kafka-ui'),
      )
      .forRoutes({
        path: 'admin/kafka-ui{/*path}',
        method: RequestMethod.ALL,
      });
  }
}
