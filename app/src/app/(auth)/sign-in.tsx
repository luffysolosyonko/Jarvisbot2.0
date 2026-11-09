import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { layout, space, useTheme } from '@/theme';

type Busy = 'email' | 'google' | 'demo' | null;

export default function SignInScreen() {
  const { signIn, signUp, signInWithGoogle, signInDemo } = useAuth();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const signingUp = mode === 'sign-up';

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (signingUp && password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }
    run('email', () => (signingUp ? signUp(email, password) : signIn(email, password)));
  }

  return (
    <Screen title={signingUp ? 'Create your account' : 'Sign in to Jarvis'} subtitle="Log sets in gym shorthand. See where your lifts are heading.">
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          textContentType={signingUp ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
          hint={signingUp ? 'At least 6 characters.' : undefined}
        />
        {error ? (
          <Text tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button
          label={signingUp ? 'Create account' : 'Sign in'}
          onPress={submit}
          loading={busy === 'email'}
          disabled={busy !== null}
          fullWidth
        />
        {!signingUp ? (
          <View style={styles.left}>
            <Button label="Forgot password?" variant="text" onPress={() => router.push('/forgot-password')} />
          </View>
        ) : null}
      </View>

      <View style={[styles.alt, { borderTopColor: colors.border }]}>
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => run('google', signInWithGoogle)}
          loading={busy === 'google'}
          disabled={busy !== null}
          fullWidth
        />
        <Button
          label="Try the demo"
          variant="secondary"
          onPress={() => run('demo', signInDemo)}
          loading={busy === 'demo'}
          disabled={busy !== null}
          fullWidth
        />
        <Text variant="label" tone="secondary">
          The demo account has 12 weeks of made-up training data.
        </Text>
      </View>

      <View style={styles.switch}>
        <Text tone="secondary">{signingUp ? 'Already have an account?' : 'New to Jarvis?'}</Text>
        <Button
          label={signingUp ? 'Sign in' : 'Create an account'}
          variant="text"
          onPress={() => {
            setError(null);
            setMode(signingUp ? 'sign-in' : 'sign-up');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: layout.itemGap },
  left: { alignSelf: 'flex-start' },
  alt: { gap: space.sm, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: layout.hairline },
  switch: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, marginTop: space.lg },
});
