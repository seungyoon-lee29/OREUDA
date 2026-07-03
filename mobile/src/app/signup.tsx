import { useState } from 'react';
import { Link } from 'expo-router';
import {
  KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity,
} from 'react-native';
import { signup } from '@/lib/api';
import { useSession } from '@/lib/stores';

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
      <TextInput style={s.input} placeholder="이메일" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="비밀번호 (8자 이상)" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={s.input} placeholder="닉네임" value={nickname} onChangeText={setNickname} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : '가입하고 시작하기'}</Text>
      </TouchableOpacity>
      <Link href="/login" style={s.link}>이미 계정이 있어요 → 로그인</Link>
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
