import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AgentChip } from '../components/AgentChip';
import { Drawer, Empty, Field } from '../components/Drawer';
import { EvidenceTag } from '../components/EvidenceTag';
import { FilterBar, ResultCount, SearchInput, SelectFilter } from '../components/FilterBar';
import { LinkedText, messageHref, type KnownIds } from '../components/LinkedText';
import { EmptyState, QueryBoundary } from '../components/QueryBoundary';
import { CategoryPill, StatusBadge } from '../components/StatusBadge';
import { Timestamp } from '../components/Timestamp';
import { Mono, PageHeader, rowProps, SourceLabel, TableScroll } from '../components/ui';
import { useAgents, useMessages, useTasks } from '../data/hooks';
import { findReferences, mentionsAgent, mentionsJosh, needsJosh } from '../domain/derive';
import { CATEGORY_META, CATEGORY_ORDER, classifyStatus, type StatusCategory } from '../domain/status';
import type { AgentInventory, BridgeMessage, BridgeTask } from '../domain/types';

const JOSH = '__josh';

function taskText(t: BridgeTask): string {
  return [t.id, t.workstream, t.owner, t.status, t.nextAction, t.doneWhen, t.evidence.text, t.relatedMessage, t.draftOutput, t.outcome]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function linkedMessages(task: BridgeTask, messages: BridgeMessage[]): BridgeMessage[] {
  const explicit = new Set(findReferences(task.relatedMessage, messages.map((m) => m.id)));
  return messages.filter((m) => explicit.has(m.id) || findReferences(m.body, [task.id]).length > 0);
}

function TaskDetail({ task, messages, known }: { task: BridgeTask; messages: BridgeMessage[]; known: KnownIds }) {
  const s = classifyStatus(task.status);
  const related = linkedMessages(task, messages);
  return (
    <>
      <dl>
        <Field label="Status (raw)">
          <StatusBadge raw={task.status} />
          <div className="mt-1 text-[12px] text-muted">
            Interpreted as {CATEGORY_META[s.category].label}
            {s.ambiguous && <> (also: {s.matches.slice(1).map((m) => CATEGORY_META[m].label).join(', ')})</>}. Interpretation
            only; the raw text is authoritative.
          </div>
        </Field>
        <Field label="Owner">
          <AgentChip name={task.owner} />
        </Field>
        <Field label="Next action / blocker">{task.nextAction ? <LinkedText text={task.nextAction} known={known} /> : <Empty />}</Field>
        <Field label="Done when">{task.doneWhen ?? <Empty />}</Field>
        <Field label="Deadline / timezone">
          <Timestamp value={task.deadline} emptyLabel="Not recorded" />
        </Field>
        <Field label="Evidence">
          <div className="flex flex-wrap items-center gap-2">
            <EvidenceTag value={task.evidence.class} />
            {task.evidence.text ? <LinkedText text={task.evidence.text} known={known} /> : <Empty>No evidence recorded</Empty>}
          </div>
        </Field>
        <Field label="Evidence verified at">
          <Timestamp value={task.evidence.verifiedAt} emptyLabel="Not recorded" />
        </Field>
        <Field label="Related message / dependency">
          {task.relatedMessage ? <LinkedText text={task.relatedMessage} known={known} /> : <Empty />}
        </Field>
        <Field label="Draft / output">{task.draftOutput ? <Mono>{task.draftOutput}</Mono> : <Empty />}</Field>
        <Field label="Outcome / next milestone">{task.outcome ? <LinkedText text={task.outcome} known={known} /> : <Empty />}</Field>
        <Field label="Updated at">
          <Timestamp value={task.updatedAt} emptyLabel="Not recorded" />
        </Field>
        <Field label="Source">
          <SourceLabel source={task.source} />
        </Field>
      </dl>
      <h3 className="mt-5 mb-2 text-[13px] font-semibold">Linked messages</h3>
      {related.length === 0 ? (
        <p className="text-[13px] text-muted">No messages reference {task.id}.</p>
      ) : (
        <ul className="space-y-2">
          {related.map((m) => (
            <li key={m.id} className="rounded-md border border-line px-3 py-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link to={messageHref(m.id)} className="font-mono text-[12px] text-accent hover:underline">
                  {m.id}
                </Link>
                <span className="text-muted">
                  {m.from} → {m.to}
                </span>
                <Timestamp value={m.writtenAt} />
              </div>
              <div className="mt-1">
                <StatusBadge raw={m.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TaskTable({ tasks, agents, messages }: { tasks: BridgeTask[]; agents: AgentInventory[]; messages: BridgeMessage[] }) {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [workstream, setWorkstream] = useState('');
  const cat = (params.get('cat') ?? '') as StatusCategory | '';
  const openId = params.get('task');

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: key === 'cat' },
    );

  const classified = useMemo(() => tasks.map((t) => ({ t, s: classifyStatus(t.status) })), [tasks]);
  const counts = useMemo(() => {
    const c = new Map<StatusCategory, number>();
    for (const { s } of classified) c.set(s.category, (c.get(s.category) ?? 0) + 1);
    return c;
  }, [classified]);
  const workstreams = useMemo(() => [...new Set(tasks.map((t) => t.workstream))].sort(), [tasks]);
  const ownerOptions = [...agents.map((a) => ({ value: a.agentId, label: a.displayName })), { value: JOSH, label: 'Josh' }];

  const rows = classified.filter(({ t, s }) => {
    if (cat && s.category !== cat) return false;
    if (workstream && t.workstream !== workstream) return false;
    if (owner) {
      if (owner === JOSH ? !mentionsJosh(t.owner) : !mentionsAgent(t.owner, agents.find((a) => a.agentId === owner) ?? { aliases: [] }))
        return false;
    }
    if (q && !taskText(t).includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const known: KnownIds = { tasks: tasks.map((t) => t.id), messages: messages.map((m) => m.id) };
  const selected = openId ? tasks.find((t) => t.id === openId) : undefined;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-x-1 gap-y-1.5" role="group" aria-label="Filter by interpreted category">
        {CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setParam('cat', cat === c ? null : c)}
            className={`rounded-md border px-2 py-0.5 ${cat === c ? 'border-line-strong bg-surface-3' : 'border-transparent hover:bg-surface-2'}`}
          >
            <CategoryPill category={c} count={counts.get(c)} />
          </button>
        ))}
      </div>

      <div className="mb-3 space-y-2">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} label="Search tasks" placeholder="ID, workstream, next action…" />
          <SelectFilter label="Owner (mentions)" value={owner} onChange={setOwner} options={ownerOptions} />
          <SelectFilter
            label="Category"
            value={cat}
            onChange={(v) => setParam('cat', v || null)}
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
          />
          <SelectFilter label="Workstream" value={workstream} onChange={setWorkstream} options={workstreams.map((w) => ({ value: w, label: w }))} />
        </FilterBar>
        <ResultCount shown={rows.length} total={tasks.length} noun="tasks" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No tasks match these filters" />
      ) : (
        <TableScroll label="Tasks">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Workstream / output</th>
                <th scope="col">Owner</th>
                <th scope="col">Status (raw)</th>
                <th scope="col">Next action / blocker</th>
                <th scope="col">Deadline</th>
                <th scope="col">Evidence</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t }) => (
                <tr key={t.id} data-testid="task-row" {...rowProps(() => setParam('task', t.id), `Open details for ${t.id}`)}>
                  <td>
                    <Mono>{t.id}</Mono>
                    {needsJosh(t) && (
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--st-josh)' }}>
                        ! Josh
                      </div>
                    )}
                  </td>
                  <td className="max-w-[240px]">{t.workstream}</td>
                  <td>
                    <AgentChip name={t.owner} />
                  </td>
                  <td className="max-w-[240px]">
                    <StatusBadge raw={t.status} />
                  </td>
                  <td className="max-w-[280px] text-muted">{t.nextAction ?? <Empty>—</Empty>}</td>
                  <td>
                    <Timestamp value={t.deadline} relative={false} />
                  </td>
                  <td>
                    <EvidenceTag value={t.evidence.class} />
                  </td>
                  <td>
                    <Timestamp value={t.updatedAt} relative={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Drawer
        open={!!selected}
        onOpenChange={(o) => !o && setParam('task', null)}
        title={
          selected ? (
            <>
              <span className="font-mono text-muted">{selected.id}</span> {selected.workstream}
            </>
          ) : (
            ''
          )
        }
        subtitle="Task board record · read-only"
      >
        {selected && <TaskDetail task={selected} messages={messages} known={known} />}
      </Drawer>
    </>
  );
}

export function TasksView() {
  const tasks = useTasks();
  const agents = useAgents();
  const messages = useMessages();
  return (
    <>
      <PageHeader
        title="Task board"
        description="Rows from the Task board tab. Status text is shown exactly as written; the glyph is an interpretation for filtering."
      />
      <QueryBoundary query={tasks} isEmpty={(d) => d.length === 0} emptyTitle="No tasks on the board">
        {(ts) => (
          <QueryBoundary query={agents} noBanner>
            {(ag) => (
              <QueryBoundary query={messages} noBanner>
                {(ms) => <TaskTable tasks={ts} agents={ag} messages={ms} />}
              </QueryBoundary>
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </>
  );
}
