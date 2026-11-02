/**
 * Verify the Cloudflare Access JWT on every API request (defence in depth:
 * Access already blocks unauthenticated visitors before the Worker runs).
 */

export interface AccessConfig {
  /** e.g. https://your-team.cloudflareaccess.com */
  teamDomain: string;
  /** Application Audience (AUD) tag from the Access application. */
  aud: string;
  /** Optional comma-separated allow-list of emails. */
  allowedEmails?: string;
}

export type AccessResult = { ok: true; email: string | null } | { ok: false; status: 401 | 403; reason: string };

interface Jwk extends JsonWebKey {
  kid?: string;
}

type FetchFn = typeof fetch;

let jwksCache: { url: string; at: number; keys: Jwk[] } | null = null;

async function getKeys(teamDomain: string, fetchFn: FetchFn, nowMs: number): Promise<Jwk[]> {
  const url = `${teamDomain.replace(/\/+$/, '')}/cdn-cgi/access/certs`;
  if (jwksCache && jwksCache.url === url && nowMs - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Could not fetch Access signing keys (HTTP ${res.status}).`);
  const body = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { url, at: nowMs, keys: body.keys ?? [] };
  return jwksCache.keys;
}

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function verifyAccess(
  token: string | null,
  cfg: AccessConfig,
  fetchFn: FetchFn = fetch,
  nowMs = Date.now(),
): Promise<AccessResult> {
  if (!token) return { ok: false, status: 401, reason: 'No Access token on the request.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'Malformed Access token.' };
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
    payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  } catch {
    return { ok: false, status: 401, reason: 'Malformed Access token.' };
  }
  if (header.alg !== 'RS256') return { ok: false, status: 401, reason: 'Unexpected token algorithm.' };

  const keys = await getKeys(cfg.teamDomain, fetchFn, nowMs);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, status: 401, reason: 'Unknown token signing key.' };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64url(s);
  } catch {
    return { ok: false, status: 401, reason: 'Malformed Access token.' };
  }
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return { ok: false, status: 401, reason: 'Invalid token signature.' };

  const nowS = Math.floor(nowMs / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(cfg.aud)) return { ok: false, status: 401, reason: 'Token is for a different application.' };
  if (payload.iss !== cfg.teamDomain.replace(/\/+$/, '')) return { ok: false, status: 401, reason: 'Token issuer mismatch.' };
  if (typeof payload.exp !== 'number' || payload.exp < nowS) return { ok: false, status: 401, reason: 'Token expired.' };
  if (typeof payload.nbf === 'number' && payload.nbf > nowS + 60) return { ok: false, status: 401, reason: 'Token not yet valid.' };

  const allowed = (cfg.allowedEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = payload.email?.toLowerCase() ?? null;
  if (allowed.length && (!email || !allowed.includes(email))) {
    return { ok: false, status: 403, reason: 'This account is not on the allow-list.' };
  }
  return { ok: true, email };
}

/** Test hook. */
export function resetAccessCache() {
  jwksCache = null;
}
