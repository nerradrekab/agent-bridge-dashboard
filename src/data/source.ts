import type {
  AgentInventory,
  BridgeDeliveryEvent,
  BridgeHealth,
  BridgeMessage,
  BridgeOverview,
  BridgeTask,
  Envelope,
} from '../domain/types';

/**
 * The only seam between UI and data. Views never know whether data comes from
 * fixtures or the secure proxy. Every method returns an Envelope so the UI can
 * show provenance (generated/source timestamps, demo flag, warnings).
 *
 * All methods are READ-ONLY. Write operations (approvals, instructions) are
 * intentionally absent until an authenticated, audited API is authorised.
 */
export interface BridgeDataSource {
  readonly kind: 'mock' | 'http';
  getOverview(): Promise<Envelope<BridgeOverview>>;
  getTasks(): Promise<Envelope<BridgeTask[]>>;
  getMessages(): Promise<Envelope<BridgeMessage[]>>;
  getDeliveryEvents(): Promise<Envelope<BridgeDeliveryEvent[]>>;
  getAgentInventories(): Promise<Envelope<AgentInventory[]>>;
  getHealth(): Promise<Envelope<BridgeHealth>>;
}

export type ApiErrorKind =
  | 'not_configured'
  | 'unauthorised'
  | 'forbidden'
  | 'source_unavailable'
  | 'unavailable'
  | 'contract'
  | 'network';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}
