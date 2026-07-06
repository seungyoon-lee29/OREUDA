// Overpass에서 산별 peak + 주변 등산로 way를 받아 etl/data/<slug>.json 캐시로 저장.
// 재실행 가능: 캐시가 있으면 스킵 (--force로 새로 받음).
// 레이트리밋 대응: peak은 서울 bbox 한 방, way는 4산씩 묶은 union around 쿼리로 요청 수 최소화.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { MOUNTAINS, OVERPASS, OVERPASS_MIRROR, UA } from './config.mjs';

const DATA = new URL('./data/', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BBOX = '37.3,126.7,37.8,127.3'; // s,w,n,e

const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const hav = ([lng1, lat1], [lng2, lat2]) => {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

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
      await sleep(10000 * (i + 1)); // ponytail: 익명 슬롯이라 30s+까지 백오프
    }
  }
  throw new Error('overpass failed after retries');
}

await mkdir(DATA, { recursive: true });
const force = process.argv.includes('--force');
const cached = async (slug) => access(new URL(`${slug}.json`, DATA)).then(() => true, () => false);
const todo = [];
for (const m of MOUNTAINS) (!force && (await cached(m.slug))) ? console.log(`${m.slug}: cached, skip`) : todo.push(m);
if (!todo.length) process.exit(0);

// 1) 서울 bbox 전체 peak 한 방 → 산별 로컬 매칭 (nameRe + hint 4km 내, 최고 고도 우선)
const peaks = (await overpass(`[out:json][timeout:60];node["natural"="peak"]["name"](${BBOX});out;`)).elements ?? [];
console.log(`peaks in bbox: ${peaks.length}`);
const peakOf = {};
for (const m of todo) {
  const re = new RegExp(m.nameRe);
  const cand = peaks
    .filter((p) => re.test(p.tags.name) && hav(m.hint, [p.lon, p.lat]) <= 4000)
    .sort((a, b) => (parseFloat(b.tags.ele) || 0) - (parseFloat(a.tags.ele) || 0));
  peakOf[m.slug] = cand[0] ?? null;
  if (!cand[0]) console.warn(`${m.slug}: NO PEAK MATCH`);
}

// 2) way는 4산씩 union around 쿼리 → 산별로 되쪼개 캐시
for (let i = 0; i < todo.length; i += 4) {
  const group = todo.slice(i, i + 4).filter((m) => peakOf[m.slug]);
  if (!group.length) continue;
  const clauses = group
    .map((m) => `way["highway"~"^(path|footway|steps|track)$"](around:${m.radius},${peakOf[m.slug].lat},${peakOf[m.slug].lon});`)
    .join('');
  console.log(`fetching ways for: ${group.map((m) => m.slug).join(', ')}`);
  const ways = (await overpass(`[out:json][timeout:180];(${clauses});out geom;`)).elements ?? [];
  for (const m of group) {
    const peak = peakOf[m.slug];
    const pk = [peak.lon, peak.lat];
    const mine = ways.filter((w) => w.geometry?.some((g) => hav(pk, [g.lon, g.lat]) <= m.radius));
    await writeFile(new URL(`${m.slug}.json`, DATA), JSON.stringify({ mountain: m.slug, peak, ways: mine }));
    console.log(`${m.slug}: peak=${peak.tags.name} ele=${peak.tags.ele ?? '?'} ways=${mine.length}`);
  }
  await sleep(8000);
}
// peak 못 찾은 산도 빈 캐시로 기록 (build에서 '데이터 없음' 처리)
for (const m of todo)
  if (!peakOf[m.slug]) await writeFile(new URL(`${m.slug}.json`, DATA), JSON.stringify({ mountain: m.slug, peak: null, ways: [] }));
