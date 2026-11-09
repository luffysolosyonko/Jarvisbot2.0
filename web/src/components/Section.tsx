import type { ReactNode } from 'react';

/** A section: a bold 15px label (and an optional action), then the content. No card. */
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
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
