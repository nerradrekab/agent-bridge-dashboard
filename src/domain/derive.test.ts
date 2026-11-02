import { buildMockDataset } from '../data/mock/fixtures';
import {
  agentActivity,
  buildOverview,
  diagnoseDelivery,
  findReferences,
  mentionsAgent,
  mentionsJosh,
  needsJosh,
} from './derive';
import type { BridgeDeliveryEvent, BridgeTask, SourceTimestamp } from './types';

const NOW = new Date('2026-11-02T22:00:00Z');
const ago = (min: number): SourceTimestamp => ({ raw: 'x', iso: new Date(NOW.getTime() - min * 60_000).toISOString() });
const none: SourceTimestamp = { raw: null, iso: null };

function task(over: Partial<BridgeTask>): BridgeTask {
  return {
    id: 'T-1',
    workstream: 'w',
    owner: 'ChatGPT',
    status: 'Active',
    nextAction: null,
    doneWhen: null,
    deadline: none,
    evidence: { text: null, verifiedAt: none, class: 'unknown' },
    relatedMessage: null,
    draftOutput: null,
    outcome: null,
    updatedAt: none,
    source: { tab: 'Task board', row: 2 },
    ...over,
  };
}

function delivery(over: Partial<BridgeDeliveryEvent>): BridgeDeliveryEvent {
  return {
    messageId: 'M-1',
    recipient: 'Instinct',
    fingerprint: null,
    writtenAt: none,
    signalReceivedAt: none,
    processingStartedAt: none,
    processingCompletedAt: none,
    disposition: null,
    responseRef: null,
    evidenceOrError: null,
    health: null,
    reviewedAt: none,
    source: { tab: 'Delivery log', row: 2 },
    ...over,
  };
}

describe('mentionsAgent', () => {
  const instinct = { aliases: ['instinct', 'instinct ai'] };
  const chatgpt = { aliases: ['chatgpt', 'gpt'] };

  it('matches on word boundaries, case-insensitively', () => {
    expect(mentionsAgent('Instinct', instinct)).toBe(true);
    expect(mentionsAgent('instinct (proposed)', instinct)).toBe(true);
    expect(mentionsAgent('ChatGPT → Instinct', instinct)).toBe(true);
    expect(mentionsAgent('ChatGPT → Instinct', chatgpt)).toBe(true);
  });

  it('does not match inside longer words', () => {
    expect(mentionsAgent('Instinctive', instinct)).toBe(false);
    expect(mentionsAgent('GPTs', chatgpt)).toBe(false);
  });

  it('handles empty cells', () => {
    expect(mentionsAgent(null, instinct)).toBe(false);
    expect(mentionsAgent('', instinct)).toBe(false);
  });

  // Josh and Joshua are the same person; other words starting "josh" are not.
  it('treats "Joshua" and "Josh" as the same person', () => {
    expect(mentionsJosh('Joshua')).toBe(true);
    expect(mentionsJosh('Josh')).toBe(true);
    expect(mentionsJosh("Josh's call")).toBe(true);
    expect(mentionsJosh('Joshuas')).toBe(false);
    expect(mentionsJosh('Joshing')).toBe(false);
  });
});

describe('needsJosh', () => {
  it('is true when the status asks for Josh', () => {
    expect(needsJosh(task({ status: 'Awaiting Josh approval', owner: 'Instinct' }))).toBe(true);
  });
  it('is true when Josh owns an open task', () => {
    expect(needsJosh(task({ owner: 'Josh', status: 'In progress' }))).toBe(true);
  });
  it('is true when the next action names Josh', () => {
    expect(needsJosh(task({ nextAction: 'Josh to pick a host' }))).toBe(true);
    expect(needsJosh(task({ nextAction: 'Waiting for Josh’s decision' }))).toBe(true);
    expect(needsJosh(task({ nextAction: 'Awaiting Josh' }))).toBe(true);
    expect(needsJosh(task({ nextAction: 'Joshua to pick a host' }))).toBe(true);
    expect(needsJosh(task({ nextAction: 'Awaiting Joshua’s sign-off' }))).toBe(true);
    expect(needsJosh(task({ owner: 'Joshua', status: 'In progress' }))).toBe(true);
  });
  it('is false for closed tasks even if Josh owns them', () => {
    expect(needsJosh(task({ owner: 'Josh', status: 'Done' }))).toBe(false);
    expect(needsJosh(task({ owner: 'Josh', status: 'Superseded (historical)' }))).toBe(false);
  });
  it('is false when Josh is only mentioned in passing', () => {
    expect(needsJosh(task({ nextAction: 'Send digest; Josh already saw draft' }))).toBe(false);
  });
});

