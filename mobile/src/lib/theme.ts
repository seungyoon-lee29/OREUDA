// UI 크롬 토큰 SSOT (05 §토큰 통일). 색칠/난이도 팔레트는 도메인 SSOT라 colored.ts에 남긴다 —
// 여긴 앱 표면(CTA/카드/텍스트/성공 축하)만. 기존 인라인 리터럴(#208AEF, #1D4ED8, #F5F5F5)의 드리프트를 여기로 수렴.
export const C = {
  brand: '#0A66C2', // 주 CTA·강조 (구 #208AEF/#1D4ED8 통일)
  brandDark: '#08508F', // pressed / 그라데이션 끝 톤
  brandSoft: '#E7F0FA', // 브랜드 연한 표면(칩/히어로 배경)
  success: '#009E73', // 완등 성공 그린 — easy 팔레트와 의도적 동일('내 색'이 지도를 채운다)
  successSoft: '#E3F5EE', // 성공 축하 히어로 연한 배경
  ink: '#111827', // 제목/강조 텍스트
  body: '#4B5563', // 본문 (흰 배경 AA)
  faint: '#8A8A8A', // 보조/비활성 (탭 inactive tint 포함)
  surface: '#F4F5F7', // 카드/행 배경 (구 #F5F5F5)
  danger: '#C43E00', // 실패/삭제
  white: '#fff',
};

export const R = { pill: 999, card: 16, btn: 14 }; // radius
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }; // spacing (8pt 계열)
export const CTA_H = 56; // 야외/장갑 최소 터치(정상 인증 CTA는 64로 별도)
