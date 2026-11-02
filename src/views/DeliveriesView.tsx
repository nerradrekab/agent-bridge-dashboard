import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AgentChip } from '../components/AgentChip';
import { Drawer, Empty, Field } from '../components/Drawer';
import { FilterBar, ResultCount, SearchInput, SelectFilter } from '../components/FilterBar';
import { messageHref } from '../components/LinkedText';
import { EmptyState, QueryBoundary } from '../components/QueryBoundary';
import { STAGE_META } from '../components/stage';
import { StatusBadge } from '../components/StatusBadge';
import { Timestamp } from '../components/Timestamp';
import { Mono, PageHeader, rowProps, SourceLabel, TableScroll } from '../components/ui';
import { useDeliveries } from '../data/hooks';
import {
  diagnoseDelivery,
  NO_SIGNAL_AFTER_MINUTES,
  PROBLEM_STAGES,
  STALL_AFTER_MINUTES,
  tsMillis,
  type DeliveryStage,
} from '../domain/derive';
import type { BridgeDeliveryEvent, SourceTimestamp } from '../domain/types';
import { formatMinutes } from '../lib/format';
import { useNow } from '../lib/now';

const STAGE_ORDER: DeliveryStage[] = ['failed', 'stalled', 'no-signal', 'unknown', 'awaiting-processing', 'processing', 'processed'];

export function StageLabel({ stage }: { stage: DeliveryStage }) {
  const m = STAGE_META[stage];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium" style={{ color: m.color }} data-stage={stage}>
      <span aria-hidden="true">{m.glyph}</span>
      {m.label}
    </span>
  );
}

const STEPS: Array<{ key: keyof BridgeDeliveryEvent; label: string }> = [
  { key: 'writtenAt', label: 'Written' },
  { key: 'signalReceivedAt', label: 'Signal received' },
  { key: 'processingStartedAt', label: 'Processing started' },
  { key: 'processingCompletedAt', label: 'Processing completed' },
  { key: 'reviewedAt', label: 'Reviewed' },
];

