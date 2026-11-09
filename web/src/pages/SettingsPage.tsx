import { useId, useState, type FormEvent } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Section } from '@/components/Section';
import { Segmented } from '@/components/Segmented';
import { QueryView } from '@/components/States';
import { useMe, useUpdateSettings } from '@/hooks/queries';
import { useTitle } from '@/hooks/useTitle';
import { errorMessage } from '@/lib/api';
import { deviceTimeZone, fromLb, num, toLb } from '@/lib/format';
import type { Me, Unit } from '@/lib/types';
import { AliasesTool, ExportTool, UsageTool } from '@/tools/ToolViews';

function BarWeight({ me }: { me: Me }) {
  const unit = me.settings.set_unit;
  const [value, setValue] = useState(num(fromLb(me.settings.bar_lb, unit)));
  const update = useUpdateSettings();
  const id = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = Number(value);
    if (v >= 0) update.mutate({ bar_lb: Math.round(toLb(v, unit) * 10) / 10 });
  }
  return (
    <form className="stack-2" onSubmit={submit}>
      <div className="form-row">
        <div className="field field-fixed">
          <label htmlFor={id}>Bar weight ({unit})</label>
          <input id={id} className="input mono" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button type="submit" loading={update.isPending}>
          Save bar weight
        </Button>
      </div>
      <p className="hint">What “bar” means in a set, like 8x bar bench.</p>
      {update.error ? <p className="error-text" role="alert">{errorMessage(update.error)}</p> : null}
    </form>
  );
}

function TimeZone({ me }: { me: Me }) {
  const update = useUpdateSettings();
  const browser = deviceTimeZone();
  return (
    <div className="stack-3">
      <p>
        Days start at midnight in <span className="semibold">{me.settings.tz_name}</span>.
      </p>
      {browser !== me.settings.tz_name ? (
        <Button loading={update.isPending} onClick={() => update.mutate({ tz_name: browser })}>
          Use {browser}
        </Button>
      ) : null}
      {update.error ? <p className="error-text" role="alert">{errorMessage(update.error)}</p> : null}
    </div>
  );
}

export function SettingsPage() {
  useTitle('Settings');
  const me = useMe();
  const update = useUpdateSettings();
  const { signOut } = useAuth();
  return (
    <main className="main" id="main">
      <div className="page-header">
        <h1 className="t-title">Settings</h1>
      </div>
      <QueryView query={me}>
        {(m) => (
          <>
            <Section title="Units">
              <div className="stack-3">
                <p className="t-label secondary">Weights without a unit are read in this unit, and shown in it.</p>
                <Segmented<Unit>
                  label="Units"
                  value={m.settings.set_unit}
                  onChange={(u) => update.mutate({ set_unit: u })}
                  options={[
                    { value: 'lb', label: 'lb' },
                    { value: 'kg', label: 'kg' },
                  ]}
                />
                <BarWeight key={`${m.settings.set_unit}-${m.settings.bar_lb}`} me={m} />
              </div>
            </Section>
            <Section title="Time zone">
              <TimeZone me={m} />
            </Section>
            <Section title="Aliases">
              <AliasesTool />
            </Section>
            <Section title="Export">
              <ExportTool />
            </Section>
            <Section title="AI usage">
              <UsageTool />
            </Section>
            <Section title="Account">
              <div className="stack-3">
                <p>
                  {m.is_demo
                    ? 'You’re using the demo account. Its data is made up and gets reset.'
                    : `Signed in as ${m.email ?? m.display_name ?? 'you'}.`}
                </p>
                <div>
                  <Button onClick={() => void signOut()}>Sign out</Button>
                </div>
              </div>
            </Section>
          </>
        )}
      </QueryView>
    </main>
  );
}
