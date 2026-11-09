import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { IconButton } from '@/components/Button';
import { TrendChart } from '@/components/Charts';
import { ICON } from '@/components/icons';
import { Section } from '@/components/Section';
import { Stat } from '@/components/Stat';
import { QueryView } from '@/components/States';
import { useExercise, useUnit } from '@/hooks/queries';
import { exerciseName, shortDate, signedWeight, weight } from '@/lib/format';
import { setRefText } from '@/lib/describe';
import { RepTargets, TargetForm } from '@/tools/ToolViews';

/** One lift: e1RM chart with forecast, best sets, rep targets and "when will I hit…". */
export function LiftPage() {
  const { name = '' } = useParams();
  const unit = useUnit();
  const navigate = useNavigate();
  const q = useExercise(name);
  return (
    <main className="main" id="main">
      <div className="page-header" style={{ justifyContent: 'flex-start' }}>
        <IconButton label="Back to progress" onClick={() => navigate('/progress')}>
          <ArrowLeft {...ICON} />
        </IconButton>
        <h1 className="t-title">{exerciseName(name)}</h1>
      </div>
      <QueryView query={q} lines={8}>
        {(d) => (
          <>
            <Section title="Estimated 1-rep max">
              <div className="stack-4">
                <div className="stats">
                  <Stat label="Latest session" value={weight(d.summary.latest_e1rm, unit, 0)} />
                  <Stat
                    label="Best"
                    value={weight(d.summary.best_e1rm, unit, 0)}
                    note={d.summary.e1rm_change !== null ? `${signedWeight(d.summary.e1rm_change, unit, 0)} since start` : undefined}
                    noteTone={d.summary.e1rm_change !== null && d.summary.e1rm_change > 0 ? 'success' : 'secondary'}
                  />
                </div>
                <TrendChart
                  main={d.sessions}
                  projection={d.forecast?.projection}
                  unit={unit}
                  mainLabel="Best set per session"
                  label={`Estimated 1-rep max for ${name} over ${d.sessions.length} sessions${d.forecast ? ', with a forecast' : ''}.`}
                />
                {d.forecast ? (
                  <p className="t-label">
                    Trend {signedWeight(d.forecast.projection.slope_per_week, unit)} a week over {d.forecast.projection.points} sessions. About{' '}
                    {weight(d.forecast.projection.pred, unit, 0)} by {shortDate(d.forecast.projection.target_date)}.
                  </p>
                ) : (
                  <p className="t-label secondary">A forecast needs at least 4 sessions over 2 or more weeks.</p>
                )}
              </div>
            </Section>
            <Section title="Best sets">
              <div className="stats">
                <Stat label="Highest e1RM" value={setRefText(d.best_set, unit)} note={d.best_set ? shortDate(d.best_set.date) : undefined} />
                <Stat label="Heaviest" value={setRefText(d.heaviest_set, unit)} note={d.heaviest_set ? shortDate(d.heaviest_set.date) : undefined} />
              </div>
            </Section>
            <Section title="Rep targets">
              <RepTargets d={d} unit={unit} />
            </Section>
            <Section title="When will I hit a target?">
              <TargetForm name={d.summary.exercise} unit={unit} />
            </Section>
          </>
        )}
      </QueryView>
    </main>
  );
}
