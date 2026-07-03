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
import { attachCourse, cacheCourses, finalizeCapture, flush, getCachedCourses, insertCapture } from '@/lib/outbox';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, useMeClimbs } from '@/lib/colored';

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
  const { mountainId } = useLocalSearchParams<{ mountainId: string }>();
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
        <Center title="위치 권한이 필요해요" body="인증 순간의 위치 1점만 사용해요. 백그라운드 추적은 하지 않아요.">
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
        <Center title="체크포인트가 아직 멀어요" body={`${state.courseName} 체크포인트까지 ${fmtDist(state.distanceM)}`}>{retry}</Center>
      )}
      {state.key === 'no_courses' && (
        <Center title="코스 정보가 없어요" body="온라인 상태에서 산 상세를 한 번 열어두면 오프라인에서도 인증할 수 있어요" />
      )}

      {state.key === 'select_course' && (
        <View style={s.selectWrap}>
          <Text style={s.bigTitle}>도착 확인! 🏔</Text>
          <Text style={s.body}>올라온 코스를 선택해주세요</Text>
          {courses.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.courseBtn, c.id === state.nearest.id && s.courseBtnNearest]}
              onPress={() => chooseCourse(state.clientRef, c.id, c.name)}
            >
              <View style={s.difficultyBadge}>
                <View style={[s.dot, { backgroundColor: DIFFICULTY_COLOR[c.difficulty ?? 'moderate'] }]} />
                <Text style={s.difficultyText}>{DIFFICULTY_LABEL[c.difficulty ?? 'moderate']}</Text>
              </View>
              <Text style={s.courseBtnText}>
                {c.name}
                {c.id === state.nearest.id ? ' (가장 가까움)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.laterBtn} onPress={() => chooseCourse(state.clientRef, null, null)}>
            <Text style={s.laterText}>나중에 선택할게요</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.key === 'captured' && (
        <Center title="인증 완료! 🎉" body={`${state.courseName ?? '코스 미선택'}\n연결되면 자동으로 제출돼요. 늦어도 다음에 앱을 열 때.`}>
          {(meClimbs?.totalMountains ?? 0) > 0 && (
            <Text style={s.counterText}>지금까지 {meClimbs!.totalMountains}좌 완등</Text>
          )}
          <TouchableOpacity style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnText}>지도로 돌아가기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline} onPress={() => router.navigate('/(tabs)/records')}>
            <Text style={s.btnOutlineText}>기록 보기</Text>
          </TouchableOpacity>
        </Center>
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

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  close: { position: 'absolute', top: 48, right: 12, zIndex: 1, padding: 16 },
  closeText: { fontSize: 24, color: '#666' },
  // 상단 void 방지 — 콘텐츠를 화면 상단 ~28%에 앵커(중앙 정렬 시 '덜 만든' 느낌, 05 폴리시)
  center: { flex: 1, alignItems: 'center', padding: 32, paddingTop: 200, gap: 16 },
  bigTitle: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  // 05 §5: 야외/장갑 대응 최소 56dp
  btn: { backgroundColor: '#208AEF', borderRadius: 12, minHeight: 56, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  selectWrap: { flex: 1, padding: 24, paddingTop: 180, gap: 10 },
  courseBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#F5F5F5', borderRadius: 12 },
  courseBtnNearest: { borderWidth: 2, borderColor: '#208AEF' },
  courseBtnText: { fontSize: 16, fontWeight: '500', flex: 1 },
  difficultyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  difficultyText: { fontSize: 12, fontWeight: '600', color: '#333' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  laterBtn: { alignItems: 'center', padding: 16, minHeight: 48, justifyContent: 'center' },
  laterText: { color: '#666', fontWeight: '500' },
  counterText: { fontSize: 16, fontWeight: '600', color: '#208AEF', textAlign: 'center' },
  btnOutline: { borderWidth: 2, borderColor: '#208AEF', borderRadius: 12, minHeight: 56, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  btnOutlineText: { color: '#208AEF', fontSize: 17, fontWeight: '700' },
});
