import type { ReactNode } from 'react';

/** A flat section: a hairline rule above (except the first), a heading, then content. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="row-between section-head">
        <h2 className="t-heading">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
