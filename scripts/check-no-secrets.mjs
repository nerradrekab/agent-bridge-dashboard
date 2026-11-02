#!/usr/bin/env node
/**
 * Guard against committing or publishing secrets, Sheet references or real
 * bridge data.
 *
 *   node scripts/check-no-secrets.mjs --staged         # scan files staged for commit
 *   node scripts/check-no-secrets.mjs --dir dist       # scan a build output
 *   ... --deny-file ../private/deny.txt                # extra literal strings (one per line)
 *
 * The deny file lets you check for the real Sheet ID without ever writing it
 * into this repository. Keep that file outside the repo (or in the ignored
 * private/ folder). BRIDGE_DENY_FILE works as an alternative to --deny-file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const PATTERNS = [
  { name: 'Google Sheets/Docs URL', re: /docs\.google\.com\/(spreadsheets|document)/i },
  { name: 'Sheets API URL', re: /sheets\.googleapis\.com\/v4\/spreadsheets\/[A-Za-z0-9_-]{20,}/i },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Service-account JSON', re: /"type"\s*:\s*"service_account"/ },
  { name: 'OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub token', re: /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}/ },
  { name: 'Bearer token literal', re: /Bearer\s+[A-Za-z0-9._-]{30,}/ },
  // Google Sheet IDs are 44 chars starting with "1". Lockfile hashes are skipped below.
  { name: 'Sheet-ID-shaped token', re: /(?<![A-Za-z0-9_-])1[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/, skip: /package-lock\.json$/ },
];

const SKIP_FILES = /(^|\/)(node_modules|\.git)\/|\.(png|jpg|jpeg|gif|ico|woff2?|ttf|eot)$/i;
// This script describes the patterns it looks for, so it is not scanned.
const SELF = 'scripts/check-no-secrets.mjs';

const denyPath = flag('--deny-file') ?? process.env.BRIDGE_DENY_FILE ?? null;
const deny =
  denyPath && existsSync(denyPath)
    ? readFileSync(denyPath, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#'))
    : [];
if (denyPath && !existsSync(denyPath)) {
  console.error(`Deny file not found: ${denyPath}`);
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let files;
let read;
if (args.includes('--staged')) {
  files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  // Scan the staged blob, not the working copy.
  read = (f) => execFileSync('git', ['show', `:${f}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} else {
  const dir = flag('--dir') ?? '.';
  files = walk(dir).map((p) => relative('.', p).replaceAll('\\', '/'));
  read = (f) => readFileSync(f, 'utf8');
}

const problems = [];
for (const f of files) {
  if (SKIP_FILES.test(f) || f === SELF) continue;
  if (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')) problems.push(`${f}: .env files must not be committed`);
  if (/\.(csv|xlsx)$/i.test(f)) problems.push(`${f}: spreadsheet exports must not be committed`);
  let text;
  try {
    text = read(f);
  } catch {
    continue;
  }
  for (const p of PATTERNS) {
    if (p.skip?.test(f)) continue;
    const m = text.match(p.re);
    if (m) problems.push(`${f}: ${p.name} (${m[0].slice(0, 12)}…)`);
  }
  for (const d of deny) if (text.includes(d)) problems.push(`${f}: matches an entry in the deny file`);
}

if (problems.length) {
  console.error('Secret/source check FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Secret/source check passed (${files.length} files${deny.length ? `, ${deny.length} deny entries` : ''}).`);
