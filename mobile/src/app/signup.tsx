import { useState } from 'react';
import { Link } from 'expo-router';
import {
  KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity,
} from 'react-native';
import { signup } from '@/lib/api';
import { reconcileLocalDataForAccount } from '@/lib/outbox';
import { useSession } from '@/lib/stores';
import { C, R, CTA_H } from '@/lib/theme';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setAuthed = useSession((s) => s.setAuthed);

  const submit = async () => {
    if (password.length < 8) return setError('비밀번호는 8자 이상이어야 해요');
    setBusy(true);
    setError('');
    try {
      await signup(email.trim(), password, nickname.trim() || '등산러');
      reconcileLocalDataForAccount(email); // 다른 계정이면 purge, 같은 계정이면 draft 보존(login.tsx와 동일)
      setAuthed(true);
    } catch (e: any) {
      setError(e?.code === 'AUTH_EMAIL_TAKEN' ? '이미 가입된 이메일이에요' : '가입에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.title}>가입하기</Text>
      <TextInput style={s.input} placeholder="이메일" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="비밀번호 (8자 이상)" placeholderTextColor={C.faint} secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={s.input} placeholder="닉네임" placeholderTextColor={C.faint} value={nickname} onChangeText={setNickname} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : '가입하고 시작하기'}</Text>
      </TouchableOpacity>
      <Link href="/login" style={s.link}>이미 계정이 있어요 → 로그인</Link>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: C.bg },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 16, color: C.ink },
  // 다크 인풋: surfaceHigh 배경 + border 윤곽 + ink 텍스트 (design §4 login/signup)
  input: { borderWidth: 1, borderColor: C.border, borderRadius: R.btn, padding: 14, fontSize: 16, backgroundColor: C.surfaceHigh, color: C.ink },
  btn: { backgroundColor: C.brand, borderRadius: R.btn, minHeight: CTA_H, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: C.onBrand, fontSize: 16, fontWeight: '600' },
  error: { color: C.dangerText },
  link: { textAlign: 'center', color: C.success, marginTop: 8 },
});
