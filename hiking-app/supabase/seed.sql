-- 06 §1 v0 수동 시딩: 북한산·관악산·청계산. SQL 직접 작성은 문서상 정당(데모 루프 목적).
-- path는 주요 경유점 근사 폴리라인 — v1 ETL(산림청 SHP)에서 source_id upsert로 교체된다.
-- 재실행 안전: mountains는 not exists 가드, courses는 source_id upsert (02 §3).

insert into mountains (name, region, elevation_m, summit_point, verify_radius_m)
select v.name, v.region, v.elev, st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography, 150
from (values
  ('북한산', '서울·경기 고양', 836, 126.9780, 37.6590),   -- 백운대
  ('관악산', '서울·경기 과천', 632, 126.9640, 37.4430),   -- 연주대
  ('청계산', '서울·경기 과천·성남', 583, 127.0464, 37.4243) -- 매봉(망경대 618m는 통제구역이라 대표점=매봉)
) as v(name, region, elev, lng, lat)
where not exists (select 1 from mountains m where m.name = v.name);

insert into courses (mountain_id, name, path, checkpoint_point, distance_m, duration_min, difficulty, source_difficulty_raw, source_id)
values
  ((select id from mountains where name = '북한산'), '백운대 코스',
   st_geomfromtext('LINESTRING(126.9887 37.6633, 126.9855 37.6620, 126.9822 37.6606, 126.9797 37.6596, 126.9780 37.6590)', 4326),
   st_setsrid(st_makepoint(126.9780, 37.6590), 4326)::geography,
   1900, 120, 'hard', '수동판정: 백운봉암문~정상 급경사 암릉, 상행 120분', 'v0-bhs-baegundae'),

  ((select id from mountains where name = '북한산'), '북한산성 코스',
   st_geomfromtext('LINESTRING(126.9430 37.6580, 126.9520 37.6570, 126.9610 37.6565, 126.9700 37.6575, 126.9780 37.6590)', 4326),
   st_setsrid(st_makepoint(126.9780, 37.6590), 4326)::geography,
   4000, 150, 'hard', '수동판정: 거리 4km, 누적고도 700m+', 'v0-bhs-sanseong'),

  ((select id from mountains where name = '북한산'), '비봉 코스',
   st_geomfromtext('LINESTRING(126.9628 37.6199, 126.9600 37.6250, 126.9570 37.6280, 126.9560 37.6300)', 4326),
   st_setsrid(st_makepoint(126.9560, 37.6300), 4326)::geography,
   2400, 90, 'moderate', '수동판정: 상행 90분, 정상부 짧은 암릉', 'v0-bhs-bibong'),

  ((select id from mountains where name = '관악산'), '서울대입구 코스',
   st_geomfromtext('LINESTRING(126.9465 37.4685, 126.9500 37.4620, 126.9550 37.4550, 126.9600 37.4480, 126.9640 37.4430)', 4326),
   st_setsrid(st_makepoint(126.9640, 37.4430), 4326)::geography,
   4300, 150, 'hard', '수동판정: 연주대 직전 급경사 암릉', 'v0-gas-seouldae'),

  ((select id from mountains where name = '관악산'), '과천향교 코스',
   st_geomfromtext('LINESTRING(126.9856 37.4363, 126.9800 37.4380, 126.9750 37.4400, 126.9700 37.4420, 126.9640 37.4430)', 4326),
   st_setsrid(st_makepoint(126.9640, 37.4430), 4326)::geography,
   3200, 120, 'moderate', '수동판정: 꾸준한 오르막, 상행 120분', 'v0-gas-gwacheon'),

  ((select id from mountains where name = '관악산'), '사당능선 코스',
   st_geomfromtext('LINESTRING(126.9825 37.4745, 126.9800 37.4680, 126.9770 37.4600, 126.9720 37.4520, 126.9660 37.4460, 126.9640 37.4430)', 4326),
   st_setsrid(st_makepoint(126.9640, 37.4430), 4326)::geography,
   4500, 160, 'moderate', '수동판정: 능선 완경사 위주, 거리 김', 'v0-gas-sadang'),

  ((select id from mountains where name = '청계산'), '원터골 코스',
   st_geomfromtext('LINESTRING(127.0560 37.4460, 127.0530 37.4400, 127.0500 37.4340, 127.0480 37.4290, 127.0464 37.4243)', 4326),
   st_setsrid(st_makepoint(127.0464, 37.4243), 4326)::geography,
   2600, 90, 'moderate', '수동판정: 깔딱고개 계단 급경사 구간', 'v0-cgs-wonteogol'),

  ((select id from mountains where name = '청계산'), '옛골 코스',
   st_geomfromtext('LINESTRING(127.0680 37.4310, 127.0620 37.4290, 127.0560 37.4270, 127.0510 37.4255, 127.0464 37.4243)', 4326),
   st_setsrid(st_makepoint(127.0464, 37.4243), 4326)::geography,
   3200, 110, 'easy', '수동판정: 완경사 흙길 위주', 'v0-cgs-yetgol')

on conflict (source_id) do update set
  mountain_id = excluded.mountain_id,
  name = excluded.name,
  path = excluded.path,
  checkpoint_point = excluded.checkpoint_point,
  distance_m = excluded.distance_m,
  duration_min = excluded.duration_min,
  difficulty = excluded.difficulty,
  source_difficulty_raw = excluded.source_difficulty_raw;
