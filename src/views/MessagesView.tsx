import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AgentChip } from '../components/AgentChip';
import { Drawer, Empty, Field } from '../components/Drawer';
import { FilterBar, ResultCount, SearchInput, SelectFilter } from '../components/FilterBar';
import { LinkedText, taskHref, type KnownIds } from '../components/LinkedText';
import { EmptyState, QueryBoundary } from '../components/QueryBoundary';
import { StatusBadge } from '../components/StatusBadge';
import { Timestamp } from '../components/Timestamp';
import { Mono, PageHeader, rowProps, SourceLabel, TableScroll } from '../components/ui';
import { useDeliveries, useMessages, useTasks } from '../data/hooks';
import { diagnoseDelivery, findReferences, truncate } from '../domain/derive';
import { CATEGORY_META, CATEGORY_ORDER, classifyStatus } from '../domain/status';
import type { BridgeDeliveryEvent, BridgeMessage, BridgeTask } from '../domain/types';
import { useNow } from '../lib/now';
import { STAGE_META } from '../components/stage';

function MessageTable({ messages, tasks, deliveries }: { messages: BridgeMessage[]; tasks: BridgeTask[]; deliveries: BridgeDeliveryEvent[] }) {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cat, setCat] = useState('');
  const openId = params.get('msg');

  const setOpen = (id: string | null) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('msg', id);
      else n.delete('msg');
      return n;
    });

  const uniq = (xs: string[]) => [...new Set(xs)].sort().map((v) => ({ value: v, label: v }));
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const known: KnownIds = { tasks: taskIds, messages: messages.map((m) => m.id) };

  // Append-only log: newest first, undated rows last.
  const sorted = useMemo(
    () => [...messages].sort((a, b) => (b.writtenAt.iso ? Date.parse(b.writtenAt.iso) : -Infinity) - (a.writtenAt.iso ? Date.parse(a.writtenAt.iso) : -Infinity)),
    [messages],
  );
  const rows = sorted.filter((m) => {
    if (from && m.from !== from) return false;
    if (to && m.to !== to) return false;
    if (cat && classifyStatus(m.status).category !== cat) return false;
    if (q && ![m.id, m.from, m.to, m.body, m.status].join(' ').toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const selected = openId ? messages.find((m) => m.id === openId) : undefined;
  const selectedDeliveries = selected ? deliveries.filter((d) => d.messageId === selected.id) : [];

  return (
    <>
      <div className="mb-3 space-y-2">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} label="Search messages" placeholder="ID, text, task ref…" />
          <SelectFilter label="From" value={from} onChange={setFrom} options={uniq(messages.map((m) => m.from))} />
          <SelectFilter label="To" value={to} onChange={setTo} options={uniq(messages.map((m) => m.to))} />
          <SelectFilter
            label="Status category"
            value={cat}
            onChange={setCat}
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
          />
        </FilterBar>
        <ResultCount shown={rows.length} total={messages.length} noun="messages" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No messages match these filters" />
      ) : (
        <TableScroll label="Messages">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Written at</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Message</th>
                <th scope="col">Task refs</th>
                <th scope="col">Status (raw)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} data-testid="message-row" {...rowProps(() => setOpen(m.id), `Open message ${m.id}`)}>
                  <td>
                    <Mono>{m.id}</Mono>
                  </td>
                  <td>
                    <Timestamp value={m.writtenAt} relative={false} />
                  </td>
                  <td>
                    <AgentChip name={m.from} />
                  </td>
                  <td>
                    <AgentChip name={m.to} />
                  </td>
                  <td className="max-w-[360px] text-muted">{truncate(m.body.replace(/\s+/g, ' '), 120)}</td>
                  <td>
                    <Mono>{findReferences(m.body, taskIds).join(', ') || '—'}</Mono>
                  </td>
                  <td className="max-w-[220px]">
                    <StatusBadge raw={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setOpen(null)}
        title={selected ? <span className="font-mono">{selected.id}</span> : ''}
        subtitle="Messages record · append-only handoff · read-only"
      >
        {selected && (
          <dl>
            <Field label="From">
              <AgentChip name={selected.from} />
            </Field>
            <Field label="To">
              <AgentChip name={selected.to} />
            </Field>
            <Field label="Written at">
              <Timestamp value={selected.writtenAt} emptyLabel="Not recorded" />
            </Field>
            <Field label="Status (raw)">
              <StatusBadge raw={selected.status} />
            </Field>
            <Field label="Message">
              <div className="rounded-md border border-line bg-surface-2 px-3 py-2 leading-relaxed">
                <LinkedText text={selected.body} known={known} />
              </div>
            </Field>
            <Field label="Task references">
              {findReferences(selected.body, taskIds).length ? (
                <span className="flex flex-wrap gap-2">
                  {findReferences(selected.body, taskIds).map((id) => (
                    <Link key={id} to={taskHref(id)} className="font-mono text-[12px] text-accent hover:underline">
                      {id}
                    </Link>
                  ))}
                </span>
              ) : (
                <Empty>None found</Empty>
              )}
            </Field>
            <Field label="Delivery log">
              {selectedDeliveries.length === 0 ? (
                <Empty>No Delivery log row for this message</Empty>
              ) : (
                <ul className="space-y-1">
                  {selectedDeliveries.map((d, i) => {
                    const dx = diagnoseDelivery(d, now);
                    return (
                      <li key={i}>
                        <span style={{ color: STAGE_META[dx.stage].color }}>
                          {STAGE_META[dx.stage].glyph} {STAGE_META[dx.stage].label}
                        </span>{' '}
                        <span className="text-muted">for {d.recipient}</span>{' '}
                        <Link to={`/deliveries?msg=${encodeURIComponent(d.messageId)}`} className="text-accent hover:underline">
                          view
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Field>
            <Field label="Source">
              <SourceLabel source={selected.source} />
            </Field>
          </dl>
        )}
      </Drawer>
    </>
  );
}

export function MessagesView() {
  const messages = useMessages();
  const tasks = useTasks();
  const deliveries = useDeliveries();
  return (
    <>
      <PageHeader
        title="Messages"
        description="Append-only handoffs recorded in the Messages tab. These are periodic records, not a live conversation. A written message is not proof it was read."
      />
      <QueryBoundary query={messages} isEmpty={(d) => d.length === 0} emptyTitle="No handoffs recorded">
        {(ms) => (
          <QueryBoundary query={tasks} noBanner>
            {(ts) => (
              <QueryBoundary query={deliveries} noBanner>
                {(ds) => <MessageTable messages={ms} tasks={ts} deliveries={ds} />}
              </QueryBoundary>
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </>
  );
}
