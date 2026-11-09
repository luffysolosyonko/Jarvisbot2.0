import { exerciseName, weight } from '@/lib/format';
import type { ParsedSet, Unit } from '@/lib/types';

function flags(s: ParsedSet): string {
  const f = [s.estimated && 'est', s.bodyweight && 'uw', s.per_hand && 'each hand'].filter(Boolean);
  return f.length ? f.join(', ') : '–';
}

/** Parsed sets grouped by exercise: reps, good, failed, weight, flags. */
export function SetRows({ sets, unit, caption }: { sets: ParsedSet[]; unit: Unit; caption?: string }) {
  if (!sets.length) return null;
  const groups: { name: string | null; rows: ParsedSet[] }[] = [];
  for (const s of sets) {
    const name = s.matched_exercise ?? s.exercise;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.rows.push(s);
    else groups.push({ name, rows: [s] });
  }
  return (
    <div className="table-wrap">
      <table className="table">
        {caption ? <caption className="visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col">Exercise</th>
            <th scope="col" className="num">Reps</th>
            <th scope="col" className="num">Good</th>
            <th scope="col" className="num">Failed</th>
            <th scope="col" className="num">Weight</th>
            <th scope="col" className="flags">Flags</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((g) =>
            g.rows.map((s, i) => (
              <tr key={`${s.idx}`}>
                <td>{i === 0 ? <span className="semibold">{exerciseName(g.name)}</span> : null}</td>
                <td className="num">{s.reps}</td>
                <td className="num">{s.good_reps}</td>
                <td className={`num ${s.failed_reps ? 'danger' : ''}`}>{s.failed_reps || '–'}</td>
                <td className="num">{s.bodyweight && s.weight_lb === null ? 'uw' : weight(s.weight_lb, unit)}</td>
                <td className="flags">{flags(s)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
