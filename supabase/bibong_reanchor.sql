-- 비봉 코스 재앵커 — checkpoint를 실제 비봉으로, 북측 초과분 트림. identity(id·이름·source_id·mountain_id) 보존.
-- 생성: node supabase/etl/rebuild_bibong.mjs — path·checkpoint_point·distance_m·duration_min·raw만 갱신. climb_count=0 확인.
-- 원자적: begin/commit + 대상 source_id 1개 존재검증(없으면 롤백). © OpenStreetMap contributors, ODbL.

begin;

update courses set
  path = st_geomfromtext('LINESTRING(126.96429 37.621, 126.96443 37.62111, 126.96386 37.62143, 126.96365 37.62176, 126.96356 37.62222, 126.96372 37.62264, 126.96319 37.62274, 126.96117 37.62509, 126.96069 37.62526, 126.95993 37.62583, 126.95848 37.6263, 126.95845 37.6266, 126.95874 37.62699, 126.95862 37.62754, 126.95842 37.62722, 126.95787 37.627, 126.95714 37.62605, 126.95677 37.62613, 126.95625 37.62561)', 4326),
  checkpoint_point = st_setsrid(st_makepoint(126.95625, 37.62561), 4326)::geography,
  distance_m = 1332,
  duration_min = 61,
  source_difficulty_raw = '재앵커 — 체크포인트를 실제 비봉(OSM peak 560m, 126.95625 37.62561)으로 교정하고 북측 초과분(-640m) 트림. 수동판정 상행, 정상부 짧은 암릉'
where source_id = 'v0-bhs-bibong';

do $$ declare n int; begin
  select count(*) into n from courses where source_id = 'v0-bhs-bibong';
  if n <> 1 then raise exception '비봉 재앵커 대상 % 개(1 기대) — 롤백', n; end if;
end $$;

commit;
