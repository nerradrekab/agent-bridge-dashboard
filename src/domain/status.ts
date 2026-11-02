/**
 * Conservative classification of free-text status strings.
 *
 * The Sheet's status cells are descriptive ("Proposed — awaiting Instinct
 * acceptance", "Paused (historical)", "Blocked on Josh approval"). We never
 * replace that text. Instead we attach a *secondary* category used for
 * colour, filtering and counts. Anything not clearly matched is
 * `unclassified`, which the UI surfaces rather than hides.
 */

export type StatusCategory =
  | 'failed'
  | 'blocked'
  | 'needs-josh'
  | 'archived'
  | 'paused'
  | 'done'
  | 'proposed'
  | 'active'
  | 'waiting'
  | 'unclassified';

export interface StatusClassification {
  raw: string;
  /** Highest-precedence category matched. */
  category: StatusCategory;
  /** Every category matched, in precedence order. >1 means the text is mixed. */
  matches: StatusCategory[];
  ambiguous: boolean;
}

interface Rule {
  category: StatusCategory;
  pattern: RegExp;
}

// Precedence: earlier rules win. A row that is "Done but awaiting Josh
// sign-off" needs Josh; "Blocked; proposed fix" is blocked.
const RULES: Rule[] = [
  { category: 'failed', pattern: /\b(fail(ed|ure|ing)?|errors?|errored|bounced|rejected)\b/ },
  { category: 'blocked', pattern: /\b(block(ed|er|ing)?|stuck)\b/ },
  {
    category: 'needs-josh',
    pattern:
      /\b((awaiting|needs?|pending|for|requires?)\s+(josh|approval|sign[- ]?off|decision))\b|\bjosh\s+(to|must|should)\b|\bapproval required\b/,
  },
  { category: 'archived', pattern: /\b(historical|superseded|retired|cancell?ed|withdrawn|obsolete|archived)\b/ },
  { category: 'paused', pattern: /\b(paused|on hold|deferred|suspended|parked)\b/ },
  { category: 'done', pattern: /\b(done|complete|completed|closed|delivered|resolved|processed|acknowledged)\b/ },
  { category: 'proposed', pattern: /\b(proposed|proposal|draft|suggested|unconfirmed|not (yet )?accepted)\b/ },
  { category: 'active', pattern: /\b(in progress|active|ongoing|running|underway|working|processing|live|scheduled)\b/ },
  { category: 'waiting', pattern: /\b(waiting|awaiting|pending|queued|sent|outstanding|open|new|not started|to do|todo)\b/ },
];

// Phrases that would otherwise trigger a false positive.
const NEGATIONS: Array<{ pattern: RegExp; suppresses: StatusCategory }> = [
  { pattern: /\bnot (yet )?(done|complete|completed|closed|delivered|resolved|processed)\b/, suppresses: 'done' },
  { pattern: /\bunblocked\b|\bno (longer )?blocke(d|rs?)\b|\bnot blocked\b/, suppresses: 'blocked' },
  { pattern: /\bno errors?\b|\b0 errors?\b|\bwithout errors?\b/, suppresses: 'failed' },
];

export function classifyStatus(raw: string | null | undefined): StatusClassification {
  const text = (raw ?? '').trim();
  if (!text) {
    return { raw: '', category: 'unclassified', matches: [], ambiguous: false };
  }
  const lower = text.toLowerCase();
  const suppressed = new Set(NEGATIONS.filter((n) => n.pattern.test(lower)).map((n) => n.suppresses));
  // "unblocked" contains "block" only as a substring, but \bblock won't match it;
  // still, remove negated phrases before matching to be safe.
  let scrubbed = lower;
  for (const n of NEGATIONS) scrubbed = scrubbed.replace(new RegExp(n.pattern.source, 'g'), ' ');

  const matches = RULES.filter((r) => !suppressed.has(r.category) && r.pattern.test(scrubbed)).map(
    (r) => r.category,
  );
  // "not done" with nothing else is still informative: it's open.
  if (matches.length === 0 && suppressed.has('done')) matches.push('waiting');

  const category = matches[0] ?? 'unclassified';
  return { raw: text, category, matches, ambiguous: matches.length > 1 };
}

/** Categories that mean the work is no longer open. */
export const CLOSED_CATEGORIES: ReadonlySet<StatusCategory> = new Set(['done', 'archived']);

export function isOpen(c: StatusCategory): boolean {
  return !CLOSED_CATEGORIES.has(c);
}

export interface CategoryMeta {
  label: string;
  /** Non-colour glyph so status is never conveyed by colour alone. */
  glyph: string;
  description: string;
}

export const CATEGORY_META: Record<StatusCategory, CategoryMeta> = {
  failed: { label: 'Failed', glyph: '✕', description: 'Text mentions failure or error' },
  blocked: { label: 'Blocked', glyph: '⊘', description: 'Text mentions a blocker' },
  'needs-josh': { label: 'Needs Josh', glyph: '!', description: 'Awaiting Josh’s decision or approval' },
  archived: { label: 'Historical', glyph: '◌', description: 'Historical, superseded or cancelled' },
  paused: { label: 'Paused', glyph: '‖', description: 'Paused, on hold or deferred' },
  done: { label: 'Done', glyph: '✓', description: 'Reported complete (not independently verified)' },
  proposed: { label: 'Proposed', glyph: '◇', description: 'Proposed; not accepted by the owner' },
  active: { label: 'Active', glyph: '●', description: 'Reported in progress or scheduled' },
  waiting: { label: 'Waiting', glyph: '○', description: 'Open, queued or awaiting a response' },
  unclassified: { label: 'Unclassified', glyph: '?', description: 'Status text did not match any known pattern' },
};

export const CATEGORY_ORDER: StatusCategory[] = [
  'needs-josh',
  'failed',
  'blocked',
  'active',
  'waiting',
  'proposed',
  'paused',
  'done',
  'archived',
  'unclassified',
];
