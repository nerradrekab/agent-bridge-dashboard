/**
 * HTTP adapter for the PROPOSED read-only proxy API (docs/API_CONTRACT.md).
 *
 * Do not enable until the proxy is deployed, authenticated and verified.
 * The browser sends no secrets: authentication is expected to be handled by
 * the proxy's own session (e.g. a Cloudflare Access cookie), so requests use
 * `credentials: 'include'` and the proxy must allow this origin via CORS.
 */
import type { Envelope, ResponseMeta } from '../../domain/types';
import { ApiError, type BridgeDataSource } from '../source';

export interface HttpOptions {
  baseUrl: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Check = (v: unknown) => string | null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkMeta(v: unknown): string | null {
  if (!isObj(v)) return 'meta missing';
  if (typeof v.generatedAt !== 'string') return 'meta.generatedAt missing';
  if (!(v.sourceUpdatedAt === null || typeof v.sourceUpdatedAt === 'string')) return 'meta.sourceUpdatedAt invalid';
  if (typeof v.isDemo !== 'boolean') return 'meta.isDemo missing';
  if (!Array.isArray(v.warnings)) return 'meta.warnings missing';
  return null;
}

/** Light structural checks: catch contract drift without a schema library. */
const arrayOf =
  (requiredStringKeys: string[]): Check =>
  (v) => {
    if (!Array.isArray(v)) return 'data is not an array';
    for (const [i, row] of v.entries()) {
      if (!isObj(row)) return `data[${i}] is not an object`;
      for (const k of requiredStringKeys) if (typeof row[k] !== 'string') return `data[${i}].${k} missing`;
      if (!isObj(row.source)) return `data[${i}].source missing`;
    }
    return null;
  };

const objectWith =
  (keys: string[]): Check =>
  (v) => {
    if (!isObj(v)) return 'data is not an object';
    for (const k of keys) if (!(k in v)) return `data.${k} missing`;
    return null;
  };

const agentsCheck: Check = (v) => {
  if (!Array.isArray(v)) return 'data is not an array';
  for (const [i, a] of v.entries()) {
    if (!isObj(a)) return `data[${i}] is not an object`;
    if (typeof a.agentId !== 'string' || typeof a.displayName !== 'string') return `data[${i}] missing agentId/displayName`;
    if (!Array.isArray(a.aliases) || !Array.isArray(a.items)) return `data[${i}] missing aliases/items`;
  }
  return null;
};

const ERROR_KIND_BY_CODE: Record<string, ApiError['kind']> = {
  UNAUTHENTICATED: 'unauthorised',
  FORBIDDEN: 'forbidden',
  SOURCE_UNAVAILABLE: 'source_unavailable',
};

function isSecureBase(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export function createHttpDataSource(opts: HttpOptions): BridgeDataSource {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = opts.timeoutMs ?? 15_000;

  async function get<T>(path: string, check: Check): Promise<Envelope<T>> {
    if (!opts.baseUrl) throw new ApiError('not_configured', 'VITE_API_BASE_URL is not set.');
    if (!isSecureBase(opts.baseUrl)) throw new ApiError('not_configured', 'API base URL must use HTTPS.');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/api/v1/${path}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
        cache: 'no-store',
      });
    } catch (e) {
      throw new ApiError('network', e instanceof Error && e.name === 'AbortError' ? 'Request timed out.' : 'Network error reaching the API.');
    } finally {
      clearTimeout(timer);
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body handled below */
    }

    if (!res.ok) {
      const code = isObj(body) && isObj(body.error) && typeof body.error.code === 'string' ? body.error.code : '';
      const msg =
        isObj(body) && isObj(body.error) && typeof body.error.message === 'string' ? body.error.message : res.statusText;
      const kind =
        ERROR_KIND_BY_CODE[code] ??
        (res.status === 401 ? 'unauthorised' : res.status === 403 ? 'forbidden' : 'unavailable');
      throw new ApiError(kind, msg || `HTTP ${res.status}`, res.status);
    }

    if (!isObj(body)) throw new ApiError('contract', 'Response was not a JSON object.', res.status);
    const metaErr = checkMeta(body.meta);
    if (metaErr) throw new ApiError('contract', `Contract violation: ${metaErr}`, res.status);
    const dataErr = check(body.data);
    if (dataErr) throw new ApiError('contract', `Contract violation: ${dataErr}`, res.status);
    return { data: body.data as T, meta: body.meta as ResponseMeta };
  }

  return {
    kind: 'http',
    getOverview: () => get('overview', objectWith(['kpis', 'timeline', 'priorities', 'lastVerifiedActivity'])),
    getTasks: () => get('tasks', arrayOf(['id', 'status', 'owner'])),
    getMessages: () => get('messages', arrayOf(['id', 'from', 'to', 'status'])),
    getDeliveryEvents: () => get('deliveries', arrayOf(['messageId', 'recipient'])),
    getAgentInventories: () => get('agents', agentsCheck),
    getHealth: () => get('health', objectWith(['api', 'source', 'checks'])),
  };
}
