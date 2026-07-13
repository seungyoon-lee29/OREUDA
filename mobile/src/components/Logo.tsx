import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, MONO } from '@/lib/theme';

// 오르다 로고 — 상승 획이 봉우리로. 아랫부분이 Summit Green으로 차오르면 완등.
// react-native-svg 없음 → 봉우리는 border-trick 삼각형, 초록 채움은 clip 높이로 표현.
// ponytail: 마크는 뷰 3장(초록 삼각형 + 클립 + 흰 ∧ 오버레이)이면 충분. SVG 도입 안 함.

const T = 40; // 기준 마크 높이(size 기본값)와 비례 계수의 기준

export function Logo({
  size = T,
  showWordmark = true,
  animateFill = false,
}: {
  size?: number;
  showWordmark?: boolean;
  animateFill?: boolean;
}) {
  const w = size * 1.15; // 봉우리 밑변은 높이보다 살짝 넓게(안정감)
  const stroke = Math.max(2, Math.round(size * 0.11)); // ∧ 획 두께

  // 채움 진행도 0→1. animateFill이 아니면 즉시 1(완등 상태).
  const fill = useSharedValue(animateFill ? 0 : 1);
  useEffect(() => {
    if (!animateFill) return;
    let cancelled = false;
    // 감속 모션(reduce motion) 켜져 있으면 애니메이션 없이 채워진 상태로.
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      fill.value = reduced ? 1 : withTiming(1, { duration: 900 });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 초록 채움은 아래에서 위로 — 클립 뷰의 높이를 0→size로.
  const clipStyle = useAnimatedStyle(() => ({ height: size * fill.value }));

  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="오르다">
      <View style={{ width: w, height: size }}>
        {/* 초록 채움(완등) — 봉우리 삼각형, 아래에서 차오르도록 하단 정렬 클립 */}
        <Animated.View style={[styles.clip, { width: w }, clipStyle]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: w / 2,
              borderRightWidth: w / 2,
              borderBottomWidth: size,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: C.success,
            }}
          />
        </Animated.View>
        {/* ∧ 봉우리 윤곽(상승 획) — 회전한 두 바 */}
        <View style={styles.chevron} pointerEvents="none">
          <View
            style={{
              position: 'absolute',
              left: size * 0.02,
              bottom: 0,
              width: w * 0.62,
              height: stroke,
              backgroundColor: C.ink,
              borderRadius: stroke,
              transform: [{ translateY: -size * 0.28 }, { rotate: '-48deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: size * 0.02,
              bottom: 0,
              width: w * 0.62,
              height: stroke,
              backgroundColor: C.ink,
              borderRadius: stroke,
              transform: [{ translateY: -size * 0.28 }, { rotate: '48deg' }],
            }}
          />
        </View>
      </View>

      {showWordmark && (
        <View style={styles.words}>
          <Text style={[styles.wordmark, { fontSize: size * 0.72 }]}>오르다</Text>
          <Text style={[styles.roman, { fontSize: Math.max(9, size * 0.2) }]}>OREUDA</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // 하단 정렬 + overflow hidden → 초록이 밑에서 위로 드러남
  clip: { position: 'absolute', bottom: 0, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  chevron: { ...StyleSheet.absoluteFill },
  words: { justifyContent: 'center' },
  wordmark: { color: C.ink, fontWeight: '800', letterSpacing: -0.5 },
  roman: { color: C.faint, fontFamily: MONO, letterSpacing: 2, marginTop: 1 },
});

export default Logo;
