import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  // Permissive for the Docker Compose dev phase — the frontend calls this directly (different
  // origin/port) until the Gateway proxies /auth/*. Lock this down before any real deployment.
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 8001;
  await app.listen(port);

  console.log(`Auth Service listening on http://localhost:${port}`);
}
void bootstrap();
