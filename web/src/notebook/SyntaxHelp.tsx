/** The bot's /howto cheat sheet: every format with an example (from the Jarvis Bot README). */
const WORKOUT: [string, string][] = [
  ['8x 160lb bench', '8 reps, 160 lb, bench (write lb or kg; kg is converted)'],
  ['8x5f 25kg rear delt fly', '8 good reps, then 5f = 5 reps gone to failure'],
  ['2xf 200lb bench', '2 tried, the last failed: 1 good + 1 failed'],
  ['20x ? db traps', '? on its own: the weight is unknown'],
  ['8x 75kg? bench', '? after a weight: not the exact weight (an estimate)'],
  ['10x uw dips', 'uw = unweighted: your latest weigh-in is the load'],
  ['8x bar bench', 'just the bar (45 lb)'],
  ['8x 20-25lb curl', 'a range is an estimate: midpoint used'],
  ['12x 60 or 50kg bench', 'unsure which: the midpoint, marked estimated'],
  ['8x', 'reps only: the same weight and exercise as the set above'],
  ['30x ^', 'any number of reps, at the same weight and exercise as the set above'],
  ['2x1x1x1xf 85kg bench', 'several sets on one line; each f is one failed attempt'],
  ['5x 155lb 2x1x1xf bench', 'a first set, then more at the same weight'],
  ['2', 'a bare number: the same set again'],
  ['8x 160lb', 'no name: the last exercise named that day'],
];

const WEIGHT: [string, string][] = [
  ['182lb', '182 lb'],
  ['83.9kg', '185.0 lb'],
  ['182.4 different scale', 'the words are kept as a note'],
];

function Table({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="table">
      <caption className="t-heading">
        {caption}
      </caption>
      <thead>
        <tr>
          <th scope="col">You type</th>
          <th scope="col">It records</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([type, rec]) => (
          <tr key={type}>
            <td className="tnum nowrap">{type}</td>
            <td>{rec}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SyntaxHelp() {
  return (
    <div className="stack-4">
      <p className="t-label secondary">One set per line, the way you’d write it in your notes.</p>
      <Table caption="Workout" rows={WORKOUT} />
      <Table caption="Weight" rows={WEIGHT} />
    </div>
  );
}
