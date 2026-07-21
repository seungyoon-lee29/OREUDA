import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { wireOutbox } from '@/lib/outbox';
import { hasSeenOnboarding } from '@/lib/prefs';
import { useHikeTracker } from '@/lib/hikeTracker';
import { useSession } from '@/lib/stores';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// TanStack onlineManager를 NetInfo에 배선 (04 §1)
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected)),
);

export default function RootLayout() {
  const { ready, authed, init } = useSession();
  const segments = useSegments();
  const router = useRouter();
  useHikeTracker(); // 등반 세션 ↔ 잠금화면 위젯/진행 알림 배선(유일 구독점)

  useEffect(() => {
    init();
    wireOutbox(queryClient); // 콜드스타트 flush 포함 (04 §6 트리거 ①)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync();
    const onOnboarding = segments[0] === 'onboarding';
    const inAuth = segments[0] === 'login' || segments[0] === 'signup';
    if (!authed) {
      // 첫 실행이면 로그인 전에 온보딩 1회 노출
      if (!hasSeenOnboarding() && !onOnboarding && !inAuth) { router.replace('/onboarding'); return; }
      if (hasSeenOnboarding() && !inAuth && !onOnboarding) { router.replace('/login'); return; }
    } else if (inAuth || onOnboarding) {
      router.replace('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authed, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 다크 배경 위 흰 상태바 (design §4 탭바) */}
      <StatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          {/* 캡처 위저드 — 탭 위 풀스크린 모달 (04 §9) */}
          <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal' }} />
          {/* 산 검색 모달 — FE-B가 search.tsx 동시 생성 중, 라우트 등록만 선점 */}
          <Stack.Screen name="search" options={{ presentation: 'modal' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
