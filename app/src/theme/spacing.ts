/** Strict 8px grid. `xxs` (4) is only for icon-to-label gaps. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
  xxl: 64,
} as const;

export const layout = {
  screenPadding: space.md, // 24
  sectionGap: space.xl, // 48 between sections
  itemGap: space.md, // 24 between items in a section
  touchTarget: 48, // minimum 48x48
  hairline: 1,
} as const;

export const radii = {
  control: 8, // inputs and buttons
  container: 12, // the few true containers
  segment: 999, // segmented controls only
} as const;

/** Fixed component sizes, on the 8px grid where they're boxes. */
export const sizes = {
  hairline: 1,
  tableRow: 32,
  colNarrow: 40,
  colMid: 48,
  colWide: 56,
  statMinWidth: 128,
  multilineMinHeight: 128,
  segmentMinWidth: 64,
  chartHeight: 200,
  barChartHeight: 136,
  chartStroke: 2,
  chartDot: 3,
  barRadius: 4,
  maxContentWidth: 520, // the phone-width column the web build is centred in
} as const;

export const icon = {
  size: 24,
  sizeSmall: 20,
  stroke: 1.75,
} as const;
