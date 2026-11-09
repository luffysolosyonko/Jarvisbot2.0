/**
 * Color tokens. One accent, used only for the primary action, the selected nav item,
 * the active mode and the main chart series. Every text/background pair meets WCAG AA
 * (see contrast.test.ts). index.css defines the same values as CSS variables.
 */
export type ColorTokens = {
  bg: string;
  surface: string;
  ink: string;
  inkSecondary: string;
  border: string;
  accent: string;
  onAccent: string;
  success: string;
  danger: string;
};

export const light: ColorTokens = {
  bg: '#F7F6F2',
  surface: '#FFFFFF',
  ink: '#16181D',
  inkSecondary: '#4A4F59',
  border: '#DAD7CE',
  accent: '#C2410C',
  onAccent: '#FFFFFF',
  success: '#15803D',
  danger: '#B91C1C',
};

export const dark: ColorTokens = {
  bg: '#0F1012',
  surface: '#17191C',
  ink: '#ECEAE4',
  inkSecondary: '#A9ADB5',
  border: '#2A2D32',
  accent: '#F97316',
  onAccent: '#0F1012',
  success: '#4ADE80',
  danger: '#F87171',
};

export const palettes = { light, dark } as const;
export type Scheme = keyof typeof palettes;

/** Strict 8px grid. 4 is only for icon-to-label gaps. */
export const space = { xxs: 4, xs: 8, sm: 16, md: 24, lg: 32, xl: 48, xxl: 64 } as const;
export const fontSize = { caption: 12, label: 14 } as const;
export const fonts = {
  ui: "'Manrope Variable', 'Manrope', system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
} as const;
