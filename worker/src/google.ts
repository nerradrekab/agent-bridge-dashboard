/**
 * Read-only Google access with a service account (no SDK; Web Crypto only).
 *
 * Scopes are read-only: the Worker cannot edit the Sheet even if the code or
 * key were misused. The service account must be shared on the Sheet as Viewer.
 */
import type { Grid } from './parse';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

type FetchFn = typeof fetch;

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function parseServiceAccount(json: string | undefined): ServiceAccount {
  if (!json) throw new GoogleError('Service account secret is not set.', 500);
  let sa: unknown;
  try {
    sa = JSON.parse(json);
  } catch {
    throw new GoogleError('Service account secret is not valid JSON.', 500);
  }
  const o = sa as Partial<ServiceAccount>;
  if (typeof o.client_email !== 'string' || typeof o.private_key !== 'string') {
    throw new GoogleError('Service account secret is missing client_email or private_key.', 500);
  }
  return o as ServiceAccount;
}

let tokenCache: { token: string; exp: number; email: string } | null = null;

export async function getAccessToken(sa: ServiceAccount, fetchFn: FetchFn = fetch, nowMs = Date.now()): Promise<string> {
  if (tokenCache && tokenCache.email === sa.client_email && tokenCache.exp - 60_000 > nowMs) return tokenCache.token;
  const iat = Math.floor(nowMs / 1000);
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
    iss: sa.client_email,
    scope: SCOPES.join(' '),
    aud,
    iat,
    exp: iat + 3600,
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetchFn(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new GoogleError('Google rejected the service account login.', res.status);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new GoogleError('Google returned no access token.', 502);
  tokenCache = { token: body.access_token, exp: nowMs + (body.expires_in ?? 3600) * 1000, email: sa.client_email };
  return body.access_token;
}

async function getJson<T>(url: string, token: string, fetchFn: FetchFn): Promise<T> {
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    // Never echo Google's body: it can contain the Sheet ID or account names.
    const hint =
      res.status === 403
        ? 'The service account cannot read the Sheet. Share the Sheet with it as Viewer and enable the Sheets API.'
        : res.status === 404
          ? 'Sheet not found. Check the SHEET_ID secret.'
          : res.status === 429
            ? 'Google API quota exceeded; try again shortly.'
            : `Google API error (HTTP ${res.status}).`;
    throw new GoogleError(hint, res.status);
  }
  return (await res.json()) as T;
}

export interface SheetSnapshot {
  tabs: string[];
  grids: Map<string, Grid>;
  modifiedTime: string | null;
}

/** Read every tab the dashboard needs in one batch, plus the file's modified time. */
export async function readSheet(
  sheetId: string,
  wantTab: (title: string) => boolean,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<SheetSnapshot> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const meta = await getJson<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    `${base}?fields=sheets.properties.title`,
    token,
    fetchFn,
  );
  const tabs = (meta.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
  const wanted = tabs.filter(wantTab);
  const qs = new URLSearchParams({ valueRenderOption: 'FORMATTED_VALUE', majorDimension: 'ROWS' });
  for (const t of wanted) qs.append('ranges', `'${t.replace(/'/g, "''")}'`);
  const batch = await getJson<{ valueRanges?: Array<{ values?: Grid }> }>(`${base}/values:batchGet?${qs}`, token, fetchFn);
  const grids = new Map<string, Grid>();
  wanted.forEach((t, i) => grids.set(t, batch.valueRanges?.[i]?.values ?? []));

  // Optional: Drive API gives the true last-modified time. If it is not enabled
  // the dashboard shows "source age unknown" instead of failing.
  let modifiedTime: string | null = null;
  try {
    const f = await getJson<{ modifiedTime?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}?fields=modifiedTime&supportsAllDrives=true`,
      token,
      fetchFn,
    );
    modifiedTime = f.modifiedTime ?? null;
  } catch {
    modifiedTime = null;
  }
  return { tabs, grids, modifiedTime };
}
