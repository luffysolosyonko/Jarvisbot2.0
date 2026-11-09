/**
 * Color tokens: a strict monochrome palette. The darkest grey marks the main chart
 * series, the current page and primary actions. Every text/background pair meets
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

/** Strict monochrome: white background, #333333 text, greys between. */
export const mono: ColorTokens = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  ink: '#333333',
  inkSecondary: '#666666',
  border: '#DDDDDD',
  accent: '#111111',
  onAccent: '#FFFFFF',
  success: '#333333',
  danger: '#111111',
};

/** One color scheme only: monochrome. */
export const colors = mono;
export const palettes = { mono } as const;

/** Strict 8px grid. 4 is only for icon-to-label gaps. */
export const space = { xxs: 4, xs: 8, sm: 16, md: 24, lg: 32, xl: 48, xxl: 64 } as const;
export const fontSize = { caption: 12, label: 14 } as const;
export const fonts = {
  ui: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;
