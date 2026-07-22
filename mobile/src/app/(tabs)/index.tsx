import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  NaverMapPolylineOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { api } from '@/lib/api';
import { CoursesSchema, MountainSchema, type Course } from '@/lib/schemas';
import { FETCH_TILE_Z, haversineM, lngLatToTile, tileToBboxWithMargin } from '@/lib/geo';
import { buildCoursePath, projectOnCourse } from '@/lib/courseProgress';
import { cacheCourses, clearHike, getCachedCourses, setHikeStartAltitude, startHike } from '@/lib/outbox';
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  type Emphasis,
  lineStyle,
  mountainMarkerStyle,
  useActiveHike,
  useMeClimbs,
  useMountains,
  usePendingSet,
  useVerifiedSet,
} from '@/lib/colored';
import { hasAllClear, tierFor } from '@/lib/tiers';
import { C, MONO, R, SP } from '@/lib/theme';

// 산 마커는 항상 표시(줌 무관). 완등·대기 코스선은 상시 색칠(누적 채색 지도), 미완등은 "산을 탭해야" 보인다.
// 선택·등반 중에는 기존 강조 규칙 유지 — 타 코스(상시 색칠 포함)는 dimmed로 포커스를 양보한다.
// 얇은 코스선(w3~6)은 손가락으로 맞히기 어렵다. 투명 넓은 폴리라인을 위에 겹쳐 탭 타겟만 넓힌다.
const HIT_WIDTH = 44; // 44dp = iOS 최소 터치 타겟
const HIT_COLOR = '#00000001'; // 사실상 투명(alpha 0은 렌더 스킵될 수 있어 1/255)

