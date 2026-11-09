export function Stat({
  label,
  value,
  note,
  noteTone,
  card = false,
}: {
  label: string;
  value: string;
  note?: string;
  noteTone?: 'success' | 'danger' | 'secondary';
  card?: boolean;
}) {
  return (
    <div className={card ? 'stack-1 stat-card' : 'stack-1'}>
      <div className="t-label secondary">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className={`t-label ${noteTone ?? 'secondary'}`}>{note}</div> : null}
    </div>
  );
}
