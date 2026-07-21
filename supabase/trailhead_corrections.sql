-- 들머리/종주 교정 — 코스 시작점을 실제 들머리로 트림(1코스: 인왕산 동측 코스).
-- 생성: node supabase/etl/rebuild_trailheads.mjs — identity(id·이름·source_id·checkpoint) 보존, path·거리·판정만 갱신.
-- 원자적 적용: begin/commit + 대상 source_id 1개 존재 검증(하나라도 없으면 전체 롤백). © OpenStreetMap contributors, ODbL.

begin;

-- 인왕산 · 인왕산 동측 코스
update courses set
  path = st_geomfromtext('LINESTRING(126.96455 37.58932, 126.96382 37.58875, 126.96326 37.58792, 126.96263 37.58765, 126.96228 37.58702, 126.96154 37.58663, 126.95994 37.58613, 126.95906 37.5862, 126.95805 37.58536, 126.95801 37.58461, 126.95779 37.5849, 126.95788 37.58495)', 4326),
  distance_m = 902,
  duration_min = 38,
  difficulty = 'easy',
  source_difficulty_raw = '들머리 교정 — 북악산 종주 구간 제거(선두 -3052m 트림), OSM 경로합산 902m, 상승근사 248m(정상 338m - 들머리근사 90m), 휴리스틱 판정'
where source_id = 'osm-way-1059266490';

-- 검증: 대상 source_id 1개 전부 존재해야 커밋(아니면 예외→롤백)
do $$ declare n int; begin
  select count(*) into n from courses where source_id in ('osm-way-1059266490');
  if n <> 1 then raise exception '들머리 교정 대상 % 개 존재(% 기대) — 롤백', n, 1; end if;
end $$;

commit;
