import { useState } from 'react';
import { Link } from 'expo-router';
import {
  KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Logo } from '@/components/Logo';
import { login, signup } from '@/lib/api';
import { setGuest } from '@/lib/prefs';
import { useSession } from '@/lib/stores';
import { C, R, CTA_H } from '@/lib/theme';

// 폼 라이브러리 채택 안 함 — controlled input 2개로 충분 (04 §2 의도적 결정)
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setAuthed = useSession((s) => s.setAuthed);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      setGuest(false); // 실제 계정 로그인 — 게스트 플래그 해제(게스트→계정 전환)
      setAuthed(true); // 게이트가 /로 보낸다
    } catch (e: any) {
      setError(e?.code === 'AUTH_INVALID_CREDENTIALS' ? '이메일 또는 비밀번호가 달라요' : '로그인에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  // 게스트 시작 — 랜덤 계정 즉석 가입(백엔드 변경 없이 기존 signup 재사용).
  // Math.random은 앱 런타임 허용(워크플로 스크립트만 금지).
  const startGuest = async () => {
    setBusy(true);
    setError('');
    try {
      const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await signup(`guest_${rand}@oreuda.app`, `g${rand}A1`, '게스트');
      setGuest(true);
      setAuthed(true);
    } catch {
      setError('게스트 시작에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.logo}><Logo size={48} /></View>
      <TextInput style={s.input} placeholder="이메일" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="비밀번호" placeholderTextColor={C.faint} secureTextEntry value={password} onChangeText={setPassword} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : '로그인'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.ghostBtn} onPress={startGuest} disabled={busy}>
        <Text style={s.ghostBtnText}>게스트로 시작</Text>
      </TouchableOpacity>
      <Link href="/signup" style={s.link}>계정이 없어요 → 가입하기</Link>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: C.bg },
  logo: { alignItems: 'center', marginBottom: 16 },
  // 다크 인풋: surfaceHigh 배경 + border 윤곽 + ink 텍스트 (design §4 login/signup)
  input: { borderWidth: 1, borderColor: C.border, borderRadius: R.btn, padding: 14, fontSize: 16, backgroundColor: C.surfaceHigh, color: C.ink },
  btn: { backgroundColor: C.brand, borderRadius: R.btn, minHeight: CTA_H, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: C.onBrand, fontSize: 16, fontWeight: '600' },
  // 보조 CTA: 투명 배경 + border 윤곽(design §4 ghost)
  ghostBtn: { borderWidth: 1, borderColor: C.border, borderRadius: R.btn, minHeight: CTA_H, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { color: C.body, fontSize: 16, fontWeight: '600' },
  error: { color: C.dangerText },
  link: { textAlign: 'center', color: C.success, marginTop: 8 },
});
