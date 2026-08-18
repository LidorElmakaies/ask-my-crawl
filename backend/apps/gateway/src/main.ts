import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env.PORT ?? 8000;
  await app.listen(port);

  console.log(
    `Gateway listening on http://localhost:${port} (Socket.IO path: /ws)`,
  );
}
void bootstrap();
