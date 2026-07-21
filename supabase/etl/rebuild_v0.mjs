// v0 3산(북한산·관악산·청계산) 코스 path만 실제 OSM 등산로로 교체.
// 코스 id·이름·checkpoint·source_id·difficulty·duration은 보존(수작업 큐레이션) — path·distance_m만 실측 반영.
// 방식: Overpass 등산로 way 수집 → 그래프 → 각 코스 (목표봉 최근접 노드 Dijkstra, 들머리 최근접 도달노드) 최단경로.
// 출력: supabase/v0_real_paths.sql (UPDATE ... WHERE source_id=...). checkpoint/이름 불변이라 climbs FK·기록 안전.
import { readFile, writeFile } from 'node:fs/promises';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter';
const UA = 'hiking-app-etl/0.1 (seoul v0 repath; contact: dev@local)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const haversine = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Douglas-Peucker (build.mjs와 동일 — 서울 위도 0.0001°≈9~11m)
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

function dijkstra(adj, start) {
  const dist = new Map([[start, 0]]), prev = new Map();
  const heap = [[0, start]];
  while (heap.length) {
    let i = 0;
    for (let j = 1; j < heap.length; j++) if (heap[j][0] < heap[i][0]) i = j;
    const [d, u] = heap.splice(i, 1)[0];
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const { to, w } of adj.get(u) ?? []) {
      const nd = d + w;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, u);
        heap.push([nd, to]);
      }
    }
  }
  return { dist, prev };
}

async function overpass(query) {
  for (let i = 0; i < 8; i++) {
    const url = i % 2 ? OVERPASS_MIRROR : OVERPASS;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`  retry ${i + 1} (${url === OVERPASS ? 'main' : 'mirror'}): ${e.message}`);
      await sleep(10000 * (i + 1));
    }
  }
  throw new Error('overpass failed after retries');
}

// 각 코스: target=목표봉(=기존 checkpoint 좌표, path 종점), trailhead=v0 path 첫점(들머리 의도).
const MOUNTAINS = [
  {
    name: '북한산', center: [126.9787, 37.6592], radius: 4300,
    courses: [
      { sourceId: 'v0-bhs-baegundae', target: [126.9780, 37.6590], trailhead: [126.9887, 37.6633] }, // 백운대
      { sourceId: 'v0-bhs-sanseong', target: [126.9780, 37.6590], trailhead: [126.9430, 37.6580] },  // 백운대(산성 서측)
      { sourceId: 'v0-bhs-bibong', target: [126.95625, 37.62561], trailhead: [126.9628, 37.6199] },   // 비봉(실제 OSM peak 560m — 2026-07-20 재앵커, 구 target 126.956,37.63은 비봉서 489m 북 오설정)
    ],
  },
  {
    name: '관악산', center: [126.9640, 37.4430], radius: 4300,
    courses: [
      // 들머리를 관악산역(도심)에서 실제 등산로 입구(칠성당계곡 부근)로 올림 — 서울대 캠퍼스 도로 ~2km 접근로 제거, 산 루트만 남김.
      { sourceId: 'v0-gas-seouldae', target: [126.9640, 37.4430], trailhead: [126.9497, 37.4508] },
      { sourceId: 'v0-gas-gwacheon', target: [126.9640, 37.4430], trailhead: [126.9856, 37.4363] },
      { sourceId: 'v0-gas-sadang', target: [126.9640, 37.4430], trailhead: [126.9825, 37.4745] },
    ],
  },
  {
    name: '청계산', center: [127.0464, 37.4243], radius: 3300,
    courses: [
      { sourceId: 'v0-cgs-wonteogol', target: [127.0464, 37.4243], trailhead: [127.0560, 37.4460] },
      { sourceId: 'v0-cgs-yetgol', target: [127.0464, 37.4243], trailhead: [127.0680, 37.4310] },
    ],
  },
];

function buildGraph(ways) {
  const coords = new Map(), adj = new Map();
  for (const w of ways) {
    if (!w.geometry || !w.nodes) continue;
    for (let i = 0; i < w.nodes.length; i++) coords.set(w.nodes[i], [w.geometry[i].lon, w.geometry[i].lat]);
    for (let i = 1; i < w.nodes.length; i++) {
      const [u, v] = [w.nodes[i - 1], w.nodes[i]];
      const wgt = haversine(coords.get(u), coords.get(v));
      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);
      adj.get(u).push({ to: v, w: wgt });
      adj.get(v).push({ to: u, w: wgt });
    }
  }
  return { coords, adj };
}

