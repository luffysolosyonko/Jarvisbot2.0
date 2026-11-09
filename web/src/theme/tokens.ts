/**
 * Colors mirrored from theme/tokens.css, for charts (which need real values) and the
 * contrast test. Red, yellow and green only carry meaning (failed reps; goals and
 * PRs; a confirmed parse). Blue is the only interactive color.
 */
export type ColorTokens = {
  bg: string;
  surface: string;
  ink: string;
  inkSecondary: string; // --muted
  border: string; // --line
  accent: string; // --blue
  onAccent: string; // --on-blue
  success: string; // --green
  danger: string; // --red
  yellow: string; // goals and PRs; never text
};

export const palette: ColorTokens = {
  bg: '#EEF0F2',
  surface: '#FFFFFF',
  ink: '#1C2127',
  inkSecondary: '#656E78',
  border: '#D5D9DE',
  accent: '#1F4FA3',
  onAccent: '#FFFFFF',
  success: '#2C7B4D',
  danger: '#C8102E',
  yellow: '#E8B100',
};

/** One color scheme only. */
export const colors = palette;
export const palettes = { palette } as const;

export const fonts = {
  ui: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
} as const;

/** The type scale's small step, for chart ticks. */
export const fontSize = { small: 13 } as const;
