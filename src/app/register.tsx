import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button, Chips, ErrorNote, Field, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { space, useColors } from '@/lib/theme';

type Mode = 'new' | 'invite';

export default function Register() {
  const c = useColors();
  const { signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('new');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ready = name.trim() && email.trim() && password.length >= 8 && (mode === 'new' || inviteCode.trim());

  const submit = async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      await signUp({
        name,
        email,
        password,
        ...(mode === 'invite' ? { inviteCode } : householdName.trim() ? { householdName } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar a conta');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.md }}>
            <Logo />
            <Txt size={30} weight={800}>
              Criar conta
            </Txt>
          </View>
          <View style={{ gap: space.lg }}>
            <Chips
              label="Como você quer começar?"
              options={[
                { value: 'new', label: 'Nova casa' },
                { value: 'invite', label: 'Tenho um convite' },
              ]}
              value={mode}
              onChange={(value) => setMode(value ?? 'new')}
            />
            <Field label="Seu nome" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
            />
            <Field
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              hint="Pelo menos 8 caracteres"
            />
            {mode === 'new' ? (
              <Field
                label="Nome da casa (opcional)"
                value={householdName}
                onChangeText={setHouseholdName}
                placeholder="Ex.: Família Silva"
              />
            ) : (
              <Field
                label="Código do convite"
                value={inviteCode}
                onChangeText={(text) => setInviteCode(text.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Ex.: K7M2QX9A"
                hint="Peça para quem já usa o app gerar em Ajustes → Convidar pessoa"
              />
            )}
            <ErrorNote>{error}</ErrorNote>
            <Button title={loading ? 'Criando…' : 'Criar conta'} onPress={submit} loading={loading} disabled={!ready} full />
            <Link href="/login" style={{ textAlign: 'center' }}>
              <Txt size={15} weight={600} color={c.primary}>
                Já tenho conta
              </Txt>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.xxl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});
