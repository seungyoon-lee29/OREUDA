import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';

// 02 §6 에러 규약: { error: { code, message } }
export function err(status: number, code: string, message: string): HttpException {
  return new HttpException({ code, message }, status);
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = e instanceof HttpException ? e.getStatus() : 500;
    const body: any = e instanceof HttpException ? e.getResponse() : {};
    const fallback: Record<number, string> = {
      400: 'VALIDATION_FAILED',
      401: 'AUTH_UNAUTHORIZED',
      404: 'NOT_FOUND',
      429: 'THROTTLED',
    };
    const code = body.code ?? fallback[status] ?? 'INTERNAL';
    const message =
      status >= 500
        ? 'internal error'
        : Array.isArray(body.message)
          ? body.message.join('; ')
          : (body.message ?? 'error');
    if (status === 429) res.header('Retry-After', '60');
    if (status >= 500) {
      // 좌표 스크럽 (07 §1: 위치 좌표 미전송) — QueryFailedError.parameters엔 lng/lat가 들어가므로
      // 전체 에러 객체 대신 name/message/stack만 로깅한다.
      const anyE = e as any;
      console.error('[500]', anyE?.name, anyE?.message, anyE?.stack);
    }
    res.status(status).json({ error: { code, message } });
  }
}

// H1b: 인증된 요청의 스로틀 키를 IP→userId로. 기본 트래커(req.ip)는 통신사 CGNAT
// (수천 사용자가 egress IP 공유)에서 남의 트래픽 때문에 내 완등 제출이 429를 맞는다.
// 글로벌 가드라 AuthGuard(컨트롤러 레벨)보다 먼저 돌아 req.userId가 아직 없으므로
// 토큰을 여기서 직접 검증한다(JWT verify 1회 중복 — 무시 가능한 비용).
// 비인증 요청(로그인·가입 등)과 무효 토큰은 IP 유지 — api-design 규칙 "로그인은 IP 기준".
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  // ponytail: 프로퍼티 주입 — 부모 constructor(@InjectThrottlerOptions 등) 재선언 회피
  @Inject(JwtService) private jwtSvc: JwtService;

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // 로그인·가입·리프레시는 항상 IP — 유효 토큰 N개를 붙여 계정별 버킷을 받으면
    // 크리덴셜 스터핑 제한(login 5/min/IP)이 계정 수만큼 증폭된다(적대 리뷰·code-reviewer HIGH 수렴).
    // req.path(쿼리스트링 제외) + 대소문자 무시 + trailing slash 허용 — req.url은 ?query로 $ 앵커가 뚫린다(재검 지적).
    const path: string = req.path ?? (req.url ?? '').split('?')[0];
    if (/\/(login|signup|refresh)\/?$/i.test(path)) return req.ip;
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (token) {
      try {
        const payload = this.jwtSvc.verify(token);
        // refresh 토큰은 user 키 불인정 — 보호 API에선 어차피 401, 버킷 증폭 여지만 제거
        if (payload.type !== 'refresh') return `user:${payload.sub}`;
      } catch {
        // 무효 토큰 → IP 폴백 (어차피 AuthGuard에서 401)
      }
    }
    return req.ip;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    try {
      const payload = this.jwt.verify(token);
      if (payload.type === 'refresh') throw new Error('refresh token not usable as access');
      req.userId = payload.sub;
      return true;
    } catch {
      throw err(401, 'AUTH_UNAUTHORIZED', 'missing or invalid access token');
    }
  }
}
