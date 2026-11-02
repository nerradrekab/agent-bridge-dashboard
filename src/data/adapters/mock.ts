import { buildOverview } from '../../domain/derive';
import type { BridgeHealth, Envelope, ResponseMeta } from '../../domain/types';
import { buildMockDataset, type MockDataset } from '../mock/fixtures';
import type { BridgeDataSource } from '../source';

export interface MockOptions {
  now?: () => Date;
  /** Simulated latency so loading states are visible in development. */
  latencyMs?: number;
}

/** Serves fictional fixtures through the same contract as the HTTP adapter. */
export function createMockDataSource(opts: MockOptions = {}): BridgeDataSource {
  const now = opts.now ?? (() => new Date());
  const latency = opts.latencyMs ?? 250;
  let cached: { at: number; data: MockDataset } | null = null;

  const dataset = () => {
    const n = now();
    // Rebuild at most once a minute so relative times stay coherent across views.
    if (!cached || n.getTime() - cached.at > 60_000) cached = { at: n.getTime(), data: buildMockDataset(n) };
    return cached.data;
  };

  const wrap = async <T>(fn: (d: MockDataset) => T): Promise<Envelope<T>> => {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    const d = dataset();
    const meta: ResponseMeta = {
      generatedAt: now().toISOString(),
      sourceUpdatedAt: d.sourceUpdatedAt,
      isDemo: true,
      warnings: [{ code: 'DEMO_DATA', message: 'Fictional demo data. No live bridge records are loaded.' }],
    };
    return { data: fn(d), meta };
  };

  return {
    kind: 'mock',
    getOverview: () => wrap((d) => buildOverview(d.tasks, d.messages, d.deliveries, now())),
    getTasks: () => wrap((d) => d.tasks),
    getMessages: () => wrap((d) => d.messages),
    getDeliveryEvents: () => wrap((d) => d.deliveries),
    getAgentInventories: () => wrap((d) => d.agents),
    getHealth: () =>
      wrap<BridgeHealth>((d) => ({
        api: 'demo',
        source: { name: 'Mock fixtures (fictional)', lastModifiedAt: d.sourceUpdatedAt },
        checks: [
          { name: 'Secure API proxy', result: 'unknown', detail: 'Not deployed. Phase 2.', checkedAt: null },
          { name: 'Sheet read access', result: 'unknown', detail: 'Not connected in demo mode.', checkedAt: null },
          { name: 'Fixture integrity', result: 'pass', detail: 'Demo dataset loaded.', checkedAt: now().toISOString() },
        ],
      })),
  };
}
