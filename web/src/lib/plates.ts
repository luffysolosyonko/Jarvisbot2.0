/** Barbell math for the goal bar: competition plates on a 20 kg bar. */
export const LB_PER_KG = 2.20462;
export const BAR_KG = 20;
export const GOAL_LB = 225;

/** Competition plates used by the goal bar, heaviest first. */
export const PLATE_KG = [25, 20, 15, 10] as const;
export type PlateKg = (typeof PLATE_KG)[number];

/** Plates on ONE side to make up `perSideKg`, heaviest first (anything under 10 kg is left off). */
export function platesFor(perSideKg: number): PlateKg[] {
  const out: PlateKg[] = [];
  let left = perSideKg;
  for (const p of PLATE_KG) {
    while (left >= p - 1e-9) {
      out.push(p);
      left -= p;
    }
  }
  return out;
}

/** Weight on one side of the bar for a total in lb. */
export function perSideKg(totalLb: number): number {
  return Math.max(0, (totalLb / LB_PER_KG - BAR_KG) / 2);
}

/**
 * What the bar shows: the plates for the current best, and the extra plates (drawn as
 * outlines) still needed to reach the goal.
 */
export function goalLoad(currentLb: number, goalLb = GOAL_LB): { loaded: PlateKg[]; toGo: PlateKg[] } {
  const loaded = platesFor(perSideKg(currentLb));
  const loadedKg = loaded.reduce((a, b) => a + b, 0);
  const toGo = platesFor(Math.max(0, perSideKg(goalLb) - loadedKg));
  return { loaded, toGo };
}
