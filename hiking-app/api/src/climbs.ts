import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Response } from 'express';
import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AuthGuard, err } from './http';

// 03 §6 검증 입력 payload
class SubmitClimbDto {
  @IsOptional() @IsUUID() courseId?: string | null; // null 허용: "나중에 선택" 폴백
  @IsUUID() clientRef: string;
  @IsNumber() @Min(-90) @Max(90) lat: number;
  @IsNumber() @Min(-180) @Max(180) lng: number;
  @IsNumber() @Min(0) accuracyM: number;
  @IsBoolean() isMock: boolean;
  @IsISO8601() capturedAt: string;
}

// 03 §2 flags — verified 전용 신뢰도 플래그
export function computeFlags(input: {
  distanceM: number | null;
  radiusM: number | null;
  isMock: boolean;
  speedKmh: number | null;
}): string[] {
  const flags: string[] = [];
  if (input.distanceM != null && input.radiusM != null && input.distanceM > input.radiusM)
    flags.push('distance');
  if (input.speedKmh != null && input.speedKmh > 200) flags.push('speed');
  if (input.isMock) flags.push('mock');
  return flags;
}

// 03 §4 sanity: 미래 금지, submitted_at(=now) 이하. 위반은 4xx 종결.
export function capturedAtError(capturedAt: Date, now: Date): string | null {
  if (Number.isNaN(+capturedAt)) return 'invalid';
  if (+capturedAt > +now) return 'future';
  return null;
}

const CLIMB_RETURNING = `returning id, client_ref, status, flags, distance_m,
  to_char(climbed_on, 'YYYY-MM-DD') as climbed_on`;

function toResponse(row: any, extra: Record<string, unknown> = {}) {
  const flags: string[] = row.flags ?? [];
  return {
    climbId: row.id,
    clientRef: row.client_ref,
    status: row.status,
    flags,
    distanceM: row.distance_m,
    climbedOn: row.climbed_on,
    leaderboardEligible: row.status === 'verified' && flags.length === 0,
    ...extra,
  };
}

@Controller()
@UseGuards(AuthGuard)
export class ClimbsController {
  constructor(@InjectDataSource() private db: DataSource) {}

  // 02 §5.2 동기 검증, client_ref 멱등. ponytail: 명시적 트랜잭션 없음 —
  // 정합성은 unique 제약 2개가 보장하고, 충돌은 constraint 이름으로 분기한다.
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('climbs')
  async submit(
    @Req() req: any,
    @Body() dto: SubmitClimbDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId: string = req.userId;
    if (capturedAtError(new Date(dto.capturedAt), new Date()))
      throw err(400, 'VALIDATION_CAPTURED_AT', 'capturedAt is in the future or invalid');

    const replayed = await this.findByClientRef(userId, dto.clientRef);
    if (replayed) {
      res.status(200);
      return toResponse(replayed, { replayed: true });
    }

    // 판정 거리 (03 §1). courseId null이면 거리 판정 없음.
    let distanceM: number | null = null;
    let radiusM: number | null = null;
    if (dto.courseId) {
      const [course] = await this.db.query(
        `select st_distance(c.checkpoint_point,
                 st_setsrid(st_makepoint($2, $3), 4326)::geography) as dist,
                m.verify_radius_m as radius
         from courses c join mountains m on m.id = c.mountain_id
         where c.id = $1`,
        [dto.courseId, dto.lng, dto.lat],
      );
      if (!course) throw err(404, 'COURSE_NOT_FOUND', 'no such course');
      distanceM = Math.round(course.dist);
      radiusM = course.radius;
    }

    // speed sanity (03 §2) — captured_at 기준, 직전 verified 대비
    const [prev] = await this.db.query(
      `select captured_at,
              st_distance(verified_point,
                st_setsrid(st_makepoint($2, $3), 4326)::geography) as dist
       from climbs
       where user_id = $1 and status = 'verified' and deleted_at is null
         and captured_at < $4
       order by captured_at desc limit 1`,
      [userId, dto.lng, dto.lat, dto.capturedAt],
    );
    let speedKmh: number | null = null;
    if (prev) {
      const hours = (+new Date(dto.capturedAt) - +new Date(prev.captured_at)) / 3_600_000;
      speedKmh = hours > 0 ? prev.dist / 1000 / hours : Infinity;
    }

    const flags = computeFlags({ distanceM, radiusM, isMock: dto.isMock, speedKmh });

    try {
      const [row] = await this.db.query(
        `insert into climbs (user_id, course_id, client_ref, verified_point,
           gps_accuracy_m, is_mock, status, flags, distance_m, captured_at)
         values ($1, $2, $3, st_setsrid(st_makepoint($4, $5), 4326)::geography,
           $6, $7, 'verified', $8, $9, $10) ${CLIMB_RETURNING}`,
        [userId, dto.courseId ?? null, dto.clientRef, dto.lng, dto.lat,
         dto.accuracyM, dto.isMock, flags, distanceM, dto.capturedAt],
      );
      return toResponse(row); // 201
    } catch (e: any) {
      const constraint = e?.driverError?.constraint;
      if (constraint === 'uq_climbs_client_ref') {
        // 동시 재제출 레이스 — 저장된 결과 재생
        const row = await this.findByClientRef(userId, dto.clientRef);
        res.status(200);
        return toResponse(row, { replayed: true });
      }
      if (constraint === 'uq_climbs_daily') {
        // 하루 1회 충돌 → duplicate_day rejected로 종결 (02 §3, §5.2)
        const [existing] = await this.db.query(
          `select id from climbs
           where user_id = $1 and course_id = $2 and climbed_on = kst_date($3)
             and status = 'verified' and deleted_at is null`,
          [userId, dto.courseId, dto.capturedAt],
        );
        const [row] = await this.db.query(
          `insert into climbs (user_id, course_id, client_ref, verified_point,
             gps_accuracy_m, is_mock, status, flags, distance_m, captured_at)
           values ($1, $2, $3, st_setsrid(st_makepoint($4, $5), 4326)::geography,
             $6, $7, 'rejected', '{}', $8, $9) ${CLIMB_RETURNING}`,
          [userId, dto.courseId ?? null, dto.clientRef, dto.lng, dto.lat,
           dto.accuracyM, dto.isMock, distanceM, dto.capturedAt],
        );
        res.status(200);
        return toResponse(row, { reason: 'duplicate_day', existingClimbId: existing?.id });
      }
      throw e;
    }
  }

