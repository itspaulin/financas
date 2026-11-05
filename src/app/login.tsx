import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button, ErrorNote, inputStyle, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { radius, space, useColors } from '@/lib/theme';

export default function Login() {
  const c = useColors();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao entrar');
      setLoading(false);
    }
  };

  const bad = Boolean(error);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.wrap}>
          <View style={{ gap: space.md }}>
            <Logo />
            <View>
              <Txt size={34} weight={800}>
                Finanças
              </Txt>
              <Txt size={16} color={c.text2}>
                Controle financeiro da sua casa
              </Txt>
            </View>
          </View>
          <View style={{ gap: space.lg }}>
            <View>
              <Txt size={13} weight={600} color={c.text2} style={{ marginBottom: 6 }}>
                E-mail
              </Txt>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color={c.text3} style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="username"
                  placeholder="voce@email.com"
                  placeholderTextColor={c.text3}
                  style={[inputStyle(c), { paddingLeft: 42 }, bad && { borderColor: c.err }]}
                />
              </View>
            </View>
            <View>
              <Txt size={13} weight={600} color={c.text2} style={{ marginBottom: 6 }}>
                Senha
              </Txt>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={c.text3} style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!visible}
                  autoComplete="current-password"
                  textContentType="password"
                  onSubmitEditing={submit}
                  style={[inputStyle(c), { paddingLeft: 42, paddingRight: 48 }, bad && { borderColor: c.err }]}
                />
                <Pressable
                  accessibilityLabel={visible ? 'Esconder senha' : 'Mostrar senha'}
                  onPress={() => setVisible((v) => !v)}
                  style={styles.eye}
                  hitSlop={8}>
                  <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.text3} />
                </Pressable>
              </View>
            </View>
            <ErrorNote>{error ? `${error}. Confira e tente de novo.` : null}</ErrorNote>
            <Button title={loading ? 'Entrando…' : 'Entrar'} onPress={submit} loading={loading} disabled={!email || !password} full />
            <Link href="/register" style={{ textAlign: 'center' }}>
              <Txt size={15} weight={600} color={c.primary}>
                Não tenho conta
              </Txt>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.xxl, width: '100%', maxWidth: 420, alignSelf: 'center' },
  inputRow: { justifyContent: 'center' },
  inputIcon: { position: 'absolute', left: 14, zIndex: 1 },
  eye: { position: 'absolute', right: 14, borderRadius: radius.sm },
});
