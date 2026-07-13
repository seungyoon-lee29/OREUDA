import { Link, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logout } from '@/lib/api';
import { PeakMark } from '@/components/PeakMark';
import { useVerifiedSet } from '@/lib/colored';
import { isGuest, setGuest } from '@/lib/prefs';
import { useSession } from '@/lib/stores';
import {
  ALL_CLEAR_BADGE, hasAllClear, nextTier, tierFor, SUMMIT_GOAL,
} from '@/lib/tiers';
import { C, MONO, R, SP } from '@/lib/theme';

// 프로필 — 등급/완등 현황/배지. 정체성 헤드라인은 닉네임이 아니라 '등급 이름'(백엔드 /me 호출 없음).
export default function Profile() {
  const router = useRouter();
  const setAuthed = useSession((s) => s.setAuthed);
  const done = useVerifiedSet().size; // 완등 코스 수 SSOT
  const guest = isGuest();

  const tier = tierFor(done);
  const next = nextTier(done);
  const allClear = hasAllClear(done);
  const badges = [ALL_CLEAR_BADGE]; // ponytail: 배지 1개 — 배열로 감싸 미래 확장 대비

  const signOut = async () => {
    await logout();
    setGuest(false);
    setAuthed(false); // 게이트가 /login으로
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.content}>
        {/* ── 헤더 카드: 등급 엠블럼 + 등급명 + 계정 타입 칩 */}
        <View style={s.card}>
          <View style={s.emblemWrap}>
            {tier.ring && <View style={s.ring} />}
            <PeakMark size={64} color={tier.color} />
          </View>
          <Text style={s.tierName}>{tier.name}</Text>
          <View style={s.accountChip}>
            <Text style={s.accountChipText}>{guest ? '게스트' : '계정'}</Text>
          </View>
        </View>

        {/* ── 완등 현황 */}
        <View style={s.card}>
          <View style={s.statRow}>
            <Text style={s.statNum}>{done}</Text>
            <Text style={s.statTotal}> / {SUMMIT_GOAL}</Text>
          </View>
          <Text style={s.statLabel}>완등한 코스</Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.min(100, (done / SUMMIT_GOAL) * 100)}%` }]} />
          </View>
          {/* 다음 등급 */}
          <Text style={s.nextText}>
            {next ? `다음 등급 「${next.name}」까지 ${next.min - done}코스` : '최고 등급 달성'}
          </Text>
        </View>

        {/* ── 배지 */}
        <Text style={s.sectionTitle}>배지</Text>
        <View style={s.badgeRow}>
          {badges.map((b) => (
            <View key={b.name} style={s.badgeCard}>
              <PeakMark size={36} color={allClear ? b.color : C.border} />
              <Text style={[s.badgeLabel, allClear && s.badgeLabelOn]}>{b.name}</Text>
              {allClear ? (
                <View style={s.badgeChip}>
                  <Text style={s.badgeChipText}>정복</Text>
                </View>
              ) : (
                <Text style={s.badgeProgress}>{done}/{b.need}</Text>
              )}
            </View>
          ))}
        </View>

        {/* ── 게스트 넛지 */}
        {guest && (
          <View style={s.nudge}>
            <Text style={s.nudgeText}>게스트로 이용 중 — 계정을 만들면 기록이 안전해요</Text>
            {/* ponytail: v0엔 계정 전환 플로우 없음 — 가입 화면으로 넛지만 */}
            <Link href="/signup" style={s.nudgeLink}>계정 만들기</Link>
          </View>
        )}

        {/* ── 로그아웃 */}
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
        >
          <Text style={s.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  content: { padding: SP.page, gap: SP.md },

  // 공통 카드 — 플랫 1px 보더
  card: {
    alignItems: 'center',
    padding: SP.xl,
    backgroundColor: C.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: SP.sm,
  },

  // 등급 엠블럼
  emblemWrap: { alignItems: 'center', justifyContent: 'center', height: 72, marginBottom: SP.xs },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.success,
    opacity: 0.5,
  },
  tierName: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  accountChip: {
    backgroundColor: C.surfaceHigh,
    paddingHorizontal: SP.md,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  accountChipText: { fontSize: 12, fontWeight: '600', color: C.faint },

  // 완등 현황
  statRow: { flexDirection: 'row', alignItems: 'baseline' },
  statNum: { fontSize: 48, fontWeight: '800', color: C.success, fontFamily: MONO, fontVariant: ['tabular-nums'] },
  statTotal: { fontSize: 28, fontWeight: '700', color: C.ink, fontFamily: MONO, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, fontWeight: '600', color: C.faint, letterSpacing: 1 },
  track: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: R.pill,
    backgroundColor: C.surfaceHigh,
    marginTop: SP.sm,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: R.pill, backgroundColor: C.success },
  nextText: { fontSize: 13, color: C.faint, marginTop: SP.xs },

  // 배지
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginTop: SP.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md },
  badgeCard: {
    width: 110,
    alignItems: 'center',
    padding: SP.lg,
    backgroundColor: C.surface,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: SP.sm,
  },
  badgeLabel: { fontSize: 13, fontWeight: '600', color: C.faint },
  badgeLabelOn: { color: C.ink },
  badgeProgress: { fontSize: 12, color: C.faint, fontFamily: MONO },
  badgeChip: {
    backgroundColor: C.successSoft,
    paddingHorizontal: SP.sm,
    paddingVertical: 2,
    borderRadius: R.pill,
  },
  badgeChipText: { fontSize: 11, fontWeight: '700', color: C.success },

  // 게스트 넛지
  nudge: {
    padding: SP.lg,
    backgroundColor: C.surfaceDeep,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: SP.sm,
  },
  nudgeText: { fontSize: 13, color: C.body, lineHeight: 20 },
  nudgeLink: { fontSize: 14, fontWeight: '600', color: C.success },

  // 로그아웃 — ghost/danger 텍스트
  logoutBtn: { alignItems: 'center', paddingVertical: SP.lg, marginTop: SP.sm },
  logoutText: { fontSize: 15, fontWeight: '600', color: C.dangerText },
});
