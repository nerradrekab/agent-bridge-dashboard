const TZ = 'Europe/London';

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

const fullFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

const dateOnlyFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'short', year: 'numeric' });

/** For day-precision Sheet dates (stored as Dublin midnight): "2 Nov 2026", no time implied. */
export function formatDateOnly(iso: string): string {
  return dateOnlyFmt.format(new Date(iso));
}

/** e.g. "2 Nov, 22:30 GMT" — timezone always shown. */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function formatFull(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/** e.g. "5 min ago", "in 2 d", "just now". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMin = Math.round((Date.parse(iso) - now.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'just now';
  const [n, unit] =
    abs < 60 ? [abs, 'min'] : abs < 48 * 60 ? [Math.round(abs / 60), 'h'] : [Math.round(abs / 1440), 'd'];
  return diffMin < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`;
}

export function formatMinutes(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
