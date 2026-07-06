import { Platform } from 'react-native';

// UI 크롬 토큰 SSOT — Summit Precision 다크 퍼스트 전환 (Stitch ref).
// 색칠/난이도 팔레트는 도메인 SSOT라 colored.ts에 남긴다. 여긴 앱 표면만.
// 표면 계층: surfaceDeep(-1) < bg(0) < surface(+1, 카드) < surfaceHigh(+2, 칩/인풋).
// 그림자 금지 — 승격은 border 1px로 표현(플랫). 예외는 성공 모먼트 딱 하나.
export const C = {
  // ── 표면 (Deep Granite 스케일)
  bg: '#1A1C1E', // 기본 화면 배경 (Deep Granite)
  surfaceDeep: '#121416', // bg보다 깊은 바닥 — 스탯 히어로/지도 데이터 칩
  surface: '#1E2022', // 카드/행 배경 (구 #F4F5F7 자리)
  surfaceHigh: '#282A2C', // 칩/뱃지/인풋 — 한 단 더 뜬 표면
  border: '#343A40', // Elevation Grey — 카드 1px 보더(그림자 대체)

  // ── 텍스트
  ink: '#F8F9FA', // Cloud White — 제목/강조 (bg 대비 16.2:1)
  body: '#E2E2E5', // on-surface 본문 (13.2:1)
  faint: '#9BA1A6', // 보조/비활성/탭 inactive (6.5:1, AA)

  // ── 액션 — Summit Precision: primary 버튼 = Cloud White 배경 + granite 텍스트
  brand: '#F8F9FA', // 주 CTA 배경 (구 파랑 #0A66C2 자리 — 다크에선 흰 버튼이 primary)
  brandDark: '#D5D8DB', // pressed / 그라데이션 끝 톤
  brandSoft: '#26292C', // 브랜드 연한 표면(칩/nearest 하이라이트) — 다크에선 밝은 틴트 표면
  onBrand: '#1A1C1E', // brand 버튼 위 텍스트 — 구 C.white 자리, 버튼 텍스트는 반드시 이걸로

  // ── 상태
  success: '#2ECC71', // Vibrant Summit Green — 성공/인증/verified 전용 (8.1:1)
  successSoft: '#122B1D', // 그린 틴트 다크 표면 (인증 칩/헤일로)
  danger: '#FF6B00', // Safety Orange — 경고/실패/삭제 (5.99:1 — 14px bold 이상에서만)
  dangerText: '#FF8A3D', // 작은 본문용 오렌지 (7.3:1, AA)

  white: '#FFFFFF', // 진짜 흰색이 필요한 곳만(마커 halo 등). 버튼 텍스트엔 onBrand.

  // ── 글래스 (지도 위 오버레이 — Tactile Glassmorphism)
  glass: 'rgba(18,20,22,0.80)', // granite 80% — 지도 위 패널/추천 카드
  glassChip: 'rgba(18,20,22,0.60)', // granite 60% — 데이터 칩 pill
};

// Summit Precision: 버튼 8 / 카드·시트 16
export const R = { pill: 999, card: 16, btn: 8 };
// page(20) = 화면 좌우 마진(레퍼런스 20px). 나머지는 기존 8pt 계열 유지.
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, page: 20, xl: 24 };
export const CTA_H = 56; // 야외/장갑 최소 터치(정상 인증 CTA는 64로 별도)

// 데이터/스탯 모노스페이스(라벨=CAPS 모노, 값=볼드 산세리프 대비).
// ponytail: 시스템 모노 폴백 — JetBrains Mono는 expo-font 도입 시 이 상수만 교체.
export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });
