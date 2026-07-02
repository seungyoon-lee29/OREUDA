import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
    if (status >= 500) console.error(e);
    res.status(status).json({ error: { code, message } });
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
