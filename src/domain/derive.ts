/**
 * Pure derivations over bridge records. No I/O; `now` is always injected so
 * results are deterministic and testable.
 */
import type {
  AgentInventory,
  BridgeDeliveryEvent,
  BridgeMessage,
  BridgeOverview,
  BridgeTask,
  SourceTimestamp,
  TimelineEvent,
} from './types';
import { classifyStatus, isOpen } from './status';

export const HUMAN_ALIASES = ['josh'];

export function tsMillis(t: SourceTimestamp | null | undefined): number | null {
  if (!t?.iso) return null;
  const ms = Date.parse(t.iso);
  return Number.isNaN(ms) ? null : ms;
}

const words = (s: string) => s.toLowerCase();

/** Does a free-text cell (Owner, From, To, Recipient) name this agent? */
export function mentionsAgent(cell: string | null | undefined, agent: Pick<AgentInventory, 'aliases'>): boolean {
  if (!cell) return false;
  const text = words(cell);
  return agent.aliases.some((a) => new RegExp(`\\b${escapeRegExp(a.toLowerCase())}\\b`).test(text));
}

export function mentionsJosh(cell: string | null | undefined): boolean {
  return mentionsAgent(cell, { aliases: HUMAN_ALIASES });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A task needs Josh when its status asks for him, or when he is named as the
 * owner (or in the next action) and the task is still open.
 */
export function needsJosh(task: BridgeTask): boolean {
  const s = classifyStatus(task.status);
  if (s.category === 'needs-josh') return true;
  if (!isOpen(s.category)) return false;
  const next = task.nextAction ?? '';
  return (
    mentionsJosh(task.owner) ||
    /\bjosh\s+(to|must|should|needs? to)\b|\b(awaiting|needs?|for)\s+josh\b|\bjosh'?s (approval|decision|sign[- ]?off)\b/i.test(next)
  );
}

// ---------- Delivery diagnosis ----------

export type DeliveryStage =
  | 'failed'
  | 'processed'
  | 'stalled'
  | 'processing'
  | 'awaiting-processing'
  | 'no-signal'
  | 'unknown';

export interface DeliveryDiagnosis {
  stage: DeliveryStage;
  /** Human-readable reason derived only from recorded timestamps / text. */
  reason: string;
  /** Minutes from written → completed, if both are known. */
  latencyMinutes: number | null;
}

export const STALL_AFTER_MINUTES = 60;
export const NO_SIGNAL_AFTER_MINUTES = 30;

export function diagnoseDelivery(e: BridgeDeliveryEvent, now: Date): DeliveryDiagnosis {
  const written = tsMillis(e.writtenAt);
  const signal = tsMillis(e.signalReceivedAt);
  const started = tsMillis(e.processingStartedAt);
  const completed = tsMillis(e.processingCompletedAt);
  const nowMs = now.getTime();
  const mins = (ms: number) => Math.round(ms / 60000);

  const dispo = classifyStatus(e.disposition);
  const health = classifyStatus(e.health);
  if (dispo.category === 'failed' || health.category === 'failed') {
    return { stage: 'failed', reason: 'Disposition or health records a failure', latencyMinutes: null };
  }
  if (completed !== null) {
    return {
      stage: 'processed',
      reason: 'Processing-completed timestamp recorded',
      latencyMinutes: written !== null ? mins(completed - written) : null,
    };
  }
  if (started !== null) {
    const age = mins(nowMs - started);
    return age > STALL_AFTER_MINUTES
      ? { stage: 'stalled', reason: `Started ${age} min ago with no completion recorded`, latencyMinutes: null }
      : { stage: 'processing', reason: `Started ${age} min ago`, latencyMinutes: null };
  }
  if (signal !== null) {
    return { stage: 'awaiting-processing', reason: 'Signal received; processing not yet recorded', latencyMinutes: null };
  }
  if (written !== null) {
    const age = mins(nowMs - written);
    return age > NO_SIGNAL_AFTER_MINUTES
      ? { stage: 'no-signal', reason: `Written ${age} min ago; no signal recorded`, latencyMinutes: null }
      : { stage: 'awaiting-processing', reason: `Written ${age} min ago`, latencyMinutes: null };
  }
  return { stage: 'unknown', reason: 'No usable timestamps in this row', latencyMinutes: null };
}

export const PROBLEM_STAGES: ReadonlySet<DeliveryStage> = new Set(['failed', 'stalled', 'no-signal', 'unknown']);

// ---------- References ----------

/**
 * Find IDs of known records mentioned in free text. Only IDs that actually
 * exist are returned, so a stray "Q3-2026" never becomes a fake link.
 */
export function findReferences(text: string | null | undefined, knownIds: Iterable<string>): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const id of knownIds) {
    if (!id) continue;
    if (new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(id)}(?![A-Za-z0-9])`).test(text)) found.push(id);
  }
  return found;
}

// ---------- Agent activity ----------

export interface AgentActivity {
  /** Latest delivery to this agent with a recorded completion (observed). */
  lastProcessed: { at: string; messageId: string } | null;
  /** Latest message this agent wrote to the Messages tab (reported). */
  lastMessageWritten: { at: string; messageId: string } | null;
  openTasks: number;
  blockedTasks: number;
  proposedTasks: number;
}

export function agentActivity(
  agent: AgentInventory,
  tasks: BridgeTask[],
  messages: BridgeMessage[],
  deliveries: BridgeDeliveryEvent[],
): AgentActivity {
  const latest = <T>(items: T[], at: (t: T) => number | null) =>
    items.reduce<{ item: T; ms: number } | null>((best, item) => {
      const ms = at(item);
      return ms !== null && (best === null || ms > best.ms) ? { item, ms } : best;
    }, null);

  const processed = latest(
    deliveries.filter((d) => mentionsAgent(d.recipient, agent)),
    (d) => tsMillis(d.processingCompletedAt),
  );
  const written = latest(
    messages.filter((m) => mentionsAgent(m.from, agent)),
    (m) => tsMillis(m.writtenAt),
  );
  const owned = tasks.filter((t) => mentionsAgent(t.owner, agent));
  const cats = owned.map((t) => classifyStatus(t.status).category);
  return {
    lastProcessed: processed
      ? { at: new Date(processed.ms).toISOString(), messageId: processed.item.messageId }
      : null,
    lastMessageWritten: written ? { at: new Date(written.ms).toISOString(), messageId: written.item.id } : null,
    openTasks: cats.filter(isOpen).length,
    blockedTasks: cats.filter((c) => c === 'blocked').length,
    proposedTasks: cats.filter((c) => c === 'proposed').length,
  };
}

// ---------- Overview ----------

export function buildTimeline(
  tasks: BridgeTask[],
  messages: BridgeMessage[],
  deliveries: BridgeDeliveryEvent[],
  limit = 15,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const m of messages) {
    if (!m.writtenAt.iso) continue;
    events.push({
      at: m.writtenAt.iso,
      kind: 'message',
      title: `${m.from} → ${m.to}: handoff ${m.id} written`,
      detail: truncate(m.body, 140),
      evidence: 'reported',
      refId: m.id,
      source: m.source,
    });
  }
  for (const d of deliveries) {
    if (!d.processingCompletedAt.iso) continue;
    events.push({
      at: d.processingCompletedAt.iso,
      kind: 'delivery',
      title: `${d.messageId} processed for ${d.recipient}`,
      detail: d.disposition,
      evidence: 'observed',
      refId: d.messageId,
      source: d.source,
    });
  }
  for (const t of tasks) {
    if (!t.updatedAt.iso) continue;
    events.push({
      at: t.updatedAt.iso,
      kind: 'task',
      title: `${t.id} updated — ${t.status}`,
      detail: t.workstream,
      evidence: t.evidence.class === 'observed' ? 'observed' : 'reported',
      refId: t.id,
      source: t.source,
    });
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

export function buildOverview(
  tasks: BridgeTask[],
  messages: BridgeMessage[],
  deliveries: BridgeDeliveryEvent[],
  now: Date,
  recentWindowHours = 72,
): BridgeOverview {
  const windowStart = now.getTime() - recentWindowHours * 3600_000;
  const classified = tasks.map((t) => ({ t, s: classifyStatus(t.status) }));
  const open = classified.filter(({ s }) => isOpen(s.category));
  const josh = tasks.filter(needsJosh);
  const blocked = classified.filter(({ s }) => s.category === 'blocked');

  const recentHandoffs = messages.filter((m) => {
    const ms = tsMillis(m.writtenAt);
    return ms !== null && ms >= windowStart;
  }).length;

  const recentFailures = deliveries.filter((d) => {
    const dx = diagnoseDelivery(d, now);
    if (!PROBLEM_STAGES.has(dx.stage)) return false;
    const ms = tsMillis(d.writtenAt) ?? tsMillis(d.signalReceivedAt);
    // Undated problems count as recent: unknown is worth surfacing.
    return ms === null || ms >= windowStart;
  }).length;

  const priorityRank = (t: BridgeTask) => {
    if (needsJosh(t)) return 0;
    const c = classifyStatus(t.status).category;
    if (c === 'blocked' || c === 'failed') return 1;
    return 2;
  };
  const priorities = open
    .map(({ t }) => t)
    .sort((a, b) => {
      const r = priorityRank(a) - priorityRank(b);
      if (r !== 0) return r;
      const da = tsMillis(a.deadline) ?? Number.POSITIVE_INFINITY;
      const db = tsMillis(b.deadline) ?? Number.POSITIVE_INFINITY;
      return da - db;
    })
    .slice(0, 5);

  const timeline = buildTimeline(tasks, messages, deliveries);
  const lastVerifiedActivity = timeline.find((e) => e.evidence === 'observed') ?? null;

  return {
    kpis: {
      openTasks: open.length,
      joshActionTasks: josh.length,
      blockedTasks: blocked.length,
      recentHandoffs,
      recentDeliveryFailures: recentFailures,
      unclassifiedStatuses: classified.filter(({ s }) => s.category === 'unclassified').length,
    },
    lastVerifiedActivity,
    priorities,
    timeline,
    recentWindowHours,
  };
}

export function truncate(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Minutes since an ISO timestamp, or null if unknown. */
export function ageMinutes(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.round((now.getTime() - ms) / 60000);
}
