// @vitest-environment node
import { resetAccessCache, verifyAccess } from '../src/access';
import { handleApi, resetCache, type Env } from '../src/index';
import { AUD, jsonResponse, privatePem, publicJwk, rsaKeyPair, signJwt, SYNTHETIC, TEAM } from './helpers';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const FAKE_SHEET = 'synthetic-sheet-id';

let accessKeys: CryptoKeyPair;
let saKeys: CryptoKeyPair;
let saJson: string;

beforeAll(async () => {
  accessKeys = await rsaKeyPair();
  saKeys = await rsaKeyPair();
  saJson = JSON.stringify({ client_email: 'reader@synthetic.iam.gserviceaccount.com', private_key: await privatePem(saKeys.privateKey) });
});

beforeEach(() => {
  resetAccessCache();
  resetCache();
});

const loginToken = (over: Record<string, unknown> = {}) =>
  signJwt(accessKeys.privateKey, { alg: 'RS256', kid: 'k1' }, {
    aud: [AUD],
    iss: TEAM,
    exp: Math.floor(NOW / 1000) + 600,
    email: 'josh@example.com',
    ...over,
  });

interface FakeOpts {
  sheetsStatus?: number;
  driveStatus?: number;
  grids?: Record<string, string[][]>;
}

function fakeGoogle(opts: FakeOpts = {}) {
  const grids = opts.grids ?? SYNTHETIC;
  const calls: string[] = [];
  const fn = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url === `${TEAM}/cdn-cgi/access/certs`) return jsonResponse(200, { keys: [await publicJwk(accessKeys.publicKey, 'k1')] });
    if (url === 'https://oauth2.googleapis.com/token') {
      expect(init?.method).toBe('POST');
      return jsonResponse(200, { access_token: 'synthetic-token', expires_in: 3600 });
    }
    if (url.includes('sheets.googleapis.com')) {
      if (opts.sheetsStatus) return jsonResponse(opts.sheetsStatus, { error: { message: `Sheet ${FAKE_SHEET} denied` } });
      if (url.includes('?fields=sheets.properties.title')) {
        return jsonResponse(200, { sheets: Object.keys(grids).map((title) => ({ properties: { title } })) });
      }
      const ranges = new URL(url).searchParams.getAll('ranges').map((r) => r.slice(1, -1));
      return jsonResponse(200, { valueRanges: ranges.map((r) => ({ values: grids[r] })) });
    }
    if (url.includes('googleapis.com/drive')) {
      return opts.driveStatus ? jsonResponse(opts.driveStatus, {}) : jsonResponse(200, { modifiedTime: '2026-11-02T11:00:00Z' });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  return { fn, calls };
}

const env = (over: Partial<Env> = {}): Env => ({
  SHEET_ID: FAKE_SHEET,
  GOOGLE_SERVICE_ACCOUNT_JSON: saJson,
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ...over,
});

async function call(path: string, e: Env, fetchFn: typeof fetch, token?: string | null, method = 'GET') {
  const headers = new Headers();
  if (token) headers.set('Cf-Access-Jwt-Assertion', token);
  const res = await handleApi(new Request(`https://agent-bridge.example.workers.dev${path}`, { method, headers }), e, fetchFn, NOW);
  return { res, body: (await res.json()) as any };
}

