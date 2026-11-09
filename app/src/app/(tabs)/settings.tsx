import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { SegmentedControl } from '@/components/SegmentedControl';
import { ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useMe, useUpdateSettings } from '@/hooks/queries';
import { errorMessage } from '@/lib/api';
import { config } from '@/lib/config';
import { deviceTimeZone, weight } from '@/lib/format';
import type { Unit } from '@/lib/types';
import { space } from '@/theme';

export default function SettingsScreen() {
  const me = useMe();
  const update = useUpdateSettings();
  const { signOut } = useAuth();
  const device = deviceTimeZone();

  return (
    <Screen title="Settings">
      {me.isPending ? (
        <Skeleton rows={4} label="Loading settings" />
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <View>
          <Section title="Units" first>
            <Text tone="secondary">Weights without a unit are read in this unit, and shown in it.</Text>
            <SegmentedControl<Unit>
              label="Weight unit"
              options={[
                { value: 'lb', label: 'lb' },
                { value: 'kg', label: 'kg' },
              ]}
              value={me.data.settings.set_unit}
              onChange={(u) => update.mutate({ set_unit: u })}
              disabled={update.isPending}
            />
            <Text tone="secondary">
              An empty bar counts as {weight(me.data.settings.bar_lb, me.data.settings.set_unit)}.
            </Text>
          </Section>

          <Section title="Time zone">
            <Text>
              Days start at midnight in <Text weight="semibold">{me.data.settings.tz_name}</Text>.
            </Text>
            {device !== me.data.settings.tz_name ? (
              <View style={styles.left}>
                <Button
                  label={`Use ${device}`}
                  variant="secondary"
                  onPress={() => update.mutate({ tz_name: device })}
                  loading={update.isPending}
                />
              </View>
            ) : null}
            {update.isError ? <Text tone="danger">{errorMessage(update.error)}</Text> : null}
          </Section>

          <Section title="Account">
            <Text>
              {me.data.is_demo
                ? 'You’re using the demo account. Its data is made up and gets reset.'
                : `Signed in as ${me.data.email ?? me.data.display_name ?? 'you'}.`}
            </Text>
            <View style={styles.left}>
              <Button label="Sign out" variant="secondary" onPress={signOut} />
            </View>
          </Section>

          <Section title="About">
            <Text variant="label" tone="secondary" mono>
              Jarvis {Constants.expoConfig?.version ?? ''} · {config.apiUrl}
            </Text>
          </Section>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  left: { alignSelf: 'flex-start', marginTop: space.xs },
});
