/**
 * Domain model for the Agent Bridge.
 *
 * These types mirror the seven tabs of the operational Google Sheet. They are
 * deliberately permissive: the Sheet holds descriptive, human-written status
 * strings, so raw text is always preserved and any classification is a
 * secondary, client-side interpretation.
 */

export const SHEET_TABS = [
  'Start here',
  'Task board',
  'Delivery log',
  'Mission and profiles',
  'ChatGPT inventory',
  'Instinct inventory',
  'Messages',
] as const;

/** Known tabs plus future inventory tabs for agents added later. */
export type SheetTab = (typeof SHEET_TABS)[number] | `${string} inventory`;

/** Where a record came from in the source of truth. */
export interface SourceRef {
  tab: SheetTab;
  /** 1-based spreadsheet row, or null when not applicable (derived records). */
  row: number | null;
}

/**
 * A timestamp as it appears in the Sheet, plus the server's parse of it.
 * `iso` is null when the cell is empty or could not be parsed unambiguously;
 * the UI then shows "Unknown" alongside the raw text.
 */
export interface SourceTimestamp {
  raw: string | null;
  /** ISO 8601 in UTC (e.g. 2026-11-02T22:30:00Z) */
  iso: string | null;
}

/**
 * How much weight a claim can bear.
 * - observed:   written by the bridge's own automation (e.g. Apps Script delivery timestamps)
 * - reported:   written by an agent about its own work, not independently verified
 * - hypothesis: an attributed assumption or proposal (e.g. Mission and profiles)
 * - unknown:    no evidence recorded
 */
export type EvidenceClass = 'observed' | 'reported' | 'hypothesis' | 'unknown';

export interface Evidence {
  text: string | null;
  verifiedAt: SourceTimestamp;
  class: EvidenceClass;
}

/** Task board row. Columns in order, as in the Sheet. */
export interface BridgeTask {
  id: string;
  workstream: string;
  owner: string;
  status: string;
  nextAction: string | null;
  doneWhen: string | null;
  deadline: SourceTimestamp;
  evidence: Evidence;
  relatedMessage: string | null;
  draftOutput: string | null;
  outcome: string | null;
  updatedAt: SourceTimestamp;
  source: SourceRef;
}

/** Messages row (append-only cross-agent handoff). */
export interface BridgeMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  status: string;
  writtenAt: SourceTimestamp;
  source: SourceRef;
}

/** Delivery log row. */
export interface BridgeDeliveryEvent {
  messageId: string;
  recipient: string;
  fingerprint: string | null;
  writtenAt: SourceTimestamp;
  signalReceivedAt: SourceTimestamp;
  processingStartedAt: SourceTimestamp;
  processingCompletedAt: SourceTimestamp;
  disposition: string | null;
  responseRef: string | null;
  evidenceOrError: string | null;
  health: string | null;
  reviewedAt: SourceTimestamp;
  source: SourceRef;
}

/** Row from a "<Agent> inventory" tab. */
export interface InventoryItem {
  id: string;
  addressedTo: string;
  responsibility: string;
  status: string;
  schedule: string | null;
  nextAction: string | null;
  source: SourceRef;
}

/** One agent and its inventory. New agents are added by the API, not the UI. */
export interface AgentInventory {
  agentId: string;
  displayName: string;
  /** Lower-case strings used to match this agent in free-text Owner/From/To cells. */
  aliases: string[];
  inventoryTab: SheetTab;
  items: InventoryItem[];
}

export type WarningCode =
  | 'STALE_SOURCE'
  | 'MISSING_FIELD'
  | 'UNPARSEABLE_DATE'
  | 'PARTIAL_DATA'
  | 'DEMO_DATA';

export interface DataWarning {
  code: WarningCode;
  message: string;
  ref?: SourceRef;
}

/** Metadata attached to every API response. */
export interface ResponseMeta {
  /** When the server produced this response (UTC ISO). */
  generatedAt: string;
  /** When the underlying Sheet was last modified, if known (UTC ISO). */
  sourceUpdatedAt: string | null;
  isDemo: boolean;
  warnings: DataWarning[];
}

export interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
}

/** A single dated event for the overview timeline. */
export interface TimelineEvent {
  at: string;
  kind: 'message' | 'delivery' | 'task';
  title: string;
  detail: string | null;
  evidence: EvidenceClass;
  refId: string;
  source: SourceRef;
}

export interface BridgeOverview {
  kpis: {
    openTasks: number;
    joshActionTasks: number;
    blockedTasks: number;
    recentHandoffs: number;
    recentDeliveryFailures: number;
    unclassifiedStatuses: number;
  };
  /** Most recent activity the bridge automation itself recorded. */
  lastVerifiedActivity: TimelineEvent | null;
  priorities: BridgeTask[];
  timeline: TimelineEvent[];
  /** Window (hours) used for "recent" KPIs. */
  recentWindowHours: number;
}

export interface BridgeHealth {
  api: 'reachable' | 'demo';
  source: {
    name: string;
    lastModifiedAt: string | null;
  };
  checks: Array<{
    name: string;
    result: 'pass' | 'warn' | 'fail' | 'unknown';
    detail: string;
    checkedAt: string | null;
  }>;
}
