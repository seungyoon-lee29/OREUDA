// 로컬 판정은 haversine 미터 직접 계산 — degree 단위 실수가 구조적으로 불가 (04 §5)
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 등반 진행률 — 현재 위치를 코스 경로(들머리→정상)에 투영. frac=누적거리/전체(0..1), offM=경로 최근접점까지 거리(m).
// path=[lng,lat][]. 로컬 등거리 평면(경도 cos(lat) 보정)에서 각 세그먼트에 투영해 최근접 세그먼트를 찾는다.
// offM은 호출부에서 "코스 이탈(먼 곳)" 판별용 — 경로에서 크게 벗어나면 frac은 의미 없어(끝점으로 collapse) 라인을 숨긴다.
export function pathProgress(
  path: [number, number][],
  lat: number,
  lng: number,
): { frac: number; offM: number } {
  if (path.length < 2) return { frac: 0, offM: Infinity };
  const kx = Math.cos((lat * Math.PI) / 180); // 경도 1도의 상대 미터 스케일
  const Px = lng * kx;
  const Py = lat;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineM(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return { frac: 0, offM: haversineM(lat, lng, path[0][1], path[0][0]) };
  let bestD2 = Infinity;
  let bestCum = 0;
  let bestProjLat = path[0][1];
  let bestProjLng = path[0][0];
  let cum = 0;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0] * kx, ay = path[i - 1][1];
    const bx = path[i][0] * kx, by = path[i][1];
    const abx = bx - ax, aby = by - ay;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 > 0 ? ((Px - ax) * abx + (Py - ay) * aby) / ab2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = Px - (ax + abx * t), dy = Py - (ay + aby * t);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestCum = cum + seg[i - 1] * t;
      bestProjLat = ay + aby * t;
      bestProjLng = (ax + abx * t) / kx;
    }
    cum += seg[i - 1];
  }
  const f = bestCum / total;
  return { frac: f < 0 ? 0 : f > 1 ? 1 : f, offM: haversineM(lat, lng, bestProjLat, bestProjLng) };
}

// 04 §7 타일 양자화 Query 키 — bbox 연속값을 키에 넣으면 팬 1픽셀마다 캐시 미스
export const FETCH_TILE_Z = 11;

export function lngLatToTile(z: number, lng: number, lat: number) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

// 타일 → bbox(minLng,minLat,maxLng,maxLat). 주변 1타일 마진 포함해 팬 경계 재요청 감소.
export function tileToBboxWithMargin(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  // clamp: 타일 경계(x=0/n−1)의 ±1 마진이 ±180 밖으로 나가 서버 bbox 400을 맞지 않게
  const tile2lng = (tx: number) => Math.max(-180, Math.min(180, (tx / n) * 360 - 180));
  const tile2lat = (ty: number) => {
    const t = Math.PI - (2 * Math.PI * ty) / n;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t)));
  };
  return [tile2lng(x - 1), tile2lat(y + 2), tile2lng(x + 2), tile2lat(y - 1)];
}
