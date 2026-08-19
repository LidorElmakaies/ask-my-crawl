import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  // Permissive for the Docker Compose dev phase, same rationale as the WS gateway's own cors
  // option — no HTTP routes here yet, but the future /auth/* etc. proxy routes will need this.
  app.enableCors({ origin: true });
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env.PORT ?? 8000;
  await app.listen(port);

  console.log(
    `Gateway listening on http://localhost:${port} (Socket.IO path: /ws)`,
  );
}
void bootstrap();
