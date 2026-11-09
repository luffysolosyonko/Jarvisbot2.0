import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';

import { TrendChart, WeeklyBars } from '@/components/Charts';
import { ICON } from '@/components/icons';
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

              <Section title="This week">
                <div className="stack-4">
                  <div className="stats">
                    <Stat
                      label="Sets"
                      value={`${d.week.sets} sets`}
                      note={`${setsDelta > 0 ? '+' : setsDelta < 0 ? '−' : '±'}${Math.abs(setsDelta)} sets vs last week`}
                    />
                    <Stat label="Volume" value={volume(d.week.volume_lb, unit)} note={`${d.week.sessions} sessions`} />
                  </div>
                  <WeeklyBars weeks={d.weekly} />
                </div>
              </Section>

              <Section title="Top lifts">
                {!d.top_lifts.length ? (
                  <EmptyState message="Log sets like 8x 160lb bench to see your top lifts." actionLabel="Open notebook" onAction={() => navigate('/')} />
                ) : (
                  <div className="stack-2">
                    <ul className="list">
                      {d.top_lifts.map((l) => (
                        <li key={l.exercise}>
                          <button type="button" className="list-row" onClick={() => navigate(`/progress/${encodeURIComponent(l.exercise)}`)}>
                            <span className="list-title">{exerciseName(l.exercise)}</span>
                            <span className="mono t-label">{weight(l.latest_e1rm, unit, 0)}</span>
                            <span
                              className={`mono t-label lift-change ${l.e1rm_change && l.e1rm_change > 0 ? 'success' : l.e1rm_change && l.e1rm_change < 0 ? 'danger' : 'secondary'}`}>
                              {l.e1rm_change === null ? '–' : signedWeight(l.e1rm_change, unit, 0)}
                            </span>
                            <ChevronRight {...ICON} className="secondary" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="hint">Estimated 1-rep max (Epley), latest session. Change is since your first sessions.</p>
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
