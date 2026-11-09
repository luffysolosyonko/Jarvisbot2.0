import { exerciseName, weight } from '@/lib/format';
import type { ParsedSet, Unit } from '@/lib/types';

/** The weight as logged: "~" marks an estimate, "uw" is bodyweight, "each" is per hand. */
function setWeight(s: ParsedSet, unit: Unit): string {
  if (s.bodyweight && s.weight_lb === null) return 'uw';
  const w = `${s.estimated ? '~' : ''}${weight(s.weight_lb, unit)}`;
  return s.per_hand ? `${w} each` : w;
}

/** "3 ✓ · 1 ✗": good reps, then failed ones (only when there are any). */
function Done({ s }: { s: ParsedSet }) {
  return (
    <>
      {s.good_reps} ✓
      {s.failed_reps ? (
        <>
          {' · '}
          <span className="fail-mark">{s.failed_reps} ✗</span>
        </>
      ) : null}
    </>
  );
}

/** Parsed sets grouped by exercise, three columns so it never scrolls sideways. */
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
    <table className="table">
      {caption ? <caption className="visually-hidden">{caption}</caption> : null}
      <thead>
        <tr>
          <th scope="col">Exercise</th>
          <th scope="col" className="num">
            Reps
          </th>
          <th scope="col" className="num">
            Weight
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.flatMap((g, gi) =>
          g.rows.map((s, i) => (
            <tr key={`${gi}-${i}`}>
              <td>{i === 0 ? <span className="semibold">{exerciseName(g.name)}</span> : null}</td>
              <td className="num nowrap" aria-label={`${s.good_reps} good${s.failed_reps ? `, ${s.failed_reps} failed` : ''}`}>
                <Done s={s} />
              </td>
              <td className="num nowrap">{setWeight(s, unit)}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}