describe('Access verification', () => {
  it('accepts a valid token and rejects tampered, expired or foreign ones', async () => {
    const { fn } = fakeGoogle();
    const cfg = { teamDomain: TEAM, aud: AUD };
    expect(await verifyAccess(await loginToken(), cfg, fn, NOW)).toEqual({ ok: true, email: 'josh@example.com' });
    expect((await verifyAccess(await loginToken({ exp: Math.floor(NOW / 1000) - 1 }), cfg, fn, NOW)).ok).toBe(false);
    expect((await verifyAccess(await loginToken({ aud: ['other-app'] }), cfg, fn, NOW)).ok).toBe(false);
    expect((await verifyAccess(await loginToken({ iss: 'https://evil.cloudflareaccess.com' }), cfg, fn, NOW)).ok).toBe(false);
    const t = await loginToken();
    const tampered = t.slice(0, t.lastIndexOf('.') + 5) + (t.endsWith('A') ? 'B' : 'A');
    expect((await verifyAccess(tampered, cfg, fn, NOW)).ok).toBe(false);
    const other = await rsaKeyPair();
    const forged = await signJwt(other.privateKey, { alg: 'RS256', kid: 'k1' }, { aud: [AUD], iss: TEAM, exp: Math.floor(NOW / 1000) + 600 });
    expect((await verifyAccess(forged, cfg, fn, NOW)).ok).toBe(false);
  });

  it('enforces the optional email allow-list', async () => {
    const { fn } = fakeGoogle();
    const r = await verifyAccess(await loginToken({ email: 'someone@else.com' }), { teamDomain: TEAM, aud: AUD, allowedEmails: 'josh@example.com' }, fn, NOW);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe('API', () => {
  it('refuses to serve anything when Access is not configured (fails closed)', async () => {
    const { fn, calls } = fakeGoogle();
    const { res, body } = await call('/api/v1/tasks', env({ ACCESS_AUD: '' }), fn, await loginToken());
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(calls.some((c) => c.includes('googleapis'))).toBe(false);
  });

  it('returns 401 UNAUTHENTICATED without a login and never touches Google', async () => {
    const { fn, calls } = fakeGoogle();
    const { res, body } = await call('/api/v1/tasks', env(), fn, null);
    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(calls).toHaveLength(0);
  });

  it('is read-only', async () => {
    const { fn } = fakeGoogle();
    const { res } = await call('/api/v1/tasks', env(), fn, await loginToken(), 'POST');
    expect(res.status).toBe(405);
  });

  it('serves the envelope contract with no-store caching', async () => {
    const { fn } = fakeGoogle();
    const { res, body } = await call('/api/v1/tasks', env(), fn, await loginToken());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body.meta).toMatchObject({ isDemo: false, sourceUpdatedAt: '2026-11-02T11:00:00Z', generatedAt: '2026-11-02T12:00:00.000Z' });
    expect(body.data.map((t: { id: string }) => t.id)).toEqual(['TST-001', 'TST-002']);
    expect(body.meta.warnings).toEqual([expect.objectContaining({ code: 'UNPARSEABLE_DATE' })]);
  });

  it('includes archived messages flagged, but overview counts only live ones', async () => {
    const { fn } = fakeGoogle();
    const token = await loginToken();
    const msgs = await call('/api/v1/messages', env(), fn, token);
    expect(msgs.body.data.map((m: { id: string; archived?: boolean }) => [m.id, !!m.archived])).toEqual([
      ['TST-MSG-1', false],
      ['TST-OLD-1', true],
    ]);
    const ov = await call('/api/v1/overview', env(), fn, token);
    expect(ov.body.data.kpis).toMatchObject({ openTasks: 1, joshActionTasks: 1, recentHandoffs: 1 });
    expect(ov.body.data.lastVerifiedActivity).toMatchObject({ kind: 'delivery', refId: 'TST-MSG-0', evidence: 'observed' });
  });

  it('discovers every "<Name> inventory" tab as an agent', async () => {
    const { fn } = fakeGoogle();
    const { body } = await call('/api/v1/agents', env(), fn, await loginToken());
    expect(body.data.map((a: { agentId: string }) => a.agentId)).toEqual(['synthbot']);
  });

  it('caches the Sheet read for a minute', async () => {
    const { fn, calls } = fakeGoogle();
    const token = await loginToken();
    await call('/api/v1/tasks', env(), fn, token);
    await call('/api/v1/messages', env(), fn, token);
    expect(calls.filter((c) => c.includes('values:batchGet'))).toHaveLength(1);
  });

  it('maps a Google permission error to SOURCE_UNAVAILABLE without leaking the Sheet ID', async () => {
    const { fn } = fakeGoogle({ sheetsStatus: 403 });
    const { res, body } = await call('/api/v1/tasks', env(), fn, await loginToken());
    expect(res.status).toBe(503);
    expect(body.error.code).toBe('SOURCE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain(FAKE_SHEET);
  });

  it('fails closed with SOURCE_UNAVAILABLE when the Sheet layout changes', async () => {
    const grids = { ...SYNTHETIC, 'Task board': [['Task ID', 'Something else']] };
    const { fn } = fakeGoogle({ grids });
    const { res, body } = await call('/api/v1/tasks', env(), fn, await loginToken());
    expect(res.status).toBe(503);
    expect(body.error.message).toMatch(/Sheet layout changed/);
  });

  it('still works, with a warning, when the Drive API is not enabled', async () => {
    const { fn } = fakeGoogle({ driveStatus: 403 });
    const { res, body } = await call('/api/v1/health', env(), fn, await loginToken());
    expect(res.status).toBe(200);
    expect(body.meta.sourceUpdatedAt).toBeNull();
    expect(body.data.checks.find((c: { name: string }) => c.name === 'Sheet last-modified time').result).toBe('warn');
  });

  it('reports a missing secret as INTERNAL', async () => {
    const { fn } = fakeGoogle();
    const { res, body } = await call('/api/v1/tasks', env({ GOOGLE_SERVICE_ACCOUNT_JSON: undefined }), fn, await loginToken());
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
  });
});
