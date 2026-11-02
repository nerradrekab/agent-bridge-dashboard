import { useId, type ReactNode } from 'react';

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div role="search" className="flex flex-wrap items-end gap-2">
      {children}
    </div>
  );
}

const inputCls =
  'h-8 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint hover:border-line-strong';

export function SearchInput({
  value,
  onChange,
  label = 'Search',
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-1 sm:max-w-[320px]">
      <label htmlFor={id} className="text-[11px] text-muted">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ResultCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <p className="text-[12px] text-muted tabular" aria-live="polite">
      Showing {shown} of {total} {noun}
    </p>
  );
}
