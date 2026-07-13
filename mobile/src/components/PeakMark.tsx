import { View } from 'react-native';

// 공용 봉우리 마크 — border-trick 삼각형(SVG 없음). onboarding/records/profile/tier 공통.
// ponytail: 온보딩의 로컬 Peak를 여기로 승격. color만 받아 채운다(완등=success, 윤곽=border, 등급=tier color).
export function PeakMark({ size, color }: { size: number; color: string }) {
  const w = size * 1.15; // 밑변은 높이보다 살짝 넓게(안정감) — Logo/onboarding과 동일 비율
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: w / 2,
        borderRightWidth: w / 2,
        borderBottomWidth: size,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  );
}

export default PeakMark;
