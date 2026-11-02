/**
 * Agent Bridge read-only API + private dashboard host (Cloudflare Worker).
 *
 * The whole hostname sits behind Cloudflare Access. Static dashboard files are
 * served from ASSETS; /api/v1/* reads the bridge Sheet with a read-only
 * service account and returns the Envelope contract in docs/API_CONTRACT.md.
 * There are no write endpoints.
 */
import { buildOverview } from '../../src/domain/derive';
import type {
  AgentInventory,
  BridgeDeliveryEvent,
  BridgeHealth,
  BridgeMessage,
  BridgeTask,
  DataWarning,
  Envelope,
} from '../../src/domain/types';
import { verifyAccess } from './access';
import { getAccessToken, GoogleError, parseServiceAccount, readSheet } from './google';
import {
  DateWarnings,
  isInventoryTab,
  parseDeliveries,
  parseInventory,
  parseMessages,
  parseTasks,
  SchemaError,
} from './parse';

export interface Env {
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** Secret. Never commit. */
  SHEET_ID?: string;
  /** Secret: the service account key JSON. Never commit. */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  /** e.g. https://your-team.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Optional comma-separated allow-list, checked in addition to the Access policy. */
  ALLOWED_EMAILS?: string;
}

const REQUIRED_TABS = ['Task board', 'Messages', 'Delivery log'];
const OPTIONAL_TABS = ['Messages archive'];
const CACHE_MS = 60_000;

interface Dataset {
  tasks: BridgeTask[];
  messages: BridgeMessage[];
  deliveries: BridgeDeliveryEvent[];
  agents: AgentInventory[];
  modifiedTime: string | null;
  warnings: DataWarning[];
  fetchedAt: number;
}

let cache: Dataset | null = null;

type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'SOURCE_UNAVAILABLE' | 'INTERNAL';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS });
const fail = (status: number, code: ErrorCode, message: string) => json(status, { error: { code, message } });

async function loadDataset(env: Env, fetchFn: typeof fetch, nowMs: number): Promise<Dataset> {
  if (cache && nowMs - cache.fetchedAt < CACHE_MS) return cache;
  if (!env.SHEET_ID) throw new GoogleError('SHEET_ID secret is not set.', 500);
  const sa = parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getAccessToken(sa, fetchFn, nowMs);
  const snap = await readSheet(
    env.SHEET_ID,
    (t) => REQUIRED_TABS.includes(t) || OPTIONAL_TABS.includes(t) || isInventoryTab(t),
    token,
    fetchFn,
  );
  const missingTabs = REQUIRED_TABS.filter((t) => !snap.tabs.includes(t));
  if (missingTabs.length) throw new SchemaError(missingTabs.join(', '), ['(tab missing)']);

  const dw = new DateWarnings();
  const warnings: DataWarning[] = [];
  const tasks = parseTasks(snap.grids.get('Task board'), dw);
  const live = parseMessages(snap.grids.get('Messages'), dw, 'Messages');
  let archive: BridgeMessage[] = [];
  if (snap.grids.has('Messages archive')) {
    try {
      archive = parseMessages(snap.grids.get('Messages archive'), dw, 'Messages archive');
    } catch (e) {
      if (!(e instanceof SchemaError)) throw e;
      warnings.push({ code: 'PARTIAL_DATA', message: `Messages archive skipped: ${e.message}` });
    }
  }
  const deliveries = parseDeliveries(snap.grids.get('Delivery log'), dw);
  const agents: AgentInventory[] = [];
  for (const title of snap.tabs.filter(isInventoryTab)) {
    try {
      agents.push(parseInventory(title, snap.grids.get(title), dw));
    } catch (e) {
      if (!(e instanceof SchemaError)) throw e;
      warnings.push({ code: 'PARTIAL_DATA', message: `${title} skipped: ${e.message}`, ref: { tab: title as never, row: null } });
    }
  }
  if (!snap.modifiedTime) {
    warnings.push({
      code: 'PARTIAL_DATA',
      message: 'Sheet last-modified time unavailable (enable the Google Drive API for the project to show it).',
    });
  }
  cache = {
    tasks,
    messages: [...live, ...archive],
    deliveries,
    agents,
    modifiedTime: snap.modifiedTime,
    warnings: [...warnings, ...dw.warnings()],
    fetchedAt: nowMs,
  };
  return cache;
}

