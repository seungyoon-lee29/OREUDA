import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter } from './http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Fly 프록시 뒤에서 스로틀러가 실 클라이언트 IP를 보도록
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ErrorFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
