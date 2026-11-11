import { Link, useNavigate } from 'react-router';

import { Section } from '@/components/Section';
import { EmptyState, QueryView, SkeletonChart } from '@/components/States';
import { WeightChart } from '@/components/WeightChart';
import { useDashboard, useUnit } from '@/hooks/queries';
import { useTitle } from '@/hooks/useTitle';
import { exerciseName, fromLb, longDate, num, parseDate, signedWeight, unitLabel, weight } from '@/lib/format';
import type { Point } from '@/lib/types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Whether the 7-day average moved over the last week: "flat" within half a pound. */
function direction(avg: Point[]): 'up' | 'down' | 'flat' {
  if (avg.length < 2) return 'flat';
  const last = avg[avg.length - 1];
  const weekAgo = parseDate(last.date).getTime() - 7 * 86_400_000;
  const before = [...avg].reverse().find((p) => parseDate(p.date).getTime() <= weekAgo) ?? avg[0];
  const diff = last.value - before.value;
  return Math.abs(diff) < 0.5 ? 'flat' : diff > 0 ? 'up' : 'down';
}

function weekLabel(startIso: string): string {
  const d = parseDate(startIso);
  return `WEEK OF ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function ProgressPage() {
  useTitle('Progress');
  const unit = useUnit();
  const q = useDashboard();
  const navigate = useNavigate();

  return (
    <main className="main" id="main">
      <div className="page-header">
        <h1 className="t-title">Progress</h1>
        {q.data ? <span className="caps">{weekLabel(q.data.week.start)}</span> : null}
      </div>
      <QueryView query={q} skeleton={<SkeletonChart />}>
        {(d) => {
          const pts = d.weight.points;
          const latest = pts[pts.length - 1];
          const avg = d.weight.average_7d;
          const avgNow = avg[avg.length - 1];
          const delta = d.week.sets - d.previous_week.sets;
          const p = d.weight.projection;
          return (
            <>
              <section className="section" aria-labelledby="bw-label">
                <p id="bw-label" className="caps">
                  Body weight
                </p>
                {latest ? (
                  <>
                    <p className="hero-number">
                      {num(fromLb(latest.value, unit))}
                      <small> {unitLabel(unit)}</small>
                    </p>
                    <p className="secondary">Latest weigh-in, {longDate(latest.date)}.</p>
                    {avgNow ? (
                      <p className="mono t-label">
                        7-day avg {num(fromLb(avgNow.value, unit))} · {direction(avg)}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {pts.length < 2 ? (
                  <EmptyState
                    message="Log weigh-ins like 182.4 in Weight mode to see the trend."
                    actionLabel="Open notebook"
                    onAction={() => navigate('/')}
                  />
                ) : (
                  <div className="stack-2 chart-block">
                    <WeightChart
                      points={pts}
                      avg={avg}
                      projection={p}
                      unit={unit}
                      label={`Body weight over the last 90 days: ${pts.length} weigh-ins, with a 7-day average${p ? ' and a forecast' : ''}.`}
                    />
                    {p ? (
                      <p className="t-label secondary">
                        Trend {signedWeight(p.slope_per_week, unit)} a week; about {weight(p.pred, unit)} by {longDate(p.target_date)} (
                        {weight(p.low, unit)} to {weight(p.high, unit)}).
                      </p>
                    ) : null}
                  </div>
                )}
              </section>

              <div className="ruled-stats section">
                <div>
                  <span className="value">{d.week.sets}</span>
                  <span className="caps">Sets this week</span>
                  <span className="t-caption secondary mono">
                    {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
                    {Math.abs(delta)} vs last week
                  </span>
                </div>
                <div>
                  <span className="value">{d.week.sessions}</span>
                  <span className="caps">Sessions</span>
                </div>
              </div>

              <Section title="Top lifts">
                {!d.top_lifts.length ? (
                  <EmptyState message="Log sets like 8x 160lbs bench to see your top lifts." actionLabel="Open notebook" onAction={() => navigate('/')} />
                ) : (
                  <div className="stack-2">
                    <table className="table">
                      <caption className="visually-hidden">Top lifts by estimated 1-rep max</caption>
                      <thead>
                        <tr>
                          <th scope="col">Exercise</th>
                          <th scope="col" className="num">
                            e1RM
                          </th>
                          <th scope="col" className="num">
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.top_lifts.map((l) => (
                          <tr key={l.exercise}>
                            <td>
                              <Link to={`/progress/${encodeURIComponent(l.exercise)}`}>{exerciseName(l.exercise)}</Link>
                            </td>
                            <td className="num">{weight(l.latest_e1rm, unit, 0)}</td>
                            <td className="num">{l.e1rm_change === null ? '–' : signedWeight(l.e1rm_change, unit, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="t-caption secondary">Estimated 1-rep max (Epley), latest session. Change is since your first sessions.</p>
                  </div>
                )}
              </Section>
            </>
          );
        }}
      </QueryView>
    </main>
  );
}