// 코스 예상 소요시간·거리 라벨 (네비처럼 지도에 표기). 데이터 없으면 null → 라벨 스킵.
const durationLabel = (c: Course): string | null => {
  const t = c.durationMin ? `⏱ ${c.durationMin}분` : '';
  const d = c.distanceM ? `${(c.distanceM / 1000).toFixed(1)}km` : '';
  return [t, d].filter(Boolean).join(' · ') || null;
};
// NativeTabs(플로팅)는 높이 훅이 없어 상수로 클리어 — safe-area 인셋 위로 이만큼 띄운다(추천 카드 겹침 방지)
const TABBAR_CLEARANCE = 88;

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tile, setTile] = useState(() => lngLatToTile(FETCH_TILE_Z, 126.98, 37.55));
  const [selectedMountainId, setSelectedMountainId] = useState<string | null>(null);
  // P0-1: 코스 선택 상태
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const lastCam = useRef({ lng: 126.98, lat: 37.55, zoom: 11.5 });
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const mapRef = useRef<NaverMapViewRef>(null);
  // P0-4 수신 중복 방지 + 비동기 courseId 선택 대기 (mountain 쿼리 완료 후 처리)
  const pendingCourseRef = useRef<string | null>(null);

  const bbox = useMemo(() => tileToBboxWithMargin(FETCH_TILE_Z, tile.x, tile.y), [tile]);

  // 타일 양자화 쿼리 키 + staleTime Infinity — 코스는 거의 불변 (04 §7)
  const { data: courses, isError: coursesError, refetch: refetchCourses } = useQuery({
    queryKey: ['courses-tile', FETCH_TILE_Z, tile.x, tile.y],
    queryFn: async () =>
      CoursesSchema.parse(
        await api(`/courses?bbox=${bbox.join(',')}&zoom=${Math.round(lastCam.current.zoom)}`),
      ),
    staleTime: Infinity,
  });

  const { data: mountain, isError: mountainError, refetch: refetchMountain } = useQuery({
    queryKey: ['mountain', selectedMountainId],
    queryFn: async () => {
      const m = MountainSchema.parse(await api(`/mountains/${selectedMountainId}`));
      cacheCourses(m.id, m.courses); // 프리페치 계약 — 오프라인 위저드의 판정 소스 (04 §5)
      return m;
    },
    enabled: !!selectedMountainId,
  });

  // 시트 헤더는 상세 쿼리를 기다리지 않는다 — 카탈로그(staleTime Infinity, 이미 캐시됨)에 name/region/elevationM이 다 있다.
  // 없으면 타 산 코스를 고를 때 mountain이 undefined인 동안 시트 전체가 '불러오는 중…' 한 줄로 붕괴했다가 다시 펴져 플리커.
  const { data: mountainsList } = useMountains();
  const sheetHeader =
    mountain ?? mountainsList?.find((m) => m.id === selectedMountainId);

  const pending = usePendingSet();
  const verified = useVerifiedSet();
  // 완등 마커 등급 테마 — 유저 완등수로 등급색/완등왕 골드 (프로필·기록과 톤 통일)
  const markerTier = { tierColor: tierFor(verified.size).color, max: hasAllClear(verified.size) };
  const activeHike = useActiveHike();

  // 등반 중이면 30s마다 경과시간 갱신 (상단 배너 표시용)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!activeHike) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [activeHike]);
  const elapsedLabel = useMemo(() => {
    if (!activeHike) return '';
    const m = Math.max(0, Math.floor((nowMs - Date.parse(activeHike.startedAt)) / 60_000));
    return m < 60 ? `${m}분째` : `${Math.floor(m / 60)}시간 ${m % 60}분째`;
  }, [activeHike, nowMs]);

  // 진행 중 등반 코스의 체크포인트(정상) 좌표+반경 — 프리페치 캐시에서(등반 시작 전 openMountain이 캐시함)
  const activeCheckpoint = useMemo(() => {
    if (!activeHike) return null;
    const c = (getCachedCourses(activeHike.mountainId) ?? []).find((x) => x.id === activeHike.courseId);
    if (!c) return null;
    return {
      lat: c.checkpointPoint.coordinates[1],
      lng: c.checkpointPoint.coordinates[0],
      radiusM: c.verifyRadiusM,
      // 코스 페이스(분/m) — 남은 직선거리×페이스로 대략 ETA. ponytail: 직선이라 실거리보다 짧게 잡힘 → '약'.
      paceMinPerM: c.durationMin && c.distanceM ? c.durationMin / c.distanceM : null,
      // 진행률 라인용 경로(들머리→정상). 내 위치를 여기 투영해 얼마나 왔는지 계산.
      path: c.path.coordinates,
      distanceM: c.distanceM, // 서버 실측 총거리 — 위젯과 동일하게 buildCoursePath에 넘겨 인덱스 정본 일치.
    };
  }, [activeHike]);

  // 정상까지 실시간 남은 거리(포그라운드 폴링). 이미 권한 허용된 경우만 — 콜드 프롬프트 금지(05 §3).
  // ponytail: 이 watch는 포그라운드 전용 — 앱 백그라운드 시 iOS가 자동 중단. 잠금화면 위젯/알림의 백그라운드 갱신은 hikeTracker.ts 태스크가 담당.
  const [distM, setDistM] = useState<number | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number; heading: number } | null>(null);
  const [locGranted, setLocGranted] = useState<boolean | null>(null); // 등반 시작 권한 요청 결과 → watch 재가동 트리거
  useEffect(() => {
    if (!activeHike || !activeCheckpoint) return; // distM/myPos 정리는 아래 cleanup이 담당(중복 제거)
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 5000 },
        (loc) => {
          setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading ?? -1 });
          setDistM(haversineM(loc.coords.latitude, loc.coords.longitude, activeCheckpoint.lat, activeCheckpoint.lng));
          // 첫 fix 고도를 시작 고도로 기록 → 완등 시 정상 고도와의 델타로 평균 경사도 산출(setter가 1회만 반영).
          if (loc.coords.altitude != null) setHikeStartAltitude(loc.coords.altitude);
        },
      );
      // watch가 resolve되는 await 창 사이에 정리(등반 종료 등)가 돌면 sub이 아직 null → 누수.
      // resolve 후 재확인해 self-remove — 이 포그라운드 watch의 수명 관리(백그라운드 태스크는 별개).
      if (cancelled) s.remove();
      else sub = s;
    })();
    return () => {
      cancelled = true;
      sub?.remove();
      setDistM(null);
      setMyPos(null);
    };
  }, [activeHike, activeCheckpoint, locGranted]);

  // 등반 시작 시 내 위치 ↔ 정상이 한눈에 들어오게 카메라 1회 맞춤(등반당 1회, 이후 사용자 조작 존중).
  const fittedHikeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeHike) {
      fittedHikeRef.current = null;
      return;
    }
    if (!myPos || !activeCheckpoint || fittedHikeRef.current === activeHike.courseId || !mapRef.current) return;
    fittedHikeRef.current = activeHike.courseId;
    const pad = 0.002; // ~200m 여유 — 두 점이 붙어 있어도 과도 줌 방지
    mapRef.current.animateCameraWithTwoCoords({
      coord1: { latitude: Math.min(myPos.lat, activeCheckpoint.lat) - pad, longitude: Math.min(myPos.lng, activeCheckpoint.lng) - pad },
      coord2: { latitude: Math.max(myPos.lat, activeCheckpoint.lat) + pad, longitude: Math.max(myPos.lng, activeCheckpoint.lng) + pad },
    });
  }, [activeHike, myPos, activeCheckpoint]);

  const arrived = distM != null && !!activeCheckpoint && distM <= activeCheckpoint.radiusM;
  // 정상까지 남은 거리(지도 정상 마커·배너 공용). 반경 안이면 '도착'.
  const remainLabel = useMemo(() => {
    if (distM == null || !activeCheckpoint) return null;
    if (distM <= activeCheckpoint.radiusM) return '도착';
    return distM >= 1000 ? (distM / 1000).toFixed(1) + 'km' : Math.round(distM) + 'm';
  }, [distM, activeCheckpoint]);
  // 배너용: 남은 거리 + 예상 소요시간(페이스 있을 때만).
  const progressLabel = useMemo(() => {
    if (remainLabel == null) return null;
    if (remainLabel === '도착') return '정상 도착 ✓';
    const eta =
      activeCheckpoint?.paceMinPerM && distM != null
        ? ` · 약 ${Math.max(1, Math.round(distM * activeCheckpoint.paceMinPerM))}분`
        : '';
    return `정상 ${remainLabel}${eta}`;
  }, [remainLabel, activeCheckpoint, distM]);

  // 상단 배너 진행률 라인(0~100%) — 내 위치를 코스 경로에 투영한 누적거리 비율. 도착=100%. GPS 전엔 null(라인 숨김).
  // 투영은 잠금화면 위젯과 동일한 courseProgress 단일 정본. 누적거리 테이블은 코스당 1회만 빌드(myPos마다 재계산 안 함).
  // 코스에서 1km 넘게 벗어나면(집에서 시작·GPS 튐 등) 투영값이 끝점으로 collapse해 무의미 → 라인 숨김.
  const courseIndex = useMemo(
    () => (activeCheckpoint?.path ? buildCoursePath(activeCheckpoint.path, activeCheckpoint.distanceM) : null),
    [activeCheckpoint],
  );
  const progressPct = useMemo(() => {
    if (arrived) return 100;
    if (!myPos || !courseIndex) return null;
    const p = projectOnCourse(courseIndex, myPos.lat, myPos.lng);
    return p.offCourseM > 1000 ? null : Math.round(p.fraction * 100);
  }, [arrived, myPos, courseIndex]);

  // rank15 (05 §9): 빈 상태 = 도화지. 완등 0 신규 유저에게 시작 코스 추천 카드 1장.
  // ponytail: 타일 /courses엔 산 이름이 없어(mountainId만) 코스 단위 추천 — 탭하면 openMountain으로 산 시트 오픈.
  const { data: me } = useMeClimbs();
  const [recDismissed, setRecDismissed] = useState(false);
  const recommended = useMemo(
    () => (courses ?? []).find((c) => c.difficulty === 'easy') ?? courses?.[0] ?? null,
    [courses],
  );
  // P0-1: 코스 선택 시 추천 카드 숨김
  const showRec = !!me && me.totalClimbs === 0 && !selectedMountainId && !selectedCourseId && !activeHike && !recDismissed && !!recommended;

  // onCameraIdle에서만 + 200ms 디바운스 (04 §7 — onCameraChanged fetch 금지)
  const onCameraIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const { lng, lat } = lastCam.current;
      setTile(lngLatToTile(FETCH_TILE_Z, lng, lat));
    }, 200);
  }, []);

  const lineState = (c: Course) =>
    verified.has(c.id) ? 'verified' : pending.has(c.id) ? 'pending' : 'unclimbed';

  // rank10: 저줌이면 산 단위로 집약 — mountainId별 checkpoint centroid에 마커 1개. 정복=코스 중 verified 존재.
  // ponytail: courses는 타일당 소수라 매 렌더 계산 OK.
  const mountainMarkers = useMemo(() => {
    const groups = new Map<string, Course[]>();
    for (const c of courses ?? []) {
      const arr = groups.get(c.mountainId);
      if (arr) arr.push(c);
      else groups.set(c.mountainId, [c]);
    }
    return [...groups].map(([mountainId, cs]) => ({
      mountainId,
      lat: cs.reduce((s, c) => s + c.checkpointPoint.coordinates[1], 0) / cs.length,
      lng: cs.reduce((s, c) => s + c.checkpointPoint.coordinates[0], 0) / cs.length,
      conquered: cs.some((c) => verified.has(c.id)),
    }));
  }, [courses, verified]);

  const openMountain = useCallback((mountainId: string) => {
    setSelectedMountainId(mountainId);
    sheetRef.current?.snapToIndex(0);
  }, []);

  // P0-1: 코스 선택 — 카메라 bounds fit + 상태 업데이트
  const selectCourse = useCallback(
    (c: Course) => {
      setSelectedCourseId(c.id);
      openMountain(c.mountainId);
      if (c.path.coordinates.length >= 2 && mapRef.current) {
        const lngs = c.path.coordinates.map(([lng]) => lng);
        const lats = c.path.coordinates.map(([, lat]) => lat);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const latSpan = maxLat - minLat;
        // animateCameraWithTwoCoords는 두 좌표 중심을 화면 중앙(pivot 0.5)에 둔다.
        // 하단 바텀시트가 45%를 덮으므로 남쪽(하단)에 여백을 크게 줘 코스를 시트 위 상단으로 올린다.
        // (버그였음: 북쪽 maxLat에 가산하면 중심이 북으로 밀려 코스가 오히려 시트 밑으로 내려가 가려짐)
        mapRef.current.animateCameraWithTwoCoords({
          coord1: { latitude: minLat - latSpan * 1.0, longitude: Math.min(...lngs) },
          coord2: { latitude: maxLat + latSpan * 0.1, longitude: Math.max(...lngs) },
        });
      }
    },
    [openMountain],
  );

  // P0-4 수신 계약: focusMountainId/focusCourseId (기록 탭·검색 화면이 router.navigate로 전달)
  const { focusMountainId, focusCourseId } = useLocalSearchParams<{
    focusMountainId?: string;
    focusCourseId?: string;
  }>();

  useEffect(() => {
    if (!focusMountainId) return;
    pendingCourseRef.current = focusCourseId ?? null;
    // 네비 param 소비 = 시트 오픈(외부 이벤트 반응) + 아래 param 클리어 부수효과 → 이펙트가 정당. 룰 오탐.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openMountain(focusMountainId);
    // 소비 즉시 param 클리어 — 같은 산을 다시 탭해도 param이 재세팅돼 effect 재발화(잔류 가드 시 무동작 방지)
    router.setParams({ focusMountainId: undefined, focusCourseId: undefined });
  }, [focusMountainId, focusCourseId, openMountain, router]);

  // pendingCourseRef 처리: mountain 쿼리 완료 후 해당 코스 선택
  useEffect(() => {
    if (!pendingCourseRef.current || !mountain) return;
    const c = mountain.courses.find((c) => c.id === pendingCourseRef.current);
    if (c) selectCourse(c);
    pendingCourseRef.current = null; // 미발견 포함 항상 클리어
  }, [mountain, selectCourse]);

  // 타일 이탈로 선택 코스가 courses에서 사라지면 선택 해제 —
  // react.dev "prop 변화 시 state 조정": 이펙트 대신 렌더 중 조정(즉시 수렴, 페인트 전).
  if (selectedCourseId && courses && !courses.some((c) => c.id === selectedCourseId)) {
    setSelectedCourseId(null);
  }

  // 현재 시트에 열려 있는 산의 선택된 코스 — CTA 라벨 계산용
  const selectedCourse = mountain?.courses.find((c) => c.id === selectedCourseId) ?? null;
  const selectedIsActive = !!selectedCourse && activeHike?.courseId === selectedCourse.id;

  // 코스선 노출 집합: 완등·대기 코스는 항상(누적 채색 = 핵심 가치) + 선택된 산의 코스 + 진행 중 등반 코스.
  // 미완등 코스만 "산을 탭해야 보인다"를 유지.
  const visibleCourses = useMemo(
    () =>
      (courses ?? []).filter(
        (c) =>
          c.mountainId === selectedMountainId ||
          c.id === activeHike?.courseId ||
          verified.has(c.id) ||
          pending.has(c.id),
      ),
    [courses, selectedMountainId, activeHike, verified, pending],
  );
  // 강조: 진행 중 등반 코스는 active(네비 경로), 나머지는 dimmed. 등반 없으면 기존 선택 로직.
  const emphasisFor = (c: Course): Emphasis => {
    if (activeHike?.courseId === c.id) return 'active';
    if (activeHike) return 'dimmed';
    if (!selectedCourseId) return 'none';
    return c.id === selectedCourseId ? 'selected' : 'dimmed';
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 다크 지도: Navi만이 야간 모드를 지원 (§3 근거 — NaverMapView.tsx L166-173).
          lightness -0.1 → granite 쪽으로 살짝 침전, 오버레이는 그대로라 코스선 대비 상승.
          P0-3: isShowLocationButton — JS prop. 탭이 트리거라 콜드 프롬프트 없음 (PM §P0-3). */}
      <NaverMapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialCamera={{ latitude: 37.55, longitude: 126.98, zoom: 11.5 }}
        mapType="Navi"
        isNightModeEnabled
        lightness={-0.1}
        layerGroups={{ BUILDING: true, TRAFFIC: false, TRANSIT: false, BICYCLE: false, MOUNTAIN: false, CADASTRAL: false }}
        isShowLocationButton
        onCameraChanged={({ latitude, longitude, zoom }) => {
          lastCam.current = { lat: latitude, lng: longitude, zoom: zoom ?? 11 };
        }}
        onCameraIdle={onCameraIdle}
        // 빈 지도 탭 → 1탭: 코스 선택만 해제 / 코스 없으면 시트 닫기(=산 선택 해제)
        onTapMap={() => {
          if (selectedCourseId) setSelectedCourseId(null);
          else sheetRef.current?.close();
        }}
      >
        {visibleCourses.map((c) => {
          const st = lineStyle(lineState(c), c.difficulty, emphasisFor(c));
          const coords = c.path.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
          return (
            <Fragment key={c.id}>
              {/* verified glow 언더레이 — §2: zIndex 본선(1)보다 낮게(0) */}
              {st.glow && (
                <NaverMapPolylineOverlay coords={coords} width={st.glow.width} color={st.glow.color} zIndex={0} />
              )}
              <NaverMapPolylineOverlay
                coords={coords}
                width={st.width}
                color={st.color}
                pattern={st.pattern}
                zIndex={1}
              />
              {/* 투명 넓은 탭 히트영역 — 본선 위(zIndex 2)라 탭을 먼저 잡는다. selectCourse=미리보기 */}
              <NaverMapPolylineOverlay
                coords={coords}
                width={HIT_WIDTH}
                color={HIT_COLOR}
                zIndex={2}
                onTap={() => selectCourse(c)}
              />
            </Fragment>
          );
        })}
        {/* 코스별 예상 소요시간·거리 라벨 — 코스선 중앙에. 겹치면 자동 숨김(isHideCollidedCaptions).
            dimmed(비선택/진행 외) 코스는 라벨 숨김. 라인 탭 가로채기 대비 onTap도 selectCourse. */}
        {visibleCourses.map((c) => {
          if (c.mountainId !== selectedMountainId) return null; // 상시 색칠(완등) 코스는 라벨 없이 선만 — 전역 라벨 노이즈 방지
          if (emphasisFor(c) === 'dimmed') return null;
          if (activeHike?.courseId === c.id) return null; // 등반 중 코스는 정적 소요시간 라벨 숨김 — 배너가 실시간 담당
          const label = durationLabel(c);
          if (!label) return null;
          const mid = c.path.coordinates[Math.floor(c.path.coordinates.length / 2)];
          if (!mid) return null;
          return (
            <NaverMapMarkerOverlay
              key={`dur-${c.id}`}
              latitude={mid[1]}
              longitude={mid[0]}
              width={1}
              height={1}
              isHideCollidedCaptions
              caption={{ text: label, color: C.success, haloColor: '#0C0E10', textSize: 12 }}
              onTap={() => selectCourse(c)}
            />
          );
        })}
        {/* 등반 중 정상(목표) 마커 — 남은 거리를 목표 지점에 표기(캡션만, 핀 없이). GPS 전엔 '🚩 정상'만. */}
        {activeHike && activeCheckpoint && (
          <NaverMapMarkerOverlay
            latitude={activeCheckpoint.lat}
            longitude={activeCheckpoint.lng}
            width={1}
            height={1}
            isHideCollidedCaptions
            caption={{
              text: `🚩 정상${remainLabel ? ` ${remainLabel}` : ''}`,
              color: C.ink,
              haloColor: '#0C0E10',
              textSize: 13,
            }}
          />
        )}
        {/* 등반 중 내 위치 — 큰 내비 화살표(heading 방향 회전, 정적이면 위쪽). 작은 점 대신. */}
        {activeHike && myPos && (
          <NaverMapMarkerOverlay
            latitude={myPos.lat}
            longitude={myPos.lng}
            width={40}
            height={40}
            anchor={{ x: 0.5, y: 0.5 }}
            angle={myPos.heading >= 0 ? myPos.heading : 0}
            image={require('../../../assets/images/nav-arrow.png')}
          />
        )}
        {/* 산 단위 집약 마커 — 항상 표시(줌 무관). 정복=green+✓ / 미정복=gray(색+아이콘+텍스트 이중 인코딩).
            탭하면 그 산의 시트가 열리고 코스선이 나타난다. */}
        {mountainMarkers.map((m) => {
            if (activeHike?.mountainId === m.mountainId) return null; // 등반 중인 산은 정상 마커로 대체(캡션 겹침 방지)
            const mk = mountainMarkerStyle(m.conquered, markerTier);
            return (
              <NaverMapMarkerOverlay
                key={`mt-${m.mountainId}`}
                latitude={m.lat}
                longitude={m.lng}
                width={28}
                height={28}
                image={{ symbol: mk.symbol }}
                caption={mk.caption}
                onTap={() => openMountain(m.mountainId)}
              />
            );
          })}
      </NaverMapView>

      {/* 등반 중이면 상단을 등반 배너가 차지(진행 중 세션) — 아니면 검색 pill */}
      {activeHike ? (
        <View style={[s.hikeBarWrap, { top: insets.top + SP.sm }]} pointerEvents="box-none">
          <View style={s.hikeCard}>
            <View style={s.hikeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.hikeName} numberOfLines={1}>🥾 {activeHike.courseName}</Text>
                <Text style={[s.hikeMeta, arrived && s.hikeMetaArrived]} numberOfLines={1}>
                  {progressLabel ? `${elapsedLabel} · ${progressLabel}` : `등반 중 · ${elapsedLabel}`}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.hikeCertify, arrived && s.hikeCertifyArrived]}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/capture',
                    params: { mountainId: activeHike.mountainId, courseId: activeHike.courseId },
                  })
                }
              >
                <Text style={s.hikeCertifyText}>완등 인증</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.hikeEnd} onPress={() => clearHike()} hitSlop={10} accessibilityRole="button" accessibilityLabel="등반 종료">
                <Text style={s.hikeEndText}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* 진행률 라인 — 내 위치를 코스 경로에 투영한 %. GPS 잡히기 전엔 숨김. */}
            {progressPct != null && (
              <View style={s.progressRow}>
                <View
                  style={s.progressTrack}
                  accessibilityRole="progressbar"
                  accessibilityLabel="등반 진행률"
                  accessibilityValue={{ min: 0, max: 100, now: progressPct, text: arrived ? '완등 지점' : `${progressPct}%` }}
                >
                  <View style={[s.progressFill, { width: `${progressPct}%` }, arrived && s.progressFillDone]} />
                </View>
                <Text style={[s.progressPct, arrived && s.progressPctDone]} numberOfLines={1}>
                  {arrived ? '완등 지점' : `${progressPct}%`}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={[s.searchPillWrap, { top: insets.top + SP.sm }]} pointerEvents="box-none">
          <TouchableOpacity
            style={s.searchPill}
            activeOpacity={0.85}
            // ponytail: /search는 FE-B 생성 예정 — typedRoutes 미등록이라 as any
            onPress={() => router.push('/search' as any)}
          >
            <Text style={s.searchPillText}>산 이름 검색</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* L5: 타일 코스 조회 실패 — 빈 지도를 '산이 없다'로 오독하지 않게 에러+재시도 pill(records 패턴) */}
      {coursesError && (
        <View style={[s.searchPillWrap, { top: insets.top + 64 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={s.errorPill}
            activeOpacity={0.85}
            onPress={() => refetchCourses()}
            accessibilityRole="button"
            accessibilityLabel="지도 코스 다시 불러오기"
          >
            <Text style={s.errorPillText}>코스를 불러오지 못했어요 · 다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {showRec && recommended && (
        <View style={[s.recWrap, { bottom: insets.bottom + TABBAR_CLEARANCE }]} pointerEvents="box-none">
          <View style={s.recCard}>
            <TouchableOpacity
              style={s.recMain}
              activeOpacity={0.85}
              onPress={() => openMountain(recommended.mountainId)}
            >
              <Text style={s.recKicker}>🏔 이런 코스부터 칠해보세요</Text>
              <Text style={s.recTitle} numberOfLines={1}>{recommended.name}</Text>
              <Text style={s.recCta}>코스 보기 →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.recClose} onPress={() => setRecDismissed(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="추천 닫기">
              <Text style={s.recCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 등반 중 '내 위치로' FAB(우하단) — 앱이 추적하는 myPos(=지도의 내비 화살표)로 카메라 리센터.
          ponytail: 네이티브 isShowLocationButton은 SDK 자체 위치원을 써 목표 myPos와 어긋난다 —
          이 FAB는 화면의 그 화살표로 정확히 리센터하고 같은 아이콘으로 "이 버튼=저 화살표"를 잇는다. myPos 있을 때만. */}
      {activeHike && myPos && (
        <TouchableOpacity
          style={[s.locFab, { bottom: insets.bottom + TABBAR_CLEARANCE }]}
          activeOpacity={0.85}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="내 위치로 이동"
          onPress={() =>
            // 줌인만(≥14) — 더 당겨봤으면 그 줌 유지, 멀리 봤으면 14로. 줌아웃으로 홱 당기지 않음(사용자 조작 존중).
            mapRef.current?.animateCameraTo({
              latitude: myPos.lat,
              longitude: myPos.lng,
              zoom: Math.max(lastCam.current.zoom, 14),
            })
          }
        >
          <Image source={require('../../../assets/images/nav-arrow.png')} style={s.locFabIcon} />
        </TouchableOpacity>
      )}

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['45%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: C.surface }}
        handleIndicatorStyle={{ backgroundColor: C.border }}
        // 시트 닫힘 = 산 선택 해제 → 코스선도 숨김("산을 탭해야 코스가 보인다"). 캐시는 react-query가 보존.
        // 진행 중 등반 코스선은 activeHike 파생이라 여기서 안 사라짐.
        onClose={() => {
          setSelectedCourseId(null);
          setSelectedMountainId(null);
        }}
      >
        <BottomSheetScrollView contentContainerStyle={[s.sheet, { paddingBottom: insets.bottom + TABBAR_CLEARANCE }]}>
          {sheetHeader ? (
            <>
              <Text style={s.name}>{sheetHeader.name}</Text>
              <Text style={s.meta}>
                {sheetHeader.region ?? ''} {sheetHeader.elevationM ? `· ${sheetHeader.elevationM}m` : ''}
              </Text>
              {/* 상세 실패 시 영구 '불러오는 중' 고착 방지 — L5 pill 동형 재시도(산중 전파 불안정 대비) */}
              {/* ponytail: 캐시된 mountain이 있는 산의 백그라운드 refetch 실패는 침묵 — 옛 코스 목록이 에러 pill보다 낫다 */}
              {!mountain &&
                (mountainError ? (
                  <TouchableOpacity
                    style={[s.errorPill, s.sheetErrorPill]}
                    activeOpacity={0.85}
                    onPress={() => refetchMountain()}
                    accessibilityRole="button"
                    accessibilityLabel="이 산의 코스 다시 불러오기"
                  >
                    <Text style={s.errorPillText}>코스를 불러오지 못했어요 · 다시 시도</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.meta}>코스 불러오는 중…</Text>
                ))}
              {(mountain?.courses ?? []).map((c) => {
                const isSelected = c.id === selectedCourseId;
                const isVerified = verified.has(c.id);
                const isPending = pending.has(c.id);
                return (
                  // P0-1: 코스 행 탭 → 선택/토글. 선택 시 지도 하이라이트+카메라 fit.
                  <TouchableOpacity
                    key={c.id}
                    style={[s.courseRow, isSelected && s.courseRowSelected]}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${c.name}, ${DIFFICULTY_LABEL[c.difficulty ?? 'moderate']}${isVerified ? ', 완등' : isPending ? ', 대기 중' : ''}`}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedCourseId(null); // 재탭 = 선택 토글 해제
                      } else {
                        selectCourse(c);
                      }
                    }}
                  >
                    <View style={s.difficultyBadge}>
                      <View style={[s.dot, { backgroundColor: DIFFICULTY_COLOR[c.difficulty ?? 'moderate'] }]} />
                      <Text style={s.difficultyText}>{DIFFICULTY_LABEL[c.difficulty ?? 'moderate']}</Text>
                    </View>
                    <View style={s.courseInfo}>
                      <Text style={s.courseName} numberOfLines={1}>{c.name}</Text>
                      <Text style={s.courseMeta}>
                        {c.distanceM ? `${(c.distanceM / 1000).toFixed(1)}km` : ''}{' '}
                        {c.durationMin ? `${c.durationMin}분` : ''}
                      </Text>
                    </View>
                    {isVerified && (
                      <View style={s.statusChip}>
                        <Text style={s.statusChipVerified}>완등</Text>
                      </View>
                    )}
                    {!isVerified && isPending && (
                      <View style={s.statusChip}>
                        <Text style={s.statusChipPending}>대기 중</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* 코스를 골라 '등반 시작' → 상단 배너로 진행. 이미 진행 중인 코스면 '완등 인증'으로 전환. */}
              <TouchableOpacity
                style={[s.captureBtn, !selectedCourse && s.captureBtnDisabled]}
                disabled={!selectedCourse}
                onPress={() => {
                  if (!selectedCourse) return;
                  if (selectedIsActive) {
                    router.push({
                      pathname: '/capture',
                      params: { mountainId: selectedCourse.mountainId, courseId: selectedCourse.id },
                    });
                    return;
                  }
                  const begin = () => {
                    startHike({
                      courseId: selectedCourse.id,
                      mountainId: selectedCourse.mountainId,
                      courseName: selectedCourse.name,
                    });
                    sheetRef.current?.close();
                    // 등반 시작 = 명시적 위치 액션 → 이 시점 권한 요청(콜드 아님). 허용되면 watch 재가동.
                    Location.requestForegroundPermissionsAsync()
                      .then((p) => {
                        setLocGranted(p.granted);
                        // 시작(들머리) 고도 원샷 캡처 → 완등 시 정상 고도와의 델타로 평균 경사도.
                        // 포그라운드 워치 첫 fix(백업)보다 신뢰 — 폰을 주머니에 넣어 앱이 백그라운드여도 여기서 잡힘.
                        if (p.granted)
                          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
                            .then((loc) => {
                              if (loc.coords.altitude != null) setHikeStartAltitude(loc.coords.altitude);
                            })
                            .catch(() => {});
                      })
                      .catch(() => {});
                  };
                  // M3: startHike는 INSERT OR REPLACE(단일행) — 무확인이면 진행 중 세션(경과시간·시작고도) 소리 없이 소멸
                  if (activeHike) {
                    Alert.alert('진행 중인 등반이 있어요', '종료하고 새로 시작할까요?', [
                      { text: '취소', style: 'cancel' },
                      { text: '새로 시작', style: 'destructive', onPress: begin },
                    ]);
                  } else {
                    begin();
                  }
                }}
              >
                <Text style={s.captureBtnText}>
                  {!selectedCourse
                    ? '코스를 선택하세요'
                    : selectedIsActive
                    ? `${selectedCourse.name} 완등 인증하기`
                    : `${selectedCourse.name} 등반 시작`}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={s.meta}>불러오는 중…</Text>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { padding: SP.xl, gap: SP.xs },
  name: { fontSize: 24, fontWeight: '700', color: C.ink },
  meta: { color: C.faint, fontSize: 14, marginTop: SP.xs, marginBottom: SP.sm },
  // 코스 행: TouchableOpacity + 2px 투명 보더 프리셋(레이아웃 시프트 방지). 선택 시 brandSoft+brand 교체.
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.md,
    paddingVertical: SP.md,
    paddingHorizontal: SP.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: R.btn,
  },
  courseRowSelected: {
    backgroundColor: C.brandSoft,
    borderColor: C.brand,
  },
  courseInfo: { flex: 1, gap: 2 },
  courseName: { fontSize: 16, fontWeight: '600', color: C.ink },
  courseMeta: { color: C.faint, fontSize: 13, fontWeight: '500' },
  // 난이도 뱃지: 색약 안전 이중 인코딩(Okabe-Ito dot + 라벨). surfaceHigh로 다크 표면에서 선명하게.
  difficultyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    backgroundColor: C.surfaceHigh,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.xs,
    borderRadius: R.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  difficultyText: { fontSize: 12, fontWeight: '700', color: C.body },
  // 완등/대기 상태 칩
  statusChip: {
    backgroundColor: C.successSoft,
    borderRadius: R.pill,
    paddingHorizontal: SP.sm,
    paddingVertical: 2,
  },
  statusChipVerified: { color: C.success, fontSize: 12, fontWeight: '700' },
  statusChipPending: { color: C.dangerText, fontSize: 12, fontWeight: '600' },
  // 05 §5: 장갑 대응 인증 CTA 64dp
  captureBtn: {
    backgroundColor: C.brand,
    borderRadius: R.btn,
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SP.lg,
  },
  captureBtnText: { color: C.onBrand, fontSize: 17, fontWeight: '700' },
  captureBtnDisabled: { opacity: 0.4 },
  // 등반 중 상단 배너 — success 좌보더 강조 + granite glass. 검색 pill 자리를 대체.
  hikeBarWrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: SP.lg },
  hikeCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: SP.xs,
    backgroundColor: C.glass,
    borderRadius: R.card,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.md,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    borderLeftColor: C.success,
  },
  hikeRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  // 진행률 라인 — 트랙(dim) 위 채움(success), 우측에 % 텍스트
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.success },
  progressFillDone: { backgroundColor: C.ink },
  progressPct: { fontSize: 11, fontWeight: '700', color: C.success, fontFamily: MONO, minWidth: 34, textAlign: 'right' },
  progressPctDone: { color: C.ink },
  hikeName: { fontSize: 15, fontWeight: '700', color: C.ink },
  hikeMeta: { fontSize: 12, color: C.success, fontWeight: '600', marginTop: 2, fontFamily: MONO },
  hikeMetaArrived: { fontWeight: '700' },
  hikeCertify: { backgroundColor: C.success, borderRadius: R.btn, paddingHorizontal: SP.md, paddingVertical: SP.sm },
  // 정상 도착 시 인증 버튼에 밝은 링 — "지금 누르세요" 신호
  hikeCertifyArrived: { borderWidth: 2, borderColor: C.ink },
  hikeCertifyText: { color: '#0C0E10', fontSize: 14, fontWeight: '700' },
  hikeEnd: { padding: SP.xs },
  hikeEndText: { fontSize: 15, color: C.faint },
  // P0-2: 상단 플로팅 검색 pill (safe-area top 기준)
  searchPillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  searchPill: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.pill,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.sm,
  },
  searchPillText: { color: C.faint, fontSize: 15 },
  // L5 에러 pill — searchPill과 동형, 텍스트만 danger 톤
  errorPill: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.pill,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
  },
  errorPillText: { color: C.dangerText, fontSize: 14, fontWeight: '500' },
  sheetErrorPill: { alignSelf: 'flex-start', marginTop: SP.sm }, // 시트 안에선 절대배치 wrap 없이 인라인
  // rank15: 빈 상태 추천 카드 — glass 80% granite + 1px 보더 + 그림자 제거(플랫 원칙)
  recWrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: SP.lg },
  recCard: {
    flexDirection: 'row',
    backgroundColor: C.glass,
    borderRadius: R.card,
    padding: SP.lg,
    gap: SP.sm,
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: C.border,
    borderRightColor: C.border,
    borderBottomColor: C.border,
    borderLeftColor: C.success,
  },
  recMain: { flex: 1, gap: SP.xs },
  recKicker: { fontSize: 13, color: C.success, fontWeight: '700' },
  recTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  recCta: { fontSize: 14, color: C.success, fontWeight: '600', marginTop: SP.xs },
  recClose: { padding: SP.xs },
  recCloseText: { fontSize: 16, color: C.faint },
  // '내 위치로' FAB — glass 원형, 지도 내비 화살표와 동일 아이콘. 탭바 clearance 위 우하단(추천 카드와 배타: showRec는 !activeHike).
  locFab: {
    position: 'absolute',
    right: SP.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locFabIcon: { width: 24, height: 24, resizeMode: 'contain' },
});
