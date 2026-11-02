import { Link } from 'react-router-dom';

interface Props {
  label: string;
  value: number;
  hint?: string;
  /** CSS colour; used only when value > 0 so zero reads as calm. */
  tone?: string;
  to?: string;
}

export function Kpi({ label, value, hint, tone, to }: Props) {
  const color = tone && value > 0 ? tone : undefined;
  const body = (
    <>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-none tabular" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-faint">{hint}</div>}
    </>
  );
  const cls = 'block rounded-lg border border-line bg-surface px-4 py-3';
  return to ? (
    <Link to={to} className={`${cls} hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
