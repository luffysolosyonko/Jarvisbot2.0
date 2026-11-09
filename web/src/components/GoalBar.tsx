import { useExercises, useUnit } from '@/hooks/queries';
import { weight } from '@/lib/format';
import { GOAL_LB, goalLoad, type PlateKg } from '@/lib/plates';

/** Plate colors are the competition colors, and the only decoration in the app. */
const PLATE: Record<PlateKg, { color: string; h: number; w: number }> = {
  25: { color: 'var(--red)', h: 88, w: 16 },
  20: { color: 'var(--blue)', h: 78, w: 14 },
  15: { color: 'var(--yellow)', h: 66, w: 12 },
  10: { color: 'var(--green)', h: 54, w: 10 },
};

/** Your best bench e1RM: the best of the exercises named "bench" or "bench press". */
function useBenchBest(): number | null {
  const { data } = useExercises();
  const benches = (data ?? []).filter((e) => /^bench( press)?$/.test(e.exercise) && e.best_e1rm !== null);
  if (!benches.length) return null;
  return Math.max(...benches.map((e) => e.best_e1rm ?? 0));
}

/** One side of the bar: plates from the collar outward (dir -1 = left, 1 = right). */
function Side({ plates, toGo, collarX, dir, cy, scale }: { plates: PlateKg[]; toGo: PlateKg[]; collarX: number; dir: 1 | -1; cy: number; scale: number }) {
  let x = collarX + dir * 2 * scale;
  const shapes = [...plates.map((kg) => ({ kg, ghost: false })), ...toGo.map((kg) => ({ kg, ghost: true }))].map(({ kg, ghost }, i) => {
    const p = PLATE[kg];
    const w = p.w * scale;
    const h = p.h * scale;
    const left = dir === 1 ? x : x - w;
    x += dir * (w + 2 * scale);
    return ghost ? (
      <rect key={i} x={left} y={cy - h / 2} width={w} height={h} rx={2} fill="none" stroke={p.color} strokeWidth={2} strokeDasharray="4 3" />
    ) : (
      <rect key={i} x={left} y={cy - h / 2} width={w} height={h} rx={2} fill={p.color} />
    );
  });
  return <>{shapes}</>;
}

function Barbell({ currentLb, width, height, scale }: { currentLb: number; width: number; height: number; scale: number }) {
  const { loaded, toGo } = goalLoad(currentLb);
  const cy = height / 2;
  const collarL = width * 0.32;
  const collarR = width * 0.68;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <rect x={4} y={cy - 3 * scale} width={width - 8} height={6 * scale} rx={2} fill="var(--ink)" />
      <rect x={collarL - 4 * scale} y={cy - 12 * scale} width={4 * scale} height={24 * scale} fill="var(--ink)" />
      <rect x={collarR} y={cy - 12 * scale} width={4 * scale} height={24 * scale} fill="var(--ink)" />
      <Side plates={loaded} toGo={toGo} collarX={collarL - 4 * scale} dir={-1} cy={cy} scale={scale} />
      <Side plates={loaded} toGo={toGo} collarX={collarR + 4 * scale} dir={1} cy={cy} scale={scale} />
    </svg>
  );
}

/**
 * The goal bar: best bench e1RM against a 225 lb goal, drawn as a loaded barbell.
 * Solid plates are what you lift now; outlined plates are what's left to the goal.
 */
export function GoalBar({ variant }: { variant: 'full' | 'slim' }) {
  const unit = useUnit();
  const best = useBenchBest();
  if (best === null) return null;
  const toGo = Math.max(0, GOAL_LB - best);
  const label = `Bench, best estimated 1-rep max ${weight(best, unit, 0)} of a ${weight(GOAL_LB, unit, 0)} goal; ${
    toGo ? `${weight(toGo, unit, 0)} to go` : 'goal reached'
  }.`;

  if (variant === 'slim') {
    return (
      <div className="goal-slim" role="img" aria-label={label}>
        <Barbell currentLb={best} width={200} height={44} scale={0.45} />
        <span>
          Bench <strong>{weight(best, unit, 0)}</strong> of {weight(GOAL_LB, unit, 0)}
        </span>
      </div>
    );
  }
  return (
    <section className="goal" role="img" aria-label={label}>
      <div className="goal-numbers">
        <span className="t-caption secondary">Bench, best e1RM</span>
        <span className="goal-big">
          {weight(best, unit, 0).replace(/ \w+$/, '')} <small>{unit}</small>
        </span>
        <span>
          Goal {weight(GOAL_LB, unit, 0)} · {toGo ? `${weight(toGo, unit, 0)} to go` : 'reached'}
        </span>
      </div>
      <div className="goal-svg">
        <Barbell currentLb={best} width={520} height={100} scale={1} />
      </div>
    </section>
  );
}
