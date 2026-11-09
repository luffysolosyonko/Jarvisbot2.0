import { Text as RNText, type TextProps } from 'react-native';

import { MAX_FONT_SCALE, tabular as tabularStyle, textStyle, useTheme, type Variant, type Weight } from '@/theme';

export type Tone = 'ink' | 'secondary' | 'accent' | 'danger' | 'success' | 'onAccent';

type Props = TextProps & {
  variant?: Variant;
  weight?: Weight;
  mono?: boolean;
  tabular?: boolean;
  tone?: Tone;
};

export function Text({
  variant = 'body',
  weight = 'regular',
  mono = false,
  tabular = false,
  tone = 'ink',
  style,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const color = {
    ink: colors.ink,
    secondary: colors.inkSecondary,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    onAccent: colors.onAccent,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[textStyle(variant, weight, mono), tabular && tabularStyle, { color }, style]}
      {...rest}
    />
  );
}
