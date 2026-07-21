// 등반 세션 트래커 — 백그라운드 위치 → 코스 투영 → 잠금화면 위젯(iOS)/진행 알림(Android) 실시간 갱신.
// 표시 전용. 인증·멱등성·관대 판정 무변경(03) — 위치는 세션 중에만, 서버 전송 없음(문서 07).
// 수명: activeHike의 courseId를 '원하는 상태'로 보고 reconcile. 모든 시작/중단은 opChain으로 직렬화(경쟁 방지).
// 배선은 useHikeTracker 하나(구독). 순수 계산은 테스트된 courseProgress·hikeWidget가 담당, 여긴 네이티브 글루(빌드 게이트로 검증).
import { useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import HikeActivity, { type HikeActivityProps } from '@/widgets/HikeActivity';
import { type LiveActivity } from 'expo-widgets';
import { buildCoursePath, projectOnCourse, type CoursePathIndex } from './courseProgress';
import { formatHikeWidget } from './hikeWidget';
import { getActiveHike, getCachedCourses, setHikeStartAltitude, subscribeHike, type ActiveHike } from './outbox';
import { hasSeenAlwaysPrompt, markAlwaysPromptSeen } from './prefs';

const TASK = 'hike-location-tracking';
const GREEN = '#2ECC71';
const APP_URL = 'mobile://'; // 위젯 탭 → 앱 열기(완등 인증 플로우로 진입). ponytail: 캡처 라우트 딥링크는 후속.

// 코스 인덱스 캐시(courseId 바뀔 때만 재빌드). liveActivity/runningCourseId는 현재 추적 상태.
let cachedIndex: { courseId: string; index: CoursePathIndex } | null = null;
let liveActivity: LiveActivity<HikeActivityProps> | null = null;
let runningCourseId: string | null = null;
let opChain: Promise<unknown> = Promise.resolve(); // 시작/중단 직렬화 — await 사이 인터리브·중복 시작 차단

function courseIndexFor(hike: ActiveHike): CoursePathIndex | null {
  if (cachedIndex?.courseId === hike.courseId) return cachedIndex.index;
  const course = getCachedCourses(hike.mountainId)?.find((c) => c.id === hike.courseId);
  if (!course) return null; // 코스 캐시 미스(오프라인 콜드스타트 등) → 이번 fix 스킵, 다음에 재시도
  const index = buildCoursePath(course.path.coordinates, course.distanceM);
  if (index) cachedIndex = { courseId: hike.courseId, index };
  return index;
}

function propsFromFix(hike: ActiveHike, coords: Location.LocationObjectCoords, tsMs: number): HikeActivityProps | null {
  const index = courseIndexFor(hike);
  if (!index) return null;
  const progress = projectOnCourse(index, coords.latitude, coords.longitude);
  const s = formatHikeWidget({ startedAtMs: Date.parse(hike.startedAt), nowMs: tsMs, progress, altitude: coords.altitude });
  return {
    courseName: hike.courseName,
    elapsedLabel: s.elapsedLabel,
    doneKm: s.doneKm,
    remainingKm: s.remainingKm,
    progressPct: s.progressPct,
    etaLabel: s.etaLabel,
    altitudeLabel: s.altitudeLabel,
    arrived: s.arrived,
  };
}

// 위치 아직 없을 때(시작 순간) — 진행 0 / 잔여=코스 전체로 시작
function initialProps(hike: ActiveHike): HikeActivityProps {
  const index = courseIndexFor(hike);
  return {
    courseName: hike.courseName,
    elapsedLabel: '0분',
    doneKm: '0.0',
    remainingKm: index ? (index.totalM / 1000).toFixed(1) : '0.0',
    progressPct: 0,
    etaLabel: null,
    altitudeLabel: null,
    arrived: false,
  };
}

function locationOptions(hike: ActiveHike): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.High,
    distanceInterval: 10, // 등산 페이스에 10~30s. iOS Live Activity 로컬 업데이트는 throttle 예산 무관.
    activityType: Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true, // When-In-Use로도 화면-off 갱신 지속(파란 인디케이터)
    pausesUpdatesAutomatically: false,
    // Android FGS 상시 알림 — 정직·고정 텍스트. ponytail: expo-location엔 in-place update가 없고
    // 옵션 재전달은 GPS 스트림을 재시작한다(LocationTaskConsumer.kt 확인). 실시간 숫자를 알림에 넣으려면
    // expo-notifications ongoing notification으로 별도 구현 필요(후속). 실시간 표시는 iOS Live Activity + 앱 내 배너가 담당.
    foregroundService: {
      notificationTitle: `등산 중 · ${hike.courseName}`,
      notificationBody: '정상까지 진행 상황을 추적하고 있어요. 앱을 열면 남은 거리를 볼 수 있어요.',
      notificationColor: GREEN,
    },
  };
}

