import { exerciseName, weight } from '@/lib/format';
import type { ParsedSet, Unit } from '@/lib/types';

/** The weight as logged: "~" marks an estimate, "uw" is bodyweight, "each" is per hand. */
function setWeight(s: ParsedSet, unit: Unit): string {
  if (s.bodyweight && s.weight_lb === null) return 'uw';
  const w = `${s.estimated ? '~' : ''}${weight(s.weight_lb, unit)}`;
  return s.per_hand ? `${w} each` : w;
}

/** Parsed sets grouped by exercise: reps, good, failed and weight. */
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
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((g, gi) =>
            g.rows.map((s, i) => (
              <tr key={`${gi}-${i}`}>
                <td>{i === 0 ? <span className="semibold">{exerciseName(g.name)}</span> : null}</td>
                <td className="num">{s.reps}</td>
                <td className="num">{s.good_reps}</td>
                <td className={`num ${s.failed_reps ? 'danger' : ''}`}>{s.failed_reps || '–'}</td>
                <td className="num">{setWeight(s, unit)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
