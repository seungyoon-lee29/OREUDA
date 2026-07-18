// etl/data/*.json → supabase/seed_seoul.sql 생성.
// 방식: 등산로 way들로 그래프 구성 → 정상 최근접 노드에서 Dijkstra →
// 방위각이 갈라지는 먼 말단(들머리) 최대 3개 선택 → 정상행 경로로 뒤집어 코스화.
// 접근로 트림: 경로 선두의 footway(도시 보도) 연속 간선 제거 — 코스는 들머리부터 시작 (티켓 02).
import { readFile, writeFile } from 'node:fs/promises';
import { MOUNTAINS } from './config.mjs';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const bearing = ([lng1, lat1], [lng2, lat2]) =>
  ((Math.atan2(Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2)),
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1))) * 180) / Math.PI + 360) % 360;
const DIR = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const dirName = (deg) => DIR[Math.round(deg / 45) % 8];

// Douglas-Peucker (도 단위 수직거리 근사 — 서울 위도에서 0.0001° ≈ 9~11m)
function simplify(pts, eps) {
  if (pts.length <= 2) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = -1, idx = 0;
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    let d;
    if (len2 === 0) d = Math.hypot(p[0] - a[0], p[1] - a[1]);
    else {
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

// 이진 힙 Dijkstra
function dijkstra(adj, start) {
  const dist = new Map([[start, 0]]), prev = new Map();
  const heap = [[0, start]];
  while (heap.length) {
    let i = 0; // pop-min
    for (let j = 1; j < heap.length; j++) if (heap[j][0] < heap[i][0]) i = j;
    const [d, u] = heap.splice(i, 1)[0];
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const { to, w, way } of adj.get(u) ?? []) {
      const nd = d + w;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { from: u, way });
        heap.push([nd, to]);
      }
    }
  }
  return { dist, prev };
}
// ponytail: splice 선형 pop-min이라 O(V^2) — 그래프가 산당 수천 노드라 충분. 느려지면 진짜 힙으로.

const usedSourceIds = new Set(); // 전역 — 인접 산(아차/용마, 대모/구룡)이 들머리 way를 공유한다

