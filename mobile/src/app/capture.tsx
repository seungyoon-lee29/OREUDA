import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { api } from '@/lib/api';
import { MountainSchema, type Course } from '@/lib/schemas';
import { haversineM } from '@/lib/geo';
import { attachCourse, cacheCourses, clearHike, finalizeCapture, flush, getCachedCourses, insertCapture } from '@/lib/outbox';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, useMeClimbs } from '@/lib/colored';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { C, R, SP, CTA_H, MONO } from '@/lib/theme';

// 04 §4.1 캡처 위저드 상태머신. 지도 렌더 비의존 — 입력은 위치 1점 + 프리페치 코스 (04 §5).
// ponytail: 단일 화면 세션 상태라 Zustand 대신 useState — 화면 밖에서 구독할 소비자가 없다
type WizardState =
  | { key: 'requesting_permission' }
  | { key: 'permission_denied' }
  | { key: 'acquiring_fix' }
  | { key: 'fix_failed' }
  | { key: 'low_accuracy'; accuracy: number }
  | { key: 'out_of_range'; distanceM: number; courseName: string }
  | { key: 'select_course'; nearest: Course; clientRef: string }
  | { key: 'captured'; clientRef: string; courseName: string | null }
  | { key: 'priming' }
  | { key: 'no_courses' };

type CapturedFix = { lat: number; lng: number; accuracyM: number; isMock: boolean; capturedAt: string };

// 거리 표기: 1km 이상은 km 한 자리, 미만은 m (05 폴리시 — raw 5자리 미터 금지)
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

