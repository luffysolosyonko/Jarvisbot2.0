import { Link, useNavigate } from 'react-router';

import { TrendChart, WeeklyBars } from '@/components/Charts';
import { Section } from '@/components/Section';
import { Stat } from '@/components/Stat';
import { EmptyState, QueryView, SkeletonChart } from '@/components/States';
import { useDashboard, useUnit } from '@/hooks/queries';
import { useTitle } from '@/hooks/useTitle';
import { exerciseName, longDate, signedWeight, volume, weight } from '@/lib/format';

export function ProgressPage() {
  useTitle('Progress');
  const unit = useUnit();
  const q = useDashboard();
  const navigate = useNavigate();
  return (
    <main className="main" id="main">
      <div className="page-header">
        <h1 className="t-title">Progress</h1>
      </div>
      <QueryView query={q} skeleton={<SkeletonChart />}>
        {(d) => {
          const p = d.weight.projection;
          const setsDelta = d.week.sets - d.previous_week.sets;
          return (
            <>
            <div className="kpis" aria-label="This week at a glance">
              <Stat
                card
                label="Sets this week"
                value={`${d.week.sets} sets`}
                note={`${setsDelta > 0 ? '+' : setsDelta < 0 ? '−' : '±'}${Math.abs(setsDelta)} vs last week`}
              />
              <Stat card label="Volume this week" value={volume(d.week.volume_lb, unit)} note={`${d.week.sessions} sessions`} />
              <Stat card label="Body weight" value={p ? weight(p.now, unit) : '–'} note={p ? 'Latest, smoothed' : 'No weigh-ins yet'} />
              <Stat
                card
                label="Weight trend"
                value={p ? `${signedWeight(p.slope_per_week, unit)}/wk` : '–'}
                note={p ? `About ${weight(p.pred, unit)} by ${longDate(p.target_date)}` : undefined}
              />
            </div>
            <div className="dash-grid">
              <Section title="Body weight">
                {d.weight.points.length < 2 ? (
                  <EmptyState message="Log weigh-ins like 182.4 in Weight mode to see the trend." actionLabel="Open notebook" onAction={() => navigate('/')} />
                ) : (
                  <div className="stack-3">
                    <TrendChart
                      main={d.weight.points}
                      avg={d.weight.average_7d}
                      projection={p}
                      unit={unit}
                      mainLabel="Weigh-ins"
                      avgLabel="7-day average"
                      mainStyle="dots"
                      label={`Body weight over the last 90 days: ${d.weight.points.length} weigh-ins, with a 7-day average${p ? ' and a forecast' : ''}.`}
                    />
                    {p ? (
                      <p className="t-label">
                        Latest {weight(p.now, unit)}. Trend {signedWeight(p.slope_per_week, unit)} a week; about {weight(p.pred, unit)} by{' '}
                        {longDate(p.target_date)} ({weight(p.low, unit)} to {weight(p.high, unit)}).
                      </p>
                    ) : null}
                  </div>
                )}
              </Section>

              <Section title="Sets per week">
                <div className="stack-2">
                  <p className="help">This week is highlighted.</p>
                  <WeeklyBars weeks={d.weekly} />
                </div>
              </Section>

              <Section title="Top lifts" className="span-2">
                {!d.top_lifts.length ? (
                  <EmptyState message="Log sets like 8x 160lb bench to see your top lifts." actionLabel="Open notebook" onAction={() => navigate('/')} />
                ) : (
                  <div className="stack-2">
                    <table className="table roomy">
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
                            <td className={`num ${l.e1rm_change && l.e1rm_change > 0 ? 'success' : l.e1rm_change && l.e1rm_change < 0 ? 'danger' : ''}`}>
                              {l.e1rm_change === null ? '–' : signedWeight(l.e1rm_change, unit, 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hint">Estimated 1-rep max (Epley), latest session. Change is since your first sessions.</p>
                  </div>
                )}
              </Section>
            </div>
            </>
          );
        }}
      </QueryView>
    </main>
  );
}
