import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { PeakMark } from '@/components/PeakMark';
import { api } from '@/lib/api';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, useMeClimbs, useVerifiedSet } from '@/lib/colored';
import { deleteDraft, flush, listDrafts, subscribeOutbox, type Draft } from '@/lib/outbox';
import { useSession } from '@/lib/stores';
import { tierFor } from '@/lib/tiers';
import { C, MONO, R, SP } from '@/lib/theme';

function useDrafts(): Draft[] {
  const [rows, setRows] = useState<Draft[]>(() => listDrafts(['queued', 'uploading', 'failed_permanent']));
  useEffect(
    () => subscribeOutbox(() => setRows(listDrafts(['queued', 'uploading', 'failed_permanent']))),
    [],
  );
  return rows;
}

export default function Records() {
  const router = useRouter();
  const drafts = useDrafts();
  const { data, isLoading, isError, refetch } = useMeClimbs();
  const signOut = useSession((s) => s.signOut);
  const qc = useQueryClient();
  // 완등 마크는 현재 등급 색으로 — 등급이 오르면 마크 색도 따라 오른다.
  const tierColor = tierFor(useVerifiedSet().size).color;

  // 완등 삭제 — 서버 DELETE /climbs/:id(soft delete) 재사용. 오인증(자동 제출 포함) 되돌리기 수단.
  const confirmDeleteClimb = (climbId: string) =>
    Alert.alert('완등 기록을 삭제할까요?', '지도 색칠과 완등 수에서 빠져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/climbs/${climbId}`, { method: 'DELETE' });
            qc.invalidateQueries({ queryKey: ['me-climbs'] });
          } catch {
            Alert.alert('삭제하지 못했어요', '잠시 후 다시 시도해주세요.'); // 404 등 비네트워크 원인 포함 — 문구 일반화(리뷰 LOW)
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.title}>기록</Text>
        <TouchableOpacity onPress={signOut} accessibilityRole="button" accessibilityLabel="로그아웃">
          <Text style={s.logout}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {/* 스탯 히어로 — 완등한 산이 주인공, MONO 그린 숫자 */}
      {data && (
        <View style={s.hero}>
          <View style={s.heroMain}>
            <Text style={s.heroNum}>{data.totalMountains}</Text>
            <Text style={s.heroMainLabel}>완등한 산</Text>
          </View>
          <View style={s.heroDivider} />
          <View style={s.heroSub}>
            <Text style={s.heroSubNum}>{data.totalClimbs}</Text>
            <Text style={s.heroSubLabel}>전체 완등</Text>
          </View>
        </View>
      )}

      {/* stale 초안: 자동 소멸 없음 — 탭=수동 flush, 삭제 버튼=수동 삭제 (04 §6) */}
      {drafts.length > 0 && (
        <View style={s.pendingBox}>
          <Text style={s.pendingTitle}>
            전송 대기 {drafts.filter((d) => d.state !== 'failed_permanent').length}건
          </Text>
          {/* 래퍼 accessible=false: AX 리프가 되면 중첩된 삭제 버튼이 VoiceOver에서 도달 불가(시뮬 AX 검증에서 발견) */}
          {drafts.map((d) => (
            <TouchableOpacity key={d.local_uuid} style={s.pendingRow} onPress={() => flush()} accessible={false}>
              <Text style={s.pendingText}>
                {d.state === 'failed_permanent' ? '⚠️ 제출 실패' : '🕐 대기 중'} ·{' '}
                {new Date(d.captured_at).toLocaleString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {d.last_attempt_at
                  ? ` (마지막 시도 ${new Date(d.last_attempt_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`
                  : ''}
              </Text>
              {/* M4: 초안은 미전송 완등의 유일본 — 원탭 오탭 유실 방지 확인 1단계 */}
              <TouchableOpacity
                onPress={() =>
                  Alert.alert('아직 전송 안 된 기록이에요. 삭제할까요?', undefined, [
                    { text: '취소', style: 'cancel' },
                    { text: '삭제', style: 'destructive', onPress: () => deleteDraft(d.local_uuid) },
                  ])
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="전송 대기 기록 삭제"
              >
                <Text style={s.deleteBtn}>삭제</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 완등 기록 리스트 */}
      <FlatList
        data={data?.climbs ?? []}
        keyExtractor={(c) => c.climbId}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          // P0-4: mountain.id 있는 카드만 탭 가능 — 지도로 점프
          // accessible=false: 중첩 삭제 버튼 VoiceOver 도달 보장(래퍼 플래튼 방지)
          <TouchableOpacity
            style={s.card}
            accessible={false}
            disabled={!item.mountain?.id}
            onPress={() => {
              if (!item.mountain?.id) return;
              router.navigate({
                pathname: '/',
                params: {
                  focusMountainId: item.mountain.id,
                  ...(item.courseId ? { focusCourseId: item.courseId } : {}),
                },
              });
            }}
          >
            {/* 완등 마크(등급 색) + 난이도 뱃지 + 인증 상태 칩 */}
            <View style={s.cardHeader}>
              {item.status === 'verified' && <PeakMark size={20} color={tierColor} />}
              {item.course?.difficulty && (
                <View style={s.difficultyBadge}>
                  <View style={[s.dot, { backgroundColor: DIFFICULTY_COLOR[item.course.difficulty] }]} />
                  <Text style={s.difficultyText}>{DIFFICULTY_LABEL[item.course.difficulty]}</Text>
                </View>
              )}
              {/* M7: 서버가 verified만 반환(/me/climbs)하므로 비-verified 분기는 죽은 코드였음 — 삭제 */}
              <View style={s.verifiedChip}>
                <Text style={s.verifiedChipText}>인증됨</Text>
              </View>
              <TouchableOpacity
                onPress={() => confirmDeleteClimb(item.climbId)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="완등 기록 삭제"
                style={s.cardDeleteBtn}
              >
                <Text style={s.deleteBtn}>삭제</Text>
              </TouchableOpacity>
            </View>
            {/* 코스명 타이틀 */}
            <Text style={s.cardTitle}>
              {item.course?.name
                ? `${item.mountain?.name ?? '산'} · ${item.course.name}`
                : '위치 인증 완료'}
            </Text>
            {/* 날짜 메타 (MONO) */}
            <Text style={s.cardMeta}>{item.climbedOn}</Text>
            {/* 지도 점프 힌트 — mountain.id 있는 카드만 */}
            {item.mountain?.id && <Text style={s.mapHint}>→ 지도에서 보기</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.ink} />
          ) : isError ? (
            <TouchableOpacity style={s.errorBox} onPress={() => refetch()}>
              <Text style={s.errorText}>기록을 불러오지 못했어요. 눌러서 다시 시도</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.empty}>아직 기록이 없어요. 첫 산을 완등해보세요!</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // ── 헤더
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SP.lg,
    paddingTop: SP.sm,
    paddingBottom: SP.md,
  },
  title: { fontSize: 24, fontWeight: '700', color: C.ink },
  logout: { fontSize: 15, fontWeight: '500', color: C.faint },

  // ── 스탯 히어로 — surfaceDeep + border + MONO 숫자
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SP.lg,
    marginBottom: SP.lg,
    paddingVertical: SP.xl,
    paddingHorizontal: SP.xl,
    backgroundColor: C.surfaceDeep,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroMain: { flex: 3, alignItems: 'center', gap: SP.xs },
  heroNum: {
    fontSize: 52,
    fontWeight: '800',
    color: C.success,
    lineHeight: 58,
    fontVariant: ['tabular-nums'],
    fontFamily: MONO,
  },
  heroMainLabel: { fontSize: 13, fontWeight: '600', color: C.faint, letterSpacing: 1 },
  heroDivider: {
    width: 1,
    height: 48,
    backgroundColor: C.border,
    marginHorizontal: SP.lg,
  },
  heroSub: { flex: 2, alignItems: 'center', gap: SP.xs },
  heroSubNum: {
    fontSize: 36,
    fontWeight: '700',
    color: C.ink,
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
    fontFamily: MONO,
  },
  heroSubLabel: { fontSize: 13, fontWeight: '500', color: C.faint, letterSpacing: 1 },

  // ── 전송 대기 박스 — 오렌지 틴트 다크
  pendingBox: {
    marginHorizontal: SP.lg,
    marginBottom: SP.md,
    padding: SP.md,
    backgroundColor: '#2A2016',
    borderRadius: R.card,
    gap: SP.sm,
  },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: C.dangerText },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingText: { fontSize: 13, color: C.dangerText, flex: 1, opacity: 0.85 },
  deleteBtn: { fontSize: 13, fontWeight: '600', color: C.danger, paddingLeft: SP.sm },

  // ── 완등 카드 — 플랫 보더, 탭 가능(P0-4)
  listContent: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.xs,
    paddingBottom: SP.xl,
    gap: SP.sm,
  },
  card: {
    padding: SP.lg,
    backgroundColor: C.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: SP.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    flexWrap: 'wrap',
  },
  difficultyBadge: { flexDirection: 'row', alignItems: 'center', gap: SP.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  difficultyText: { fontSize: 12, fontWeight: '600', color: C.body },
  verifiedChip: {
    backgroundColor: C.successSoft,
    paddingHorizontal: SP.sm,
    paddingVertical: 2,
    borderRadius: R.pill,
  },
  verifiedChipText: { fontSize: 11, fontWeight: '700', color: C.success },
  cardDeleteBtn: { marginLeft: 'auto' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  cardMeta: { fontSize: 13, fontWeight: '400', color: C.faint, fontFamily: MONO },
  mapHint: { fontSize: 12, color: C.faint, marginTop: SP.xs },

  // ── 빈/에러
  empty: { textAlign: 'center', fontSize: 15, color: C.faint, marginTop: 40 },
  errorBox: { marginTop: 40, alignItems: 'center', padding: SP.lg },
  errorText: { fontWeight: '500', color: C.dangerText, textAlign: 'center' },
});