// ── 백그라운드 태스크 — 매 fix마다 iOS 위젯 갱신 + 시작고도 기록. 상태는 SQLite에서 읽어 헤드리스 재실행에도 동작.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] })?.locations;
  const last = locations && locations.length ? locations[locations.length - 1] : undefined;
  if (!last) return;
  const hike = getActiveHike();
  if (!hike) {
    void requestSync(); // 세션이 끝났는데 태스크가 남아있으면 reconcile이 정리
    return;
  }
  if (last.coords.altitude != null) setHikeStartAltitude(last.coords.altitude); // 시작고도 1회 기록(경사도용)
  if (Platform.OS === 'ios') {
    if (!liveActivity) liveActivity = HikeActivity.getInstances()[0] ?? null; // 재실행 복구
    const props = propsFromFix(hike, last.coords, last.timestamp);
    if (props) void liveActivity?.update(props);
  }
});

// 권한 확보 후 실제 시작. 성공하면 true. 권한 없으면(iOS 위치 거부 / Android 알림 거부) 추적 안 함 = false.
async function reallyStart(hike: ActiveHike): Promise<boolean> {
  // 이미 이 태스크로 추적 중(앱 재실행·Fast Refresh로 모듈 상태만 리셋)이면 위치 업데이트를 중복 시작하지 않는다.
  // 안 그러면 재기동마다 중복 생성된다. 단 iOS는 태스크만 살아있고 LA가 사라진 경우(앱 재설치·사용자가 닫음)
  // LA만 다시 시작한다 — 안 그러면 남은 등반 동안 위젯이 죽은 채로 남는다.
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
    if (Platform.OS === 'ios') {
      liveActivity = HikeActivity.getInstances()[0] ?? null;
      if (!liveActivity) {
        try {
          liveActivity = HikeActivity.start(initialProps(hike), APP_URL);
        } catch {
          liveActivity = null;
        }
      }
    }
    return true;
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false; // 위치 거부 → 위젯만 생략, 등반 세션 자체는 정상 진행
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    // 알림 권한 없으면 FGS가 알림 없이 돌 수 있음 = 사용자 모르게 추적. 그건 금지 — 알림 보장될 때만 시작.
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (res !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  cachedIndex = null;
  if (Platform.OS === 'ios') {
    // LA 시작이 드물게 실패해도(예: 짧은 시간 반복 시작 시 iOS rate limit) 위치 추적은 계속 — 위젯은 표시 전용이라 degrade만.
    try {
      liveActivity = HikeActivity.start(initialProps(hike), APP_URL);
    } catch {
      liveActivity = null;
    }
  }
  await Location.startLocationUpdatesAsync(TASK, locationOptions(hike));
  return true;
}

async function reallyStop(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  if (Platform.OS === 'ios') {
    for (const inst of HikeActivity.getInstances()) await inst.end('immediate'); // 고아 방지: 남은 인스턴스 전부 종료
  }
  liveActivity = null;
  cachedIndex = null;
}

// 현재 activeHike를 '원하는 상태'로 보고 추적을 맞춘다. opChain으로 직렬화돼 인터리브·중복 시작이 없다.
function requestSync(): Promise<unknown> {
  opChain = opChain.then(syncOnce, syncOnce);
  return opChain;
}
async function syncOnce(): Promise<void> {
  const hike = getActiveHike();
  const target = hike?.courseId ?? null;
  if (target === runningCourseId) return; // 이미 원하는 상태
  if (runningCourseId != null) {
    await reallyStop(); // 종료 또는 코스 전환 → 먼저 현재 세션 정리
    runningCourseId = null;
  }
  if (target != null && hike) {
    const ok = await reallyStart(hike);
    runningCourseId = ok ? target : null; // 권한 거부면 running 아님(iOS는 재프롬프트 없이 다음 emit 재시도)
  }
}

// 사용자 선택: '항상 허용'으로 업그레이드(화면-off 신뢰도↑, 앱 종료돼도 지속). 유저가 원할 때만.
export async function upgradeToAlwaysLocation(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === 'granted';
}

// iOS에서 등반 첫 시작이 성공했을 때 1회, '항상 허용' 선택지를 안내(스펙: When-In-Use/Always를 사용자가 선택).
function offerAlwaysUpgradeOnce() {
  if (Platform.OS !== 'ios' || hasSeenAlwaysPrompt()) return;
  markAlwaysPromptSeen();
  Alert.alert(
    '화면을 꺼도 추적할까요?',
    "'앱 사용 중 허용'으로도 위치 인디케이터와 함께 갱신되지만, 앱이 완전히 종료되면 멈춥니다. '항상 허용'을 선택하면 더 안정적으로 이어집니다. 위치는 등반 중에만 쓰고 서버로 보내지 않습니다.",
    [
      { text: '앱 사용 중만', style: 'cancel' },
      { text: '항상 허용', onPress: () => void upgradeToAlwaysLocation() },
    ],
  );
}

// 유일 배선점 — activeHike 변화마다 reconcile. 루트 레이아웃에서 1회 마운트.
export function useHikeTracker() {
  useEffect(() => {
    void requestSync(); // 마운트: 진행 중 세션이면 복구(재실행)
    return subscribeHike(() => {
      const wasIdle = runningCourseId == null;
      const target = getActiveHike()?.courseId ?? null;
      void requestSync().then(() => {
        // idle→추적 시작 성공 && iOS → Always 업그레이드 1회 안내
        if (wasIdle && target && runningCourseId === target) offerAlwaysUpgradeOnce();
      });
    });
  }, []);
}
