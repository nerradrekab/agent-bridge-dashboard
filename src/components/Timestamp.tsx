import type { SourceTimestamp } from '../domain/types';
import { formatDateOnly, formatDateTime, formatRelative } from '../lib/format';
import { useNow } from '../lib/now';

interface Props {
  value: SourceTimestamp | null | undefined;
  /** Hide the relative part ("5 min ago") in dense contexts. */
  relative?: boolean;
  /** Label for empty cells, e.g. "not recorded". */
  emptyLabel?: string;
}

/**
 * Shows a source timestamp in Europe/London with the zone name. The tooltip
 * carries the UTC ISO value and the raw Sheet text so nothing is hidden by
 * formatting. Unparseable cells show "Unknown" plus the raw text.
 */
export function Timestamp({ value, relative = true, emptyLabel = '—' }: Props) {
  const now = useNow();
  if (!value || (!value.iso && !value.raw)) {
    return <span className="text-faint">{emptyLabel}</span>;
  }
  if (!value.iso) {
    return (
      <span title={`Could not parse this date.\nSource text: “${value.raw}”`} className="inline-flex flex-wrap gap-x-1.5">
        <span style={{ color: 'var(--st-josh)' }}>Unknown</span>
        <span className="text-muted">“{value.raw}”</span>
      </span>
    );
  }
  if (value.precision === 'day') {
    return (
      <time
        dateTime={value.iso.slice(0, 10)}
        title={[`Date only; no time recorded`, value.raw ? `Source text: “${value.raw}”` : null].filter(Boolean).join('\n')}
        className="tabular whitespace-nowrap"
      >
        {formatDateOnly(value.iso)}
      </time>
    );
  }
  const title = [`UTC: ${value.iso}`, value.raw ? `Source text: “${value.raw}”` : null].filter(Boolean).join('\n');
  return (
    <time dateTime={value.iso} title={title} className="tabular whitespace-nowrap">
      {formatDateTime(value.iso)}
      {relative && <span className="ml-1.5 text-faint">{formatRelative(value.iso, now)}</span>}
    </time>
  );
}

/** Convenience for server-generated ISO strings (no raw Sheet text). */
export function IsoTime({ iso, relative = true }: { iso: string | null; relative?: boolean }) {
  return <Timestamp value={iso ? { iso, raw: null } : null} relative={relative} emptyLabel="Unknown" />;
}