/** written → signal → started → completed → reviewed, with gaps called out. */
export function Chronology({ event }: { event: BridgeDeliveryEvent }) {
  let prev: number | null = null;
  return (
    <ol className="relative space-y-0" aria-label="Delivery chronology">
      {STEPS.map((step, i) => {
        const ts = event[step.key] as SourceTimestamp;
        const ms = tsMillis(ts);
        const gap = ms !== null && prev !== null ? Math.round((ms - prev) / 60000) : null;
        const outOfOrder = gap !== null && gap < 0;
        if (ms !== null) prev = ms;
        const recorded = !!(ts.iso || ts.raw);
        return (
          <li key={step.key} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 pb-3 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="mt-1 size-2.5 rounded-full border"
                style={{
                  borderColor: ts.iso ? 'var(--st-done)' : 'var(--st-josh)',
                  borderStyle: recorded ? 'solid' : 'dashed',
                  background: ts.iso ? 'var(--st-done)' : 'transparent',
                }}
              />
              {i < STEPS.length - 1 && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className="min-w-0 text-[13px]">
              <div className="font-medium">{step.label}</div>
              <div className="text-muted">
                {recorded ? <Timestamp value={ts} /> : <span style={{ color: 'var(--st-josh)' }}>Not recorded</span>}
                {gap !== null && (
                  <span className="ml-2 text-[12px] text-faint" style={outOfOrder ? { color: 'var(--st-failed)' } : undefined}>
                    {outOfOrder ? `${formatMinutes(-gap)} before previous step (out of order)` : `+${formatMinutes(gap)}`}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DeliveryTable({ events }: { events: BridgeDeliveryEvent[] }) {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const openId = params.get('msg');
  const setOpen = (id: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('msg', id);
      else n.delete('msg');
      return n;
    });

  const diagnosed = useMemo(() => events.map((e, idx) => ({ e, idx, dx: diagnoseDelivery(e, now) })), [events, now]);
  const counts = new Map<DeliveryStage, number>();
  for (const { dx } of diagnosed) counts.set(dx.stage, (counts.get(dx.stage) ?? 0) + 1);

  const rows = diagnosed
    .filter(({ e, dx }) => {
      if (problemsOnly && !PROBLEM_STAGES.has(dx.stage)) return false;
      if (stage && dx.stage !== stage) return false;
      if (recipient && e.recipient !== recipient) return false;
      if (q && ![e.messageId, e.recipient, e.fingerprint, e.disposition, e.evidenceOrError, e.health, e.responseRef].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => STAGE_ORDER.indexOf(a.dx.stage) - STAGE_ORDER.indexOf(b.dx.stage) || a.idx - b.idx);

  const selected = openId ? diagnosed.find(({ e }) => e.messageId === openId) : undefined;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]" aria-label="Rows per diagnosed stage">
        {STAGE_ORDER.filter((s) => counts.has(s)).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <StageLabel stage={s} />
            <span className="tabular text-fg">{counts.get(s)}</span>
          </span>
        ))}
      </div>
      <div className="mb-3 space-y-2">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} label="Search delivery log" placeholder="Message ID, fingerprint, error…" />
          <SelectFilter label="Stage" value={stage} onChange={setStage} options={STAGE_ORDER.map((s) => ({ value: s, label: STAGE_META[s].label }))} />
          <SelectFilter
            label="Recipient"
            value={recipient}
            onChange={setRecipient}
            options={[...new Set(events.map((e) => e.recipient))].sort().map((r) => ({ value: r, label: r }))}
          />
          <label className="flex h-8 items-center gap-2 text-[13px]">
            <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
            Problems only
          </label>
        </FilterBar>
        <ResultCount shown={rows.length} total={events.length} noun="delivery rows" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No delivery rows match these filters" />
      ) : (
        <TableScroll label="Delivery log">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th scope="col">Message</th>
                <th scope="col">Recipient</th>
                <th scope="col">Diagnosis</th>
                <th scope="col">Written</th>
                <th scope="col">Completed</th>
                <th scope="col">Latency</th>
                <th scope="col">Fingerprint</th>
                <th scope="col">Disposition (raw)</th>
                <th scope="col">Health (raw)</th>
                <th scope="col">Evidence / error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, idx, dx }) => {
                const problem = PROBLEM_STAGES.has(dx.stage);
                return (
                  <tr
                    key={`${e.messageId}-${idx}`}
                    data-testid="delivery-row"
                    data-problem={problem || undefined}
                    style={problem ? { boxShadow: `inset 3px 0 0 ${STAGE_META[dx.stage].color}` } : undefined}
                    {...rowProps(() => setOpen(e.messageId), `Open delivery chronology for ${e.messageId}`)}
                  >
                    <td>
                      <Mono>{e.messageId}</Mono>
                    </td>
                    <td>
                      <AgentChip name={e.recipient} />
                    </td>
                    <td className="max-w-[220px]">
                      <StageLabel stage={dx.stage} />
                      <div className="text-[11px] text-muted">{dx.reason}</div>
                    </td>
                    <td>
                      <Timestamp value={e.writtenAt} relative={false} emptyLabel="Not recorded" />
                    </td>
                    <td>
                      <Timestamp value={e.processingCompletedAt} relative={false} emptyLabel="Not recorded" />
                    </td>
                    <td className="tabular">{formatMinutes(dx.latencyMinutes)}</td>
                    <td>
                      <Mono>{e.fingerprint ?? '—'}</Mono>
                    </td>
                    <td className="max-w-[200px]">{e.disposition ? <StatusBadge raw={e.disposition} /> : <Empty>—</Empty>}</td>
                    <td>{e.health ? <StatusBadge raw={e.health} /> : <Empty>—</Empty>}</td>
                    <td className="max-w-[220px] text-muted">{e.evidenceOrError ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
      <p className="mt-2 text-[12px] text-faint">
        Diagnosis uses recorded timestamps only. Stalled: started over {STALL_AFTER_MINUTES} min ago without completion. No signal: written
        over {NO_SIGNAL_AFTER_MINUTES} min ago with no signal recorded.
      </p>

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setOpen(null)}
        title={selected ? <span className="font-mono">{selected.e.messageId}</span> : ''}
        subtitle={selected ? `Delivery to ${selected.e.recipient} · read-only` : undefined}
      >
        {selected && (
          <>
            <div className="mb-4 rounded-md border border-line px-3 py-2">
              <StageLabel stage={selected.dx.stage} />
              <p className="text-[12px] text-muted">{selected.dx.reason}</p>
            </div>
            <h3 className="mb-2 text-[13px] font-semibold">Chronology</h3>
            <Chronology event={selected.e} />
            <dl className="mt-5">
              <Field label="Revision / fingerprint">{selected.e.fingerprint ? <Mono>{selected.e.fingerprint}</Mono> : <Empty />}</Field>
              <Field label="Disposition (raw)">{selected.e.disposition ? <StatusBadge raw={selected.e.disposition} /> : <Empty />}</Field>
              <Field label="Response / task ID">{selected.e.responseRef ? <Mono>{selected.e.responseRef}</Mono> : <Empty />}</Field>
              <Field label="Evidence / error">{selected.e.evidenceOrError ?? <Empty />}</Field>
              <Field label="Health (raw)">{selected.e.health ? <StatusBadge raw={selected.e.health} /> : <Empty />}</Field>
              <Field label="Message">
                <Link to={messageHref(selected.e.messageId)} className="font-mono text-[12px] text-accent hover:underline">
                  Open {selected.e.messageId} in Messages
                </Link>
              </Field>
              <Field label="Source">
                <SourceLabel source={selected.e.source} />
              </Field>
            </dl>
          </>
        )}
      </Drawer>
    </>
  );
}

export function DeliveriesView() {
  const deliveries = useDeliveries();
  return (
    <>
      <PageHeader
        title="Delivery health"
        description="Rows from the Delivery log. Times written by the bridge automation count as observed evidence. Problem rows are marked on the left edge and sorted first."
      />
      <QueryBoundary query={deliveries} isEmpty={(d) => d.length === 0} emptyTitle="No delivery log rows">
        {(ds) => <DeliveryTable events={ds} />}
      </QueryBoundary>
    </>
  );
}
