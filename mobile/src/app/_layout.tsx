import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { wireOutbox } from '@/lib/outbox';
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

  useEffect(() => {
    init();
    wireOutbox(queryClient); // 콜드스타트 flush 포함 (04 §6 트리거 ①)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync();
    const inAuth = segments[0] === 'login' || segments[0] === 'signup';
    if (!authed && !inAuth) router.replace('/login');
    else if (authed && inAuth) router.replace('/');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authed, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          {/* 캡처 위저드 — 탭 위 풀스크린 모달 (04 §9) */}
          <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
