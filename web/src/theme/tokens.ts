/**
 * Color tokens. One accent (blue ballpoint), used only for the send button, the selected
 * nav item, the active mode and the main chart series. Every text/background pair meets WCAG AA
 * (see contrast.test.ts). index.css defines the same values as CSS variables.
 * The app has one color scheme: a sticky note.
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

/** Sticky note: yellow paper, graphite ink, blue ballpoint for the accent. */
export const note: ColorTokens = {
  bg: '#FFF1A8',
  surface: '#FFF8D1',
  ink: '#26231A',
  inkSecondary: '#5A5236',
  border: '#E2CF6B',
  accent: '#1F4FB8',
  onAccent: '#FFFFFF',
  success: '#1E6B34',
  danger: '#B3261E',
};

/** One color scheme only: the sticky note. */
export const colors = note;
export const palettes = { note } as const;

/** Strict 8px grid. 4 is only for icon-to-label gaps. */
export const space = { xxs: 4, xs: 8, sm: 16, md: 24, lg: 32, xl: 48, xxl: 64 } as const;
export const fontSize = { caption: 12, label: 14 } as const;
export const fonts = {
  ui: "'Manrope Variable', 'Manrope', system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
} as const;
