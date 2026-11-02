/**
 * Map raw Sheet values (string[][], header in row 1) to the API records.
 *
 * Columns are found by header text, not position. A missing REQUIRED header
 * fails closed (the dashboard then shows "Source unavailable") rather than
 * silently mis-mapping cells. Cell text is passed through verbatim.
 */
import type {
  AgentInventory,
  BridgeDeliveryEvent,
  BridgeMessage,
  BridgeTask,
  DataWarning,
  InventoryItem,
  SheetTab,
  SourceTimestamp,
} from '../../src/domain/types';
import { parseSheetTimestamp } from './time';

export type Grid = string[][];

export class SchemaError extends Error {
  constructor(
    readonly tab: string,
    readonly missing: string[],
  ) {
    super(`${tab}: expected column(s) not found: ${missing.join(', ')}`);
    this.name = 'SchemaError';
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface Table {
  tab: SheetTab;
  rows: Array<{ row: number; get: (header: string) => string | null }>;
  has: (header: string) => boolean;
}

function table(tab: SheetTab, grid: Grid | undefined, required: string[]): Table {
  const [header = [], ...body] = grid ?? [];
  const index = new Map(header.map((h, i) => [norm(h), i]));
  const missing = required.filter((h) => !index.has(norm(h)));
  if (missing.length) throw new SchemaError(tab, missing);
  const rows = body
    .map((cells, i) => ({
      row: i + 2,
      get: (h: string) => {
        const idx = index.get(norm(h));
        const v = idx === undefined ? undefined : cells[idx];
        return v === undefined || v.trim() === '' ? null : v;
      },
      empty: cells.every((c) => !c || !c.trim()),
    }))
    .filter((r) => !r.empty);
  return { tab, rows, has: (h) => index.has(norm(h)) };
}

/** Collects UNPARSEABLE_DATE counts per tab/column instead of one warning per cell. */
export class DateWarnings {
  private counts = new Map<string, { tab: SheetTab; column: string; n: number }>();
  ts(tab: SheetTab, column: string, cell: string | null): SourceTimestamp {
    const t = parseSheetTimestamp(cell);
    if (t.raw && !t.iso) {
      const k = `${tab}\u0000${column}`;
      const c = this.counts.get(k) ?? { tab, column, n: 0 };
      c.n++;
      this.counts.set(k, c);
    }
    return t;
  }
  warnings(): DataWarning[] {
    return [...this.counts.values()].map((c) => ({
      code: 'UNPARSEABLE_DATE',
      message: `${c.n} “${c.column}” cell${c.n === 1 ? '' : 's'} could not be read as a date; raw text is shown instead.`,
      ref: { tab: c.tab, row: null },
    }));
  }
}

// ---------- Task board ----------

const TASK_COLS = [
  'Task ID',
  'Workstream / output',
  'Owner',
  'Status',
  'Next action / blocker',
  'Done when',
  'Deadline / timezone',
  'Evidence / verified at',
  'Related message / dependency',
  'Draft / output',
  'Outcome / next milestone',
  'Updated at',
];

export function parseTasks(grid: Grid | undefined, dw: DateWarnings): BridgeTask[] {
  const t = table('Task board', grid, TASK_COLS);
  return t.rows
    .filter((r) => r.get('Task ID'))
    .map((r) => {
      const evidence = r.get('Evidence / verified at');
      return {
        id: r.get('Task ID')!,
        workstream: r.get('Workstream / output') ?? '',
        owner: r.get('Owner') ?? '',
        status: r.get('Status') ?? '',
        nextAction: r.get('Next action / blocker'),
        doneWhen: r.get('Done when'),
        deadline: dw.ts('Task board', 'Deadline / timezone', r.get('Deadline / timezone')),
        // The Sheet combines evidence text and verification time in one free-text
        // cell; it is agent-written, so it is "reported", never "observed".
        evidence: { text: evidence, verifiedAt: { raw: null, iso: null }, class: evidence ? 'reported' : 'unknown' },
        relatedMessage: r.get('Related message / dependency'),
        draftOutput: r.get('Draft / output'),
        outcome: r.get('Outcome / next milestone'),
        updatedAt: dw.ts('Task board', 'Updated at', r.get('Updated at')),
        source: { tab: t.tab, row: r.row },
      };
    });
}

// ---------- Messages ----------

const MESSAGE_COLS = ['ID', 'From', 'To', 'Message', 'Status', 'Written at'];

export function parseMessages(grid: Grid | undefined, dw: DateWarnings, tab: 'Messages' | 'Messages archive'): BridgeMessage[] {
  const t = table(tab, grid, MESSAGE_COLS);
  return t.rows
    .filter((r) => r.get('ID'))
    .map((r) => ({
      id: r.get('ID')!,
      from: r.get('From') ?? '',
      to: r.get('To') ?? '',
      body: r.get('Message') ?? '',
      status: r.get('Status') ?? '',
      writtenAt: dw.ts(tab, 'Written at', r.get('Written at')),
      source: { tab, row: r.row },
      ...(tab === 'Messages archive' ? { archived: true } : {}),
    }));
}

// ---------- Delivery log ----------

const DELIVERY_COLS = [
  'Message ID',
  'Recipient',
  'Revision / fingerprint',
  'Written at (Dublin)',
  'Signal received (Dublin)',
  'Processing started (Dublin)',
  'Processing completed (Dublin)',
  'Disposition',
  'Response / task ID',
  'Evidence / error',
  'Health',
  'Reviewed at (Dublin)',
];

export function parseDeliveries(grid: Grid | undefined, dw: DateWarnings): BridgeDeliveryEvent[] {
  const t = table('Delivery log', grid, DELIVERY_COLS);
  const ts = (r: (typeof t.rows)[number], col: string) => dw.ts('Delivery log', col, r.get(col));
  return t.rows
    .filter((r) => r.get('Message ID'))
    .map((r) => ({
      messageId: r.get('Message ID')!,
      recipient: r.get('Recipient') ?? '',
      fingerprint: r.get('Revision / fingerprint'),
      writtenAt: ts(r, 'Written at (Dublin)'),
      signalReceivedAt: ts(r, 'Signal received (Dublin)'),
      processingStartedAt: ts(r, 'Processing started (Dublin)'),
      processingCompletedAt: ts(r, 'Processing completed (Dublin)'),
      disposition: r.get('Disposition'),
      responseRef: r.get('Response / task ID'),
      evidenceOrError: r.get('Evidence / error'),
      health: r.get('Health'),
      reviewedAt: ts(r, 'Reviewed at (Dublin)'),
      source: { tab: t.tab, row: r.row },
    }));
}

// ---------- Agent inventories ----------

const INVENTORY_COLS = ['ID', 'Addressed to', 'Task / responsibility', 'Status', 'Schedule / deadline', 'Next action / blocker'];

/** Extra aliases for free-text matching; every agent also matches its own name. */
const EXTRA_ALIASES: Record<string, string[]> = {
  chatgpt: ['gpt'],
  instinct: ['instinct ai'],
};

export function isInventoryTab(title: string): boolean {
  return / inventory$/i.test(title.trim());
}

export function parseInventory(title: string, grid: Grid | undefined, dw: DateWarnings): AgentInventory {
  const tab = title as SheetTab;
  const t = table(tab, grid, INVENTORY_COLS);
  const displayName = title.replace(/ inventory$/i, '').trim();
  const agentId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const items: InventoryItem[] = t.rows
    .filter((r) => r.get('ID'))
    .map((r) => ({
      id: r.get('ID')!,
      addressedTo: r.get('Addressed to') ?? '',
      responsibility: r.get('Task / responsibility') ?? '',
      status: r.get('Status') ?? '',
      schedule: r.get('Schedule / deadline'),
      nextAction: r.get('Next action / blocker'),
      ...(t.has('Evidence / source') ? { evidence: r.get('Evidence / source') } : {}),
      ...(t.has('Verified / reviewed') ? { reviewedAt: dw.ts(tab, 'Verified / reviewed', r.get('Verified / reviewed')) } : {}),
      source: { tab, row: r.row },
    }));
  return {
    agentId,
    displayName,
    aliases: [displayName.toLowerCase(), ...(EXTRA_ALIASES[agentId] ?? [])],
    inventoryTab: tab,
    items,
  };
}
