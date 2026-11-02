// @vitest-environment node
import { DateWarnings, isInventoryTab, parseDeliveries, parseInventory, parseMessages, parseTasks, SchemaError } from '../src/parse';
import { SYNTHETIC } from './helpers';

describe('Sheet → records', () => {
  it('maps Task board rows by header, skips blank rows and keeps text verbatim', () => {
    const dw = new DateWarnings();
    const tasks = parseTasks(SYNTHETIC['Task board'], dw);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: 'TST-001',
      owner: 'Josh',
      status: 'Awaiting Josh decision',
      deadline: { raw: 'Before 1 Dec (TBC)', iso: null },
      evidence: { text: 'Agent says drafted', class: 'reported' },
      updatedAt: { iso: '2026-11-01T00:00:00Z', precision: 'day' },
      draftOutput: null,
      source: { tab: 'Task board', row: 2 },
    });
    expect(tasks[1]!.evidence.class).toBe('unknown');
    expect(dw.warnings()).toEqual([
      expect.objectContaining({ code: 'UNPARSEABLE_DATE', ref: { tab: 'Task board', row: null } }),
    ]);
  });

  it('finds columns by header name even if the order changes', () => {
    const [header, ...rows] = SYNTHETIC['Task board']!;
    const reversed = [[...header!].reverse(), ...rows.map((r) => [...r].reverse())];
    expect(parseTasks(reversed, new DateWarnings())[0]!.id).toBe('TST-001');
  });

  it('fails closed when a required header is missing or renamed', () => {
    const grid = SYNTHETIC['Task board']!.map((r) => [...r]);
    grid[0]![3] = 'State';
    expect(() => parseTasks(grid, new DateWarnings())).toThrow(SchemaError);
  });

  it('preserves line breaks in messages and flags archive rows', () => {
    const live = parseMessages(SYNTHETIC.Messages, new DateWarnings(), 'Messages');
    expect(live[0]!.body).toBe('Synthetic question about TST-001.\nSecond line.');
    expect(live[0]!.archived).toBeUndefined();
    const old = parseMessages(SYNTHETIC['Messages archive'], new DateWarnings(), 'Messages archive');
    expect(old[0]).toMatchObject({ archived: true, source: { tab: 'Messages archive', row: 2 } });
  });

  it('parses Delivery log Dublin timestamps', () => {
    const [d] = parseDeliveries(SYNTHETIC['Delivery log'], new DateWarnings());
    expect(d!.processingCompletedAt).toEqual({ raw: '01/11/2026 09:02:00', iso: '2026-11-01T09:02:00Z' });
    expect(d!.fingerprint).toBe('abc123');
  });

  it('builds an agent from any "<Name> inventory" tab, including the extra columns', () => {
    expect(isInventoryTab('Claude inventory')).toBe(true);
    expect(isInventoryTab('Inventory notes')).toBe(false);
    const a = parseInventory('Synthbot inventory', SYNTHETIC['Synthbot inventory'], new DateWarnings());
    expect(a).toMatchObject({ agentId: 'synthbot', displayName: 'Synthbot', aliases: ['synthbot'], inventoryTab: 'Synthbot inventory' });
    expect(a.items[0]).toMatchObject({
      id: 'SB-001',
      evidence: 'Synthetic config',
      reviewedAt: { iso: '2026-11-02T00:00:00Z', precision: 'day' },
    });
  });

  it('adds known aliases for ChatGPT', () => {
    const grid = [SYNTHETIC['Synthbot inventory']![0]!];
    expect(parseInventory('ChatGPT inventory', grid, new DateWarnings()).aliases).toEqual(['chatgpt', 'gpt']);
  });
});
