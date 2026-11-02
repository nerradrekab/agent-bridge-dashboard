import type { ReactNode } from 'react';
import type { SourceRef } from '../domain/types';

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {aside && <div className="text-[12px] text-muted">{aside}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Horizontal scroll stays inside the table container, never the page. */
export function TableScroll({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface"
    >
      {children}
    </div>
  );
}

export function SourceLabel({ source }: { source: SourceRef }) {
  return (
    <span className="font-mono text-[11px] text-faint">
      {source.tab}
      {source.row !== null ? ` · row ${source.row}` : ''}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px]">{children}</span>;
}

/** Keyboard + click activation for clickable table rows. */
export function rowProps(onOpen: () => void, label: string) {
  return {
    tabIndex: 0,
    'aria-label': label,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
  };
}
