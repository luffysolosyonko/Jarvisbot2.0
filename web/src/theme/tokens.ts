/**
 * Color tokens: greys plus one indigo accent, used for primary actions, the active
 * toggle, workout days and the main chart series. Every text/background pair meets
 * WCAG AA (see contrast.test.ts). index.css defines the same values as CSS variables.
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

/** White, #333333 text, light greys, and one indigo accent for primary actions. */
export const mono: ColorTokens = {
  bg: '#FFFFFF',
  surface: '#F9FAFB',
  ink: '#333333',
  inkSecondary: '#6B7280',
  border: '#E5E7EB',
  accent: '#4F46E5',
  onAccent: '#FFFFFF',
  success: '#333333',
  danger: '#B91C1C',
};

/** One color scheme only. */
export const colors = mono;
export const palettes = { mono } as const;

/** Strict 8px grid. 4 is only for icon-to-label gaps. */
export const space = { xxs: 4, xs: 8, sm: 16, md: 24, lg: 32, xl: 48, xxl: 64 } as const;
export const fontSize = { caption: 12, label: 14 } as const;
export const fonts = {
  ui: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;
