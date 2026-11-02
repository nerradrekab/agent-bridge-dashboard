import { ageMinutes } from '../domain/derive';
import type { ResponseMeta } from '../domain/types';
import { config } from '../lib/config';
import { formatDateTime, formatMinutes } from '../lib/format';
import { useNow } from '../lib/now';

export type Freshness = { state: 'fresh'; ageMin: number } | { state: 'stale'; ageMin: number } | { state: 'unknown' };

export function assessFreshness(meta: ResponseMeta, now: Date, staleAfterMinutes = config.staleAfterMinutes): Freshness {
  const age = ageMinutes(meta.sourceUpdatedAt, now);
  if (age === null) return { state: 'unknown' };
  return age > staleAfterMinutes ? { state: 'stale', ageMin: age } : { state: 'fresh', ageMin: age };
}

function Banner({ tone, glyph, children }: { tone: string; glyph: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
      style={{ borderColor: `color-mix(in srgb, ${tone} 50%, transparent)`, background: `color-mix(in srgb, ${tone} 8%, transparent)` }}
    >
      <span aria-hidden="true" style={{ color: tone }} className="font-semibold">
        {glyph}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Demo notice, staleness and server warnings for one response. */
export function FreshnessBanner({ meta }: { meta: ResponseMeta }) {
  const now = useNow();
  const f = assessFreshness(meta, now);
  const warnings = meta.warnings.filter((w) => w.code !== 'DEMO_DATA');
  return (
    <div className="mb-4 space-y-2" data-testid="freshness">
      {meta.isDemo && (
        <Banner tone="var(--demo)" glyph="◆">
          <strong className="font-semibold">Demo data.</strong> Every record on this page is fictional. No live bridge
          records are loaded.
        </Banner>
      )}
      {f.state === 'stale' && (
        <Banner tone="var(--st-blocked)" glyph="⚠">
          <strong className="font-semibold">Stale source.</strong> The source was last modified{' '}
          {formatMinutes(f.ageMin)} ago ({formatDateTime(meta.sourceUpdatedAt!)}), which is older than the{' '}
          {formatMinutes(config.staleAfterMinutes)} threshold.
        </Banner>
      )}
      {f.state === 'unknown' && (
        <Banner tone="var(--st-josh)" glyph="?">
          <strong className="font-semibold">Source age unknown.</strong> The API did not report when the source was last
          modified, so freshness cannot be confirmed.
        </Banner>
      )}
      {warnings.map((w, i) => (
        <Banner key={i} tone="var(--st-josh)" glyph="!">
          <span className="font-mono text-[11px] text-muted">{w.code}</span> {w.message}
          {w.ref && (
            <span className="text-muted">
              {' '}
              ({w.ref.tab}
              {w.ref.row ? `, row ${w.ref.row}` : ''})
            </span>
          )}
        </Banner>
      ))}
    </div>
  );
}
