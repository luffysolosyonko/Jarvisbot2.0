export function Stat({
  label,
  value,
  note,
  noteTone,
}: {
  label: string;
  value: string;
  note?: string;
  noteTone?: 'success' | 'danger' | 'secondary';
}) {
  return (
    <div className="stack-1">
      <div className="t-caption secondary">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className={`t-caption ${noteTone ?? 'secondary'}`}>{note}</div> : null}
    </div>
  );
}
