import { useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMeClimbs, useMountains } from '@/lib/colored';
import { type MountainsListItem } from '@/lib/schemas';
import { C, MONO, R, SP } from '@/lib/theme';

// 순수 함수로 분리 — node --test 대상 (search.test.js 참조)
export function filterMountains(mountains: MountainsListItem[], q: string): MountainsListItem[] {
  if (!q) return mountains;
  const lq = q.toLowerCase();
  return mountains.filter(
    (m) => m.name.toLowerCase().includes(lq) || m.region?.toLowerCase().includes(lq),
  );
}

export function groupByRegion(
  mountains: MountainsListItem[],
): { title: string; data: MountainsListItem[] }[] {
  const map = new Map<string, MountainsListItem[]>();
  for (const m of mountains) {
    const key = m.region ?? '기타';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  // ponytail: Map insertion order = 첫 등장 region 순. 정렬 필요 시 [...map.keys()].sort()
  return [...map.entries()].map(([title, data]) => ({ title, data }));
}

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');

  // 인라인 useQuery → 공용 훅으로 이동(colored.ts) — profile 완등 세트·capture 배너와 캐시 공유
  const { data: mountains = [], isError, refetch } = useMountains();

  const { data: meClimbs } = useMeClimbs();
  // 완등 산 ID 집합 — courseId 기준인 useVerifiedSet과 달리 mountainId 기준
  const conquered = new Set(
    (meClimbs?.climbs ?? [])
      .filter((c) => c.status === 'verified' && c.mountain?.id)
      .map((c) => c.mountain!.id),
  );

  const filtered = filterMountains(mountains, q);
  // 빈 쿼리 = region 그룹 / 검색 중 = 단일 플랫 섹션
  const sections = q ? [{ title: '', data: filtered }] : groupByRegion(mountains);

  return (
    <SafeAreaView style={s.wrap}>
      {/* 헤더: 검색 인풋 + 닫기 */}
      <View style={s.header}>
        <TextInput
          style={s.input}
          value={q}
          onChangeText={setQ}
          placeholder="산 이름 검색"
          placeholderTextColor={C.faint}
          autoFocus
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <Text style={s.closeText}>닫기</Text>
        </TouchableOpacity>
      </View>

      {/* ponytail: SectionList = FlatList에 섹션 헤더 추가한 네이티브 컴포넌트 — 별도 FlatList 구현 대체 */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        renderSectionHeader={({ section: { title } }) =>
          title ? <Text style={s.sectionHeader}>{title}</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            // dismissTo = 이 검색 모달을 닫으며 지도(/)로 복귀. navigate는 모달을 안 닫고
            // 밑 탭으로만 이동해 화면이 중복 스택으로 쌓였다(실기기 QA 2026-07-22).
            onPress={() =>
              router.dismissTo({ pathname: '/', params: { focusMountainId: item.id } })
            }
          >
            <View style={s.rowMain}>
              <Text style={s.rowName}>{item.name}</Text>
              <Text style={s.rowMeta}>
                {[
                  item.region,
                  item.elevationM != null ? `${item.elevationM}m` : null,
                  `코스 ${item.courseCount}개`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {conquered.has(item.id) && (
              <View style={s.conqueredChip}>
                <Text style={s.conqueredChipText}>완등 ✓</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          // L5: 조회 실패를 '검색 결과 없음'으로 오도하지 않기 — 에러+재시도 (records 패턴)
          isError ? (
            <TouchableOpacity style={s.errorBox} onPress={() => refetch()} accessibilityRole="button">
              <Text style={s.errorText}>산 목록을 불러오지 못했어요. 눌러서 다시 시도</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.empty}>검색 결과가 없어요</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.page,
    paddingVertical: SP.sm,
    gap: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: SP.md,
    backgroundColor: C.surfaceHigh,
    borderRadius: R.btn,
    fontSize: 16,
    color: C.ink,
  },
  closeBtn: { padding: SP.xs },
  closeText: { fontSize: 15, color: C.faint },
  listContent: { paddingHorizontal: SP.page, paddingBottom: SP.xl },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: C.faint,
    letterSpacing: 0.5,
    paddingTop: SP.lg,
    paddingBottom: SP.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: C.ink },
  rowMeta: { fontSize: 13, color: C.faint, marginTop: 2, fontFamily: MONO },
  conqueredChip: {
    backgroundColor: C.successSoft,
    paddingHorizontal: SP.sm,
    paddingVertical: 2,
    borderRadius: R.pill,
  },
  conqueredChipText: { fontSize: 11, fontWeight: '700', color: C.success },
  empty: { textAlign: 'center', color: C.faint, marginTop: 40 },
  errorBox: { marginTop: 40, alignItems: 'center', padding: SP.lg },
  errorText: { fontWeight: '500', color: C.dangerText, textAlign: 'center' },
});
