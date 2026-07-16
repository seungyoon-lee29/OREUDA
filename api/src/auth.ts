import { Body, Controller, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Column, Entity, PrimaryGeneratedColumn, IsNull, Repository } from 'typeorm';
import { compare, hash } from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { err } from './http';

// ponytail: v0에서 레포지토리를 쓰는 건 users뿐 — 나머지 테이블은 raw SQL(ADR-002).
// TypeORM 마이그레이션 도입 시점에 엔티티 추가.
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() email: string;
  @Column() password_hash: string;
  @Column() provider: string;
  @Column({ type: 'text', nullable: true }) provider_user_id: string | null;
  @Column() nickname: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) created_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) deleted_at: Date | null;
}

class SignupDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsString() @MinLength(1) nickname: string;
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  // 02 §5: access 단수명 + 고정 refresh(rotation은 v1)
  private tokens(userId: string) {
    return {
      accessToken: this.jwt.sign({ sub: userId }, { expiresIn: '1h' }),
      refreshToken: this.jwt.sign({ sub: userId, type: 'refresh' }, { expiresIn: '90d' }),
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    if (await this.users.exists({ where: { email: dto.email } }))
      throw err(409, 'AUTH_EMAIL_TAKEN', 'email already registered');
    try {
      const user = await this.users.save({
        email: dto.email,
        password_hash: await hash(dto.password, 10),
        nickname: dto.nickname,
        provider: 'password',
      });
      return this.tokens(user.id);
    } catch (e: any) {
      // exists→save 사이 동시 가입 레이스 — email unique 충돌을 제약-이름 디스패치로 409 (api-design 규칙).
      // 제약명은 인라인 unique의 PG 기본명(users_email_key) — 실DB pg_constraint로 확인함.
      if (e?.driverError?.constraint === 'users_email_key')
        throw err(409, 'AUTH_EMAIL_TAKEN', 'email already registered');
      throw e;
    }
  }

  // ponytail: 로그인 스로틀 키는 IP — 비인증 경로라 UserOrIpThrottlerGuard가 IP로 폴백(api-design 규칙).
  // 02의 "IP+계정" 복합 키는 어뷰징 확인되면 추가
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email, deleted_at: IsNull() },
    });
    if (!user || !(await compare(dto.password, user.password_hash)))
      throw err(401, 'AUTH_INVALID_CREDENTIALS', 'wrong email or password');
    return this.tokens(user.id);
  }

  @Post('refresh')
  refresh(@Req() req: any) {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    try {
      const payload = this.jwt.verify(token);
      if (payload.type !== 'refresh') throw new Error('not a refresh token');
      return { accessToken: this.jwt.sign({ sub: payload.sub }, { expiresIn: '1h' }) };
    } catch {
      throw err(401, 'AUTH_INVALID_REFRESH', 'missing or invalid refresh token');
    }
  }
}
