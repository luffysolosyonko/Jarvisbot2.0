import type { ReactNode } from 'react';

/** A card: a header bar with the title (and an optional action), then the content. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={['section', className].filter(Boolean).join(' ')}>
      <div className="section-head">
        <h2 className="t-heading">{title}</h2>
        {action}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}
