import { useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useMeClimbs } from '@/lib/colored';
import { MountainsListSchema, type MountainsListItem } from '@/lib/schemas';
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

  const { data: mountains = [] } = useQuery({
    queryKey: ['mountains'],
    queryFn: async () => MountainsListSchema.parse(await api('/mountains')),
    staleTime: Infinity,
  });

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
            onPress={() =>
              router.navigate({ pathname: '/', params: { focusMountainId: item.id } })
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
        ListEmptyComponent={<Text style={s.empty}>검색 결과가 없어요</Text>}
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
});
