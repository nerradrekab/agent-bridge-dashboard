import { Link } from 'react-router-dom';
import { agentColor } from '../components/AgentChip';
import { EvidenceTag } from '../components/EvidenceTag';
import { messageHref } from '../components/LinkedText';
import { QueryBoundary } from '../components/QueryBoundary';
import { StatusBadge } from '../components/StatusBadge';
import { IsoTime, Timestamp } from '../components/Timestamp';
import { PageHeader, SourceLabel } from '../components/ui';
import { useAgents, useDeliveries, useMessages, useTasks } from '../data/hooks';
import { agentActivity } from '../domain/derive';
import type { AgentInventory, BridgeDeliveryEvent, BridgeMessage, BridgeTask } from '../domain/types';

function ActivityRow({
  label,
  source,
  evidence,
  value,
}: {
  label: string;
  source: string;
  evidence: 'observed' | 'reported';
  value: { at: string; messageId: string } | null;
}) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
      <div className="min-w-0">
        <div className="text-[13px]">
          {label} <span className="text-faint">({source})</span>
        </div>
        {value ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <IsoTime iso={value.at} />
            <Link to={messageHref(value.messageId)} className="font-mono text-accent hover:underline">
              {value.messageId}
            </Link>
          </div>
        ) : (
          <div className="mt-0.5 text-[12px]" style={{ color: 'var(--st-josh)' }}>
            None recorded
          </div>
        )}
      </div>
      <div>
        <EvidenceTag value={value ? evidence : 'unknown'} />
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  tasks,
  messages,
  deliveries,
}: {
  agent: AgentInventory;
  tasks: BridgeTask[];
  messages: BridgeMessage[];
  deliveries: BridgeDeliveryEvent[];
}) {
  const act = agentActivity(agent, tasks, messages, deliveries);
  const color = agentColor(agent.displayName);
  return (
    <article className="min-w-0 rounded-lg border border-line bg-surface" style={{ borderTop: `3px solid ${color}` }}>
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold">{agent.displayName}</h2>
        <p className="text-[12px] text-muted">
          {agent.items.length} inventory item{agent.items.length === 1 ? '' : 's'} · <span className="font-mono">{agent.inventoryTab}</span>
        </p>
      </header>

      <div className="border-b border-line px-4 py-2">
        <h3 className="pt-1 text-[12px] font-medium text-muted">Latest verifiable activity</h3>
        <div className="divide-y divide-line">
          <ActivityRow label="Last delivery processed" source="Delivery log" evidence="observed" value={act.lastProcessed} />
          <ActivityRow label="Last handoff written by this agent" source="Messages" evidence="reported" value={act.lastMessageWritten} />
        </div>
        <p className="pb-2 text-[11px] text-faint">
          Recorded timestamps only. This does not show whether the agent is running now.
        </p>
      </div>

      <dl className="grid grid-cols-3 border-b border-line text-center">
        {[
          ['Open tasks', act.openTasks],
          ['Blocked', act.blockedTasks],
          ['Proposed', act.proposedTasks],
        ].map(([k, v]) => (
          <div key={k} className="px-2 py-2.5 not-last:border-r not-last:border-line">
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd className="text-[18px] font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="px-4 pt-2 text-[11px] text-faint">
        Counts are tasks whose Owner cell mentions {agent.displayName}. A proposed owner is not acceptance.
      </p>

      <h3 className="px-4 pt-3 text-[12px] font-medium text-muted">Responsibilities and schedules</h3>
      {agent.items.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted">No inventory rows.</p>
      ) : (
        <ul className="divide-y divide-line">
          {agent.items.map((it) => (
            <li key={it.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[12px] text-muted">{it.id}</span>
                <span className="min-w-0 text-[13px] font-medium break-words">{it.responsibility}</span>
              </div>
              <div className="mt-1.5 grid gap-1 text-[12px] sm:grid-cols-[90px_1fr]">
                <span className="text-muted">Status</span>
                <StatusBadge raw={it.status} />
                <span className="text-muted">Schedule</span>
                <span>{it.schedule ?? <span className="text-faint">Not recorded</span>}</span>
                <span className="text-muted">Next</span>
                <span className="break-words">{it.nextAction ?? <span className="text-faint">—</span>}</span>
                <span className="text-muted">Addressed to</span>
                <span>{it.addressedTo}</span>
                {it.evidence !== undefined && (
                  <>
                    <span className="text-muted">Evidence</span>
                    <span className="break-words">{it.evidence ?? <span className="text-faint">Not recorded</span>}</span>
                  </>
                )}
                {it.reviewedAt !== undefined && (
                  <>
                    <span className="text-muted">Reviewed</span>
                    <Timestamp value={it.reviewedAt} emptyLabel="Not recorded" />
                  </>
                )}
              </div>
              <div className="mt-1">
                <SourceLabel source={it.source} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function AgentsView() {
  const agents = useAgents();
  const tasks = useTasks();
  const messages = useMessages();
  const deliveries = useDeliveries();
  return (
    <>
      <PageHeader
        title="Agents"
        description="Each agent’s inventory tab, side by side, with the latest activity the records can support. Schedules are stated intentions, not proof that a run happened."
      />
      <QueryBoundary query={agents} isEmpty={(a) => a.length === 0} emptyTitle="No agent inventories returned">
        {(ag) => (
          <QueryBoundary query={tasks} noBanner>
            {(ts) => (
              <QueryBoundary query={messages} noBanner>
                {(ms) => (
                  <QueryBoundary query={deliveries} noBanner>
                    {(ds) => (
                      <div className={`grid gap-4 lg:grid-cols-2 ${ag.length >= 3 ? '2xl:grid-cols-3' : ''}`}>
                        {ag.map((a) => (
                          <AgentCard key={a.agentId} agent={a} tasks={ts} messages={ms} deliveries={ds} />
                        ))}
                      </div>
                    )}
                  </QueryBoundary>
                )}
              </QueryBoundary>
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </>
  );
}
