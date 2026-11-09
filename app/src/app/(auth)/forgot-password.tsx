import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { layout } from '@/theme';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!email.trim()) {
      setError('Enter the email you signed up with.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email);
      setSentTo(email.trim());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={send}
        />
        {error ? <Text tone="danger">{error}</Text> : null}
        {sentTo ? (
          <Text accessibilityLiveRegion="polite">
            If an account exists for {sentTo}, a reset link is on its way.
          </Text>
        ) : null}
        <Button label="Send reset link" onPress={send} loading={busy} fullWidth />
        <View style={styles.left}>
          <Button label="Back to sign in" variant="text" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: layout.itemGap },
  left: { alignSelf: 'flex-start' },
});
