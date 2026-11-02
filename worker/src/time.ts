/**
 * Parse Sheet date cells into SourceTimestamp.
 *
 * The bridge Sheet mixes several formats. Only unambiguous ones are parsed;
 * everything else keeps its raw text with iso = null so the UI shows
 * "Unknown". Local times without a zone are Europe/Dublin (the Sheet's zone).
 */
import type { SourceTimestamp } from '../../src/domain/types';

export const SHEET_TZ = 'Europe/Dublin';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Offset (ms) of `tz` from UTC at instant `ms`. */
function tzOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in `tz` → UTC milliseconds (DST-aware). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz = SHEET_TZ): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - tzOffset(guess, tz);
  // Re-check at the corrected instant in case the guess straddled a DST change.
  return guess - tzOffset(first, tz);
}

function validDate(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

export function parseSheetTimestamp(cell: string | null | undefined): SourceTimestamp {
  const raw = cell?.trim() ? cell.trim() : null;
  if (!raw) return { raw: null, iso: null };
  const unknown: SourceTimestamp = { raw, iso: null };
  let m: RegExpMatchArray | null;

  // ISO 8601 with an explicit zone: 2026-11-02T18:10:39Z, 2026-11-01T23:36:00+00:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? unknown : { raw, iso: iso(ms) };
  }

  // ISO local date-time without zone → Dublin
  if ((m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/))) {
    const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0)) as number[];
    if (!validDate(y!, mo!, d!) || h! > 23 || mi! > 59) return unknown;
    return { raw, iso: iso(zonedToUtc(y!, mo!, d!, h!, mi!, s!)) };
  }

  // Date only: 2026-11-01, 2026-11-01 (Europe/London), 2026-11-02 Europe/London
  if ((m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s*\(?Europe\/[A-Za-z_]+\)?)?$/))) {
    const [y, mo, d] = m.slice(1).map(Number) as number[];
    if (!validDate(y!, mo!, d!)) return unknown;
    return { raw, iso: iso(zonedToUtc(y!, mo!, d!, 0, 0, 0)), precision: 'day' };
  }

  // DD/MM/YYYY [HH:mm[:ss]] → Dublin (en_GB Sheet locale)
  if ((m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (!validDate(y, mo, d)) return unknown;
    if (m[4] === undefined) return { raw, iso: iso(zonedToUtc(y, mo, d, 0, 0, 0)), precision: 'day' };
    const h = Number(m[4]);
    const mi = Number(m[5]);
    if (h > 23 || mi > 59) return unknown;
    return { raw, iso: iso(zonedToUtc(y, mo, d, h, mi, Number(m[6] ?? 0))) };
  }

  // 28 October 2026 | 2 Nov 2026, Europe/London | 28 October 2026, 18:35 GMT
  if (
    (m = raw.match(
      /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*(GMT|UTC|BST|IST)?)?(?:,?\s*\(?Europe\/[A-Za-z_]+\)?)?$/,
    ))
  ) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]!.toLowerCase().slice(0, m[2]!.toLowerCase().startsWith('sept') ? 4 : 3)];
    const y = Number(m[3]);
    if (!mo || !validDate(y, mo, d)) return unknown;
    if (m[4] === undefined) return { raw, iso: iso(zonedToUtc(y, mo, d, 0, 0, 0)), precision: 'day' };
    const h = Number(m[4]);
    const mi = Number(m[5]);
    if (h > 23 || mi > 59) return unknown;
    const zone = m[6]?.toUpperCase();
    if (zone === 'GMT' || zone === 'UTC') return { raw, iso: iso(Date.UTC(y, mo - 1, d, h, mi)) };
    // BST/IST are both UTC+1 summer time; no zone means Dublin local.
    if (zone === 'BST' || zone === 'IST') return { raw, iso: iso(Date.UTC(y, mo - 1, d, h - 1, mi)) };
    return { raw, iso: iso(zonedToUtc(y, mo, d, h, mi, 0)) };
  }

  return unknown;
}
