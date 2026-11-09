import { StyleSheet, View } from 'react-native';

import { sizes, space } from '@/theme';

import { Text, type Tone } from './Text';

/** A label above a number. Numbers use the mono face with tabular figures. */
export function Stat({
  label,
  value,
  detail,
  detailTone = 'secondary',
}: {
  label: string;
  value: string;
  detail?: string;
  detailTone?: Tone;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant="title" weight="semibold" mono tabular>
        {value}
      </Text>
      {detail ? (
        <Text variant="label" tone={detailTone} tabular>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  stat: { flex: 1, gap: space.xxs, minWidth: sizes.statMinWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
});
