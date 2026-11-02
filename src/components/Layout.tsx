import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useDataSource } from '../data/hooks';
import { useLatestMeta } from '../data/meta';
import { formatDateTime } from '../lib/format';
import { applyTheme, readTheme, type Theme } from '../lib/theme';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/tasks', label: 'Task board' },
  { to: '/agents', label: 'Agents' },
  { to: '/messages', label: 'Messages' },
  { to: '/deliveries', label: 'Delivery health' },
  { to: '/approvals', label: 'Approvals', note: 'read-only' },
  { to: '/connections', label: 'Connections' },
];

export function DemoBadge() {
  return (
    <span
      data-testid="demo-badge"
      title="Fictional demo data from the mock adapter. No live bridge records are loaded."
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider"
      style={{ color: 'var(--demo)', borderColor: 'var(--demo)' }}
    >
      ◆ DEMO DATA
    </span>
  );
}

export function Layout() {
  const ds = useDataSource();
  const qc = useQueryClient();
  const meta = useLatestMeta();
  const fetching = useIsFetching() > 0;
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => setNavOpen(false), [location.pathname]);

  // Before any response arrives, fall back to the adapter kind so the badge never flickers off in demo mode.
  const isDemo = meta?.isDemo ?? ds.kind === 'mock';

  return (
    <div className="flex h-full min-h-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <nav
        id="sidebar"
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 w-[220px] shrink-0 border-r border-line bg-surface md:static md:block ${navOpen ? 'block' : 'hidden'}`}
      >
        <div className="border-b border-line px-4 py-3.5">
          <div className="text-[13px] font-semibold leading-tight">Agent Bridge</div>
          <div className="text-[11px] text-muted">Control Centre · read-only</div>
        </div>
        <ul className="space-y-0.5 p-2">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-md px-3 py-1.5 text-[13px] ${
                    isActive ? 'bg-surface-3 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                  }`
                }
              >
                {n.label}
                {n.note && <span className="text-[10px] text-faint">{n.note}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="px-4 pt-2 text-[11px] leading-relaxed text-faint">
          The bridge Sheet remains the source of truth. This console cannot change it.
        </p>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
          <button
            type="button"
            className="rounded-md border border-line px-2 py-1 text-[13px] md:hidden"
            aria-controls="sidebar"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
          >
            ☰ <span className="sr-only">Menu</span>
          </button>
          {isDemo && <DemoBadge />}
          <span className="text-[12px] text-muted">
            {meta ? (
              <>
                Generated <span className="tabular text-fg">{formatDateTime(meta.generatedAt)}</span>
              </>
            ) : (
              'Not loaded yet'
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void qc.invalidateQueries()}
              disabled={fetching}
              className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:bg-surface-2 disabled:opacity-60"
              title="Re-read data from the current source. This does not trigger any agent or Sheet action."
            >
              {fetching ? 'Refreshing…' : '↻ Refresh'}
            </button>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:bg-surface-2"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
