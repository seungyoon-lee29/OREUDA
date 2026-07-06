// 생성된 seed_seoul.sql 정합성 검증 — node --test supabase/etl/validate.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../seed_seoul.sql', import.meta.url), 'utf8');
const BBOX = { lngMin: 126.7, lngMax: 127.3, latMin: 37.3, latMax: 37.8 };
const inBbox = ([lng, lat]) =>
  lng >= BBOX.lngMin && lng <= BBOX.lngMax && lat >= BBOX.latMin && lat <= BBOX.latMax;

// 코스 블록 파싱: LINESTRING + 바로 뒤 checkpoint makepoint + 메타
const courseRe = /LINESTRING\(([^)]+)\)', 4326\),\s*st_setsrid\(st_makepoint\(([\d.]+), ([\d.]+)\)[\s\S]*?'(easy|moderate|hard)', '[^']*', '([^']+)'\)/g;
const courses = [...sql.matchAll(courseRe)].map((m) => ({
  path: m[1].split(',').map((p) => p.trim().split(' ').map(Number)),
  checkpoint: [Number(m[2]), Number(m[3])],
  difficulty: m[4],
  sourceId: m[5],
}));

test('코스가 존재하고 산 최소 12개', () => {
  assert.ok(courses.length >= 12, `courses=${courses.length}`);
  const mountains = new Set([...sql.matchAll(/select id from mountains where name = '([^']+)'/g)].map((m) => m[1]));
  assert.ok(mountains.size >= 12, `mountains=${mountains.size}`);
});

test('① 모든 좌표가 서울 근방 bbox 안', () => {
  for (const c of courses)
    for (const pt of [...c.path, c.checkpoint])
      assert.ok(inBbox(pt), `${c.sourceId}: ${pt} bbox 밖`);
  for (const m of sql.matchAll(/\('([^']+)', '[^']*', \d+, ([\d.]+), ([\d.]+)\)/g))
    assert.ok(inBbox([Number(m[2]), Number(m[3])]), `summit ${m[1]} bbox 밖`);
});

test('② path 점수 2~200', () => {
  for (const c of courses)
    assert.ok(c.path.length >= 2 && c.path.length <= 200, `${c.sourceId}: ${c.path.length}pt`);
});

test('③ checkpoint == path 마지막 점', () => {
  for (const c of courses)
    assert.deepEqual(c.path[c.path.length - 1], c.checkpoint, c.sourceId);
});

test('④ source_id 유니크 + 접두사 규칙', () => {
  const ids = courses.map((c) => c.sourceId);
  assert.equal(new Set(ids).size, ids.length, '중복 source_id');
  for (const id of ids) assert.match(id, /^(osm-(rel|way)-\d+|manual-[a-z0-9-]+)$/, id);
});

test('⑤ difficulty 값 유효', () => {
  for (const c of courses) assert.ok(['easy', 'moderate', 'hard'].includes(c.difficulty), c.sourceId);
});
