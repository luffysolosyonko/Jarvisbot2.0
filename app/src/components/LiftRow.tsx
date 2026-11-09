import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { exerciseName, signedWeight } from '@/lib/format';
import type { Unit } from '@/lib/types';
import { icon, layout, space, useTheme } from '@/theme';

import { Text } from './Text';

/** A tappable exercise row: name, a value, an optional e1RM change. */
export function LiftRow({
  name,
  value,
  change,
  unit,
  detail,
}: {
  name: string;
  value: string;
  change?: number | null;
  unit: Unit;
  detail?: string;
}) {
  const { colors } = useTheme();
  const changeText = change === null || change === undefined ? '' : signedWeight(change, unit, 0);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${exerciseName(name)}, ${value}${changeText ? `, ${changeText}` : ''}${detail ? `, ${detail}` : ''}`}
      onPress={() => router.push({ pathname: '/exercise/[name]', params: { name } })}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={styles.name} numberOfLines={2}>
        {exerciseName(name)}
        {detail ? (
          <Text variant="label" tone="secondary">
            {'\n'}
            {detail}
          </Text>
        ) : null}
      </Text>
      <Text mono tabular>
        {value}
      </Text>
      {change !== undefined ? (
        <Text
          variant="label"
          mono
          tabular
          tone={change === null ? 'secondary' : change >= 0 ? 'success' : 'danger'}
          style={styles.change}>
          {changeText || '–'}
        </Text>
      ) : null}
      <ChevronRight size={icon.sizeSmall} strokeWidth={icon.stroke} color={colors.inkSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.touchTarget + space.xs,
    gap: space.sm,
    borderBottomWidth: layout.hairline,
    paddingVertical: space.xs,
  },
  name: { flex: 1 },
  change: { minWidth: space.xxl, textAlign: 'right' },
});
