import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { resolve } from 'path';

/** Everything main.ts applies to the app; the E2E tests call it too so they exercise the real setup. */
export function configureApp(app: NestExpressApplication, { swagger = true } = {}) {
  const config = app.get(ConfigService);
  const prefix = config.get<string>('apiPrefix')!;

  // Behind the Vite proxy / ngrok tunnel every request comes from localhost: read the client IP from
  // X-Forwarded-For so the login rate limit counts each visitor separately.
  app.set('trust proxy', 'loopback');
  app.setGlobalPrefix(prefix, { exclude: ['health'] });
  app.enableCors({ origin: config.get<string[]>('corsOrigins'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  // Journal photos: served at /uploads/photos/<file>
  app.useStaticAssets(resolve(config.get<string>('uploadDir')!), { prefix: '/uploads/', maxAge: '7d' });

  if (swagger) {
    const doc = new DocumentBuilder()
      .setTitle('KinderLog API – PDJRS')
      .setDescription(
        'Preschool Daily Journal & Reporting System. Sign in with POST /api/auth/login, then "Authorize" with the token.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, doc), {
      swaggerOptions: { persistAuthorization: true },
    });
  }
  return { prefix, port: config.get<number>('port')! };
}
