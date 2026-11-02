# Bridge read-only API contract (proposal, v1)

**Status:** proposal. No endpoint implementing this exists yet. The HTTP adapter (`src/data/adapters/http.ts`) is written against this document. TypeScript types in `src/domain/types.ts` are the normative schema; this document explains them.

All endpoints are `GET`, read-only, and return JSON. There are no write endpoints in v1.

| Endpoint | `data` type | Source tab(s) |
|---|---|---|
| `GET /api/v1/overview` | `BridgeOverview` | derived from Task board, Messages, Delivery log |
| `GET /api/v1/tasks` | `BridgeTask[]` | Task board |
| `GET /api/v1/messages` | `BridgeMessage[]` | Messages |
| `GET /api/v1/deliveries` | `BridgeDeliveryEvent[]` | Delivery log |
| `GET /api/v1/agents` | `AgentInventory[]` | `<Agent> inventory` tabs |
| `GET /api/v1/health` | `BridgeHealth` | proxy self-checks |

`Start here` and `Mission and profiles` are not exposed in v1. If they are added later, assumptions from `Mission and profiles` must carry `evidence: "hypothesis"`.

## Envelope

Every successful response:

```json
{
  "data": "…endpoint-specific…",
  "meta": {
    "generatedAt": "2026-11-02T22:30:05Z",
    "sourceUpdatedAt": "2026-11-02T22:12:00Z",
    "isDemo": false,
    "warnings": [
      { "code": "UNPARSEABLE_DATE", "message": "Deadline could not be parsed", "ref": { "tab": "Task board", "row": 14 } }
    ]
  }
}
```

| Field | Rule |
|---|---|
| `generatedAt` | Server time the response was built, UTC ISO 8601. Required. |
| `sourceUpdatedAt` | Last modification time of the Sheet (e.g. Drive `modifiedTime`), UTC ISO, or `null` if unknown. The UI shows "source age unknown" for `null`. |
| `isDemo` | `true` only for fixture data. Live responses must send `false`. |
| `warnings[]` | Non-fatal data problems. `code` ∈ `STALE_SOURCE`, `MISSING_FIELD`, `UNPARSEABLE_DATE`, `PARTIAL_DATA`, `DEMO_DATA`. `ref` optional. |

## Records

Every record carries `source: { tab, row }`, where `row` is the 1-based Sheet row. IDs are the Sheet's own IDs, passed through unchanged. Free-text cells are passed through **verbatim** (no trimming of inner whitespace, line breaks preserved). Empty cells become `null`, not `""`.

### SourceTimestamp

```json
{ "raw": "02/11/2026 21:14", "iso": "2026-11-02T21:14:00Z" }
```

- `raw` is the cell's displayed text, or `null` if empty.
- `iso` is the server's UTC parse, or `null` if empty **or ambiguous**.
- Sheet times are in Dublin local time. Parse with IANA zone `Europe/Dublin`, honouring DST.
- Accept only unambiguous formats (`DD/MM/YYYY HH:mm`, ISO 8601, Sheets serial numbers). Anything else ("Tue evening", "End of week (TBC)") gets `iso: null`, keeps `raw`, and adds an `UNPARSEABLE_DATE` warning.
- Never guess a year, time or zone.

### BridgeTask (Task board)

| Field | Column |
|---|---|
| `id` | Task ID |
| `workstream` | Workstream / output |
| `owner` | Owner (free text; may name several parties or "(proposed)") |
| `status` | Status (verbatim) |
| `nextAction` | Next action / blocker |
| `doneWhen` | Done when |
| `deadline` | Deadline / timezone (SourceTimestamp) |
| `evidence` | `{ text, verifiedAt, class }` from Evidence / verified at |
| `relatedMessage` | Related message / dependency |
| `draftOutput` | Draft / output |
| `outcome` | Outcome / next milestone |
| `updatedAt` | Updated at (SourceTimestamp) |

### BridgeMessage (Messages)

`id`, `from`, `to`, `body` (Message), `status`, `writtenAt`.

### BridgeDeliveryEvent (Delivery log)

`messageId`, `recipient`, `fingerprint` (Revision / fingerprint), `writtenAt`, `signalReceivedAt`, `processingStartedAt`, `processingCompletedAt` (the four "(Dublin)" columns), `disposition`, `responseRef` (Response / task ID), `evidenceOrError`, `health`, `reviewedAt`.

### AgentInventory

`agentId` (stable slug), `displayName`, `aliases` (lower-case strings for matching free-text cells), `inventoryTab`, and `items: InventoryItem[]`, where each item has `id`, `addressedTo`, `responsibility`, `status`, `schedule`, `nextAction`.

### BridgeOverview

`kpis` (`openTasks`, `joshActionTasks`, `blockedTasks`, `recentHandoffs`, `recentDeliveryFailures`, `unclassifiedStatuses`), `lastVerifiedActivity` (`TimelineEvent | null`), `priorities` (`BridgeTask[]`, ≤ 5), `timeline` (`TimelineEvent[]`, newest first), `recentWindowHours`. The server should compute this with the same rules as `src/domain/derive.ts`. Reusing that module in the proxy is the simplest way to keep them identical.

### BridgeHealth

`api: "reachable"`, `source: { name, lastModifiedAt }`, and `checks[]` of `{ name, result: pass|warn|fail|unknown, detail, checkedAt }`. `source.name` must be a human label (e.g. "Bridge Sheet"), **never** the Sheet URL or ID.

## Evidence classification

| `class` | When |
|---|---|
| `observed` | Timestamps and values written by bridge automation (Apps Script) in the Delivery log |
| `reported` | Text an agent wrote: Messages, Task board evidence, inventory status |
| `hypothesis` | Attributed assumptions or proposals (`Mission and profiles`) |
| `unknown` | Evidence cell empty |

The proxy must not upgrade a class. For example, a Task board evidence cell that *quotes* the Delivery log is still `reported`, unless the proxy has verified the referenced Delivery log row itself.

## Errors

Non-2xx responses use:

```json
{ "error": { "code": "SOURCE_UNAVAILABLE", "message": "Human-readable, no secrets or Sheet identifiers" } }
```

| HTTP | `code` | Client `ApiError.kind` | Meaning |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | `unauthorised` | No valid session |
| 403 | `FORBIDDEN` | `forbidden` | Signed in, not on the allow-list |
| 503 | `SOURCE_UNAVAILABLE` | `source_unavailable` | Sheet read failed (quota, permission, outage) |
| 200 | – | – | Stale source: return data **with** a `STALE_SOURCE` warning, not an error |
| 409 | `STALE_SOURCE` | `unavailable` | Only if the proxy refuses to serve data older than a hard limit |
| 500 | `INTERNAL` | `unavailable` | Anything else |

Missing required fields in a row: omit nothing silently. Return the row with `null`s and add a `MISSING_FIELD` warning. A malformed envelope is treated by the client as `contract` and not rendered.

## Transport and caching

- HTTPS only. Authentication comes from the proxy's own session (e.g. a Cloudflare Access cookie). The browser sends **no** Authorization header and holds no tokens.
- CORS: `Access-Control-Allow-Origin: <exact Pages origin>` (never `*`), `Access-Control-Allow-Credentials: true`, `Vary: Origin`. Allow `GET` only.
- Responses: `Cache-Control: no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- No sample payloads containing real records may be committed to this repository.
