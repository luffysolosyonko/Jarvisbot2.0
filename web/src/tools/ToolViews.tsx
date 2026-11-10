import { Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import { Button, IconButton } from '@/components/Button';
import { TrendChart, WeeklyBars } from '@/components/Charts';
import { ExerciseSelect } from '@/components/ExerciseSelect';
import { ICON } from '@/components/icons';
import { Segmented } from '@/components/Segmented';
import { SetRows } from '@/components/SetRows';
import { Stat } from '@/components/Stat';
import { EmptyState, ErrorState, QueryView, Skeleton } from '@/components/States';
import {
  useAddAlias,
  useAliases,
  useAliasMatches,
  useDashboard,
  useExercise,
  useLiftForecast,
  useRemoveAlias,
  useSearch,
  useStats,
  useToday,
  useWeightForecast,
} from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { downloadFile, errorMessage } from '@/lib/api';
import { exerciseName, longDate, num, signedWeight, toLb, weight } from '@/lib/format';
import { reachText, setRefText } from '@/lib/describe';
import type { ExerciseDetail, Log, Unit } from '@/lib/types';

const DAY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

function DaysToggle({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return <Segmented label="Period" value={String(value)} onChange={(v) => onChange(Number(v))} options={DAY_OPTIONS} />;
}

// ---------------------------------------------------------------------------
export function TodayTool({ unit }: { unit: Unit }) {
  const q = useToday();
  return (
    <QueryView query={q}>
      {(t) =>
        !t.logs.length ? (
          <EmptyState message="Nothing logged today. Type a set like 8x 160lb bench in the Notebook." />
        ) : (
          <div className="stack-4">
            <div className="stats">
              <Stat label="Sets" value={`${t.sets} sets`} />
              <Stat label="Weigh-in" value={t.weight_lb === null ? '–' : weight(t.weight_lb, unit)} />
            </div>
            <ul className="stack-3">
              {t.logs.map((lg) => (
                <li key={lg.id} className="stack-2">
                  <div className="raw">{lg.raw_text}</div>
                  {lg.weigh_in ? <p className="t-label tnum">→ {weight(lg.weigh_in.weight_lb, unit)}</p> : <SetRows sets={lg.sets} unit={unit} />}
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </QueryView>
  );
}

export function StatsTool({ unit }: { unit: Unit }) {
  const [days, setDays] = useState(7);
  const q = useStats(days);
  return (
    <div className="stack-4">
      <DaysToggle value={days} onChange={setDays} />
      <QueryView query={q}>
        {(s) => (
          <div className="stats">
            <Stat label="Gym days" value={`${s.gym_days} days`} note={`${num(s.gym_days_per_week)} a week`} />
            <Stat label="Sets" value={`${s.sets} sets`} note={`${s.good_reps} good reps · ${s.failed_reps} failed`} />
            <Stat
              label="Weight change"
              value={s.weight_change_lb === null ? '–' : signedWeight(s.weight_change_lb, unit)}
              note={s.weight_end_lb === null ? 'No weigh-ins in this period' : `Now ${weight(s.weight_end_lb, unit)}`}
            />
          </div>
        )}
      </QueryView>
    </div>
  );
}

function useExerciseTool(initial: string) {
  const [name, setName] = useState(initial);
  const q = useExercise(name || null);
  return { name, setName, q };
}

function LiftBody({ d, unit }: { d: ExerciseDetail; unit: Unit }) {
  return (
    <div className="stack-4">
      <div className="stats">
        <Stat label="Best set" value={setRefText(d.best_set, unit)} note={d.best_set ? longDate(d.best_set.date) : undefined} />
        <Stat label="Heaviest" value={setRefText(d.heaviest_set, unit)} note={d.heaviest_set ? longDate(d.heaviest_set.date) : undefined} />
      </div>
      <TrendChart
        main={d.sessions}
        projection={d.forecast?.projection ?? null}
        unit={unit}
        mainLabel="Estimated 1RM per session"
        label={`Estimated 1-rep max for ${d.summary.exercise} over ${d.sessions.length} sessions.`}
      />
      <div className="stack-2">
        <h3 className="t-label semibold">Last session · {longDate(d.summary.last_date)}</h3>
        <ul className="t-label tnum stack-1">
          {d.last_session.map((s, i) => (
            <li key={i}>{setRefText(s, unit)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LiftTool({ unit, initial = '' }: { unit: Unit; initial?: string }) {
  const { name, setName, q } = useExerciseTool(initial);
  return (
    <div className="stack-4">
      <ExerciseSelect value={name} onChange={setName} />
      {name ? <QueryView query={q}>{(d) => <LiftBody d={d} unit={unit} />}</QueryView> : null}
    </div>
  );
}

export function RepTargets({ d, unit }: { d: ExerciseDetail; unit: Unit }) {
  return (
    <table className="table">
      <caption className="visually-hidden">Estimated maxes by reps</caption>
      <thead>
        <tr>
          <th scope="col">Reps</th>
          <th scope="col" className="num">
            Weight
          </th>
        </tr>
      </thead>
      <tbody>
        {d.rep_targets
          .filter((r) => [3, 5, 8, 10, 12].includes(r.reps))
          .map((r) => (
            <tr key={r.reps}>
              <td className="tnum">{r.reps}</td>
              <td className="num">{weight(r.weight_lb, unit, 0)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export function EstimateTool({ unit }: { unit: Unit }) {
  const { name, setName, q } = useExerciseTool('');
  return (
    <div className="stack-4">
      <ExerciseSelect value={name} onChange={setName} />
      {name ? (
        <QueryView query={q}>
          {(d) => (
            <div className="stack-4">
              <div className="stats">
                <Stat label="e1RM now" value={weight(d.summary.latest_e1rm, unit, 0)} />
                <Stat label="Best ever" value={weight(d.summary.best_e1rm, unit, 0)} />
              </div>
              <RepTargets d={d} unit={unit} />
              <p className="hint">Epley formula from your latest session. Failed reps don’t count.</p>
            </div>
          )}
        </QueryView>
      ) : null}
    </div>
  );
}

export function PredictWeightTool({ unit }: { unit: Unit }) {
  const q = useWeightForecast(28);
  return (
    <QueryView query={q}>
      {(f) =>
        !f.projection ? (
          <EmptyState message={`Log weigh-ins like 182.4 in Weight mode; a forecast needs a few more than the ${f.weigh_ins} you have.`} />
        ) : (
          <div className="stack-3">
            <div className="stats">
              <Stat label="Trend" value={`${signedWeight(f.projection.slope_per_week, unit)}/wk`} />
              <Stat label={`By ${longDate(f.projection.target_date)}`} value={weight(f.projection.pred, unit)} />
            </div>
            <p className="t-label">
              Likely range {weight(f.projection.low, unit)} to {weight(f.projection.high, unit)}, from {f.projection.points} weigh-ins over{' '}
              {f.projection.span_days} days.
            </p>
          </div>
        )
      }
    </QueryView>
  );
}

export function TargetForm({ name, unit, initialTarget = '' }: { name: string; unit: Unit; initialTarget?: string }) {
  const [input, setInput] = useState(initialTarget);
  const [target, setTarget] = useState<number | null>(null);
  const id = useId();
  const q = useLiftForecast(name || null, target);
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = Number(input);
    if (v > 0) setTarget(Math.round(toLb(v, unit) * 10) / 10);
  }
  return (
    <div className="stack-3">
      <form className="form-row" onSubmit={submit}>
        <div className="field field-grow">
          <label htmlFor={id}>Target 1RM ({unit})</label>
          <input id={id} className="input tnum" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} placeholder={unit === 'kg' ? '100' : '225'} />
        </div>
        <Button type="submit" variant="primary" disabled={!name || !(Number(input) > 0)}>
          Get date
        </Button>
      </form>
      {target !== null && q.isFetching && !q.data ? <Skeleton lines={1} /> : null}
      {q.error ? <ErrorState error={q.error} /> : null}
      {q.data ? (
        <div className="stack-3" aria-live="polite">
          <div className="stats">
            <Stat label={`By ${longDate(q.data.projection.target_date)}`} value={weight(q.data.projection.pred, unit, 0)} />
            <Stat label="Rate" value={`${signedWeight(q.data.projection.slope_per_week, unit)}/wk`} />
          </div>
          <p className="t-body semibold">{reachText(q.data, unit)}</p>
        </div>
      ) : null}
    </div>
  );
}

export function PredictLiftTool({ unit }: { unit: Unit }) {
  const [name, setName] = useState('');
  return (
    <div className="stack-4">
      <ExerciseSelect value={name} onChange={setName} />
      <TargetForm key={name} name={name} unit={unit} />
    </div>
  );
}

type ChartKind = 'overview' | 'weight' | 'lift';

export function ChartsTool({ unit }: { unit: Unit }) {
  const [kind, setKind] = useState<ChartKind>('overview');
  const [lift, setLift] = useState('');
  const dash = useDashboard();
  const ex = useExercise(kind === 'lift' && lift ? lift : null);
  return (
    <div className="stack-4">
      <Segmented<ChartKind>
        label="Chart"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'weight', label: 'Weight' },
          { value: 'lift', label: 'Lift' },
        ]}
      />
      {kind === 'overview' ? <QueryView query={dash}>{(d) => <div className="stack-2"><p className="t-label secondary">Sets per week</p><WeeklyBars weeks={d.weekly} /></div>}</QueryView> : null}
      {kind === 'weight' ? (
        <QueryView query={dash}>
          {(d) => (
            <TrendChart
              main={d.weight.points}
              avg={d.weight.average_7d}
              projection={d.weight.projection}
              unit={unit}
              mainLabel="Weigh-ins"
              avgLabel="7-day average"
              mainStyle="dots"
              label="Body weight over the last 90 days, with a 7-day average and a forecast."
            />
          )}
        </QueryView>
      ) : null}
      {kind === 'lift' ? (
        <>
          <ExerciseSelect value={lift} onChange={setLift} />
          {lift ? (
            <QueryView query={ex}>
              {(d) => (
                <TrendChart
                  main={d.sessions}
                  projection={d.forecast?.projection}
                  unit={unit}
                  mainLabel="Estimated 1RM per session"
                  label={`Estimated 1-rep max for ${lift}.`}
                />
              )}
            </QueryView>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function SearchTool({ unit, onJump }: { unit: Unit; onJump: (log: Log) => void }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q, 300);
  const res = useSearch(term);
  const id = useId();
  return (
    <div className="stack-4">
      <div className="field">
        <label htmlFor={id}>Search every log</label>
        <input id={id} className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="bench, deadlift, scale…" autoFocus />
      </div>
      {term.trim() ? (
        <QueryView query={res}>
          {(r) =>
            !r.logs.length ? (
              <EmptyState message={`No logs contain “${r.query}”. Try an exercise name like bench.`} />
            ) : (
              <ul className="list">
                {r.logs.map((lg) => (
                  <li key={lg.id}>
                    <button type="button" className="list-row" onClick={() => onJump(lg)}>
                      <span className="stack-1 grow">
                        <span className="t-caption secondary">{longDate(lg.local_date)}</span>
                        <span className="raw block">
                          {lg.raw_text}
                        </span>
                        {lg.weigh_in ? <span className="t-caption secondary">→ {weight(lg.weigh_in.weight_lb, unit)}</span> : null}
                      </span>
                      <span className="t-label accent no-shrink">
                        Show in notebook
                      </span>
                    </button>
                  </li>
                ))}
                {r.truncated ? <li className="hint">Showing the 50 newest matches.</li> : null}
              </ul>
            )
          }
        </QueryView>
      ) : null}
    </div>
  );
}

export function AliasesTool() {
  const aliases = useAliases();
  const matches = useAliasMatches();
  const add = useAddAlias();
  const remove = useRemoveAlias();
  const [short, setShort] = useState('');
  const [full, setFull] = useState('');
  const shortId = useId();
  const fullId = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate({ short: short.trim(), full: full.trim() }, { onSuccess: () => { setShort(''); setFull(''); } });
  }
  return (
    <div className="stack-4">
      <form className="stack-3" onSubmit={submit}>
        <div className="form-row">
          <div className="field field-grow">
            <label htmlFor={shortId}>Shortcut</label>
            <input id={shortId} className="input tnum" value={short} onChange={(e) => setShort(e.target.value)} placeholder="sldl" />
          </div>
          <div className="field field-grow-2">
            <label htmlFor={fullId}>Full name</label>
            <input id={fullId} className="input" value={full} onChange={(e) => setFull(e.target.value)} placeholder="stiff leg deadlift" />
          </div>
          <Button type="submit" variant="primary" loading={add.isPending} disabled={!short.trim() || !full.trim()}>
            Add shortcut
          </Button>
        </div>
        {add.error ? <p className="error-text" role="alert">{errorMessage(add.error)}</p> : null}
      </form>
      <div className="stack-2">
        <h3 className="t-label semibold">Your shortcuts</h3>
        <QueryView query={aliases}>
          {(list) =>
            !list.length ? (
              <p className="t-label secondary">No shortcuts yet. Add one like sldl = stiff leg deadlift.</p>
            ) : (
              <ul className="list">
                {list.map((a) => (
                  <li key={a.id} className="list-item">
                    <span className="t-label">
                      <span className="tnum">{a.short}</span> = {a.full}
                    </span>
                    <IconButton label={`Remove ${a.short}`} onClick={() => remove.mutate(a.id)}>
                      <Trash2 {...ICON} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryView>
      </div>
      <div className="stack-2">
        <h3 className="t-label semibold">Matched automatically</h3>
        <p className="help">Names you’ve typed that count as another exercise: initials, word prefixes, plurals and your shortcuts.</p>
        <QueryView query={matches}>
          {(list) =>
            !list.length ? (
              <p className="t-label secondary">No names matched to another exercise yet.</p>
            ) : (
              <ul className="list">
                {list.map((m) => (
                  <li key={m.written} className="list-item">
                    <span className="t-label">
                      <span className="tnum">{m.written}</span> → {exerciseName(m.matched)}
                    </span>
                    <span className="hint tnum">{m.sets} sets</span>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryView>
      </div>
    </div>
  );
}

export function ExportTool() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function get(path: string, name: string) {
    setBusy(path);
    setError(null);
    try {
      await downloadFile(path, name);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="stack-3">
      <p className="t-label secondary">One row per set or weigh-in, weights in lb.</p>
      <div className="row">
        <Button loading={busy === '/export/sets.csv'} onClick={() => void get('/export/sets.csv', 'jarvis-sets.csv')}>
          Download sets CSV
        </Button>
        <Button loading={busy === '/export/weighins.csv'} onClick={() => void get('/export/weighins.csv', 'jarvis-weigh-ins.csv')}>
          Download weigh-ins CSV
        </Button>
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </div>
  );
}

