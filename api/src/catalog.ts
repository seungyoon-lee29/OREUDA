import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { err } from './http';

export function parseBbox(raw: string | undefined): [number, number, number, number] | null {
  const parts = (raw ?? '').split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  // 신뢰경계 검증: 범위밖·역순 bbox는 st_makeenvelope가 전 세계 envelope로 새어 전 코스를 반환한다 → 400 거절.
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return parts as [number, number, number, number];
}

// 02 §5.1 코스 페이로드 — 오프라인 로컬 판정의 전제이므로 필드 계약 고정
const COURSE_SELECT = `
  select c.id, c.mountain_id as "mountainId", c.name,
    st_asgeojson(c.path)::json as path,
    st_asgeojson(c.checkpoint_point)::json as "checkpointPoint",
    m.verify_radius_m as "verifyRadiusM",
    c.difficulty, c.distance_m as "distanceM", c.duration_min as "durationMin"
  from courses c join mountains m on m.id = c.mountain_id`;

@Controller()
export class CatalogController {
  constructor(@InjectDataSource() private db: DataSource) {}

  // Fly 헬스체크용 — DB를 건드리지 않는다 (Supabase pause가 재시작 루프를 만들지 않도록)
  @Get('healthz')
  healthz() {
    return { ok: true };
  }

  // public read (01 §7 게스트 전환 대비). zoom: v0 서버는 받되 무시한다(02 §5.1 계약).
  @Get('courses')
  async courses(@Query('bbox') bbox?: string, @Query('zoom') _zoom?: string) {
    const box = parseBbox(bbox);
    if (!box) throw err(400, 'VALIDATION_BBOX', 'bbox must be minLng,minLat,maxLng,maxLat');
    return this.db.query(
      `${COURSE_SELECT} where st_intersects(c.path, st_makeenvelope($1, $2, $3, $4, 4326))`,
      box,
    );
  }

  // public read — ponytail: no pagination, 20 mountains max
  @Get('mountains')
  async mountains() {
    return this.db.query(
      `select m.id, m.name, m.region, m.elevation_m as "elevationM",
         st_asgeojson(m.summit_point)::json as "summitPoint",
         count(c.id)::int as "courseCount"
       from mountains m left join courses c on c.mountain_id = m.id
       group by m.id order by m.name`,
    );
  }

  @Get('mountains/:id')
  async mountain(@Param('id', ParseUUIDPipe) id: string) {
    const [mountain] = await this.db.query(
      `select m.id, m.name, m.region, m.elevation_m as "elevationM",
         st_asgeojson(m.summit_point)::json as "summitPoint",
         m.verify_radius_m as "verifyRadiusM"
       from mountains m where m.id = $1`,
      [id],
    );
    if (!mountain) throw err(404, 'MOUNTAIN_NOT_FOUND', 'no such mountain');
    const courses = await this.db.query(`${COURSE_SELECT} where c.mountain_id = $1`, [id]);
    return { ...mountain, courses };
  }
}
