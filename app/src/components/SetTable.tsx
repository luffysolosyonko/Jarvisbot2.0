import { StyleSheet, View } from 'react-native';

import { exerciseName, num, fromLb } from '@/lib/format';
import type { ParsedSet, Unit } from '@/lib/types';
import { layout, sizes, space, useTheme } from '@/theme';

import { Text } from './Text';

export function setFlags(s: Pick<ParsedSet, 'estimated' | 'bodyweight' | 'per_hand'>): string {
  return [s.estimated && 'est', s.bodyweight && 'bw', s.per_hand && 'each'].filter(Boolean).join(' ');
}

function weightCell(s: ParsedSet, unit: Unit): string {
  if (s.bodyweight) return 'bw';
  if (s.weight_lb === null) return s.weight_text === '?' ? '?' : '–';
  return num(fromLb(s.weight_lb, unit));
}

function describe(s: ParsedSet, unit: Unit): string {
  const name = exerciseName(s.matched_exercise ?? s.exercise);
  const reps = s.failed_reps ? `${s.good_reps} good, ${s.failed_reps} failed` : `${s.good_reps} reps`;
  const w = s.bodyweight ? 'bodyweight' : s.weight_lb === null ? 'no weight' : `${num(fromLb(s.weight_lb, unit))} ${unit}`;
  const flags = [s.estimated && 'estimated', s.per_hand && 'each hand'].filter(Boolean).join(', ');
  return `${name}, ${reps}, ${w}${flags ? `, ${flags}` : ''}`;
}

/**
 * Parsed set rows in monospace: reps, good/failed, weight, flags and the matched
 * exercise. Used by the live preview and History.
 */
export function SetTable({ sets, unit }: { sets: ParsedSet[]; unit: Unit }) {
  const { colors } = useTheme();
  const rule = { borderBottomColor: colors.border, borderBottomWidth: layout.hairline };
  return (
    <View accessibilityRole="list">
      <View style={[styles.row, rule]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Cell width={sizes.colNarrow} text="Reps" head />
        <Cell width={sizes.colWide} text="Good" head />
        <Cell width={sizes.colMid} text="Fail" head />
        <Cell flex text={unit} head align="right" />
        <Cell width={sizes.colWide} text="Flags" head />
      </View>
      {sets.map((s, i) => {
        const name = s.matched_exercise ?? s.exercise;
        const prev = i > 0 ? sets[i - 1] : null;
        const showName = !prev || name !== (prev.matched_exercise ?? prev.exercise);
        return (
          <View key={`${s.line}-${s.idx}`} accessible accessibilityLabel={describe(s, unit)}>
            {showName ? (
              <Text variant="label" weight="semibold" style={styles.name}>
                {exerciseName(name)}
              </Text>
            ) : null}
            <View style={[styles.row, rule]}>
              <Cell width={sizes.colNarrow} text={String(s.reps)} />
              <Cell width={sizes.colWide} text={String(s.good_reps)} />
              <Cell width={sizes.colMid} text={s.failed_reps ? String(s.failed_reps) : '–'} tone={s.failed_reps ? 'danger' : 'secondary'} />
              <Cell flex text={weightCell(s, unit)} align="right" />
              <Cell width={sizes.colWide} text={setFlags(s) || '–'} tone="secondary" />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Cell({
  text,
  width,
  flex,
  head = false,
  align = 'left',
  tone,
}: {
  text: string;
  width?: number;
  flex?: boolean;
  head?: boolean;
  align?: 'left' | 'right';
  tone?: 'secondary' | 'danger';
}) {
  return (
    <Text
      variant="label"
      mono
      tabular
      weight={head ? 'semibold' : 'regular'}
      tone={head ? 'secondary' : (tone ?? 'ink')}
      numberOfLines={1}
      style={[flex ? styles.flex : { width }, { textAlign: align }, align === 'right' && styles.padRight]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.tableRow, gap: space.xs },
  flex: { flex: 1 },
  padRight: { paddingRight: space.sm },
  name: { marginTop: space.sm },
});
