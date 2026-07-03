import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  NaverMapPolylineOverlay,
} from '@mj-studio/react-native-naver-map';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CoursesSchema, MountainSchema, type Course } from '@/lib/schemas';
import { FETCH_TILE_Z, lngLatToTile, tileToBboxWithMargin } from '@/lib/geo';
import { cacheCourses } from '@/lib/outbox';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, UNCLIMBED_COLOR, usePendingSet, useVerifiedSet } from '@/lib/colored';

// 줌 히스테리시스: 진입 z≥11.5 / 이탈 z<10.5 (04 §7)
const LINE_ZOOM_IN = 11.5;
const LINE_ZOOM_OUT = 10.5;

export default function MapScreen() {
  const router = useRouter();
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

  // onCameraIdle에서만 + 200ms 디바운스 (04 §7 — onCameraChanged fetch 금지)
  const onCameraIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const { lng, lat, zoom } = lastCam.current;
      setTile(lngLatToTile(FETCH_TILE_Z, lng, lat));
      setShowLines((prev) => (zoom >= LINE_ZOOM_IN ? true : zoom < LINE_ZOOM_OUT ? false : prev));
    }, 200);
  }, []);

  const lineColor = (c: Course) =>
    verified.has(c.id) || pending.has(c.id)
      ? DIFFICULTY_COLOR[c.difficulty ?? 'moderate']
      : UNCLIMBED_COLOR;

  const openMountain = (mountainId: string) => {
    setSelectedMountainId(mountainId);
    sheetRef.current?.snapToIndex(0);
  };

  return (
    <View style={{ flex: 1 }}>
      <NaverMapView
        style={{ flex: 1 }}
        initialCamera={{ latitude: 37.55, longitude: 126.98, zoom: 11.5 }}
        onCameraChanged={({ latitude, longitude, zoom }) => {
          lastCam.current = { lat: latitude, lng: longitude, zoom: zoom ?? 11 };
        }}
        onCameraIdle={onCameraIdle}
      >
        {showLines &&
          courses?.map((c) => (
            <NaverMapPolylineOverlay
              key={c.id}
              coords={c.path.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
              width={4}
              color={lineColor(c)}
              onTap={() => openMountain(c.mountainId)}
            />
          ))}
        {courses?.map((c) => (
          <NaverMapMarkerOverlay
            key={`cp-${c.id}`}
            latitude={c.checkpointPoint.coordinates[1]}
            longitude={c.checkpointPoint.coordinates[0]}
            width={20}
            height={20}
            onTap={() => openMountain(c.mountainId)}
          />
        ))}
      </NaverMapView>

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
});