export default function Capture() {
  const { mountainId, courseId: preselectCourseId } = useLocalSearchParams<{ mountainId: string; courseId?: string }>();
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ key: 'requesting_permission' });
  const [courses, setCourses] = useState<Course[]>([]);
  // 진행 중 미확정 캡처(awaiting_course)의 clientRef. 모든 이탈 경로에서 finalize를 보장하는
  // 단일 소스 + 코스 더블탭 idempotency 가드. runningRef는 start() 재진입(재시도 더블탭) 차단.
  const pendingRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const hapticFiredRef = useRef(false);

  const { data: meClimbs } = useMeClimbs();

  // 성공 햅틱 — captured 진입 1회. 네이티브 모듈 미탑재 dev 빌드에서도 크래시 방지.
  useEffect(() => {
    if (state.key === 'captured' && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      // ponytail: fire-and-forget, dev-client 재빌드 전엔 네이티브 없어 throw 가능
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [state.key]);

  const start = async (skipPriming = false) => {
    if (runningRef.current) return; // 동시 재진입 차단 → clientRef 이중 생성(중복 제출) 방지
    runningRef.current = true;
    try {
    setState({ key: 'requesting_permission' });

    // 프리페치 캐시 우선, 없으면 온라인 fetch (오프라인 정상에서는 캐시가 있어야 함)
    let list = courses;
    if (!list.length && mountainId) {
      const cached = getCachedCourses(mountainId);
      if (cached) list = cached;
      else {
        try {
          const m = MountainSchema.parse(await api(`/mountains/${mountainId}`));
          cacheCourses(m.id, m.courses);
          list = m.courses;
        } catch {
          return setState({ key: 'no_courses' });
        }
      }
      setCourses(list);
    }
    if (!list.length) return setState({ key: 'no_courses' });

    // 05-design §3: 콜드 프롬프트 금지 — undetermined면 프라이밍 먼저
    if (!skipPriming) {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'undetermined') return setState({ key: 'priming' });
      if (status === 'denied') return setState({ key: 'permission_denied' });
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setState({ key: 'permission_denied' });

    setState({ key: 'acquiring_fix' });
    let loc: Location.LocationObject;
    try {
      loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15_000)),
      ]);
    } catch {
      return setState({ key: 'fix_failed' });
    }

    const accuracy = loc.coords.accuracy ?? 999;
    if (accuracy > 100) return setState({ key: 'low_accuracy', accuracy: Math.round(accuracy) });

    const fix: CapturedFix = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracyM: accuracy,
      isMock: (loc as any).mocked ?? false, // Android 한정, iOS 항상 false (03 §5)
      capturedAt: new Date(loc.timestamp).toISOString(),
    };

    // 로컬 판정: haversine 미터 vs verifyRadiusM (04 §5)
    const withDist = list
      .map((c) => ({
        course: c,
        dist: haversineM(fix.lat, fix.lng, c.checkpointPoint.coordinates[1], c.checkpointPoint.coordinates[0]),
      }))
      .sort((a, b) => a.dist - b.dist);
    const nearest = withDist[0];

    if (nearest.dist > nearest.course.verifyRadiusM)
      return setState({
        key: 'out_of_range',
        distanceM: Math.round(nearest.dist),
        courseName: nearest.course.name,
      });

    // 04 §4.1: 판정 통과 = 성공. 코스 선택 전에 즉시 durable 저장 → 여기서 이탈해도 캡처 보존.
    const clientRef = Crypto.randomUUID();
    pendingRef.current = clientRef; // 이탈 시 언마운트 이펙트가 finalize할 대상
    insertCapture({ courseId: null, clientRef, ...fix });
    setState({ key: 'select_course', nearest: nearest.course, clientRef });
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    // setTimeout: 이펙트 내 동기 setState 경고 회피 (react-hooks lint)
    const t = setTimeout(start, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모든 이탈 경로(✕/하드웨어 뒤로/스와이프 dismiss/프로그램 이동)는 언마운트로 수렴한다.
  // 미확정 캡처(pendingRef)를 finalize해 제출 큐로 승격 → warm 상태에서도 유실 없음.
  // pendingRef는 코스 선택/미선택 확정 시 null로 비워지므로 여기서 no-op.
  useEffect(
    () => () => {
      if (pendingRef.current) {
        finalizeCapture(pendingRef.current);
        flush();
      }
    },
    [],
  );

  // 이미 durable한 캡처(clientRef)에 코스를 부착(또는 미선택 확정)하고 제출 큐로 승격.
  const chooseCourse = (clientRef: string, courseId: string | null, courseName: string | null) => {
    if (pendingRef.current !== clientRef) return; // 이미 확정/이탈 — 코스 더블탭 무시
    pendingRef.current = null;
    if (courseId) attachCourse(clientRef, courseId);
    else finalizeCapture(clientRef);
    clearHike(); // 인증 성공 = 등반 세션 종료 (지도 배너 사라짐)
    setState({ key: 'captured', clientRef, courseName });
    flush(); // 온라인이면 즉시 제출 시도
  };

  // 언마운트 이펙트가 미확정 캡처를 finalize하므로 닫기는 이동만.
  const close = () => router.back();

  const retry = (
    <TouchableOpacity style={s.btn} onPress={() => start()}>
      <Text style={s.btnText}>다시 시도</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.wrap}>
      <TouchableOpacity style={s.close} onPress={close}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      {state.key === 'requesting_permission' && <Center title="위치 권한 확인 중…" />}
      {state.key === 'priming' && (
        <Center title="위치 권한이 필요해요" body="인증하는 순간의 위치만 딱 한 번 사용해요. 백그라운드 추적은 하지 않아요.">
          <TouchableOpacity style={s.btn} onPress={() => start(true)}>
            <Text style={s.btnText}>위치 허용하고 인증</Text>
          </TouchableOpacity>
        </Center>
      )}
      {state.key === 'permission_denied' && (
        <Center title="위치 권한이 필요해요" body="인증 순간의 위치로만 완등을 확인해요. 백그라운드 추적은 하지 않아요.">
          <TouchableOpacity style={s.btn} onPress={() => Linking.openSettings()}>
            <Text style={s.btnText}>설정 열기</Text>
          </TouchableOpacity>
          {retry}
        </Center>
      )}
      {state.key === 'acquiring_fix' && <Center title="GPS 신호를 찾는 중…" body="하늘이 트인 곳에서 잠시만 기다려주세요" />}
      {state.key === 'fix_failed' && <Center title="GPS를 잡지 못했어요" body="하늘이 트인 곳으로 이동해보세요">{retry}</Center>}
      {state.key === 'low_accuracy' && (
        <Center title="정확도가 낮아요" body={`현재 오차 ±${state.accuracy}m — 100m 이하일 때 인증할 수 있어요`}>{retry}</Center>
      )}
      {state.key === 'out_of_range' && (
        <Center
          title={state.distanceM <= 200 ? '거의 다 왔어요!' : '체크포인트가 아직 멀어요'}
          body={
            state.distanceM <= 200
              ? `${state.courseName} 체크포인트까지 ${fmtDist(state.distanceM)}`
              : `${state.courseName} 체크포인트까지 ${fmtDist(state.distanceM)} 남았어요`
          }
        >
          {retry}
        </Center>
      )}
      {state.key === 'no_courses' && (
        <Center title="코스 정보가 없어요" body="온라인 상태에서 산 상세를 한 번 열어두면 오프라인에서도 인증할 수 있어요" />
      )}

      {state.key === 'select_course' && (
        <View style={s.selectWrap}>
          <View style={s.selectHeader}>
            <Text style={s.selectTitle}>도착 확인! 🏔</Text>
            <Text style={s.selectSub}>올라온 코스를 선택해주세요</Text>
          </View>
          {courses.map((c) => {
            // PM §P0-1: courseId 파라미터 있으면 해당 코스를 preselect 강조(nearest 판정 불변)
            // preselect가 리스트에 있을 때만 강조, 없으면 nearest로 폴백('가장 가까움' 힌트 유지)
            const highlightId =
              preselectCourseId && courses.some((x) => x.id === preselectCourseId)
                ? preselectCourseId
                : state.nearest.id;
            const isHighlighted = c.id === highlightId;
            const tagLabel = preselectCourseId && c.id === preselectCourseId ? '선택된 코스' : '가장 가까움';
            return (
              <TouchableOpacity
                key={c.id}
                style={[s.courseBtn, isHighlighted && s.courseBtnNearest]}
                onPress={() => chooseCourse(state.clientRef, c.id, c.name)}
              >
                <View style={s.difficultyBadge}>
                  <View style={[s.dot, { backgroundColor: DIFFICULTY_COLOR[c.difficulty ?? 'moderate'] }]} />
                  <Text style={s.difficultyText}>{DIFFICULTY_LABEL[c.difficulty ?? 'moderate']}</Text>
                </View>
                <Text style={s.courseBtnText}>{c.name}</Text>
                {isHighlighted && (
                  <View style={s.nearestTag}>
                    <Text style={s.nearestTagText}>{tagLabel}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={s.laterBtn} onPress={() => chooseCourse(state.clientRef, null, null)}>
            <Text style={s.laterText}>나중에 선택할게요</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.key === 'captured' && (
        <Captured
          courseName={state.courseName}
          totalMountains={meClimbs?.totalMountains ?? 0}
          onMap={() => router.back()}
          onRecords={() => router.navigate('/(tabs)/records')}
        />
      )}
    </SafeAreaView>
  );
}

function Center({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <View style={s.center}>
      <Text style={s.bigTitle}>{title}</Text>
      {!!body && <Text style={s.body}>{body}</Text>}
      {children}
    </View>
  );
}

// 감정적 핵심 — 진입 시 콘텐츠 스프링 스케일업 + 페이드, 체크 엠블럼은 살짝 늦게 팝(성공 햅틱과 동시).
// 히어로는 그라데이션/SVG 없이 successSoft 헤일로 + success 원판 + ✓ 텍스트의 View 조합.
function Captured({
  courseName,
  totalMountains,
  onMap,
  onRecords,
}: {
  courseName: string | null;
  totalMountains: number;
  onMap: () => void;
  onRecords: () => void;
}) {
  const enter = useSharedValue(0);
  const pop = useSharedValue(0.6);
  useEffect(() => {
    // reduce-motion 켜지면 애니 없이 최종값으로 점프(reanimated 내장 처리) — 접근성.
    enter.value = withTiming(1, { duration: 260, reduceMotion: ReduceMotion.System });
    pop.value = withDelay(90, withSpring(1, { damping: 11, stiffness: 150, mass: 0.8, reduceMotion: ReduceMotion.System }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const contentStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.94 + enter.value * 0.06 }],
  }));
  const emblemStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View style={[s.captured, contentStyle]}>
      <View style={s.heroHalo}>
        <Animated.View style={[s.heroEmblem, emblemStyle]}>
          <Text style={s.heroCheck}>✓</Text>
        </Animated.View>
      </View>
      <Text style={s.bigTitle}>인증 완료! 🎉</Text>
      <Text style={s.body}>
        {courseName ?? '코스 미선택'}
        {'\n'}연결되면 자동으로 제출돼요. 늦어도 다음에 앱을 열 때.
      </Text>
      {totalMountains > 0 && (
        <View style={s.counterChip}>
          <Text style={s.counterText}>지금까지 {totalMountains}좌 완등</Text>
        </View>
      )}
      <TouchableOpacity style={s.btn} onPress={onMap}>
        <Text style={s.btnText}>지도로 돌아가기</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnOutline} onPress={onRecords}>
        <Text style={s.btnOutlineText}>기록 보기</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  close: { position: 'absolute', top: 48, right: 12, zIndex: 1, padding: 16 },
  closeText: { fontSize: 24, color: C.faint },
  // 상단 void 방지 — 콘텐츠를 화면 상단 ~28%에 앵커(중앙 정렬 시 '덜 만든' 느낌, 05 폴리시)
  center: { flex: 1, alignItems: 'center', padding: 32, paddingTop: 200, gap: SP.lg },
  bigTitle: { fontSize: 26, fontWeight: '700', color: C.ink, textAlign: 'center' },
  body: { fontSize: 15, color: C.body, textAlign: 'center', lineHeight: 22 },
  // 05 §5: 야외/장갑 대응 최소 56dp. brand 버튼 위 텍스트는 반드시 onBrand(흰 위 흰 방지).
  btn: { backgroundColor: C.brand, borderRadius: R.btn, minHeight: CTA_H, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: C.onBrand, fontSize: 17, fontWeight: '700' },
  btnOutline: { borderWidth: 2, borderColor: C.border, borderRadius: R.btn, minHeight: CTA_H, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  btnOutlineText: { color: C.ink, fontSize: 17, fontWeight: '700' },

  // captured — 앱 전체 유일한 그림자 허용(성공 모먼트 "floating trophy", design §4)
  captured: { flex: 1, alignItems: 'center', padding: 32, paddingTop: 120, gap: SP.lg, shadowColor: C.success, shadowOpacity: 0.35, shadowRadius: 24, elevation: 12 },
  heroHalo: { width: 128, height: 128, borderRadius: 64, backgroundColor: C.successSoft, alignItems: 'center', justifyContent: 'center', marginBottom: SP.sm },
  heroEmblem: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },
  heroCheck: { color: '#0C0E10', fontSize: 44, fontWeight: '700', lineHeight: 48 },
  counterChip: { backgroundColor: C.successSoft, paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.pill },
  counterText: { fontSize: 15, fontWeight: '700', color: C.success, textAlign: 'center', fontFamily: MONO },

  // select_course — 좌측 정렬 헤더 + 카드 리스트(폼 아닌 '고르는' 비트)
  selectWrap: { flex: 1, padding: 24, paddingTop: 150, gap: SP.md },
  selectHeader: { marginBottom: SP.sm },
  selectTitle: { fontSize: 24, fontWeight: '700', color: C.ink },
  selectSub: { fontSize: 15, color: C.body, marginTop: SP.xs },
  // 2px 투명 트릭 유지(레이아웃 시프트 방지), 기본 borderColor는 C.border(다크 윤곽)
  courseBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: C.surface, borderRadius: R.card, borderWidth: 2, borderColor: C.border },
  courseBtnNearest: { backgroundColor: C.brandSoft, borderColor: C.success },
  courseBtnText: { fontSize: 16, fontWeight: '600', color: C.ink, flex: 1 },
  difficultyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceHigh, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill },
  difficultyText: { fontSize: 12, fontWeight: '700', color: C.body },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nearestTag: { backgroundColor: C.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill },
  nearestTagText: { color: '#0C0E10', fontSize: 11, fontWeight: '700' },
  laterBtn: { alignItems: 'center', padding: 16, minHeight: 48, justifyContent: 'center' },
  laterText: { color: C.faint, fontWeight: '600' },
});
