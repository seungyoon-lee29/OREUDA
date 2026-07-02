import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, User } from './auth';
import { CatalogController } from './catalog';
import { ClimbsController } from './climbs';
import { AuthGuard } from './http';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [User],
      synchronize: false, // 스키마는 마이그레이션이 정본 (02 §4)
    }),
    TypeOrmModule.forFeature([User]),
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AuthController, CatalogController, ClimbsController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, AuthGuard],
})
export class AppModule {}
