import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter } from './http';

async function bootstrap() {
  // 시크릿 무결성 가드: HS256 대칭키라 약한 JWT_SECRET은 전 계정 토큰 위조로 이어진다. 부팅 시 차단.
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-me' || secret.length < 32) {
    console.error('FATAL: JWT_SECRET가 없거나 약합니다(기본값/32자 미만). 32바이트+ 랜덤값을 설정하세요.');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);
  // Fly 프록시 뒤에서 스로틀러가 실 클라이언트 IP를 보도록
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ErrorFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