describe('diagnoseDelivery', () => {
  it('failed when disposition or health records a failure', () => {
    const d = diagnoseDelivery(delivery({ health: 'Error', processingCompletedAt: ago(5) }), NOW);
    expect(d.stage).toBe('failed');
  });
  it('processed with latency when completed', () => {
    const d = diagnoseDelivery(delivery({ writtenAt: ago(30), processingCompletedAt: ago(10) }), NOW);
    expect(d).toMatchObject({ stage: 'processed', latencyMinutes: 20 });
  });
  it('processed with unknown latency when written time is missing', () => {
    expect(diagnoseDelivery(delivery({ processingCompletedAt: ago(10) }), NOW).latencyMinutes).toBeNull();
  });
  it('processing when started recently', () => {
    expect(diagnoseDelivery(delivery({ processingStartedAt: ago(20) }), NOW).stage).toBe('processing');
  });
  it('stalled when started over 60 min ago without completion', () => {
    expect(diagnoseDelivery(delivery({ processingStartedAt: ago(61) }), NOW).stage).toBe('stalled');
  });
  it('awaiting-processing when only a signal is recorded', () => {
    expect(diagnoseDelivery(delivery({ writtenAt: ago(300), signalReceivedAt: ago(299) }), NOW).stage).toBe('awaiting-processing');
  });
  it('awaiting-processing when written recently with no signal', () => {
    expect(diagnoseDelivery(delivery({ writtenAt: ago(10) }), NOW).stage).toBe('awaiting-processing');
  });
  it('no-signal when written over 30 min ago with no signal', () => {
    expect(diagnoseDelivery(delivery({ writtenAt: ago(31) }), NOW).stage).toBe('no-signal');
  });
  it('unknown when no timestamp parses', () => {
    const d = diagnoseDelivery(delivery({ writtenAt: { raw: 'earlier today', iso: null } }), NOW);
    expect(d.stage).toBe('unknown');
  });
});

describe('findReferences', () => {
  const ids = ['T-101', 'T-10', 'M-0417'];
  it('returns only IDs that exist and appear as whole tokens', () => {
    expect(findReferences('See T-101 and M-0417.', ids)).toEqual(['T-101', 'M-0417']);
  });
  it('does not match an ID that is a prefix of another token', () => {
    expect(findReferences('See T-101', ['T-10'])).toEqual([]);
    expect(findReferences('XT-101', ['T-101'])).toEqual([]);
  });
  it('ignores unknown IDs and empty text', () => {
    expect(findReferences('Q3-2026 plan, T-999', ids)).toEqual([]);
    expect(findReferences(null, ids)).toEqual([]);
  });
});

describe('fixture-backed derivations', () => {
  const d = buildMockDataset(NOW);

  it('buildOverview KPIs match the demo dataset', () => {
    const o = buildOverview(d.tasks, d.messages, d.deliveries, NOW);
    expect(o.kpis).toEqual({
      openTasks: 6,
      joshActionTasks: 1,
      blockedTasks: 1,
      recentHandoffs: 7,
      recentDeliveryFailures: 3,
      unclassifiedStatuses: 1,
    });
    expect(o.recentWindowHours).toBe(72);
  });

  it('lastVerifiedActivity is the newest observed event only', () => {
    const o = buildOverview(d.tasks, d.messages, d.deliveries, NOW);
    expect(o.lastVerifiedActivity).toMatchObject({ kind: 'delivery', refId: 'M-0418', evidence: 'observed' });
    // Newer reported events exist but must not count as verified.
    expect(Date.parse(o.timeline[0]!.at)).toBeGreaterThan(Date.parse(o.lastVerifiedActivity!.at));
  });

  it('puts Josh-action tasks first in priorities', () => {
    const o = buildOverview(d.tasks, d.messages, d.deliveries, NOW);
    expect(o.priorities[0]!.id).toBe('T-102');
    expect(o.priorities[1]!.id).toBe('T-103');
  });

  it('agentActivity separates observed processing from reported writes', () => {
    const instinct = d.agents.find((a) => a.agentId === 'instinct')!;
    const a = agentActivity(instinct, d.tasks, d.messages, d.deliveries);
    expect(a.lastProcessed?.messageId).toBe('M-0418');
    expect(a.lastMessageWritten?.messageId).toBe('M-0423');
    expect(a.proposedTasks).toBe(1);
  });
});