function buildCourses(m, data) {
  // peakOverride가 있으면 OSM peak 노드 매칭 실패에도 build 가능(적대 리뷰 MEDIUM — fresh seed 누락 방지)
  if ((!data.peak && !m.peakOverride) || !data.ways.length) return { courses: [], reason: 'OSM 데이터 없음' };
  const peakPt = m.peakOverride?.pt ?? [data.peak.lon, data.peak.lat]; // ws3 검증 좌표 우선
  const coords = new Map(); // nodeId -> [lng,lat]
  const adj = new Map();
  const deg = new Map();
  const footway = new Set(data.ways.filter((w) => w.tags?.highway === 'footway').map((w) => w.id));
  for (const w of data.ways) {
    if (!w.nodes || !w.geometry) continue;
    for (let i = 0; i < w.nodes.length; i++) coords.set(w.nodes[i], [w.geometry[i].lon, w.geometry[i].lat]);
    for (let i = 1; i < w.nodes.length; i++) {
      const [u, v] = [w.nodes[i - 1], w.nodes[i]];
      const wgt = haversine(coords.get(u), coords.get(v));
      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);
      adj.get(u).push({ to: v, w: wgt, way: w.id });
      adj.get(v).push({ to: u, w: wgt, way: w.id });
      deg.set(u, (deg.get(u) ?? 0) + 1);
      deg.set(v, (deg.get(v) ?? 0) + 1);
    }
  }
  // 정상 최근접 그래프 노드
  let startNode = null, best = Infinity;
  for (const [id, pt] of coords) {
    const d = haversine(peakPt, pt);
    if (d < best) { best = d; startNode = id; }
  }
  if (startNode === null || best > 400) return { courses: [], reason: `정상 근처 등산로 없음(최근접 ${Math.round(best)}m)` };
  // 정상이 등산로와 100m 넘게 단절(통제구역 등)이면 seed.sql 청계산 선례대로 대표점=최근접 등산로 지점.
  // verify_radius_m 150 안에서 실제 도달 가능해야 인증이 성립한다.
  // 단 peakOverride는 이미 검증된 실질 인증점(소망탑 등) — 스냅 없이 그대로 쓴다.
  const snapped = !m.peakOverride && best > 100;
  const summitPt = snapped ? coords.get(startNode) : peakPt;

  const { dist, prev } = dijkstra(adj, startNode);
  // 들머리 후보: 차수 1(말단) 노드, 거리 범위 내, 먼 순
  const cands = [...dist.entries()]
    .filter(([id, d]) => deg.get(id) === 1 && d >= m.minDist && d <= m.maxDist)
    .sort((a, b) => b[1] - a[1]);

  const chosen = [];
  for (const [end, d] of cands) {
    if (chosen.length >= 3) break;
    const brg = bearing(peakPt, coords.get(end));
    const sep = chosen.every((c) => {
      const diff = Math.abs(brg - c.brg);
      return Math.min(diff, 360 - diff) >= 100;
    });
    if (!sep) continue;
    // 경로 복원 (정상→들머리) 후 반전
    const nodePath = [end];
    const edgeWays = []; // edgeWays[i] = nodePath[i]~[i+1] 간선의 way id
    let firstWay = null;
    for (let cur = end; cur !== startNode;) {
      const p = prev.get(cur);
      if (firstWay === null) firstWay = p.way; // end 쪽 첫 간선 = 들머리 way
      edgeWays.push(p.way);
      nodePath.push(p.from);
      cur = p.from;
    }
    // source_id는 트림 전 firstWay 기준 유지 — 바꾸면 upsert가 새 행을 만들어 코스 중복 + climbs FK 단절
    const sourceId = `osm-way-${firstWay}`;
    if (usedSourceIds.has(sourceId)) continue; // source_id 유니크 보장
    usedSourceIds.add(sourceId);
    // 접근로 트림: 선두 footway 연속 간선 제거, 첫 path|steps|track에서 정지.
    // 잔여 ≤ minDist면 중단 — footway가 곧 등산로인 소산 공원길(일자산 등) 보호.
    let cut = 0, len = d;
    while (cut < edgeWays.length && footway.has(edgeWays[cut])) {
      const e = haversine(coords.get(nodePath[cut]), coords.get(nodePath[cut + 1]));
      if (len - e <= m.minDist) break;
      len -= e;
      cut++;
    }
    let pts = nodePath.slice(cut).map((id) => coords.get(id)); // 이미 들머리→정상 방향
    pts = simplify(pts, 0.0001);
    for (let eps = 0.0002; pts.length > 120; eps *= 1.5) pts = simplify(pts, eps);
    pts = pts.map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)]);
    // checkpoint = 정상(대표)점: path 마지막 점을 정상 좌표로 맞춘다
    const peak5 = [+summitPt[0].toFixed(5), +summitPt[1].toFixed(5)];
    if (pts[pts.length - 1][0] !== peak5[0] || pts[pts.length - 1][1] !== peak5[1]) pts.push(peak5);
    chosen.push({ end, d: len, brg, pts, sourceId }); // d = 트림 후 잔여 길이(간선 haversine 합) / brg·name은 트림 전 원 endpoint 기준
  }

  const osmEle = parseFloat(data.peak?.tags.ele);
  let ele = Math.round(osmEle || m.ele);
  if (osmEle && Math.abs(osmEle - m.ele) > 30) {
    // OSM peak ele 오염 대응(일자산 74 vs 실제 134) — 괴리 30m 초과면 config 우선
    console.warn(`⚠ ${m.name}: OSM ele ${osmEle}m vs config ${m.ele}m 괴리 >30m — config 사용`);
    ele = m.ele;
  }
  if (m.peakOverride) ele = m.peakOverride.ele; // ws3 검증 고도 — OSM ele 태그보다 우선(우면산 313 오태깅)
  const ascent = Math.max(ele - m.baseEle, 30);
  const dirCount = {};
  const courses = chosen.map((c) => {
    const distM = Math.round(c.d);
    // 상행 소요: 평지 4km/h + 상승 300m당 +30분
    const durMin = Math.round((distM / 1000 / 4) * 60 + (ascent / 300) * 30);
    // 난이도(상승 우선): 상승<100m 평지 산책로는 <4km까지 easy / <2.5km & 상승<300m → easy
    //                  ≥5km 또는 상승≥500m → hard / 그 외 moderate
    const easy = ascent < 100 ? distM < 4000 : distM < 2500 && ascent < 300;
    const difficulty = easy ? 'easy' : distM >= 5000 || ascent >= 500 ? 'hard' : 'moderate';
    const dir = dirName(c.brg);
    dirCount[dir] = (dirCount[dir] ?? 0) + 1;
    const name = `${dir}측 코스${dirCount[dir] > 1 ? ` ${dirCount[dir]}` : ''}`;
    return {
      name, pts: c.pts, distM, durMin, difficulty, sourceId: c.sourceId,
      raw: `OSM 경로합산 ${distM}m, 상승근사 ${ascent}m(정상 ${ele}m - 들머리근사 ${m.baseEle}m), 휴리스틱 판정${snapped ? `, 대표점=최근접 등산로 지점(정상 단절 ${Math.round(best)}m)` : ''}${m.peakOverride ? ', 정상점=ws3 교정 좌표' : ''}`,
    };
  });
  if (m.peakOverride)
    // 풀 재생성은 identity-unsafe: 들머리 셀렉션이 드리프트해 source_id가 바뀔 수 있다(우면산 3→2 실측).
    // 프로덕션 반영은 rebuild_summits.mjs/rebuild_v0.mjs(identity 보존 재라우팅)로만 — 적대 리뷰 HIGH.
    console.warn(`⚠ ${m.name}: peakOverride 산 — 이 재생성 산출물을 프로덕션에 그대로 upsert하지 말 것(코스 드리프트 위험)`);
  return { courses, peak: { pt: [+summitPt[0].toFixed(5), +summitPt[1].toFixed(5)], ele, osmName: data.peak?.tags.name, snapped } };
}

