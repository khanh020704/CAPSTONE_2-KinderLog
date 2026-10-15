import 'dotenv/config'; // before anything reads process.env at import time (upload limits)
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const { prefix, port } = configureApp(app);
  await app.listen(port);
  Logger.log(`API ready on http://localhost:${port}/${prefix}  ·  docs: /${prefix}/docs`, 'Bootstrap');
}
void bootstrap();
