/**
 * Public, build-time configuration. Everything here ends up in the browser
 * bundle; never add secrets.
 */
export type DataSourceKind = 'mock' | 'http';

export interface AppConfig {
  dataSource: DataSourceKind;
  apiBaseUrl: string | null;
  staleAfterMinutes: number;
  displayTimeZone: string;
}

/**
 * `VITE_API_BASE_URL=same-origin` means the API is served by the same host as
 * the page (the private Cloudflare Worker build), resolved at runtime.
 */
export function parseConfig(env: Record<string, string | undefined>, origin?: string): AppConfig {
  const ds = (env.VITE_DATA_SOURCE ?? 'mock').trim().toLowerCase();
  const rawBase = (env.VITE_API_BASE_URL ?? '').trim();
  const base = (rawBase.toLowerCase() === 'same-origin' ? (origin ?? '') : rawBase).replace(/\/+$/, '');
  const stale = Number.parseInt(env.VITE_STALE_AFTER_MINUTES ?? '', 10);
  return {
    dataSource: ds === 'http' ? 'http' : 'mock',
    apiBaseUrl: base || null,
    staleAfterMinutes: Number.isFinite(stale) && stale > 0 ? stale : 180,
    displayTimeZone: 'Europe/London',
  };
}

export const config: AppConfig = parseConfig(
  import.meta.env as Record<string, string | undefined>,
  typeof window === 'undefined' ? undefined : window.location.origin,
);