const results = [];
for (const m of MOUNTAINS) {
  let data;
  try {
    data = JSON.parse(await readFile(new URL(`./data/${m.slug}.json`, import.meta.url), 'utf8'));
  } catch {
    results.push({ m, courses: [], reason: '캐시 없음 (fetch.mjs 먼저)' });
    continue;
  }
  results.push({ m, ...buildCourses(m, data) });
}

const ok = results.filter((r) => r.courses.length);
const lines = [];
lines.push('-- 서울 시계 내/걸친 주요 산 시드 — OSM Overpass ETL 산출물 (supabase/etl/, 재생성 가능)');
lines.push('-- 생성: node supabase/etl/fetch.mjs && node supabase/etl/build.mjs / 검증: node --test supabase/etl/validate.mjs');
lines.push('-- 재실행 안전: mountains는 not exists 가드, courses는 source_id upsert (seed.sql 패턴 동일).');
lines.push('-- © OpenStreetMap contributors, ODbL — 경로는 OSM 등산로 그래프 최단경로, Douglas-Peucker(ε≈0.0001) 단순화.');
lines.push('');
lines.push('insert into mountains (name, region, elevation_m, summit_point, verify_radius_m, source_code)');
lines.push("select v.name, v.region, v.elev, st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography, 150, 'osm'");
lines.push('from (values');
lines.push(ok.map((r) => `  ('${r.m.name}', '${r.m.region}', ${r.peak.ele}, ${r.peak.pt[0]}, ${r.peak.pt[1]})`).join(',\n'));
lines.push(') as v(name, region, elev, lng, lat)');
lines.push('where not exists (select 1 from mountains m where m.name = v.name);');
lines.push('');
lines.push('insert into courses (mountain_id, name, path, checkpoint_point, distance_m, duration_min, difficulty, source_difficulty_raw, source_id)');
lines.push('values');
const vals = [];
for (const r of ok) {
  for (const c of r.courses) {
    const ls = c.pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
    const [clng, clat] = c.pts[c.pts.length - 1];
    vals.push(
      `  ((select id from mountains where name = '${r.m.name}'), '${r.m.name} ${c.name}',\n` +
      `   st_geomfromtext('LINESTRING(${ls})', 4326),\n` +
      `   st_setsrid(st_makepoint(${clng}, ${clat}), 4326)::geography,\n` +
      `   ${c.distM}, ${c.durMin}, '${c.difficulty}', '${c.raw}', '${c.sourceId}')`
    );
  }
}
lines.push(vals.join(',\n\n'));
lines.push('on conflict (source_id) do update set');
lines.push('  mountain_id = excluded.mountain_id,');
lines.push('  name = excluded.name,');
lines.push('  path = excluded.path,');
lines.push('  checkpoint_point = excluded.checkpoint_point,');
lines.push('  distance_m = excluded.distance_m,');
lines.push('  duration_min = excluded.duration_min,');
lines.push('  difficulty = excluded.difficulty,');
lines.push('  source_difficulty_raw = excluded.source_difficulty_raw;');
lines.push('');

await writeFile(new URL('../seed_seoul.sql', import.meta.url), lines.join('\n'));

for (const r of results) {
  const s = r.courses.length
    ? `${r.courses.length}코스 (${r.courses.map((c) => `${c.name} ${c.distM}m/${c.pts.length}pt`).join(', ')})`
    : `제외 — ${r.reason}`;
  console.log(`${r.m.name}: ${s}`);
}
console.log(`\n산 ${ok.length}개 / 코스 ${ok.reduce((n, r) => n + r.courses.length, 0)}개 → supabase/seed_seoul.sql`);
// 풀 재생성은 identity-unsafe: 코스 셀렉션(들머리 선택·firstWay=source_id)이 드리프트한다 —
// 실측: 우면산 3→2코스, 개화산 source_id 변경(적대 리뷰 HIGH). 이 산출물을 프로덕션에 그대로
// upsert하면 구 코스가 고아로 남고 중복이 생긴다. 기존 코스 갱신은 rebuild_summits.mjs/rebuild_v0.mjs
// 방식(id·이름·source_id 보존 재라우팅)만 사용할 것.
if (MOUNTAINS.some((m) => m.peakOverride))
  console.warn('\n⚠️  peakOverride 산 포함 — 이 seed는 fresh DB 시딩 전용. 프로덕션 upsert 금지(위 주석 참조).');
