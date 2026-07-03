import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  NaverMapPolylineOverlay,
} from '@mj-studio/react-native-naver-map';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CoursesSchema, MountainSchema, type Course } from '@/lib/schemas';
import { FETCH_TILE_Z, lngLatToTile, tileToBboxWithMargin } from '@/lib/geo';
import { cacheCourses } from '@/lib/outbox';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, lineStyle, useMeClimbs, usePendingSet, useVerifiedSet } from '@/lib/colored';

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
  const lastCam = useRef({ lng: 126.98, lat: 37.55, zoom: 11.5 });
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

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
  //   가장 가까운 산+거리(05 §9)는 지도에서 GPS를 요청하지 않는 온보딩 원칙상 불가 → 시딩 폴백("이런 코스부터").
  const { data: me } = useMeClimbs();
  const [recDismissed, setRecDismissed] = useState(false);
  const recommended = useMemo(
    () => (courses ?? []).find((c) => c.difficulty === 'easy') ?? courses?.[0] ?? null,
    [courses],
  );
  const showRec = !!me && me.totalClimbs === 0 && !selectedMountainId && !recDismissed && !!recommended;

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
  // ponytail: courses는 타일당 소수라 매 렌더 계산 OK. 화면거리 기반 군집이 필요해지면 NaverMapView clusters prop으로 승급.
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

  return (
    <View style={{ flex: 1 }}>
      <NaverMapView
        style={{ flex: 1 }}
        initialCamera={{ latitude: 37.55, longitude: 126.98, zoom: 11.5 }}
        // rank16: 홈 지도 톤다운 — Basic + 불필요 레이어 off + lightness↓(오버레이 밝기는 그대로라 색칠 대비 상승).
        // ponytail: 상세 Terrain 톤은 v0에 상세 지도 화면이 없어(상세=바텀시트) 해당 없음.
        mapType="Basic"
        layerGroups={{ BUILDING: true, TRAFFIC: false, TRANSIT: false, BICYCLE: false, MOUNTAIN: false, CADASTRAL: false }}
        lightness={-0.15}
        onCameraChanged={({ latitude, longitude, zoom }) => {
          lastCam.current = { lat: latitude, lng: longitude, zoom: zoom ?? 11 };
        }}
        onCameraIdle={onCameraIdle}
      >
        {showLines &&
          courses?.map((c) => {
            const st = lineStyle(lineState(c), c.difficulty);
            return (
              <NaverMapPolylineOverlay
                key={c.id}
                coords={c.path.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
                width={st.width}
                color={st.color}
                pattern={st.pattern}
                onTap={() => openMountain(c.mountainId)}
              />
            );
          })}
        {/* rank10: 고줌=코스별 checkpoint 마커, 저줌=산 단위 집약 마커(정복=green+✓ / 미정복=gray, 색+아이콘+텍스트 이중 인코딩) */}
        {showLines &&
          courses?.map((c) => (
            <NaverMapMarkerOverlay
              key={`cp-${c.id}`}
              latitude={c.checkpointPoint.coordinates[1]}
              longitude={c.checkpointPoint.coordinates[0]}
              width={20}
              height={20}
              onTap={() => openMountain(c.mountainId)}
            />
          ))}
        {!showLines &&
          mountainMarkers.map((m) => (
            <NaverMapMarkerOverlay
              key={`mt-${m.mountainId}`}
              latitude={m.lat}
              longitude={m.lng}
              width={28}
              height={28}
              image={{ symbol: m.conquered ? 'green' : 'gray' }}
              caption={{ text: m.conquered ? '완등 ✓' : '미완등' }}
              // ponytail: react-hooks/refs 오탐 — openMountain의 sheetRef 접근은 탭 핸들러에서만 실행(렌더 아님).
              // 위 checkpoint 마커와 동일 패턴인데 여기 배열만 memo(컴파일러 가시)라 오탐. 코드는 안전.
              // eslint-disable-next-line react-hooks/refs
              onTap={() => openMountain(m.mountainId)}
            />
          ))}
      </NaverMapView>

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
              <Text style={s.recCta}>탭해서 코스 보기 →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.recClose} onPress={() => setRecDismissed(true)} hitSlop={10}>
              <Text style={s.recCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <BottomSheet ref={sheetRef} index={-1} snapPoints={['45%']} enablePanDownToClose>
        <BottomSheetScrollView contentContainerStyle={s.sheet}>
          {mountain ? (
            <>
              <Text style={s.name}>{mountain.name}</Text>
              <Text style={s.meta}>
                {mountain.region ?? ''} {mountain.elevationM ? `· ${mountain.elevationM}m` : ''}
              </Text>
              {mountain.courses.map((c) => (
                <View key={c.id} style={s.courseRow}>
                  <View style={s.difficultyBadge}>
                    <View style={[s.dot, { backgroundColor: DIFFICULTY_COLOR[c.difficulty ?? 'moderate'] }]} />
                    <Text style={s.difficultyText}>{DIFFICULTY_LABEL[c.difficulty ?? 'moderate']}</Text>
                  </View>
                  <Text style={s.courseName}>{c.name}</Text>
                  <Text style={s.courseMeta}>
                    {c.distanceM ? `${(c.distanceM / 1000).toFixed(1)}km` : ''}{' '}
                    {c.durationMin ? `${c.durationMin}분` : ''}
                  </Text>
                </View>
              ))}
              <TouchableOpacity
                style={s.captureBtn}
                onPress={() => router.push({ pathname: '/capture', params: { mountainId: mountain.id } })}
              >
                <Text style={s.captureBtnText}>정상에서 인증하기</Text>
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
  sheet: { padding: 20, gap: 8 },
  name: { fontSize: 24, fontWeight: '700' },
  meta: { color: '#666' },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  difficultyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  difficultyText: { fontSize: 12, fontWeight: '600', color: '#333' },
  courseName: { fontSize: 16, flex: 1 },
  courseMeta: { color: '#666', fontSize: 13, fontWeight: '500' },
  // 05 §5: 장갑 대응 인증 CTA 64dp
  captureBtn: { backgroundColor: '#208AEF', borderRadius: 12, minHeight: 64, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  captureBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  // rank15: 빈 상태 추천 카드 — 지도 하단 플로팅 1장
  recWrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16 },
  recCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  recMain: { flex: 1, gap: 4 },
  recKicker: { fontSize: 13, color: '#666', fontWeight: '600' },
  recTitle: { fontSize: 18, fontWeight: '700' },
  recCta: { fontSize: 14, color: '#208AEF', fontWeight: '600', marginTop: 2 },
  recClose: { padding: 4 },
  recCloseText: { fontSize: 16, color: '#999' },
});
