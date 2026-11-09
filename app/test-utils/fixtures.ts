import type { ParsedSet, ParseResult } from '@/lib/types';

function set(idx: number, reps: number, good: number, failed: number): ParsedSet {
  return {
    idx,
    line: 1,
    exercise: 'bench',
    matched_exercise: 'bench',
    reps,
    good_reps: good,
    failed_reps: failed,
    weight_lb: 155,
    weight_text: '155lb',
    estimated: false,
    bodyweight: false,
    per_hand: false,
    inferred: false,
  };
}

/** What the API returns for "5x 155lb 2x1x1xf bench". */
export const HEADLINE_PARSE: ParseResult = {
  kind: 'workout',
  sets: [set(0, 5, 5, 0), set(1, 2, 2, 0), set(2, 1, 1, 0), set(3, 1, 1, 0), set(4, 1, 0, 1)],
  weigh_in: null,
  warnings: [],
};
