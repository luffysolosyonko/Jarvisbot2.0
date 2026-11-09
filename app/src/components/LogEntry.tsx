import { StyleSheet, View } from 'react-native';

import { weight } from '@/lib/format';
import type { Log, Unit } from '@/lib/types';
import { layout, space, useTheme } from '@/theme';

import { SetTable } from './SetTable';
import { Text } from './Text';

/** One saved log: time, the raw text as typed, and what it parsed to. */
export function LogEntry({ log, unit }: { log: Log; unit: Unit }) {
  const { colors } = useTheme();
  const time = new Date(log.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={[styles.entry, { borderBottomColor: colors.border }]}>
      <Text variant="caption" tone="secondary">
        {time}
      </Text>
      <Text variant="label" mono>
        {log.raw_text}
      </Text>
      {log.weigh_in ? (
        <Text variant="label" mono tabular tone="secondary">
          → {weight(log.weigh_in.weight_lb, unit)}
          {log.weigh_in.note ? ` · ${log.weigh_in.note}` : ''}
        </Text>
      ) : (
        <SetTable sets={log.sets} unit={unit} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: layout.hairline },
});
