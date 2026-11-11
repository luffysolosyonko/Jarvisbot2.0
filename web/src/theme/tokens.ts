/**
 * Colors mirrored from theme/tokens.css, for charts (which need real values) and the
 * contrast test. A paper notebook: warm paper, dark ink, forest-green accent.
 */
export type ColorTokens = {
  bg: string; // --paper
  surface: string; // --paper-raised
  ink: string;
  inkSecondary: string; // --ink-2
  inkTertiary: string; // --ink-3
  border: string; // --rule
  grid: string; // --segment-bg (chart gridlines)
  accent: string; // forest green
  onAccent: string; // paper on green
  success: string; // the parse note: also the accent
  danger: string; // --fail
  paperSunk: string; // the composer
};

export const palette: ColorTokens = {
  bg: '#F6F2EA',
  surface: '#FBF8F2',
  ink: '#1C1A17',
  inkSecondary: '#4A443B',
  inkTertiary: '#6B6358',
  border: '#D9CFBE',
  grid: '#E2D8C6',
  accent: '#2E5B45',
  onAccent: '#F6F2EA',
  success: '#2E5B45',
  danger: '#9A3B1E',
  paperSunk: '#EEE6D8',
};

/** One color scheme only. */
export const colors = palette;
export const palettes = { palette } as const;

export const fonts = {
  ui: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Consolas, monospace",
} as const;

/** Chart axis labels. */
export const fontSize = { small: 10 } as const;
