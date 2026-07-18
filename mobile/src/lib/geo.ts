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
