// ws3 summit 교정 — 우면산(RED)·일자산(RED)·개화산(WARN) 인증점 이동 + 코스 재라우팅.
// rebuild_v0.mjs 패턴: 코스 identity(id·이름·source_id·mountain_id) 보존,
// path·checkpoint_point·distance_m·duration_min·difficulty(·source_difficulty_raw)만 갱신.
// 방식: etl/data/<slug>.json 캐시 ways 그래프 → 신규 summit(config peakOverride) 최근접 노드에서 Dijkstra →
//        각 코스 들머리(교정 전 seed_seoul.sql path 시작점) 최근접 도달 노드 → 최단경로.
//        build.mjs와 동일한 선두 footway 트림·simplify·checkpoint 스냅 적용.
// 출력: supabase/summit_corrections.sql (프로덕션 UPDATE) + supabase/seed_seoul.sql in-place 동기화.
// © OpenStreetMap contributors, ODbL.
import { readFile, writeFile } from 'node:fs/promises';
import { MOUNTAINS } from './config.mjs';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const haversine = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Douglas-Peucker (build.mjs 동일 — 서울 위도 0.0001°≈9~11m)
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

// build.mjs 동일 — prev에 way id 보존(선두 footway 트림용)
function dijkstra(adj, start) {
  const dist = new Map([[start, 0]]), prev = new Map();
  const heap = [[0, start]];
  while (heap.length) {
    let i = 0;
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

// 들머리 = 교정 전 seed_seoul.sql 각 코스 path 시작점 — 재실행해도 동일 기준(고정값)으로 재라우팅되게.
const TARGETS = [
  { slug: 'umyeon', courses: [
    { sourceId: 'osm-way-816075678',  trailhead: [127.00087, 37.45282] }, // 남측
    { sourceId: 'osm-way-1481658401', trailhead: [127.02132, 37.48265] }, // 북동측
    { sourceId: 'osm-way-792788520',  trailhead: [127.00114, 37.47471] }, // 북서측
  ] },
  { slug: 'gaehwa', courses: [
    { sourceId: 'osm-way-1358899464', trailhead: [126.81784, 37.57766] }, // 남동측
    { sourceId: 'osm-way-1383576858', trailhead: [126.80297, 37.58156] }, // 남서측
  ] },
  { slug: 'ilja', courses: [
    { sourceId: 'osm-way-478392845',  trailhead: [127.17076, 37.53335] }, // 동측
    { sourceId: 'osm-way-1524491289', trailhead: [127.14605, 37.52248] }, // 남측
  ] },
];

const NOTE = {
  umyeon: '인증점=소망탑(실질 정상; 실정상은 공군부대 내 접근 불가), 고도 293m(서초구청)',
  ilja: '정상=해맞이광장(사용자 지도 확인), 고도 134m(서울의공원) — 구 좌표는 저봉 계열',
  gaehwa: '정상=봉수대·헬기장(OSM 128.4 노드), 고도 128m(강서구)',
};

const mountainUpdates = [], courseUpdates = [], report = [];
for (const t of TARGETS) {
  const m = MOUNTAINS.find((x) => x.slug === t.slug);
  if (!m?.peakOverride) throw new Error(`${t.slug}: config peakOverride 없음`);
  const { pt: summit, ele } = m.peakOverride;
  const data = JSON.parse(await readFile(new URL(`./data/${t.slug}.json`, import.meta.url), 'utf8'));

  // 그래프 (build.mjs 동일 — footway는 그래프에 남기고 선두 트림으로 처리: 일자산 공원길 보호)
  const coords = new Map(), adj = new Map();
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
    }
  }

  // 신규 summit 최근접 그래프 노드 = 새 목표점
  let startNode = null, best = Infinity;
  for (const [id, pt] of coords) {
    const d = haversine(summit, pt);
    if (d < best) { best = d; startNode = id; }
  }
  // ponytail: 캐시 3산 모두 최근접 ≤64m 실측 — Overpass 재수집 경로는 미구현, 넘으면 fetch.mjs --force 안내
  if (startNode === null || best > 150) throw new Error(`${t.slug}: 신규 summit 최근접 노드 ${Math.round(best)}m — 캐시 범위 밖. node supabase/etl/fetch.mjs --force 후 재실행`);

  const { dist, prev } = dijkstra(adj, startNode);
  const ascent = Math.max(ele - m.baseEle, 30);
  mountainUpdates.push({ slug: t.slug, name: m.name, ele, summit });
  console.log(`\n[${m.name}] summit → (${summit[0]}, ${summit[1]}) ele ${ele}m (정상snap ${Math.round(best)}m)`);

  for (const c of t.courses) {
    // 들머리 최근접 "도달 가능" 노드 (연결 성분 보장 — rebuild_v0 방식)
    let end = null, ed = Infinity;
    for (const id of dist.keys()) {
      const d = haversine(c.trailhead, coords.get(id));
      if (d < ed) { ed = d; end = id; }
    }
    if (end === null) { console.warn(`  ${c.sourceId}: 도달 노드 없음`); continue; }
    // 들머리 이동 가드(적대 리뷰 MEDIUM): 기존 시작점에서 100m 초과 스냅이면 조용히 옮기지 말고 중단
    if (ed > 100) throw new Error(`${c.sourceId}: 들머리 스냅 ${Math.round(ed)}m > 100m — 시작점 이동 위험, 수동 확인 필요`);
    // prev는 startNode(정상)→노드 방향 최단트리 — end(들머리)에서 따라가면 이미 들머리→정상 방향
    const nodePath = [end], edgeWays = []; // edgeWays[i] = nodePath[i]~[i+1] 간선의 way id
    for (let cur = end; cur !== startNode;) {
      const p = prev.get(cur);
      edgeWays.push(p.way);
      nodePath.push(p.from);
      cur = p.from;
    }
    // 선두 footway 트림 (build.mjs 동일: 잔여 ≤ minDist면 중단)
    let cut = 0, len = dist.get(end);
    while (cut < edgeWays.length && footway.has(edgeWays[cut])) {
      const e = haversine(coords.get(nodePath[cut]), coords.get(nodePath[cut + 1]));
      if (len - e <= m.minDist) break;
      len -= e;
      cut++;
    }
    let pts = nodePath.slice(cut).map((id) => coords.get(id)); // 들머리→정상
    pts = simplify(pts, 0.0001);
    for (let eps = 0.0002; pts.length > 120; eps *= 1.5) pts = simplify(pts, eps);
    pts = pts.map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)]);
    // path 마지막 점 = checkpoint = 신규 summit 좌표 스냅 (build.mjs 동일)
    const s5 = [+summit[0].toFixed(5), +summit[1].toFixed(5)];
    // summit 연결선(최근접 노드→교정 좌표, =best)을 거리에도 포함 — path에만 넣고 거리 누락하면
    // 개화산 기준 최대 64m 과소표기(적대 리뷰 LOW)
    if (pts[pts.length - 1][0] !== s5[0] || pts[pts.length - 1][1] !== s5[1]) { pts.push(s5); len += best; }
    const distM = Math.round(len);
    // duration·difficulty: build.mjs 휴리스틱 동일 (ascent는 신규 고도 기준)
    const durMin = Math.round((distM / 1000 / 4) * 60 + (ascent / 300) * 30);
    const easy = ascent < 100 ? distM < 4000 : distM < 2500 && ascent < 300;
    const difficulty = easy ? 'easy' : distM >= 5000 || ascent >= 500 ? 'hard' : 'moderate';
    const raw = `OSM 경로합산 ${distM}m, 상승근사 ${ascent}m(정상 ${ele}m - 들머리근사 ${m.baseEle}m), 휴리스틱 판정, 정상점=ws3 교정 좌표`;
    courseUpdates.push({ sourceId: c.sourceId, pts, distM, durMin, difficulty, raw });
    report.push({
      mountain: m.name, sourceId: c.sourceId, distM, durMin, difficulty, npts: pts.length,
      trailSnap: Math.round(ed), startShift: Math.round(haversine(c.trailhead, pts[0])),
      trimmedEdges: cut, ckToSummit: Math.round(haversine(pts[pts.length - 1], summit)),
    });
    console.log(`  ${c.sourceId}: ${distM}m ${pts.length}pt ${difficulty}/${durMin}min ` +
      `(들머리snap ${Math.round(ed)}m, 트림 ${cut}간선, 시작점 이동 ${Math.round(haversine(c.trailhead, pts[0]))}m, ` +
      `checkpoint↔summit ${Math.round(haversine(pts[pts.length - 1], summit))}m)`);
  }
}

