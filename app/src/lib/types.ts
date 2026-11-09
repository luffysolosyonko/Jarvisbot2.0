/** Response shapes from /api/v1. All weights are in lb. */
export type Unit = 'lb' | 'kg';

export type Me = {
  id: number;
  email: string | null;
  display_name: string | null;
  auth_provider: string;
  is_demo: boolean;
  created_at: string;
  settings: { tz_name: string; set_unit: Unit; bar_lb: number };
};

export type ParsedSet = {
  idx: number;
  line: number;
  exercise: string | null;
  matched_exercise: string | null;
  reps: number;
  good_reps: number;
  failed_reps: number;
  weight_lb: number | null;
  weight_text: string | null;
  estimated: boolean;
  bodyweight: boolean;
  per_hand: boolean;
  inferred: boolean;
};

export type WeighIn = { weight_lb: number; note: string | null };
export type ParseWarning = { line: number; message: string };

export type ParseResult = {
  kind: 'workout' | 'weight';
  sets: ParsedSet[];
  weigh_in: WeighIn | null;
  warnings: ParseWarning[];
};

export type Log = {
  id: number;
  kind: 'workout' | 'weight';
  raw_text: string;
  logged_at: string;
  local_date: string;
  sets: ParsedSet[];
  weigh_in: WeighIn | null;
};

export type Point = { date: string; value: number };

export type Projection = {
  slope_per_week: number;
  now: number;
  last_date: string;
  target_date: string;
  pred: number;
  low: number;
  high: number;
  points: number;
  span_days: number;
  line: Point[];
};

export type Window = {
  start: string;
  end: string;
  sessions: number;
  sets: number;
  good_reps: number;
  failed_reps: number;
  volume_lb: number;
};

export type TopLift = {
  exercise: string;
  sessions: number;
  latest_e1rm: number | null;
  best_e1rm: number | null;
  e1rm_change: number | null;
};

export type Dashboard = {
  today: { date: string; sets: number; volume_lb: number; exercises: string[]; weight_lb: number | null };
  week: Window;
  previous_week: Window;
  weekly: Window[];
  weight: { points: Point[]; average_7d: Point[]; projection: Projection | null };
  top_lifts: TopLift[];
};

export type ExerciseSummary = {
  exercise: string;
  sets: number;
  sessions: number;
  good_reps: number;
  failed_reps: number;
  first_date: string;
  last_date: string;
  best_e1rm: number | null;
  latest_e1rm: number | null;
  e1rm_change: number | null;
  per_hand: boolean;
};

export type SetRef = {
  date: string;
  reps: number;
  good_reps: number;
  failed_reps: number;
  weight_lb: number | null;
  estimated: boolean;
  bodyweight: boolean;
  per_hand: boolean;
  e1rm: number | null;
};

export type Forecast = {
  exercise: string;
  best_e1rm: number;
  target_lb: number | null;
  reach: 'date' | 'already' | 'flat' | null;
  reach_date: string | null;
  optimistic: boolean;
  projection: Projection;
};

export type ExerciseDetail = {
  summary: ExerciseSummary;
  sessions: Point[];
  best_set: SetRef | null;
  heaviest_set: SetRef | null;
  last_session: SetRef[];
  rep_targets: { reps: number; weight_lb: number }[];
  forecast: Forecast | null;
};

export type AskAnswer = {
  answer: string;
  input_tokens: number;
  output_tokens: number;
  tokens_used_today: number;
  daily_token_cap: number;
  topics: string[];
};
