// 코스 경로 투영 — 내 GPS 위치를 코스 polyline에 투영해 경로상 진행/잔여 거리를 낸다.
// GPS 궤적 누적이 아니라 "지금 경로의 어디쯤"이라 노이즈·역주행에 강하다(위젯 스펙 확정 2026-07-19).
// 서버 판정과 무관한 표시 전용 계산 — 인증은 기존 앱 플로우 그대로(03 관대 판정 불변).
import { haversineM } from './geo.ts';

const R = 6371000;
const DEG_M = (Math.PI / 180) * R; // 위도 1도당 미터(≈111195). 경도는 ×cos(lat)

// 코스에서 이 거리 이상 벗어나면 projectOnCourse가 엉뚱한 세그먼트에 스냅해 진행률이 무의미해진다(집에서 시작·GPS 튐).
// 지도 배너와 잠금화면 위젯이 공유하는 '진행률 표시 유효' 상한 — 여기 하나로 관리해 두 경로가 드리프트하지 않게(SSOT).
export const OFF_COURSE_LIMIT_M = 1000;

export type CoursePathIndex = {
  coords: [number, number][]; // [lng, lat] — 코스 path.coordinates 원본
  cum: number[]; // cum[i] = 시작점부터 정점 i까지 경로 거리(m)
  geomTotalM: number; // 기하학적 경로 총길이
  totalM: number; // 표시용 총길이 — course.distanceM 있으면 그 값(앱 다른 화면과 숫자 일치)
};

export type CourseProgress = {
  fraction: number; // 0..1 경로 진행 비율(기하 기준)
  progressM: number; // 표시 총길이 기준 진행 거리
  remainingM: number; // 표시 총길이 기준 잔여 거리
  totalM: number;
  offCourseM: number; // 내 위치에서 경로까지 수직 거리(이탈 정도)
};

// 누적거리 테이블을 한 번 만들어 매 GPS fix마다 O(n) cumsum을 반복하지 않는다.
// officialTotalM: course.distanceM(서버 실측). 주면 진행/잔여를 그 값에 맞춰 스케일 —
// 위젯 '남은 km'가 코스 상세의 총 거리와 어긋나 보이지 않게.
export function buildCoursePath(coords: [number, number][], officialTotalM?: number | null): CoursePathIndex | null {
  if (!coords || coords.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const [aLng, aLat] = coords[i - 1];
    const [bLng, bLat] = coords[i];
    cum.push(cum[i - 1] + haversineM(aLat, aLng, bLat, bLng));
  }
  const geomTotalM = cum[cum.length - 1];
  if (geomTotalM <= 0) return null; // 전 정점 동일 → 투영 불가
  const totalM = officialTotalM && officialTotalM > 0 ? officialTotalM : geomTotalM;
  return { coords, cum, geomTotalM, totalM };
}

// 각 세그먼트에 대해 점을 국소 평면(등거리 근사, m)으로 투영해 가장 가까운 세그먼트를 고른다.
// 세그먼트가 짧아(등산로 정점 간격) 등거리 근사 오차는 무시할 수준.
export function projectOnCourse(idx: CoursePathIndex, lat: number, lng: number): CourseProgress {
  let best = { off2: Infinity, progressGeom: 0 };
  for (let i = 1; i < idx.coords.length; i++) {
    const [aLng, aLat] = idx.coords[i - 1];
    const [bLng, bLat] = idx.coords[i];
    const kx = DEG_M * Math.cos((aLat * Math.PI) / 180); // 경도 미터 환산(세그먼트 시작 위도 기준)
    const bx = (bLng - aLng) * kx;
    const by = (bLat - aLat) * DEG_M;
    const px = (lng - aLng) * kx;
    const py = (lat - aLat) * DEG_M;
    const segLen2 = bx * bx + by * by;
    const t = segLen2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / segLen2)) : 0;
    const dx = px - t * bx;
    const dy = py - t * by;
    const off2 = dx * dx + dy * dy;
    if (off2 < best.off2) {
      const segM = idx.cum[i] - idx.cum[i - 1]; // 누적테이블과 일관되게 haversine 세그먼트 길이 사용
      best = { off2, progressGeom: idx.cum[i - 1] + t * segM };
    }
  }
  const fraction = Math.max(0, Math.min(1, best.progressGeom / idx.geomTotalM));
  const progressM = idx.totalM * fraction;
  return {
    fraction,
    progressM,
    remainingM: idx.totalM - progressM,
    totalM: idx.totalM,
    offCourseM: Math.sqrt(best.off2),
  };
}
