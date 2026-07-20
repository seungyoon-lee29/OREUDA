// 비봉 코스 재앵커 — checkpoint가 실제 비봉서 489m 북(사모바위 근처 능선점). 경로는 비봉 근처 지나 북측으로 초과.
// 교정: 경로에서 실제 비봉(OSM peak 560m) 최근접 정점을 찾아 그 정점을 비봉으로 스냅하고 이후(북측 초과분) 트림.
// identity 보존: source_id 'v0-bhs-bibong'·id·mountain_id·name 불변. path·checkpoint_point·distance_m·duration_min·raw만 갱신.
// climb_count=0 확인됨(재앵커해도 과거 인증 영향 없음). 프로덕션 검증앵커 변경 → 게이트+승인 후 반영.

const BIBONG = [126.95625, 37.62561]; // OSM natural=peak '비봉' 560.3m
const OLD_DIST = 1972, OLD_DUR = 90;

// 현재 프로덕션 path(v0-bhs-bibong) — MCP로 조회한 실값
const PATH = [
  [126.96429, 37.621], [126.96443, 37.62111], [126.96386, 37.62143], [126.96365, 37.62176],
  [126.96356, 37.62222], [126.96372, 37.62264], [126.96319, 37.62274], [126.96117, 37.62509],
  [126.96069, 37.62526], [126.95993, 37.62583], [126.95848, 37.6263], [126.95845, 37.6266],
  [126.95874, 37.62699], [126.95862, 37.62754], [126.95842, 37.62722], [126.95787, 37.627],
  [126.95714, 37.62605], [126.95677, 37.62613], [126.95549, 37.62571], [126.95516, 37.62579],
  [126.95504, 37.62662], [126.95564, 37.6282], [126.95535, 37.62917], [126.95558, 37.63019], [126.956, 37.63],
];

const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const lineLen = (pts) => pts.slice(1).reduce((s, p, i) => s + hav(pts[i], p), 0);

// 비봉 최근접 정점
let k = -1, kd = Infinity;
PATH.forEach((p, i) => { const d = hav(p, BIBONG); if (d < kd) { kd = d; k = i; } });
console.log(`비봉 최근접 정점 idx ${k}/${PATH.length - 1}, ${Math.round(kd)}m`);
if (k === PATH.length - 1) throw new Error('최근접이 마지막 정점 — 초과분 없음, 트림 불필요');
if (k < 3) throw new Error(`최근접 idx ${k} 너무 이름 — 경로가 비봉에 안 닿음(오설정)`);

// 최근접 정점 k 이후(북측 초과분) 트림 + 끝점을 실제 비봉으로 확정. k정점 자체도 드롭하고 비봉이 대체(68m 이동)
// → 새 path = 옛 path[0..k-1] + 비봉. 직전 정점(k-1)→비봉 74m 세그로 자연 접근, 백트랙 없음.
const newPath = [...PATH.slice(0, k), BIBONG];
const trimmedTail = PATH.slice(k); // 버리는 북측 초과분(참고)
const newDist = Math.round(lineLen(newPath));
const dropM = OLD_DIST - newDist;
// duration: v0 수동판정(상행 90분) 비례 스케일 — 트림분(능선 초과)만큼 감. 최소 30분.
const newDur = Math.max(30, Math.round(OLD_DUR * (newDist / OLD_DIST)));

const endToCp = hav(newPath[newPath.length - 1], BIBONG);
console.log(`새 path ${newPath.length}점, ${newDist}m (트림 -${dropM}m), duration ${OLD_DUR}→${newDur}분`);
console.log(`끝점=checkpoint(비봉) 거리 ${endToCp.toFixed(2)}m (0이어야 함)`);
console.log(`버린 초과분 ${trimmedTail.length - 1}세그, ~${Math.round(lineLen(trimmedTail))}m`);
if (endToCp > 0.5) throw new Error('끝점≠비봉 — 스냅 실패');
if (newPath.length < 4 || newDist < 500) throw new Error(`과다 트림 방어: ${newPath.length}점/${newDist}m`);

const wkt = 'LINESTRING(' + newPath.map((p) => `${p[0]} ${p[1]}`).join(', ') + ')';
const raw = `재앵커 — 체크포인트를 실제 비봉(OSM peak 560m, ${BIBONG[0]} ${BIBONG[1]})으로 교정하고 북측 초과분(-${dropM}m) 트림. 수동판정 상행, 정상부 짧은 암릉`;

const sql = `-- 비봉 코스 재앵커 — checkpoint를 실제 비봉으로, 북측 초과분 트림. identity(id·이름·source_id·mountain_id) 보존.
-- 생성: node supabase/etl/rebuild_bibong.mjs — path·checkpoint_point·distance_m·duration_min·raw만 갱신. climb_count=0 확인.
-- 원자적: begin/commit + 대상 source_id 1개 존재검증(없으면 롤백). © OpenStreetMap contributors, ODbL.

begin;

update courses set
  path = st_geomfromtext('${wkt}', 4326),
  checkpoint_point = st_setsrid(st_makepoint(${BIBONG[0]}, ${BIBONG[1]}), 4326)::geography,
  distance_m = ${newDist},
  duration_min = ${newDur},
  source_difficulty_raw = '${raw.replace(/'/g, "''")}'
where source_id = 'v0-bhs-bibong';

do $$ declare n int; begin
  select count(*) into n from courses where source_id = 'v0-bhs-bibong';
  if n <> 1 then raise exception '비봉 재앵커 대상 % 개(1 기대) — 롤백', n; end if;
end $$;

commit;
`;

const fs = await import('node:fs');
const out = new URL('../bibong_reanchor.sql', import.meta.url);
fs.writeFileSync(out, sql);
console.log(`\nSQL → supabase/bibong_reanchor.sql`);