// ── summit_corrections.sql — 트랜잭션 없이 문장 나열(적용 시 메인이 트랜잭션으로 감쌈)
const lines = [
  '-- ws3 summit 교정 — 우면산(RED)·일자산(RED)·개화산(WARN). 남산(WARN, 선택)은 스킵.',
  '-- 생성: node supabase/etl/rebuild_summits.mjs — 코스 identity(id·이름·source_id) 보존, 판정·경로 데이터만 갱신.',
  '-- 적용: 메인 게이트 후 수동(트랜잭션으로 감싸 적용 권장). © OpenStreetMap contributors, ODbL.',
  '',
];
for (const mu of mountainUpdates) {
  lines.push(
    `-- ${mu.name}: ${NOTE[mu.slug]}`,
    `update mountains set`,
    `  summit_point = st_setsrid(st_makepoint(${+mu.summit[0].toFixed(5)}, ${+mu.summit[1].toFixed(5)}), 4326)::geography,`,
    `  elevation_m = ${mu.ele}`,
    `where name = '${mu.name}';`,
    '',
  );
}
for (const u of courseUpdates) {
  const ls = u.pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  const [clng, clat] = u.pts[u.pts.length - 1];
  lines.push(
    `update courses set`,
    `  path = st_geomfromtext('LINESTRING(${ls})', 4326),`,
    `  checkpoint_point = st_setsrid(st_makepoint(${clng}, ${clat}), 4326)::geography,`,
    `  distance_m = ${u.distM},`,
    `  duration_min = ${u.durMin},`,
    `  difficulty = '${u.difficulty}',`,
    `  source_difficulty_raw = '${u.raw}'`,
    `where source_id = '${u.sourceId}';`,
    '',
  );
}
await writeFile(new URL('../summit_corrections.sql', import.meta.url), lines.join('\n'));
console.log(`\n→ supabase/summit_corrections.sql (mountains ${mountainUpdates.length} + courses ${courseUpdates.length} UPDATE)`);

