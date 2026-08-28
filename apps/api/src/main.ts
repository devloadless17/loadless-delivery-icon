import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', config.env.TRUSTED_PROXY_HOPS);
  app.use(helmet());
  app.use(cookieParser());
  app.enableShutdownHooks();

  // Same-origin behind Caddy — CORS stays disabled for foreign origins.

  await app.listen(config.env.PORT);
}

void bootstrap();
