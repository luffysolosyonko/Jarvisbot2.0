/** Response shapes from /api/v1. All weights are in lb. */
export type Unit = 'lb' | 'kg';
export type LogMode = 'workout' | 'weight';
export type Mode = LogMode | 'ask';

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

/** A one-click repair: replace `line` with `text`, or with `template` once its `{}` is filled. */
export type Fix = {
  label: string;
  line: number;
  text: string | null;
  template: string | null;
  placeholder: string | null;
  mode: LogMode | null;
};

export type ParseWarning = { line: number; message: string; code: string; fixes: Fix[] };
export type ExerciseMatch = { written: string; matched: string; is_new: boolean };

export type ParseResult = {
  kind: LogMode;
  sets: ParsedSet[];
  weigh_in: WeighIn | null;
  warnings: ParseWarning[];
  exercises: ExerciseMatch[];
};

export type Log = {
  id: number;
  kind: LogMode;
  raw_text: string;
  logged_at: string;
  local_date: string;
  sets: ParsedSet[];
  weigh_in: WeighIn | null;
  warnings: ParseWarning[];
  pending?: boolean; // client only: shown while the save is in flight
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

export type WeightForecast = { projection: Projection | null; weigh_ins: number };

export type AskAnswer = {
  id: number;
  asked_at: string;
  question: string;
  answer: string;
  input_tokens: number;
  output_tokens: number;
  tokens_used_today: number;
  daily_token_cap: number;
  topics: string[];
};

/** A saved question and answer from Ask mode. */
export type AskMessage = {
  id: number;
  asked_at: string;
  question: string;
  answer: string;
  input_tokens: number;
  output_tokens: number;
};

export type TodayLogs = {
  date: string;
  logs: Log[];
  sets: number;
  volume_lb: number;
  exercises: string[];
  weight_lb: number | null;
};

export type Stats = {
  days: number;
  start: string;
  end: string;
  gym_days: number;
  gym_days_per_week: number;
  sets: number;
  good_reps: number;
  failed_reps: number;
  volume_lb: number;
  weight_start_lb: number | null;
  weight_end_lb: number | null;
  weight_change_lb: number | null;
};

export type ExerciseVolume = { exercise: string; sets: number; good_reps: number; volume_lb: number };
export type Volume = { days: number; start: string; end: string; exercises: ExerciseVolume[] };

export type CalendarDay = {
  date: string;
  has_workout: boolean;
  has_weight: boolean;
  sets: number;
  volume_lb: number;
  weight_lb: number | null;
};

export type CalendarMonth = {
  month: string;
  days: CalendarDay[];
  workouts: number;
  sets: number;
  volume_lb: number;
  weight_change_lb: number | null;
};

export type SearchResult = { query: string; logs: Log[]; truncated: boolean };


export type Alias = { id: number; short: string; full: string };
export type AliasMatch = { written: string; matched: string; sets: number };