// ── seed_seoul.sql in-place 동기화 (재시딩 일관성) — 3산 mountains 행 + 해당 코스 블록만 치환
const seedUrl = new URL('../seed_seoul.sql', import.meta.url);
let seed = await readFile(seedUrl, 'utf8');
for (const mu of mountainUpdates) {
  const re = new RegExp(`\\('${mu.name}', '([^']+)', [\\d.]+, [\\d.]+, [\\d.]+\\)`);
  if (!re.test(seed)) throw new Error(`seed: mountains '${mu.name}' 행 못 찾음`);
  seed = seed.replace(re, `('${mu.name}', '$1', ${mu.ele}, ${+mu.summit[0].toFixed(5)}, ${+mu.summit[1].toFixed(5)})`);
}
const bySourceId = new Map(courseUpdates.map((u) => [u.sourceId, u]));
const blockRe = /\(\(select id from mountains where name = '([^']+)'\), '([^']+)',\s*\n\s*st_geomfromtext\('LINESTRING\([^)]*\)', 4326\),\s*\n\s*st_setsrid\(st_makepoint\([^)]*\), 4326\)::geography,\s*\n\s*\d+, \d+, '[^']+', '[^']*', '([^']+)'\)/g;
let replaced = 0;
seed = seed.replace(blockRe, (block, mtn, cname, sid) => {
  const u = bySourceId.get(sid);
  if (!u) return block;
  replaced++;
  const ls = u.pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  const [clng, clat] = u.pts[u.pts.length - 1];
  return `((select id from mountains where name = '${mtn}'), '${cname}',\n` +
    `   st_geomfromtext('LINESTRING(${ls})', 4326),\n` +
    `   st_setsrid(st_makepoint(${clng}, ${clat}), 4326)::geography,\n` +
    `   ${u.distM}, ${u.durMin}, '${u.difficulty}', '${u.raw}', '${sid}')`;
});
if (replaced !== courseUpdates.length) throw new Error(`seed: 코스 블록 치환 ${replaced}/${courseUpdates.length} — 포맷 확인`);
await writeFile(seedUrl, seed);
console.log(`→ supabase/seed_seoul.sql 동기화 (mountains ${mountainUpdates.length}행 + 코스 블록 ${replaced}개)`);

// ── 자체 검증
for (const r of report) {
  if (r.ckToSummit !== 0) throw new Error(`${r.sourceId}: checkpoint↔summit ${r.ckToSummit}m ≠ 0`);
}
console.log('검증: 전 코스 checkpoint == 신규 summit (0m). source_id·이름 불변(치환 키).');
