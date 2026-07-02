import { useState } from 'react';
import { Link } from 'expo-router';
import {
  KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity,
} from 'react-native';
import { login } from '@/lib/api';
import { useSession } from '@/lib/stores';

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
      setAuthed(true); // 게이트가 /로 보낸다
    } catch (e: any) {
      setError(e?.code === 'AUTH_INVALID_CREDENTIALS' ? '이메일 또는 비밀번호가 달라요' : '로그인에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.title}>등산 앱</Text>
      <TextInput style={s.input} placeholder="이메일" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="비밀번호" secureTextEntry value={password} onChangeText={setPassword} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : '로그인'}</Text>
      </TouchableOpacity>
      <Link href="/signup" style={s.link}>계정이 없어요 → 가입하기</Link>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 },
  btn: { backgroundColor: '#208AEF', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#d32f2f' },
  link: { textAlign: 'center', color: '#208AEF', marginTop: 8 },
});
