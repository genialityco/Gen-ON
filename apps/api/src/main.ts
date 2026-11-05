import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: la firma de los webhooks de Meta se valida sobre el cuerpo original
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // La importación de pacientes desde Excel envía hasta 1.000 filas
  app.useBodyParser('json', { limit: '2mb' });

  const origins = (process.env.WEB_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  Logger.log(`API Gen.ON en el puerto ${port}`, 'Bootstrap');
}
bootstrap();
