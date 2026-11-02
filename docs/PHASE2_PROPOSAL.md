# Phase 2 proposal: read-only live data

**Status:** proposal only. Nothing here is built or connected. Each step marked **[Josh approves]** needs explicit approval before work starts.

## 1. Recommended design

**Cloudflare Worker behind Cloudflare Access, using a read-only Google service account scoped to the one bridge Sheet.**

```
Browser (Pages) ──HTTPS + Access cookie──▶ Cloudflare Access ──▶ Worker ──▶ Google Sheets API (read-only)
```

| Concern | Choice | Why |
|---|---|---|
| Who can call it | Cloudflare Access policy allowing only Josh’s identity (email OTP or Google IdP) | No custom auth code; the Worker never sees a request without a valid Access JWT |
| Worker checks | Verify the `Cf-Access-Jwt-Assertion` JWT (audience + issuer) on every request, as defence in depth | Prevents bypass if a route is misconfigured |
| Sheet credential | Service account JSON stored as a Worker **secret**; scope `spreadsheets.readonly`; the Sheet shared with that account as **Viewer** only | Least privilege; cannot write even if compromised |
| Sheet identity | Sheet ID stored as a Worker secret/variable, never in this repo or the bundle | Keeps the identifier private |
| Output | The Envelope contract in `docs/API_CONTRACT.md` | UI needs no change. Set `VITE_DATA_SOURCE=http` and `VITE_API_BASE_URL` |
| Caching | Worker may cache Sheet reads in memory for ≤ 60 s; responses `no-store` | Protects quota without leaking via shared caches |
| Logging | Log request ID, status and latency only. Never log cell contents. | No private data in logs |

**Alternative:** a Vercel serverless function with Vercel Authentication or Auth.js. This works, but needs more auth code in the function itself, and you'd be adding a second platform. Choose it only if a Cloudflare account is unwanted.

**Not acceptable:** an API key or OAuth token in the static bundle; publishing the Sheet to the web; Apps Script `doGet` web apps deployed as "Anyone". Each of these exposes the data or the identifier publicly.

## 2. Steps

1. **[Josh approves]** Choose the host (Worker + Access recommended) and the identity for the Access policy.
2. Create the Worker locally with the contract endpoints, reusing `src/domain/` for overview derivation. Write unit tests against **synthetic** rows only.
3. **[Josh approves]** Create a service account and share the Sheet with it as **Viewer**. Nothing in the existing Sheet, Apps Script or Gmail triggers is modified.
4. Deploy the Worker behind Access, with no browser client yet. Check from the CLI that requests without a session get 401/403, and that a session gets 200.
5. **Row-mapping verification** (below) against the live Sheet, run privately. No output is committed.
6. **[Josh approves]** Build a private preview of the dashboard with `VITE_DATA_SOURCE=http`. Decide whether the public Pages build stays on mock data permanently (recommended) or points at the proxy. Even when it points at the proxy, Access keeps the data private.

## 3. Row-mapping verification plan

Run against the live Sheet with output shown only to Josh, never committed:

- **Headers:** assert the exact column order for Task board, Messages, Delivery log and both inventories. Fail closed (`SOURCE_UNAVAILABLE` + warning) if a header moves or is renamed, rather than mis-mapping.
- **IDs:** every row has a non-empty ID. Report duplicates. Record the real ID formats so `findReferences` can be tuned (open question 3).
- **Timestamps:** parse every date cell. Report the count and examples of `iso: null` per column. Confirm Dublin-local parsing around the last DST change.
- **Status text:** list every distinct status string with its classifier result. Josh reviews the `unclassified` and `(mixed)` ones, and new patterns are added only where the meaning is unambiguous.
- **Long text:** confirm multi-paragraph Message bodies and line breaks survive the API without truncation.
- **Owner/From/To:** list every distinct value and check that each one matches the intended agent aliases (e.g. "Instinct (proposed)", "ChatGPT → Instinct").
- **Delivery log:** spot-check five rows end to end against the Apps Script's own records.

## 4. Later: audited approvals (separate authorisation)

Not part of Phase 2. When wanted, propose separately:

- Write endpoints that **append** a decision row (e.g. to Messages or a new `Decisions` tab) rather than editing existing cells. This keeps the append-only model.
- Each write records who (from the Access identity), when, what was approved, and the exact record version (row + fingerprint) it applies to.
- Idempotency keys to prevent duplicate approvals or acknowledgement loops.
- Approval never triggers an agent or an external send directly. Agents read the decision on their normal schedule, which preserves "one agent’s request doesn’t authorise another".
- A separate Access policy and a separate service-account scope for writes. Read-only stays the default.
