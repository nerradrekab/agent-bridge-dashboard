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

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const ds = (env.VITE_DATA_SOURCE ?? 'mock').trim().toLowerCase();
  const base = (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const stale = Number.parseInt(env.VITE_STALE_AFTER_MINUTES ?? '', 10);
  return {
    dataSource: ds === 'http' ? 'http' : 'mock',
    apiBaseUrl: base || null,
    staleAfterMinutes: Number.isFinite(stale) && stale > 0 ? stale : 180,
    displayTimeZone: 'Europe/London',
  };
}

export const config: AppConfig = parseConfig(import.meta.env as Record<string, string | undefined>);
