import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { icon as iconTokens, layout, radii, space, useTheme } from '@/theme';

import { Text } from './Text';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'text';
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
};

/** One primary style (solid accent), one secondary (hairline), one text button. */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  icon: Icon,
  fullWidth = false,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const fg = variant === 'primary' ? colors.onAccent : variant === 'text' ? colors.accent : colors.ink;
  const tone = variant === 'primary' ? 'onAccent' : variant === 'text' ? 'accent' : 'ink';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={variant === 'text' ? space.xs : undefined}
      style={({ pressed }) => [
        styles.base,
        variant !== 'text' && styles.padded,
        fullWidth && styles.full,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'secondary' && {
          borderColor: colors.border,
          borderWidth: layout.hairline,
          backgroundColor: colors.surface,
        },
        { opacity: inactive ? 0.55 : pressed ? 0.8 : 1 },
      ]}
      {...rest}>
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : Icon ? (
          <Icon size={iconTokens.sizeSmall} strokeWidth={iconTokens.stroke} color={fg} />
        ) : null}
        <Text variant="body" weight="semibold" tone={tone}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
    borderRadius: radii.control,
    justifyContent: 'center',
    alignItems: 'center',
  },
  padded: { paddingHorizontal: space.md },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
