import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, type ApiErrorKind } from '../data/source';
import type { Envelope, ResponseMeta } from '../domain/types';
import { FreshnessBanner } from './FreshnessBanner';

const ERROR_COPY: Record<ApiErrorKind, { title: string; body: string }> = {
  unauthorised: {
    title: 'Not signed in',
    body: 'The bridge API rejected this request because there is no valid session. Sign in through the API’s access gateway, then refresh.',
  },
  forbidden: {
    title: 'Access denied',
    body: 'You are signed in, but this account is not allowed to read bridge data.',
  },
  not_configured: {
    title: 'Live data source not configured',
    body: 'The HTTP adapter is selected but no valid HTTPS API base URL is set. Set VITE_API_BASE_URL or switch back to VITE_DATA_SOURCE=mock.',
  },
  source_unavailable: {
    title: 'Source unavailable',
    body: 'The API is reachable but could not read the bridge source. Nothing is shown rather than showing guesses.',
  },
  unavailable: {
    title: 'API unavailable',
    body: 'The bridge API returned an error.',
  },
  contract: {
    title: 'Unexpected response shape',
    body: 'The API response did not match the documented contract, so it was not displayed.',
  },
  network: {
    title: 'Network error',
    body: 'Could not reach the bridge API.',
  },
};

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const kind: ApiErrorKind = error instanceof ApiError ? error.kind : 'unavailable';
  const copy = ERROR_COPY[kind];
  const detail = error instanceof Error ? error.message : null;
  return (
    <div role="alert" data-error-kind={kind} className="rounded-lg border px-4 py-4" style={{ borderColor: 'var(--st-failed)' }}>
      <h2 className="text-[14px] font-semibold" style={{ color: 'var(--st-failed)' }}>
        <span aria-hidden="true">✕ </span>
        {copy.title}
      </h2>
      <p className="mt-1 text-[13px] text-muted">{copy.body}</p>
      {detail && <p className="mt-2 font-mono text-[12px] text-faint break-words">{detail}</p>}
      {onRetry && kind !== 'not_configured' && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-line px-3 py-1 text-[13px] hover:bg-surface-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 rounded-md bg-surface-2" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      {children && <p className="mt-1 text-[13px] text-muted">{children}</p>}
    </div>
  );
}

interface Props<T> {
  query: UseQueryResult<Envelope<T>, unknown>;
  /** When true for the loaded data, render the empty state instead. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyBody?: ReactNode;
  /** Hide the freshness banner (e.g. when a parent already shows it). */
  noBanner?: boolean;
  children: (data: T, meta: ResponseMeta) => ReactNode;
}

/** One place for loading / error / empty / stale handling on every view. */
export function QueryBoundary<T>({ query, isEmpty, emptyTitle = 'Nothing to show', emptyBody, noBanner, children }: Props<T>) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { data, meta } = query.data;
  return (
    <>
      {!noBanner && <FreshnessBanner meta={meta} />}
      {isEmpty?.(data) ? <EmptyState title={emptyTitle}>{emptyBody}</EmptyState> : children(data, meta)}
    </>
  );
}
