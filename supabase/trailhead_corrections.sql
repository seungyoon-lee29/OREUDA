-- 들머리 교정 — 한양도성 도심 접근로 트림(남산 동측·북서측, 인왕산 동측·남서측 4코스).
-- 생성: node supabase/etl/rebuild_trailheads.mjs — identity(id·이름·source_id·checkpoint) 보존, path·거리·판정만 갱신.
-- 원자적 적용: begin/commit + 대상 source_id 4개 존재 검증(하나라도 없으면 전체 롤백). © OpenStreetMap contributors, ODbL.

begin;

-- 남산 · 남산 동측 코스
update courses set
  path = st_geomfromtext('LINESTRING(127.00002 37.55171, 126.99881 37.55086, 126.99878 37.55026, 126.99852 37.54995, 126.9975 37.54962, 126.99665 37.54848, 126.99581 37.54855, 126.99362 37.54934, 126.99172 37.5504, 126.9912 37.55099, 126.99053 37.55137, 126.98863 37.55176, 126.98781 37.55174, 126.98737 37.55195, 126.98749 37.55205, 126.98796 37.55221)', 4326),
  distance_m = 1490,
  duration_min = 43,
  difficulty = 'easy',
  source_difficulty_raw = '들머리 교정 — 산 wood 진입점부터 시작(도심 접근로 -1729m 트림), OSM 경로합산 1490m, 상승근사 202m(정상 262m - 들머리근사 60m), 휴리스틱 판정'
where source_id = 'osm-way-779271377';

-- 남산 · 남산 북서측 코스
update courses set
  path = st_geomfromtext('LINESTRING(126.98337 37.5537, 126.98361 37.55328, 126.98404 37.5532, 126.98452 37.55325, 126.98473 37.55345, 126.98457 37.55374, 126.98483 37.55407, 126.98513 37.55403, 126.98533 37.55418, 126.9855 37.55379, 126.9861 37.55352, 126.9873 37.55202, 126.98749 37.55205, 126.98796 37.55221)', 4326),
  distance_m = 658,
  duration_min = 30,
  difficulty = 'easy',
  source_difficulty_raw = '들머리 교정 — 산 wood 진입점부터 시작(도심 접근로 -975m 트림), OSM 경로합산 658m, 상승근사 202m(정상 262m - 들머리근사 60m), 휴리스틱 판정'
where source_id = 'osm-way-1209132245';

-- 검증: 대상 source_id 2개 전부 존재해야 커밋(아니면 예외→롤백)
do $$ declare n int; begin
  select count(*) into n from courses where source_id in ('osm-way-779271377', 'osm-way-1209132245');
  if n <> 2 then raise exception '들머리 교정 대상 % 개 존재(% 기대) — 롤백', n, 2; end if;
end $$;

commit;
