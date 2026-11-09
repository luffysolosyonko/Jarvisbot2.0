import { Pressable, StyleSheet, View } from 'react-native';

import { layout, radii, sizes, space, useTheme } from '@/theme';

import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

/** The only pill-shaped control in the app. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={o.label}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: colors.ink }]}>
            <Text variant="label" weight="semibold" style={{ color: selected ? colors.bg : colors.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: layout.hairline,
    borderRadius: radii.segment,
    padding: space.xxs,
    alignSelf: 'flex-start',
  },
  segment: {
    minHeight: layout.touchTarget - space.xs,
    minWidth: sizes.segmentMinWidth,
    paddingHorizontal: space.sm,
    borderRadius: radii.segment,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
