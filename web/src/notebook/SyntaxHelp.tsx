/** The bot's /howto cheat sheet: every format with an example (from the Jarvis Bot README). */
const WORKOUT: [string, string][] = [
  ['8x 160lb bench', '8 reps, 160 lb, bench'],
  ['12x 25kg rear delt fly', '12 reps, 55.1 lb (kg is converted)'],
  ['12x1f 25kg rear delt fly', 'f = failure: 12 good reps + 1 failed'],
  ['8x5f 25kg rear delt fly', '8 good reps + 5 failed'],
  ['2xf 200lb bench', '2 tried, the last failed: 1 good + 1 failed'],
  ['8x ?70/80kg bench', '? = estimate: midpoint of the range, shown as ~165.3 lb'],
  ['20x ? db traps', 'unknown weight'],
  ['25x 15kg each hand shrug', 'weight per hand'],
  ['10x uw dips', 'uw = unweighted: your latest weigh-in is the load'],
  ['8x bar bench', 'just the bar (45 lb, set in Settings)'],
  ['8x 20-25lb curl', 'a range is an estimate: midpoint used'],
  ['12x 60 or 50kg bench', 'unsure which: the midpoint, marked estimated'],
  ['30x ^', 'same as the set above'],
  ['2x1x1x1xf 85kg bench', 'several sets on one line; each f is one failed attempt'],
  ['5x 155lb 2x1x1xf bench', 'a first set, then more at the same weight'],
  ['2', 'a bare number: the same set again'],
  ['8x 160lb', 'no name: the last exercise named that day'],
  ['incline bench', 'a name on its own labels the sets after it'],
];

const WEIGHT: [string, string][] = [
  ['182lb', '182 lb'],
  ['83.9kg', '185.0 lb'],
  ['182', 'no unit, 100+: lb'],
  ['86', 'no unit, under 100: kg'],
  ['182 4', 'a missed decimal point: 182.4 lb'],
  ['182.4 different scale', 'the words are kept as a note'],
  ['yesterday 182.6', 'logged for the previous day'],
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
            <td className="mono nowrap">{type}</td>
            <td>{rec}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['Enter'], 'Save the entry, or ask in Ask mode'],
  [['Shift', 'Enter'], 'New line (one set per line)'],
  [['Ctrl', 'K'], 'Jump to the input (Cmd+K on a Mac)'],
  [['1'], 'Workout mode (when not typing)'],
  [['2'], 'Weight mode'],
  [['3'], 'Ask mode'],
  [['Esc'], 'Close this panel or a menu'],
];

function Shortcuts() {
  return (
    <table className="table">
      <caption className="t-heading">Keyboard</caption>
      <thead>
        <tr>
          <th scope="col">Keys</th>
          <th scope="col">Does</th>
        </tr>
      </thead>
      <tbody>
        {SHORTCUTS.map(([keys, does]) => (
          <tr key={does}>
            <td className="nowrap">
              {keys.map((k, i) => (
                <span key={k}>
                  {i ? ' + ' : null}
                  <kbd className="kbd">{k}</kbd>
                </span>
              ))}
            </td>
            <td>{does}</td>
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
      <Shortcuts />
    </div>
  );
}
