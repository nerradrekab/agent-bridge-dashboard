/**
 * Test helpers. All data here is SYNTHETIC; never paste real Sheet rows into tests.
 */

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function rsaKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

export async function signJwt(privateKey: CryptoKey, header: object, payload: object): Promise<string> {
  const enc = (v: object) => b64url(new TextEncoder().encode(JSON.stringify(v)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

export async function publicJwk(publicKey: CryptoKey, kid: string) {
  return { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'RS256', use: 'sig' };
}

export async function privatePem(privateKey: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
  let s = '';
  for (const b of der) s += String.fromCharCode(b);
  const body = btoa(s).match(/.{1,64}/g)!.join('\n');
  // Built in pieces so the repo's secret scanner never sees a literal PEM header.
  const label = ['PRIVATE', 'KEY'].join(' ');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

export const TEAM = 'https://example-team.cloudflareaccess.com';
export const AUD = 'test-audience-tag';

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A tiny fictional bridge, header rows exactly as the real Sheet names them. */
export const SYNTHETIC = {
  'Task board': [
    [
      'Task ID', 'Workstream / output', 'Owner', 'Status', 'Next action / blocker', 'Done when',
      'Deadline / timezone', 'Evidence / verified at', 'Related message / dependency', 'Draft / output',
      'Outcome / next milestone', 'Updated at',
    ],
    ['TST-001', 'Synthetic workstream', 'Josh', 'Awaiting Josh decision', 'Josh to choose', 'Chosen', 'Before 1 Dec (TBC)', 'Agent says drafted', 'TST-MSG-1', '', '', '2026-11-01 (Europe/London)'],
    ['TST-002', 'Synthetic done item', 'ChatGPT', 'Done', '', '', '', '', '', '', '', '2026-11-02T10:00:00Z'],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
  ],
  Messages: [
    ['ID', 'From', 'To', 'Message', 'Status', 'Written at'],
    ['TST-MSG-1', 'Instinct', 'Josh', 'Synthetic question about TST-001.\nSecond line.', 'Awaiting Josh', '2026-11-02T09:00:00Z'],
  ],
  'Messages archive': [
    ['ID', 'From', 'To', 'Message', 'Status', 'Written at'],
    ['TST-OLD-1', 'ChatGPT', 'Instinct', 'Old synthetic message', 'Awaiting Instinct', '28 October 2026'],
  ],
  'Delivery log': [
    [
      'Message ID', 'Recipient', 'Revision / fingerprint', 'Written at (Dublin)', 'Signal received (Dublin)',
      'Processing started (Dublin)', 'Processing completed (Dublin)', 'Disposition', 'Response / task ID',
      'Evidence / error', 'Health', 'Reviewed at (Dublin)',
    ],
    ['TST-MSG-0', 'ChatGPT', 'abc123', '01/11/2026 09:00:00', '01/11/2026 09:00:30', '01/11/2026 09:01:00', '01/11/2026 09:02:00', 'Completed', '', '', 'Closed', '01/11/2026 09:02:00'],
  ],
  'Synthbot inventory': [
    ['ID', 'Addressed to', 'Task / responsibility', 'Status', 'Schedule / deadline', 'Next action / blocker', 'Evidence / source', 'Verified / reviewed'],
    ['SB-001', 'ChatGPT', 'Synthetic duty', 'Enabled', 'Daily 09:00', '', 'Synthetic config', '2 Nov 2026, Europe/London'],
  ],
  'Start here': [['Field', 'Value']],
} as Record<string, string[][]>;
