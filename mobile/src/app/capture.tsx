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
import { attachCourse, cacheCourses, clearHike, finalizeCapture, flush, getActiveHike, getCachedCourses, insertCapture } from '@/lib/outbox';
import { computeHikeSummary, type HikeSummary } from '@/lib/hikeStats';
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
  | { key: 'confirm_marginal'; fix: CapturedFix; nearest: Course; distanceM: number; accuracyM: number; reasons: ('distance' | 'accuracy')[] }
  | { key: 'select_course'; nearest: Course; clientRef: string; marginal: boolean }
  | { key: 'captured'; clientRef: string; courseName: string | null; summary: HikeSummary | null }
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
  const summitAltRef = useRef<number | null>(null); // 인증 시점 GPS 고도(정상) — 운동 요약 경사도용
  const summitAtRef = useRef<string | null>(null); // 정상 도달(=인증 fix) 시각 — 운동 시간 종료점

  const { data: meClimbs } = useMeClimbs();

  // 성공 햅틱 — captured 진입 1회. 네이티브 모듈 미탑재 dev 빌드에서도 크래시 방지.
  useEffect(() => {
    if (state.key === 'captured' && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      // ponytail: fire-and-forget, dev-client 재빌드 전엔 네이티브 없어 throw 가능
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [state.key]);

  // 판정 통과(또는 marginal 소프트 확인) → durable 저장 + 코스 선택. 04 §4.1: 코스 선택 전 즉시 durable.
  // marginal은 nearest 코스를 선부착해 저장 — 이탈(언마운트 finalize) 경로로 courseId=null 제출되면
  // 서버가 거리 계산을 스킵해 flag 없는 verified가 되는 구멍을 막는다(적대 리뷰 BLOCKER).
  // 코스 선택 화면에서 다른 코스를 고르면 attachCourse가 덮어쓴다.
  const proceedToSelect = (fix: CapturedFix, nearest: Course, marginal: boolean) => {
    const clientRef = Crypto.randomUUID();
    pendingRef.current = clientRef; // 이탈 시 언마운트 이펙트가 finalize할 대상
    // 선부착 코스: 진행 중 등반으로 열렸으면(preselect) 그 코스가 귀속 의도에 가깝다 —
    // 선택 화면 강조와 동일 우선순위(리뷰 LOW). 목록에 없으면 nearest 폴백.
    const preAttach = courses.find((c) => c.id === preselectCourseId) ?? nearest;
    insertCapture({ courseId: marginal ? preAttach.id : null, clientRef, ...fix });
    setState({ key: 'select_course', nearest, clientRef, marginal });
  };

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
    summitAltRef.current = loc.coords.altitude ?? null; // 정상 고도 — 시작 고도와의 델타로 경사도 산출

    const fix: CapturedFix = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracyM: accuracy,
      isMock: (loc as any).mocked ?? false, // Android 한정, iOS 항상 false (03 §5)
      capturedAt: new Date(loc.timestamp).toISOString(),
    };
    summitAtRef.current = fix.capturedAt; // 운동 종료점 = 정상 도달 시각(탭 순간 아님)

    // 로컬 판정: haversine 미터 vs verifyRadiusM (04 §5)
    const withDist = list
      .map((c) => ({
        course: c,
        dist: haversineM(fix.lat, fix.lng, c.checkpointPoint.coordinates[1], c.checkpointPoint.coordinates[0]),
      }))
      .sort((a, b) => a.dist - b.dist);
    const nearest = withDist[0];

    // 판정은 관대하게(서버와 일치) — 거리·정확도 미달을 막지 않는다. marginal이면 소프트 확인('그래도 인증')으로
    // 명시적 의도만 받고 통과 → 실 등정자는 절대 안 막고(정상 좌표 오차·GPS 오차에도 완등 가능),
    // 서버가 distance/accuracy flag로 표시(리더보드 제외). 막다른 실패 없음(diagnosing-bugs WS1).
    const reasons: ('distance' | 'accuracy')[] = [];
    if (nearest.dist > nearest.course.verifyRadiusM) reasons.push('distance');
    if (accuracy > 100) reasons.push('accuracy');
    if (reasons.length)
      return setState({
        key: 'confirm_marginal',
        fix,
        nearest: nearest.course,
        distanceM: Math.round(nearest.dist),
        accuracyM: Math.round(accuracy),
        reasons,
      });

    proceedToSelect(fix, nearest.course, false);
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
    // 운동 요약은 clearHike 전에 계산 — started_at·시작고도가 active_hike에 있어야 하므로.
    // 등반을 '시작'했고(활성 세션 존재) 코스를 선택했을 때만 요약 가능(거리=코스 실측 길이).
    const hike = getActiveHike();
    const course = courseId ? courses.find((c) => c.id === courseId) : null;
    const summary =
      hike && summitAtRef.current
        ? computeHikeSummary({
            startedAt: hike.startedAt,
            endedAtMs: Date.parse(summitAtRef.current),
            distanceM: course?.distanceM ?? null,
            startAltitude: hike.startAltitude,
            endAltitude: summitAltRef.current,
          })
        : null;
    clearHike(); // 인증 성공 = 등반 세션 종료 (지도 배너 사라짐)
    setState({ key: 'captured', clientRef, courseName, summary });
    flush(); // 온라인이면 즉시 제출 시도
  };

  // 언마운트 이펙트가 미확정 캡처를 finalize하므로 닫기는 이동만.
  const close = () => router.back();

  const retry = (
    <TouchableOpacity style={s.btn} onPress={() => start()} accessibilityRole="button">
      <Text style={s.btnText}>다시 시도</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.wrap}>
      <TouchableOpacity style={s.close} onPress={close} accessibilityRole="button" accessibilityLabel="닫기">
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      {state.key === 'requesting_permission' && <Center title="위치 권한 확인 중…" />}
      {state.key === 'priming' && (
        <Center title="위치 권한이 필요해요" body="인증하는 순간의 위치만 딱 한 번 사용해요. 백그라운드 추적은 하지 않아요.">
          <TouchableOpacity style={s.btn} onPress={() => start(true)} accessibilityRole="button">
            <Text style={s.btnText}>위치 허용하고 인증</Text>
          </TouchableOpacity>
        </Center>
      )}
      {state.key === 'permission_denied' && (
        <Center title="위치 권한이 필요해요" body="인증 순간의 위치로만 완등을 확인해요. 백그라운드 추적은 하지 않아요.">
          <TouchableOpacity style={s.btn} onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={s.btnText}>설정 열기</Text>
          </TouchableOpacity>
          {retry}
        </Center>
      )}
      {state.key === 'acquiring_fix' && <Center title="GPS 신호를 찾는 중…" body="하늘이 트인 곳에서 잠시만 기다려주세요" />}
      {state.key === 'fix_failed' && <Center title="GPS를 잡지 못했어요" body="하늘이 트인 곳으로 이동해보세요">{retry}</Center>}
      {state.key === 'confirm_marginal' && (
        <Center
          title={
            state.reasons.includes('distance')
              ? state.distanceM > 1000
                ? '체크포인트에서 멀리 있어요'
                : '체크포인트에서 조금 떨어져 있어요'
              : 'GPS 정확도가 낮아요'
          }
          body={
            // 사유 전부 표시 — 거리·정확도 복합이면 둘 다 (카피 정직성, 적대 리뷰 LOW)
            [
              state.reasons.includes('distance') && `${state.nearest.name} 체크포인트까지 ${fmtDist(state.distanceM)}`,
              state.reasons.includes('accuracy') && `GPS 오차 ±${state.accuracyM}m`,
            ]
              .filter(Boolean)
              .join('\n') + '\n정상에 있다면 그대로 인증하세요. 완등으로 기록돼요.'
          }
        >
          <TouchableOpacity style={s.btn} onPress={() => proceedToSelect(state.fix, state.nearest, true)} accessibilityRole="button">
            <Text style={s.btnText}>그래도 인증하기</Text>
          </TouchableOpacity>
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
                accessibilityRole="button"
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
          {/* marginal 캡처는 코스 명시 필수 — courseId=null이면 서버가 거리 flag를 못 단다(적대 리뷰 BLOCKER) */}
          {!state.marginal && (
            <TouchableOpacity style={s.laterBtn} onPress={() => chooseCourse(state.clientRef, null, null)} accessibilityRole="button">
              {/* 정직한 카피 — 사후 코스 부착 경로가 없으므로 '나중에'를 약속하지 않는다 */}
              <Text style={s.laterText}>코스 없이 기록할게요</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {state.key === 'captured' && (
        <Captured
          courseName={state.courseName}
          summary={state.summary}
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
const fmtDuration = (min: number) => (min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`);

// 운동 요약 카드 — 완등 순간의 로컬 통계(시간·거리 실측, 경사도 GPS 측정, 칼로리 추정).
// 측정 불가값('—')은 숨기지 않고 그대로 표기 → 무엇이 추정/미측정인지 정직하게 드러낸다.
function StatGrid({ summary }: { summary: HikeSummary }) {
  const cells = [
    { label: '운동 시간', value: fmtDuration(summary.durationMin) },
    { label: '운동 거리', value: summary.distanceM != null ? fmtDist(summary.distanceM) : '—' },
    { label: '평균 속도', value: summary.avgSpeedKmh != null ? `${summary.avgSpeedKmh.toFixed(1)}km/h` : '—' },
    { label: '평균 경사도', value: summary.gradientPct != null ? `${summary.gradientPct.toFixed(1)}%` : '—' },
    { label: '예상 소모', value: `${summary.calories}kcal` },
  ];
  return (
    <View style={s.statPanel}>
      <View style={s.statGrid}>
        {cells.map((c) => (
          <View key={c.label} style={s.statCell}>
            <Text style={s.statValue}>{c.value}</Text>
            <Text style={s.statLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
      <Text style={s.statNote}>* 칼로리는 65kg 기준 추정, 경사도는 GPS 고도 기준</Text>
    </View>
  );
}

function Captured({
  courseName,
  summary,
  totalMountains,
  onMap,
  onRecords,
}: {
  courseName: string | null;
  summary: HikeSummary | null;
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
      {summary && <StatGrid summary={summary} />}
      <TouchableOpacity style={s.btn} onPress={onMap} accessibilityRole="button">
        <Text style={s.btnText}>지도로 돌아가기</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnOutline} onPress={onRecords} accessibilityRole="button">
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
  captured: { flex: 1, alignItems: 'center', padding: 32, paddingTop: 88, gap: SP.md, shadowColor: C.success, shadowOpacity: 0.35, shadowRadius: 24, elevation: 12 },
  heroHalo: { width: 128, height: 128, borderRadius: 64, backgroundColor: C.successSoft, alignItems: 'center', justifyContent: 'center', marginBottom: SP.sm },
  heroEmblem: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },
  heroCheck: { color: '#0C0E10', fontSize: 44, fontWeight: '700', lineHeight: 48 },
  counterChip: { backgroundColor: C.successSoft, paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.pill },
  counterText: { fontSize: 15, fontWeight: '700', color: C.success, textAlign: 'center', fontFamily: MONO },

  // 운동 요약 카드 — 플랫 표면 + border 1px(그림자 예외는 성공 히어로뿐, design §4). 숫자는 MONO로 지표 톤 통일.
  statPanel: { alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: R.card, borderWidth: 1, borderColor: C.border, padding: SP.md, gap: SP.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '33.33%', alignItems: 'center', paddingVertical: SP.sm, gap: 2 },
  statValue: { fontSize: 17, fontWeight: '700', color: C.ink, fontFamily: MONO },
  statLabel: { fontSize: 11, color: C.faint },
  statNote: { fontSize: 10, color: C.faint, textAlign: 'center' },

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
