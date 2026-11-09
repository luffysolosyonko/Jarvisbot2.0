/**
 * Color tokens. One accent, used only for the primary action, the selected tab and
 * the main chart series. Every text/background pair meets WCAG AA (see
 * __tests__/contrast-test.ts).
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
