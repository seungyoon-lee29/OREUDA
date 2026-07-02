import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logout } from '@/lib/api';
import { useMeClimbs } from '@/lib/colored';
import { deleteDraft, flush, listDrafts, subscribeOutbox, type Draft } from '@/lib/outbox';
import { useSession } from '@/lib/stores';

function useDrafts(): Draft[] {
  const [rows, setRows] = useState<Draft[]>(() => listDrafts(['queued', 'uploading', 'failed_permanent']));
  useEffect(
    () => subscribeOutbox(() => setRows(listDrafts(['queued', 'uploading', 'failed_permanent']))),
    [],
  );
  return rows;
}

export default function Records() {
  const drafts = useDrafts();
  const { data } = useMeClimbs();
  const setAuthed = useSession((s) => s.setAuthed);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={s.header}>
        <Text style={s.title}>기록</Text>
        <TouchableOpacity onPress={() => logout().then(() => setAuthed(false))}>
          <Text style={s.logout}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {data && (
        <View style={s.counters}>
          <Text style={s.counter}>정복한 산 {data.totalMountains}</Text>
          <Text style={s.counter}>완등 {data.totalClimbs}</Text>
        </View>
      )}

      {/* stale 초안: 자동 소멸 없음 — 탭=수동 flush, 삭제 버튼=수동 삭제 (04 §6) */}
      {drafts.length > 0 && (
        <View style={s.pendingBox}>
          <Text style={s.pendingTitle}>전송 대기 {drafts.filter((d) => d.state !== 'failed_permanent').length}건</Text>
          {drafts.map((d) => (
            <TouchableOpacity key={d.local_uuid} style={s.pendingRow} onPress={() => flush()}>
              <Text style={s.pendingText}>
                {d.state === 'failed_permanent' ? '⚠️ 제출 실패' : '🕐 대기 중'} ·{' '}
                {new Date(d.captured_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {d.last_attempt_at ? ` (마지막 시도 ${new Date(d.last_attempt_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})` : ''}
              </Text>
              <TouchableOpacity onPress={() => deleteDraft(d.local_uuid)}>
                <Text style={s.deleteBtn}>삭제</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={data?.climbs ?? []}
        keyExtractor={(c) => c.climbId}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Text style={s.rowTitle}>
              {item.mountain?.name ?? '(산 미지정)'} · {item.course?.name ?? '코스 미선택'}
            </Text>
            <Text style={s.rowMeta}>
              {item.climbedOn} · {item.status === 'verified' ? '인증됨' : '이미 인증된 코스'}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.empty}>아직 기록이 없어요. 첫 산을 정복해보세요!</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  logout: { color: '#888' },
  counters: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 8 },
  counter: { fontSize: 15, fontWeight: '600', color: '#208AEF' },
  pendingBox: { margin: 16, padding: 12, backgroundColor: '#FFF8E1', borderRadius: 12, gap: 8 },
  pendingTitle: { fontWeight: '600' },
  pendingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingText: { fontSize: 13, color: '#555', flex: 1 },
  deleteBtn: { color: '#d32f2f', fontSize: 13, paddingLeft: 8 },
  row: { padding: 14, backgroundColor: '#F5F5F5', borderRadius: 12 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#777', marginTop: 2, fontSize: 13 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
