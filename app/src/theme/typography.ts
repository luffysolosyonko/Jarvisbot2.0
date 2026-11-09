import type { TextStyle } from 'react-native';

/**
 * Manrope for UI text; JetBrains Mono for the log input, parsed set rows and
 * numbers in tables. Two weights only: Regular and SemiBold.
 * Font family names match the keys loaded in src/app/_layout.tsx.
 */
export const fonts = {
  ui: 'Manrope_400Regular',
  uiSemiBold: 'Manrope_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
} as const;

export const fontAssets = {
  mono: require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'),
} as const;

type Scale = { fontSize: number; lineHeight: number };

export const scale = {
  display: { fontSize: 32, lineHeight: 40 },
  title: { fontSize: 24, lineHeight: 32 },
  heading: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
} as const satisfies Record<string, Scale>;

export type Variant = keyof typeof scale;
export type Weight = 'regular' | 'semibold';

/** Dynamic Type: honour the system font size up to 1.3x. */
export const MAX_FONT_SCALE = 1.3;

export function textStyle(variant: Variant, weight: Weight = 'regular', mono = false): TextStyle {
  const family = mono
    ? weight === 'semibold'
      ? fonts.monoSemiBold
      : fonts.mono
    : weight === 'semibold'
      ? fonts.uiSemiBold
      : fonts.ui;
  return { ...scale[variant], fontFamily: family };
}

/** Numbers that line up in columns. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
