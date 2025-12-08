import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', {
    exclude: ['api/docs', 'api/docs-json'],
  });

  const config = new DocumentBuilder()
    .setTitle('Flood Detection System API')
    .setDescription(
      'RESTful API for ESP32-based flood detection system. ' +
        'Provides endpoints for firmware management, OTA updates, and device monitoring.',
    )
    .setVersion('1.0.0')
    .addTag('firmware', 'Firmware build and management operations')
    .addTag('ota', 'Over-The-Air update operations for ESP32 devices')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Flood Detection API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
