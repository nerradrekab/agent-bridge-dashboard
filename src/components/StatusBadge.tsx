import { CATEGORY_META, classifyStatus, type StatusCategory } from '../domain/status';

const VAR: Record<StatusCategory, string> = {
  done: 'var(--st-done)',
  active: 'var(--st-active)',
  waiting: 'var(--st-waiting)',
  proposed: 'var(--st-proposed)',
  paused: 'var(--st-paused)',
  archived: 'var(--st-archived)',
  blocked: 'var(--st-blocked)',
  failed: 'var(--st-failed)',
  'needs-josh': 'var(--st-josh)',
  unclassified: 'var(--st-unclassified)',
};

export function categoryColor(c: StatusCategory): string {
  return VAR[c];
}

interface Props {
  raw: string | null | undefined;
  /** Show only the category pill (for dense contexts); raw text goes in the tooltip. */
  compact?: boolean;
}

/**
 * Always shows the raw Sheet text. The category glyph/colour is secondary and
 * labelled as an interpretation in the tooltip.
 */
export function StatusBadge({ raw, compact = false }: Props) {
  const s = classifyStatus(raw);
  const meta = CATEGORY_META[s.category];
  const color = VAR[s.category];
  const title = [
    `Interpreted as: ${meta.label} — ${meta.description}`,
    s.ambiguous ? `Also matches: ${s.matches.slice(1).map((m) => CATEGORY_META[m].label).join(', ')}` : null,
    `Source text: “${s.raw || '(empty)'}”`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span className="inline-flex max-w-full items-start gap-1.5" title={title} data-category={s.category}>
      <span
        aria-hidden="true"
        className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-semibold leading-none"
        style={{
          color,
          border: `1px ${s.category === 'unclassified' ? 'dashed' : 'solid'} ${color}`,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
        }}
      >
        {meta.glyph}
      </span>
      <span className="sr-only">{meta.label}: </span>
      {compact ? (
        <span className="text-[13px]" style={{ color }}>
          {meta.label}
        </span>
      ) : (
        <span className="min-w-0 text-[13px] leading-snug text-fg">
          {s.raw || <span className="text-faint italic">No status</span>}
          {s.ambiguous && (
            <span className="ml-1 text-[11px] text-faint" aria-label="mixed status text">
              (mixed)
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function CategoryPill({ category, count }: { category: StatusCategory; count?: number }) {
  const meta = CATEGORY_META[category];
  const color = VAR[category];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span aria-hidden="true" style={{ color }} className="font-semibold">
        {meta.glyph}
      </span>
      {meta.label}
      {count !== undefined && <span className="tabular text-fg">{count}</span>}
    </span>
  );
}
