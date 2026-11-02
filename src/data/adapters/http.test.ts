import { ApiError } from '../source';
import { createHttpDataSource } from './http';

const META = { generatedAt: '2026-11-02T22:00:00Z', sourceUpdatedAt: null, isDemo: false, warnings: [] };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function source(fetchImpl: typeof fetch, baseUrl: string | null = 'https://api.example.com') {
  return createHttpDataSource({ baseUrl, fetchImpl });
}

async function expectKind(p: Promise<unknown>, kind: ApiError['kind']) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).kind).toBe(kind);
}

describe('HTTP adapter', () => {
  it('requests the versioned endpoint with credentials and no-store, and returns the envelope', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { data: [{ id: 'T-1', owner: 'x', status: 'Done', source: { tab: 'Task board', row: 2 } }], meta: META }),
    );
    const res = await source(fetchImpl).getTasks();
    expect(res.data).toHaveLength(1);
    expect(res.meta.isDemo).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/api/v1/tasks');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
    // No Authorization header: the browser holds no secrets.
    expect(JSON.stringify(init?.headers)).not.toMatch(/authorization/i);
  });

  it('maps 401 to unauthorised', async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }));
    await expectKind(source(f).getTasks(), 'unauthorised');
  });

  it('maps a bare 401 with no body to unauthorised', async () => {
    const f = vi.fn<typeof fetch>(async () => new Response('', { status: 401 }));
    await expectKind(source(f).getTasks(), 'unauthorised');
  });

  it('maps 403 to forbidden', async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'No' } }));
    await expectKind(source(f).getMessages(), 'forbidden');
  });

  it('maps SOURCE_UNAVAILABLE to source_unavailable and keeps the server message', async () => {
    const f = vi.fn<typeof fetch>(async () =>
      jsonResponse(503, { error: { code: 'SOURCE_UNAVAILABLE', message: 'Sheets API quota exceeded' } }),
    );
    const err = await source(f).getDeliveryEvents().catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'source_unavailable', status: 503, message: 'Sheets API quota exceeded' });
  });

  it('rejects contract violations', async () => {
    const missingMeta = vi.fn<typeof fetch>(async () => jsonResponse(200, { data: [] }));
    await expectKind(source(missingMeta).getTasks(), 'contract');

    const badRow = vi.fn<typeof fetch>(async () => jsonResponse(200, { data: [{ id: 'T-1' }], meta: META }));
    await expectKind(source(badRow).getTasks(), 'contract');

    const notArray = vi.fn<typeof fetch>(async () => jsonResponse(200, { data: {}, meta: META }));
    await expectKind(source(notArray).getAgentInventories(), 'contract');
  });

  it('refuses a non-HTTPS base URL without calling fetch', async () => {
    const f = vi.fn<typeof fetch>();
    await expectKind(source(f, 'http://api.example.com').getTasks(), 'not_configured');
    expect(f).not.toHaveBeenCalled();
  });

  it('allows plain http for localhost development', async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse(200, { data: [], meta: META }));
    await source(f, 'http://localhost:8787').getTasks();
    expect(f).toHaveBeenCalledOnce();
  });

  it('reports not_configured when no base URL is set', async () => {
    const f = vi.fn<typeof fetch>();
    await expectKind(source(f, null).getOverview(), 'not_configured');
  });

  it('maps fetch failures to network', async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expectKind(source(f).getHealth(), 'network');
  });
});