  // 02 §5.3 — 기록 탭 + 색칠 하이드레이션 + 카운터. v0 규모라 페이지네이션 없음.
  @Get('me/climbs')
  async myClimbs(@Req() req: any) {
    const userId: string = req.userId;
    const [totals] = await this.db.query(
      `select
         (select count(distinct co.mountain_id) from climbs cl
            join courses co on co.id = cl.course_id
            where cl.user_id = $1 and cl.status = 'verified' and cl.deleted_at is null)
           as total_mountains,
         (select count(*) from climbs
            where user_id = $1 and status = 'verified' and deleted_at is null)
           as total_climbs`,
      [userId],
    );
    const climbs = await this.db.query(
      `select cl.id as "climbId", cl.course_id as "courseId", cl.status, cl.flags,
         to_char(cl.climbed_on, 'YYYY-MM-DD') as "climbedOn",
         case when m.id is null then null
              else json_build_object('id', m.id, 'name', m.name) end as mountain,
         case when co.id is null then null
              else json_build_object('name', co.name, 'difficulty', co.difficulty) end as course
       from climbs cl
       left join courses co on co.id = cl.course_id
       left join mountains m on m.id = co.mountain_id
       where cl.user_id = $1 and cl.deleted_at is null
       order by cl.climbed_on desc, cl.submitted_at desc`,
      [userId],
    );
    return {
      totalMountains: Number(totals.total_mountains),
      totalClimbs: Number(totals.total_climbs),
      climbs,
    };
  }

  @Delete('climbs/:id')
  @HttpCode(204)
  async remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    // TypeORM raw UPDATE는 [rows, affected]를 반환한다
    const [rows] = await this.db.query(
      `update climbs set deleted_at = now()
       where id = $1 and user_id = $2 and deleted_at is null returning id`,
      [id, req.userId],
    );
    if (!rows.length) throw err(404, 'CLIMB_NOT_FOUND', 'no such climb');
  }

  private async findByClientRef(userId: string, clientRef: string) {
    const [row] = await this.db.query(
      `select id, client_ref, status, flags, distance_m,
         to_char(climbed_on, 'YYYY-MM-DD') as climbed_on
       from climbs where user_id = $1 and client_ref = $2`,
      [userId, clientRef],
    );
    return row;
  }
}
