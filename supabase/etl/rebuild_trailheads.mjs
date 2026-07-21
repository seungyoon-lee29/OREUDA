// 들머리/종주 교정 — 코스 시작점을 실제 들머리로 트림. 두 갈래:
//   (A) wood 트림: 한양도성 등 도심까지 뻗은 트레일이 그래프 말단(도심 길목)에서 시작하던 코스를
//       산 natural=wood 경계 진입점부터 시작하도록 선두 도심 접근로를 자름. → TARGETS
//   (B) 큐레이션 종주 트림: 인접 산을 종주하다 대상 산 정상에서 끝나 오분류된 코스(인접 산도 wood라
//       wood 방식이 못 잡음)를, 명시 컷 좌표(경로상 실측 최근접 점)부터 시작하도록 선두를 자름. → CURATED_TRIMS
// rebuild_summits.mjs 패턴: 코스 identity(id·이름·source_id·mountain_id·checkpoint) 보존,
//   path·distance_m·duration_min·difficulty(·source_difficulty_raw)만 갱신. 정상(마지막 점)은 불변.
//   기존 seed_seoul.sql path를 source로, 선두만 절단(외과적). wood 경계 = data/wood/<slug>.json
//   (natural=wood 폴리곤, 별도 캐시 — way 그래프 캐시는 동결해 identity 보존).
// 출력: supabase/trailhead_corrections.sql (프로덕션 UPDATE) + supabase/seed_seoul.sql in-place 동기화.
// 멱등: 이미 트림된 코스는 재실행 시 ti=0 또는 트림<300m로 스킵(남산 2코스 등 반영 완료분).
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
// ray-casting point-in-polygon (도 좌표 평면 근사 — 서울 국지 범위에서 충분)
const inPoly = (pt, poly) => {
  let x = pt[0], y = pt[1], c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
};
const inAny = (pt, polys) => polys.some((p) => inPoly(pt, p));
// 큐레이션 컷: 경로 점들 중 컷 좌표에 실측 최근접 인덱스. 컷점이 경로 위에 없으면(>30m) 에러(오설정 방어).
const nearestIdx = (pts, cut) => {
  let best = -1, bd = Infinity;
  for (let i = 0; i < pts.length; i++) { const d = haversine(pts[i], cut); if (d < bd) { bd = d; best = i; } }
  if (bd > 30) throw new Error(`컷점 ${cut.join(',')} 경로 최근접 ${Math.round(bd)}m > 30m — 컷점이 경로 위에 없음`);
  return best;
};
// SQL 문자열 리터럴 이스케이프 — 생성 SQL이 프로덕션 DB에 직접 실행되므로, 합성 문자열(raw 등)의 작은따옴표 방어.
const sqlEsc = (s) => String(s).replace(/'/g, "''");
// 들머리 = 이후 ≥80%가 산 안인 첫 진입점(찰나의 조각 wood·도중 공터 통과 무시). 없으면 -1.
function trailheadIdx(flags) {
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    const rest = flags.slice(i);
    if (rest.filter(Boolean).length / rest.length >= 0.8) return i;
  }
  return -1;
}
// 멀티폴리곤 relation: outer 멤버 way들을 공유 끝점으로 이어 닫힌 링으로 조립(codex 적대 리뷰 — way만 쓰면
// 인왕산 wood relation 누락 → 과다절단). inner 홀은 무시(over-inclusion = 트림 덜 함 = 안전 방향).
const eqPt = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
function ringsFromRelation(rel) {
  const outer = (rel.members || [])
    .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry?.length >= 2)
    .map((m) => m.geometry.map((g) => [g.lon, g.lat]));
  const rings = [], used = new Set();
  for (let s = 0; s < outer.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    let ring = outer[s].slice(), go = true;
    while (go && !eqPt(ring[0], ring[ring.length - 1])) {
      go = false;
      for (let i = 0; i < outer.length; i++) {
        if (used.has(i)) continue;
        const w = outer[i], e = ring[ring.length - 1];
        if (eqPt(e, w[0])) { ring = ring.concat(w.slice(1)); used.add(i); go = true; break; }
        if (eqPt(e, w[w.length - 1])) { ring = ring.concat(w.slice().reverse().slice(1)); used.add(i); go = true; break; }
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
async function loadWood(slug) {
  const d = JSON.parse(await readFile(new URL(`./data/wood/${slug}.json`, import.meta.url), 'utf8'));
  const polys = [];
  for (const e of d.elements || []) {
    if (e.tags?.natural !== 'wood') continue;
    if (e.type === 'way' && e.geometry?.length >= 4) polys.push(e.geometry.map((g) => [g.lon, g.lat]));
    else if (e.type === 'relation') polys.push(...ringsFromRelation(e));
  }
  return polys;
}

// codex 적대 리뷰(BLOCK): 인왕산 2코스는 wood relation 포함 시 도심 트림이 -190m/-24m로 무의미
//   — way만 보던 초기 판정의 과다절단 오탐. 인왕산은 이미 실제 들머리에서 시작 → 대상 제외.
// 실제 도심-시작 문제는 남산 2코스뿐(남산공원=단일 way라 relation 무관, 트림 안정).
const TARGETS = [
  { slug: 'namsan', sourceId: 'osm-way-779271377' },  // 남산 동측 — 장충/동대입구 도심 제거(GS25)
  { slug: 'namsan', sourceId: 'osm-way-1209132245' }, // 남산 북서측 — 회현/남대문 도심 제거
];

// 큐레이션 종주 트림(B) — wood로 못 잡는 산-대-산 종주 오분류. cut = 트림 후 시작점(경로상 실측 최근접), label = 잘라내는 인접 산.
const CURATED_TRIMS = [
  // 인왕산 동측: 실체가 북악산 종주 80%(시작 1.8km 동쪽, 북악 정상 43m 통과) → 창의문부터 순수 인왕 코스(903m)로.
  //   북악산은 이미 자체 3코스라 커버리지 손실 없음. 사용자 승인·프로덕션 경로 점검 2026-07-20.
  { slug: 'inwang', sourceId: 'osm-way-1059266490', cut: [126.96455, 37.58932], label: '북악산' },
];

const seedUrl = new URL('../seed_seoul.sql', import.meta.url);
let seed = await readFile(seedUrl, 'utf8');
// 코스 블록: mountain·name·LINESTRING·checkpoint·distM·durMin·difficulty·raw·source_id
const blockRe = /\(\(select id from mountains where name = '([^']+)'\), '([^']+)',\s*\n\s*st_geomfromtext\('LINESTRING\(([^)]*)\)', 4326\),\s*\n\s*st_setsrid\(st_makepoint\(([-\d.]+), ([-\d.]+)\), 4326\)::geography,\s*\n\s*(\d+), (\d+), '([^']+)', '([^']*)', '([^']+)'\)/g;

const woodCache = {};
const courseUpdates = [], report = [];
const blocks = [...seed.matchAll(blockRe)];

// 트림 인덱스 ti가 주어지면 courseUpdate/report 생성 — wood(A)·curated(B) 공통. identity·정상 불변 가드, 판정 휴리스틱.
// kind: 'wood'(도심 접근로) | 'cut'(인접 산 종주). label: cut일 때 잘라내는 인접 산 이름. null 반환 = 멱등 스킵.
function buildTrim(blk, m, ti, kind, label) {
  const [, mtn, cname, lineStr, ckLng, ckLat, , , , , sid] = blk;
  const pts = lineStr.split(',').map((s) => s.trim().split(/\s+/).map(Number));
  const summit = [+ckLng, +ckLat]; // checkpoint = 정상 (불변)
  if (ti === 0) { console.warn(`  ${sid}: 이미 시작점에서 시작 — 트림 생략(멱등 재실행)`); return null; }

  const newPts = pts.slice(ti); // 트림점→정상, 마지막 점 = 기존 checkpoint 그대로
  // 안전 가드: 정상(마지막 점)·checkpoint 불변 — 부동소수 파싱 방어로 허용오차 1m
  const last = newPts[newPts.length - 1];
  if (haversine(last, summit) > 1) throw new Error(`${sid}: 정상점 이동 ${Math.round(haversine(last, summit))}m ≠ 0`);
  let distM = 0;
  for (let i = 1; i < newPts.length; i++) distM += haversine(newPts[i - 1], newPts[i]);
  distM = Math.round(distM);
  if (distM < 300 || newPts.length < 4) throw new Error(`${sid}: 트림 후 ${distM}m/${newPts.length}pt — 과다절단 의심`);
  if (distM < m.minDist) console.warn(`  ⚠ ${sid}: 트림 후 ${distM}m < minDist ${m.minDist}m — 짧음, 수동 확인 권장`);
  // 트림량 = 잘라낸 선두 구간(pts[0..ti]) 길이. 무의미(<300m)면 이미 시작점 → 생략(오탐/멱등 방어).
  const trimM = Math.round(pts.slice(0, ti + 1).reduce((a, _, i) => (i ? a + haversine(pts[i - 1], pts[i]) : 0), 0));
  if (trimM < 300) { console.warn(`  ${sid}: 트림 ${trimM}m < 300m — 무의미(이미 시작점), 생략`); return null; }

  // duration·difficulty: build.mjs 휴리스틱 동일. ascent=ele-baseEle(선두 트림 후 산행부만 남아 근사 타당).
  const ele = m.ele, ascent = Math.max(ele - m.baseEle, 30);
  const durMin = Math.round((distM / 1000 / 4) * 60 + (ascent / 300) * 30);
  const easy = ascent < 100 ? distM < 4000 : distM < 2500 && ascent < 300;
  const difficulty = easy ? 'easy' : distM >= 5000 || ascent >= 500 ? 'hard' : 'moderate';
  const clause = kind === 'wood'
    ? `산 wood 진입점부터 시작(도심 접근로 -${trimM}m 트림)`
    : `${label} 종주 구간 제거(선두 -${trimM}m 트림)`;
  const raw = `들머리 교정 — ${clause}, OSM 경로합산 ${distM}m, 상승근사 ${ascent}m(정상 ${ele}m - 들머리근사 ${m.baseEle}m), 휴리스틱 판정`;

  courseUpdates.push({ sourceId: sid, mtn, cname, pts: newPts, summit, distM, durMin, difficulty, raw });
  report.push({ mtn, cname, sourceId: sid, oldNpts: pts.length, newNpts: newPts.length, trimM, distM, durMin, difficulty, newStart: newPts[0], ckShift: Math.round(haversine(last, summit)) });
  console.log(`[${mtn} · ${cname}] ${sid}: -${trimM}m → ${distM}m ${newPts.length}pt ${difficulty}/${durMin}min (새 시작 ${newPts[0].join(',')})`);
  return true;
}

const blkOf = (sid) => { const b = blocks.find((x) => x[10] === sid); if (!b) throw new Error(`seed: source_id ${sid} 블록 못 찾음`); return b; };
const cfgOf = (slug) => { const m = MOUNTAINS.find((x) => x.slug === slug); if (!m) throw new Error(`${slug}: config 없음`); return m; };

// (A) wood 트림 — 산 경계 진입점까지 선두 도심 절단
for (const t of TARGETS) {
  const blk = blkOf(t.sourceId);
  const pts = blk[3].split(',').map((s) => s.trim().split(/\s+/).map(Number));
  const polys = (woodCache[t.slug] ??= await loadWood(t.slug));
  const ti = trailheadIdx(pts.map((p) => inAny(p, polys)));
  if (ti < 0) throw new Error(`${t.sourceId}: wood 진입 없음 — 대상/데이터 재확인`);
  buildTrim(blk, cfgOf(t.slug), ti, 'wood', null);
}

// (B) 큐레이션 종주 트림 — 명시 컷 좌표(경로상 실측 최근접)부터 선두(인접 산 종주) 절단
for (const t of CURATED_TRIMS) {
  const blk = blkOf(t.sourceId);
  const pts = blk[3].split(',').map((s) => s.trim().split(/\s+/).map(Number));
  buildTrim(blk, cfgOf(t.slug), nearestIdx(pts, t.cut), 'cut', t.label);
}

// 전부 멱등 스킵(예: 이미 반영된 상태로 재실행)이면 생성할 UPDATE가 없음 — SQL의 `in ()` 문법오류·불필요한 seed 재기록 방지.
if (courseUpdates.length === 0) { console.log('\n전부 멱등 스킵 — 생성할 UPDATE 없음. trailhead_corrections.sql·seed_seoul.sql 미변경.'); process.exit(0); }

// ── trailhead_corrections.sql — 프로덕션 UPDATE(트랜잭션 없이 나열; 적용 시 메인이 감쌈)
const n = courseUpdates.length;
const nameList = courseUpdates.map((u) => u.cname).join('·') || '(없음 — 전부 멱등 스킵)';
const lines = [
  `-- 들머리/종주 교정 — 코스 시작점을 실제 들머리로 트림(${n}코스: ${nameList}).`,
  '-- 생성: node supabase/etl/rebuild_trailheads.mjs — identity(id·이름·source_id·checkpoint) 보존, path·거리·판정만 갱신.',
  `-- 원자적 적용: begin/commit + 대상 source_id ${n}개 존재 검증(하나라도 없으면 전체 롤백). © OpenStreetMap contributors, ODbL.`,
  '',
  'begin;',
  '',
];
for (const u of courseUpdates) {
  const ls = u.pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  lines.push(
    `-- ${u.mtn} · ${u.cname}`,
    `update courses set`,
    `  path = st_geomfromtext('LINESTRING(${ls})', 4326),`,
    `  distance_m = ${u.distM},`,
    `  duration_min = ${u.durMin},`,
    `  difficulty = '${sqlEsc(u.difficulty)}',`,
    `  source_difficulty_raw = '${sqlEsc(u.raw)}'`,
    `where source_id = '${u.sourceId}';`,
    '',
  );
}
// 존재·건수 검증: 대상 source_id 전부 있어야 커밋(오타·시드 드리프트로 0행 조용히 통과 방지 — 리뷰 HIGH)
const sidList = courseUpdates.map((u) => `'${u.sourceId}'`).join(', ');
lines.push(
  `-- 검증: 대상 source_id ${courseUpdates.length}개 전부 존재해야 커밋(아니면 예외→롤백)`,
  `do $$ declare n int; begin`,
  `  select count(*) into n from courses where source_id in (${sidList});`,
  `  if n <> ${courseUpdates.length} then raise exception '들머리 교정 대상 % 개 존재(% 기대) — 롤백', n, ${courseUpdates.length}; end if;`,
  `end $$;`,
  '',
  'commit;',
  '',
);
await writeFile(new URL('../trailhead_corrections.sql', import.meta.url), lines.join('\n'));
console.log(`\n→ supabase/trailhead_corrections.sql (courses ${courseUpdates.length} UPDATE)`);

// ── seed_seoul.sql in-place 동기화 (재시딩 일관성) — 해당 코스 블록만 치환, checkpoint 유지
const bySid = new Map(courseUpdates.map((u) => [u.sourceId, u]));
let replaced = 0;
seed = seed.replace(blockRe, (block, mtn, cname, _ls, ckLng, ckLat, _d, _du, _df, _raw, sid) => {
  const u = bySid.get(sid);
  if (!u) return block;
  replaced++;
  const ls = u.pts.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `((select id from mountains where name = '${mtn}'), '${cname}',\n` +
    `   st_geomfromtext('LINESTRING(${ls})', 4326),\n` +
    `   st_setsrid(st_makepoint(${ckLng}, ${ckLat}), 4326)::geography,\n` +
    `   ${u.distM}, ${u.durMin}, '${sqlEsc(u.difficulty)}', '${sqlEsc(u.raw)}', '${sid}')`;
});
if (replaced !== courseUpdates.length) throw new Error(`seed: 코스 블록 치환 ${replaced}/${courseUpdates.length} — 포맷 확인`);
await writeFile(seedUrl, seed);
console.log(`→ supabase/seed_seoul.sql 동기화 (코스 블록 ${replaced}개)`);

// ── 자체 검증: checkpoint 불변(0m) — 트림된 코스 전부
for (const r of report) if (r.ckShift !== 0) throw new Error(`${r.sourceId}: checkpoint 이동 ${r.ckShift}m ≠ 0`);
console.log('\n검증: 전 코스 checkpoint 불변(0m), source_id·이름·mountain_id 보존(치환 키).');
console.table(report.map((r) => ({ 코스: `${r.mtn} ${r.cname}`, 트림제거m: r.trimM, 새거리m: r.distM, pt: `${r.oldNpts}→${r.newNpts}`, 판정: r.difficulty })));