const nearestNode = (coords, pt, filter = () => true) => {
  let best = null, bd = Infinity;
  for (const [id, c] of coords) {
    if (!filter(id)) continue;
    const d = haversine(pt, c);
    if (d < bd) { bd = d; best = id; }
  }
  return { id: best, d: bd };
};

const updates = [];
for (const m of MOUNTAINS) {
  const cacheUrl = new URL(`./data/v0-${m.name}.json`, import.meta.url);
  let ways;
  try {
    ways = JSON.parse(await readFile(cacheUrl, 'utf8'));
    console.log(`\n[${m.name}] cached ways`);
  } catch {
    console.log(`\n[${m.name}] fetching ways around ${m.center} r=${m.radius}…`);
    const q = `[out:json][timeout:180];(way["highway"~"^(path|steps|track)$"](around:${m.radius},${m.center[1]},${m.center[0]}););out geom;`;
    ways = (await overpass(q)).elements ?? [];
    await writeFile(cacheUrl, JSON.stringify(ways));
  }
  // footway 제외: 도심 인도·캠퍼스 보도(예: 서울대 캠퍼스)가 등산로 그래프에 섞여 코스가 산길이 아닌
  // 도보 접근로를 타고 오르던 문제 해결 — 산 루트(path/steps/track)만 남긴다. 캐시엔 tags가 있어 재요청 불필요.
  ways = ways.filter((w) => w.tags?.highway !== 'footway');
  console.log(`  ways=${ways.length} (footway 제외)`);
  const { coords, adj } = buildGraph(ways);
  console.log(`  nodes=${coords.size}`);

  for (const c of m.courses) {
    const start = nearestNode(coords, c.target); // 목표봉 최근접 노드 = Dijkstra 소스
    if (start.id === null) { console.warn(`  ${c.sourceId}: 노드 없음`); continue; }
    const { dist, prev } = dijkstra(adj, start.id);
    // 들머리 최근접 "도달 가능" 노드 (연결 성분 보장)
    const end = nearestNode(coords, c.trailhead, (id) => dist.has(id));
    if (end.id === null) { console.warn(`  ${c.sourceId}: 도달 노드 없음`); continue; }
    // 복원 start→end 후 뒤집어 들머리→목표봉
    // prev는 start(정상)→노드 방향 최단트리. end(들머리)에서 prev를 따라가면 end→…→start,
    // 즉 nodePath가 이미 들머리→정상 방향이다(reverse 불필요).
    const nodePath = [end.id];
    for (let cur = end.id; cur !== start.id;) { cur = prev.get(cur); nodePath.push(cur); }
    let pts = nodePath.map((id) => coords.get(id)); // 들머리→정상
    pts = simplify(pts, 0.0001);
    for (let eps = 0.0002; pts.length > 120; eps *= 1.5) pts = simplify(pts, eps);
    pts = pts.map(([lng, lat]) => [+lng.toFixed(5), +lat.toFixed(5)]);
    // 종점을 checkpoint(정상) 정확 좌표로 — 라인이 정상 마커까지 닿게
    const t5 = [+c.target[0].toFixed(5), +c.target[1].toFixed(5)];
    if (pts[pts.length - 1][0] !== t5[0] || pts[pts.length - 1][1] !== t5[1]) pts.push(t5);
    const distM = Math.round(dist.get(end.id));
    updates.push({ sourceId: c.sourceId, pts, distM, snapTarget: Math.round(start.d), snapTrail: Math.round(end.d) });
    console.log(`  ${c.sourceId}: ${distM}m, ${pts.length}pt (정상snap ${Math.round(start.d)}m, 들머리snap ${Math.round(end.d)}m)`);
  }
  await sleep(6000);
}

// SQL 생성 — path + distance_m만 갱신(checkpoint/이름/난이도/duration 보존).
const lines = [
  '-- v0 3산(북한산·관악산·청계산) 코스 실경로 교체 — OSM Overpass 등산로 그래프 최단경로.',
  '-- 생성: node supabase/etl/rebuild_v0.mjs. path·distance_m만 갱신(checkpoint/이름/난이도/duration 보존).',
  '-- © OpenStreetMap contributors, ODbL.',
  '',
];
for (const u of updates) {
  const ls = u.pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  lines.push(
    `update courses set\n` +
    `  path = st_geomfromtext('LINESTRING(${ls})', 4326),\n` +
    `  distance_m = ${u.distM}\n` +
    `where source_id = '${u.sourceId}';`,
    '',
  );
}
await writeFile(new URL('../v0_real_paths.sql', import.meta.url), lines.join('\n'));
console.log(`\n→ supabase/v0_real_paths.sql (${updates.length} UPDATE)`);
