import { QueryBoundary } from '../components/QueryBoundary';
import { IsoTime } from '../components/Timestamp';
import { PageHeader, Section } from '../components/ui';
import { useDataSource, useHealth } from '../data/hooks';
import { SHEET_TABS, type BridgeHealth } from '../domain/types';
import { config } from '../lib/config';
import { formatMinutes } from '../lib/format';

const RESULT: Record<BridgeHealth['checks'][number]['result'], { glyph: string; color: string; label: string }> = {
  pass: { glyph: '✓', color: 'var(--st-done)', label: 'Pass' },
  warn: { glyph: '!', color: 'var(--st-josh)', label: 'Warning' },
  fail: { glyph: '✕', color: 'var(--st-failed)', label: 'Fail' },
  unknown: { glyph: '?', color: 'var(--st-waiting)', label: 'Unknown' },
};

type Ready = 'done' | 'pending' | 'blocked';
const READINESS: Array<{ item: string; state: Ready; note: string }> = [
  { item: 'Static frontend with mock adapter', state: 'done', note: 'This app.' },
  { item: 'Typed HTTP adapter and API contract', state: 'done', note: 'docs/API_CONTRACT.md' },
  { item: 'GitHub Pages workflow', state: 'pending', note: 'Present, manual trigger only. Pages not enabled.' },
  { item: 'Authenticated read-only proxy (e.g. Worker + Access)', state: 'pending', note: 'Phase 2 proposal; not built.' },
  { item: 'Read-only Sheet access for the proxy', state: 'blocked', note: 'Needs Josh’s explicit approval.' },
  { item: 'Row-mapping verification against the live Sheet', state: 'blocked', note: 'After proxy access is approved.' },
  { item: 'Audited approval / write workflow', state: 'blocked', note: 'Separate proposal; not authorised.' },
];
const READY_META: Record<Ready, { glyph: string; color: string; label: string }> = {
  done: { glyph: '✓', color: 'var(--st-done)', label: 'Done' },
  pending: { glyph: '○', color: 'var(--st-waiting)', label: 'Not started' },
  blocked: { glyph: '⊘', color: 'var(--st-blocked)', label: 'Awaiting approval' },
};

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-2 last:border-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="min-w-0 text-[13px] break-words">{children}</dd>
    </div>
  );
}

export function ConnectionsView() {
  const ds = useDataSource();
  const health = useHealth();
  return (
    <>
      <PageHeader title="Connections" description="Where this console’s data comes from and what is still to be built. Nothing here can be changed from the browser." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Data source">
          <dl>
            <Row k="Adapter">
              <span className="font-mono">{ds.kind}</span>{' '}
              {ds.kind === 'mock' ? (
                <span style={{ color: 'var(--demo)' }}>· fictional demo data</span>
              ) : (
                <span className="text-muted">· live via proxy API</span>
              )}
            </Row>
            <Row k="API base URL">
              {config.apiBaseUrl ? <span className="font-mono">{config.apiBaseUrl}</span> : <span className="text-faint">Not configured</span>}
            </Row>
            <Row k="Authentication">Proxy session cookie (credentials: include). The browser holds no keys.</Row>
            <Row k="Stale threshold">{formatMinutes(config.staleAfterMinutes)}</Row>
            <Row k="Display time zone">{config.displayTimeZone} (Sheet times are recorded in Dublin local time)</Row>
            <Row k="Client caching">In memory only; cleared when the tab closes.</Row>
            <Row k="Source of truth">
              Bridge Google Sheet ({SHEET_TABS.length} tabs: {SHEET_TABS.join(', ')}). Its address is deliberately not shown in this
              app.
            </Row>
          </dl>
        </Section>

        <Section title="Health checks" aside="from getHealth()">
          <QueryBoundary query={health} noBanner>
            {(h) => (
              <>
                <dl className="mb-3">
                  <Row k="API">{h.api === 'demo' ? 'Demo (no API contacted)' : 'Reachable'}</Row>
                  <Row k="Source">{h.source.name}</Row>
                  <Row k="Source last modified">
                    <IsoTime iso={h.source.lastModifiedAt} />
                  </Row>
                </dl>
                <ul className="space-y-2">
                  {h.checks.map((c) => {
                    const r = RESULT[c.result];
                    return (
                      <li key={c.name} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 text-[13px]">
                        <span aria-hidden="true" style={{ color: r.color }}>
                          {r.glyph}
                        </span>
                        <div>
                          <div>
                            {c.name} <span style={{ color: r.color }}>· {r.label}</span>
                          </div>
                          <div className="text-[12px] text-muted">{c.detail}</div>
                          <div className="text-[12px] text-faint">
                            Checked: <IsoTime iso={c.checkedAt} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </QueryBoundary>
        </Section>

        <Section title="Deployment">
          <dl>
            <Row k="Build mode">{import.meta.env.MODE}</Row>
            <Row k="Base path">
              <span className="font-mono">{import.meta.env.BASE_URL}</span>
            </Row>
            <Row k="Routing">Hash routes (#/tasks) so static hosting never 404s on refresh.</Row>
            <Row k="Hosting">GitHub Pages workflow present but manual-only; Pages is not enabled.</Row>
          </dl>
        </Section>

        <Section title="Integration readiness">
          <ul className="space-y-2">
            {READINESS.map((r) => {
              const m = READY_META[r.state];
              return (
                <li key={r.item} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 text-[13px]">
                  <span aria-hidden="true" style={{ color: m.color }}>
                    {m.glyph}
                  </span>
                  <div>
                    {r.item} <span style={{ color: m.color }}>· {m.label}</span>
                    <div className="text-[12px] text-muted">{r.note}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </>
  );
}
