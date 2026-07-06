import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { api } from '@/lib/api';
import { CoursesSchema, MountainSchema, type Course } from '@/lib/schemas';
import { FETCH_TILE_Z, lngLatToTile, tileToBboxWithMargin } from '@/lib/geo';
import { cacheCourses } from '@/lib/outbox';
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  type Emphasis,
  lineStyle,
  mountainMarkerStyle,
  useMeClimbs,
  usePendingSet,
  useVerifiedSet,
} from '@/lib/colored';
import { C, R, SP } from '@/lib/theme';

// 줌 히스테리시스: 진입 z≥11.5 / 이탈 z<10.5 (04 §7)
const LINE_ZOOM_IN = 11.5;
const LINE_ZOOM_OUT = 10.5;
// NativeTabs(플로팅)는 높이 훅이 없어 상수로 클리어 — safe-area 인셋 위로 이만큼 띄운다(추천 카드 겹침 방지)
const TABBAR_CLEARANCE = 88;

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tile, setTile] = useState(() => lngLatToTile(FETCH_TILE_Z, 126.98, 37.55));
  const [showLines, setShowLines] = useState(true);
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
  const { data: courses } = useQuery({
    queryKey: ['courses-tile', FETCH_TILE_Z, tile.x, tile.y],
    queryFn: async () =>
      CoursesSchema.parse(
        await api(`/courses?bbox=${bbox.join(',')}&zoom=${Math.round(lastCam.current.zoom)}`),
      ),
    staleTime: Infinity,
  });

  const { data: mountain } = useQuery({
    queryKey: ['mountain', selectedMountainId],
    queryFn: async () => {
      const m = MountainSchema.parse(await api(`/mountains/${selectedMountainId}`));
      cacheCourses(m.id, m.courses); // 프리페치 계약 — 오프라인 위저드의 판정 소스 (04 §5)
      return m;
    },
    enabled: !!selectedMountainId,
  });

  const pending = usePendingSet();
  const verified = useVerifiedSet();

  // rank15 (05 §9): 빈 상태 = 도화지. 완등 0 신규 유저에게 시작 코스 추천 카드 1장.
  // ponytail: 타일 /courses엔 산 이름이 없어(mountainId만) 코스 단위 추천 — 탭하면 openMountain으로 산 시트 오픈.
  const { data: me } = useMeClimbs();
  const [recDismissed, setRecDismissed] = useState(false);
  const recommended = useMemo(
    () => (courses ?? []).find((c) => c.difficulty === 'easy') ?? courses?.[0] ?? null,
    [courses],
  );
  // P0-1: 코스 선택 시 추천 카드 숨김
  const showRec = !!me && me.totalClimbs === 0 && !selectedMountainId && !selectedCourseId && !recDismissed && !!recommended;

  // onCameraIdle에서만 + 200ms 디바운스 (04 §7 — onCameraChanged fetch 금지)
  const onCameraIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const { lng, lat, zoom } = lastCam.current;
      setTile(lngLatToTile(FETCH_TILE_Z, lng, lat));
      setShowLines((prev) => (zoom >= LINE_ZOOM_IN ? true : zoom < LINE_ZOOM_OUT ? false : prev));
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
        // ponytail: 시트 45% 덮음 → ne.lat에 span*0.6 가산해 코스를 화면 상반부에 위치
        mapRef.current.animateCameraWithTwoCoords({
          coord1: { latitude: minLat, longitude: Math.min(...lngs) },
          coord2: { latitude: maxLat + latSpan * 0.6, longitude: Math.max(...lngs) },
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

  // 줌아웃으로 lines 숨김 전환 시 코스 선택 해제 (P0-1 §엣지)
  useEffect(() => {
    if (!showLines) setSelectedCourseId(null);
  }, [showLines]);

  // 타일 이탈로 선택 코스가 courses에서 사라지면 선택 해제
  useEffect(() => {
    if (selectedCourseId && courses && !courses.some((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [courses, selectedCourseId]);

  // 현재 시트에 열려 있는 산의 선택된 코스 — CTA 라벨 계산용
  const selectedCourse = mountain?.courses.find((c) => c.id === selectedCourseId) ?? null;

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
        // P0-1: 빈 지도 탭 → 코스 선택 해제 + 시트 닫기
        onTapMap={() => {
          setSelectedCourseId(null);
          sheetRef.current?.close();
        }}
      >
        {showLines &&
          courses?.map((c) => {
            // P0-1: 선택된 코스 없으면 none, 선택 코스는 selected, 나머지는 dimmed
            const emphasis: Emphasis = !selectedCourseId
              ? 'none'
              : c.id === selectedCourseId
              ? 'selected'
              : 'dimmed';
            const st = lineStyle(lineState(c), c.difficulty, emphasis);
            return (
              <Fragment key={c.id}>
                {/* verified glow 언더레이 — §2: zIndex 본선(1)보다 낮게(0) */}
                {st.glow && (
                  <NaverMapPolylineOverlay
                    coords={c.path.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
                    width={st.glow.width}
                    color={st.glow.color}
                    zIndex={0}
                  />
                )}
                <NaverMapPolylineOverlay
                  coords={c.path.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
                  width={st.width}
                  color={st.color}
                  pattern={st.pattern}
                  zIndex={1}
                  onTap={() => selectCourse(c)}
                />
              </Fragment>
            );
          })}
        {/* rank10: 고줌=코스별 checkpoint 마커. P0-1: 코스 선택 시 비선택 마커 숨김(렌더 스킵) */}
        {showLines &&
          courses?.map((c) => {
            if (selectedCourseId && c.id !== selectedCourseId) return null;
            return (
              <NaverMapMarkerOverlay
                key={`cp-${c.id}`}
                latitude={c.checkpointPoint.coordinates[1]}
                longitude={c.checkpointPoint.coordinates[0]}
                width={20}
                height={20}
                onTap={() => openMountain(c.mountainId)}
              />
            );
          })}
        {/* rank10: 저줌=산 단위 집약 마커(정복=green+✓ / 미정복=gray, 색+아이콘+텍스트 이중 인코딩) */}
        {!showLines &&
          mountainMarkers.map((m) => {
            const mk = mountainMarkerStyle(m.conquered);
            return (
              <NaverMapMarkerOverlay
                key={`mt-${m.mountainId}`}
                latitude={m.lat}
                longitude={m.lng}
                width={28}
                height={28}
                image={{ symbol: mk.symbol }}
                caption={mk.caption}
                // ponytail: react-hooks/refs 오탐 — openMountain의 sheetRef 접근은 탭 핸들러에서만 실행(렌더 아님).
                // eslint-disable-next-line react-hooks/refs
                onTap={() => openMountain(m.mountainId)}
              />
            );
          })}
      </NaverMapView>

      {/* P0-2 연결: 상단 플로팅 검색 pill — 탭 시 /search(FE-B 생성 예정) */}
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
            <TouchableOpacity style={s.recClose} onPress={() => setRecDismissed(true)} hitSlop={10}>
              <Text style={s.recCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['45%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: C.surface }}
        handleIndicatorStyle={{ backgroundColor: C.border }}
        // P0-1: 시트 pan-down close 시 코스 선택만 해제 (selectedMountainId는 유지 — 재오픈 캐시 보존)
        onClose={() => setSelectedCourseId(null)}
      >
        <BottomSheetScrollView contentContainerStyle={[s.sheet, { paddingBottom: insets.bottom + TABBAR_CLEARANCE }]}>
          {mountain ? (
            <>
              <Text style={s.name}>{mountain.name}</Text>
              <Text style={s.meta}>
                {mountain.region ?? ''} {mountain.elevationM ? `· ${mountain.elevationM}m` : ''}
              </Text>
              {mountain.courses.map((c) => {
                const isSelected = c.id === selectedCourseId;
                const isVerified = verified.has(c.id);
                const isPending = pending.has(c.id);
                return (
                  // P0-1: 코스 행 탭 → 선택/토글. 선택 시 지도 하이라이트+카메라 fit.
                  <TouchableOpacity
                    key={c.id}
                    style={[s.courseRow, isSelected && s.courseRowSelected]}
                    activeOpacity={0.75}
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
              {/* P0-1: 코스 선택 시 CTA 라벨 변경 + courseId 전달 */}
              <TouchableOpacity
                style={s.captureBtn}
                onPress={() =>
                  router.push({
                    pathname: '/capture',
                    params: {
                      mountainId: mountain.id,
                      ...(selectedCourseId ? { courseId: selectedCourseId } : {}),
                    },
                  })
                }
              >
                <Text style={s.captureBtnText}>
                  {selectedCourse ? `${selectedCourse.name}에서 인증하기` : '정상에서 인증하기'}
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
});
