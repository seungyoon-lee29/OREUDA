import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/components/Logo';
import { markOnboardingSeen } from '@/lib/prefs';
import { C, CTA_H, R, SP } from '@/lib/theme';

// 온보딩 4슬라이드 = 사용법 안내. SVG/PagerView 없이 ScrollView pagingEnabled로.
// ponytail: 페이저는 내장 ScrollView로 충분 — 라이브러리 추가 안 함.
export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);

  const done = () => {
    markOnboardingSeen();
    router.replace('/login');
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView style={s.wrap}>
      {/* flow 상단바 — absolute면 네이티브 SafeAreaView top inset을 못 받아 상태바와 겹침 */}
      <View style={s.topBar}>
        <TouchableOpacity
          style={s.skip}
          onPress={done}
          accessibilityRole="button"
          accessibilityLabel="건너뛰기"
        >
          <Text style={s.skipText}>건너뛰기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={ref}
        style={s.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        <Slide width={width} visual={<VisualLogo />}
          title="오늘도, 오르다." sub="완등을 색으로 남기는 등산 기록 앱." />
        <Slide width={width} visual={<VisualRoute />}
          title="코스를 고르고 오르세요" sub="코스마다 체크포인트가 놓여 있어요." />
        <Slide width={width} visual={<VisualPeakPoint />}
          title="정상에서 딱 한 번" sub="GPS 한 점이면 완등이 인증돼요." />
        <Slide width={width} visual={<VisualFilled />}
          title="지도를 색으로 채워요" sub="완등한 코스가 지도에 색으로 남아요.">
          <TouchableOpacity
            style={s.cta}
            onPress={done}
            accessibilityRole="button"
            accessibilityLabel="시작하기"
          >
            <Text style={s.ctaText}>시작하기</Text>
          </TouchableOpacity>
        </Slide>
      </ScrollView>

      <View style={s.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[s.dot, i === page && s.dotActive]}
            accessibilityRole="image"
            accessibilityLabel={`${i + 1}번째 슬라이드${i === page ? ', 현재' : ''}`}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

function Slide({
  width, visual, title, sub, children,
}: {
  width: number;
  visual: React.ReactNode;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[s.slide, { width }]}>
      <View style={s.visual}>{visual}</View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{sub}</Text>
      {children}
    </View>
  );
}

// ── 슬라이드 비주얼 (전부 View로 — 가짜 스크린샷 금지, 기하 마크만)
function VisualLogo() {
  return <Logo animateFill size={64} showWordmark={false} />;
}

// 코스 라인 + 체크포인트 3점
function VisualRoute() {
  return (
    <View style={s.routeBox}>
      <View style={s.routeLine} />
      {(['3%', '46%', '89%'] as const).map((left, i) => (
        <View key={left} style={[s.cp, { left }, i === 2 && s.cpEnd]} />
      ))}
    </View>
  );
}

// 봉우리 + 정상 초록 점 + 반경 링
function VisualPeakPoint() {
  return (
    <View style={s.peakBox}>
      <Peak size={72} filled={false} />
      <View style={s.ring} />
      <View style={s.glowPoint} />
    </View>
  );
}

// 봉우리 실루엣 여럿 — 일부는 완등(초록 채움), 일부는 윤곽만
function VisualFilled() {
  return (
    <View style={s.silhouettes}>
      <Peak size={56} filled />
      <Peak size={80} filled={false} />
      <Peak size={64} filled />
    </View>
  );
}

// border-trick 삼각형 봉우리. filled=완등(초록), 아니면 윤곽선만.
function Peak({ size, filled }: { size: number; filled: boolean }) {
  const w = size * 1.15;
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
        borderBottomColor: filled ? C.success : C.border,
      }}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SP.page - SP.sm },
  skip: { padding: SP.sm, minHeight: 44, justifyContent: 'center' },
  skipText: { color: C.faint, fontSize: 15 },
  pager: { flex: 1 },

  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.page },
  visual: { height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: SP.xl },
  title: { color: C.ink, fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  sub: { color: C.body, fontSize: 15, textAlign: 'center', marginTop: SP.md, lineHeight: 22 },

  cta: { backgroundColor: C.brand, borderRadius: R.btn, minHeight: CTA_H, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: SP.xl },
  ctaText: { color: C.onBrand, fontSize: 16, fontWeight: '700' },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SP.sm, paddingVertical: SP.xl },
  dot: { width: 6, height: 6, borderRadius: R.pill, backgroundColor: C.faint, opacity: 0.5 },
  dotActive: { width: 20, opacity: 1, backgroundColor: C.ink },

  // route 슬라이드
  routeBox: { width: 200, height: 80, justifyContent: 'center' },
  routeLine: { position: 'absolute', left: 8, right: 8, height: 2, borderRadius: 2, backgroundColor: C.border },
  cp: { position: 'absolute', width: 14, height: 14, borderRadius: R.pill, backgroundColor: C.surfaceHigh, borderWidth: 2, borderColor: C.faint, top: 33 },
  cpEnd: { backgroundColor: C.success, borderColor: C.success },

  // peak+point 슬라이드
  peakBox: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 88, height: 88, borderRadius: R.pill, borderWidth: 1, borderColor: C.success, opacity: 0.4, bottom: -8 },
  glowPoint: { position: 'absolute', width: 12, height: 12, borderRadius: R.pill, backgroundColor: C.success, top: -6 },

  // filled 슬라이드
  silhouettes: { flexDirection: 'row', alignItems: 'flex-end', gap: SP.md },
});
