import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { api } from '@/lib/api';
import { MountainSchema, type Course } from '@/lib/schemas';
import { haversineM } from '@/lib/geo';
import { cacheCourses, flush, getCachedCourses, insertDraft } from '@/lib/outbox';
import { DIFFICULTY_COLOR } from '@/lib/colored';

// 04 §4.1 캡처 위저드 상태머신. 지도 렌더 비의존 — 입력은 위치 1점 + 프리페치 코스 (04 §5).
// ponytail: 단일 화면 세션 상태라 Zustand 대신 useState — 화면 밖에서 구독할 소비자가 없다
type WizardState =
  | { key: 'requesting_permission' }
  | { key: 'permission_denied' }
  | { key: 'acquiring_fix' }
  | { key: 'fix_failed' }
  | { key: 'low_accuracy'; accuracy: number }
  | { key: 'out_of_range'; distanceM: number; courseName: string }
  | { key: 'select_course'; nearest: Course; captured: CapturedFix }
  | { key: 'captured'; clientRef: string; courseName: string | null }
  | { key: 'no_courses' };

type CapturedFix = { lat: number; lng: number; accuracyM: number; isMock: boolean; capturedAt: string };

export default function Capture() {
  const { mountainId } = useLocalSearchParams<{ mountainId: string }>();
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ key: 'requesting_permission' });
  const [courses, setCourses] = useState<Course[]>([]);

  const start = async () => {
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

    setState({ key: 'select_course', nearest: nearest.course, captured: fix });
  };

  useEffect(() => {
    // setTimeout: 이펙트 내 동기 setState 경고 회피 (react-hooks lint)
    const t = setTimeout(start, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmCourse = (courseId: string | null, courseName: string | null, captured: CapturedFix) => {
    const clientRef = Crypto.randomUUID();
    insertDraft({ courseId, clientRef, ...captured }); // 성공의 정의 = insert 완료 (04 §4.1)
    setState({ key: 'captured', clientRef, courseName });
    flush(); // 온라인이면 즉시 제출 시도
  };

  const retry = (
    <TouchableOpacity style={s.btn} onPress={start}>
      <Text style={s.btnText}>다시 시도</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.wrap}>
      <TouchableOpacity style={s.close} onPress={() => router.back()}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      {state.key === 'requesting_permission' && <Center title="위치 권한 확인 중…" />}
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
        <Center title="체크포인트가 아직 멀어요" body={`${state.courseName} 체크포인트까지 ${state.distanceM}m`}>{retry}</Center>
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
              onPress={() => confirmCourse(c.id, c.name, state.captured)}
            >
              <View style={[s.dot, { backgroundColor: DIFFICULTY_COLOR[c.difficulty ?? 'moderate'] }]} />
              <Text style={s.courseBtnText}>
                {c.name}
                {c.id === state.nearest.id ? ' (가장 가까움)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.laterBtn} onPress={() => confirmCourse(null, null, state.captured)}>
            <Text style={s.laterText}>나중에 선택할게요</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.key === 'captured' && (
        <Center title="인증 완료! 🎉" body={`${state.courseName ?? '코스 미선택'}\n연결되면 자동으로 제출돼요. 늦어도 다음에 앱을 열 때.`}>
          <TouchableOpacity style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnText}>지도로 돌아가기</Text>
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
  close: { position: 'absolute', top: 56, right: 20, zIndex: 1, padding: 8 },
  closeText: { fontSize: 22, color: '#666' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  bigTitle: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  btn: { backgroundColor: '#208AEF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  selectWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 10 },
  courseBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#F5F5F5', borderRadius: 12 },
  courseBtnNearest: { borderWidth: 2, borderColor: '#208AEF' },
  courseBtnText: { fontSize: 16, fontWeight: '500' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  laterBtn: { alignItems: 'center', padding: 12 },
  laterText: { color: '#888' },
});