function envelope<T>(data: T, d: Dataset, nowMs: number): Envelope<T> {
  return {
    data,
    meta: { generatedAt: new Date(nowMs).toISOString(), sourceUpdatedAt: d.modifiedTime, isDemo: false, warnings: d.warnings },
  };
}

export async function handleApi(request: Request, env: Env, fetchFn: typeof fetch = fetch, nowMs = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return fail(405, 'FORBIDDEN', 'This API is read-only.');

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    // Fail closed: never serve bridge data without verifying the login.
    return fail(500, 'INTERNAL', 'Access verification is not configured on the Worker.');
  }
  let auth;
  try {
    auth = await verifyAccess(
      request.headers.get('Cf-Access-Jwt-Assertion'),
      { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, allowedEmails: env.ALLOWED_EMAILS },
      fetchFn,
      nowMs,
    );
  } catch {
    return fail(500, 'INTERNAL', 'Could not verify the login.');
  }
  if (!auth.ok) return fail(auth.status, auth.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', auth.reason);

  const route = url.pathname.replace(/^\/api\/v1\//, '').replace(/\/+$/, '');
  let d: Dataset;
  try {
    d = await loadDataset(env, fetchFn, nowMs);
  } catch (e) {
    if (e instanceof SchemaError) return fail(503, 'SOURCE_UNAVAILABLE', `Sheet layout changed: ${e.message}`);
    if (e instanceof GoogleError) {
      // Config problems on our side (missing/invalid secrets) are INTERNAL; Google refusing or failing is SOURCE_UNAVAILABLE.
      const internal = e.status === 500;
      return fail(internal ? 500 : 503, internal ? 'INTERNAL' : 'SOURCE_UNAVAILABLE', e.message);
    }
    return fail(500, 'INTERNAL', 'Unexpected error reading the bridge.');
  }

  const now = new Date(nowMs);
  switch (route) {
    case 'overview':
      return json(200, envelope(buildOverview(d.tasks, d.messages.filter((m) => !m.archived), d.deliveries, now), d, nowMs));
    case 'tasks':
      return json(200, envelope(d.tasks, d, nowMs));
    case 'messages':
      return json(200, envelope(d.messages, d, nowMs));
    case 'deliveries':
      return json(200, envelope(d.deliveries, d, nowMs));
    case 'agents':
      return json(200, envelope(d.agents, d, nowMs));
    case 'health': {
      const health: BridgeHealth = {
        api: 'reachable',
        source: { name: 'Bridge Google Sheet', lastModifiedAt: d.modifiedTime },
        checks: [
          { name: 'Login verified', result: 'pass', detail: auth.email ? `Signed in as ${auth.email}` : 'Access token valid', checkedAt: now.toISOString() },
          {
            name: 'Sheet read (read-only)',
            result: 'pass',
            detail: `${d.tasks.length} tasks, ${d.messages.filter((m) => !m.archived).length} live + ${d.messages.filter((m) => m.archived).length} archived messages, ${d.deliveries.length} delivery rows, ${d.agents.length} inventories`,
            checkedAt: new Date(d.fetchedAt).toISOString(),
          },
          {
            name: 'Sheet last-modified time',
            result: d.modifiedTime ? 'pass' : 'warn',
            detail: d.modifiedTime ? 'From Google Drive' : 'Unavailable; enable the Drive API to show source age',
            checkedAt: new Date(d.fetchedAt).toISOString(),
          },
          {
            name: 'Data warnings',
            result: d.warnings.length ? 'warn' : 'pass',
            detail: d.warnings.length ? `${d.warnings.length} warning(s); see banners on each page` : 'None',
            checkedAt: new Date(d.fetchedAt).toISOString(),
          },
        ],
      };
      return json(200, envelope(health, d, nowMs));
    }
    default:
      return fail(404, 'INTERNAL', 'Unknown endpoint.');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

/** Test hook. */
export function resetCache() {
  cache = null;
}
