import { Link } from 'react-router-dom';
import { AgentChip } from '../components/AgentChip';
import { LinkedText, messageHref, taskHref, type KnownIds } from '../components/LinkedText';
import { QueryBoundary } from '../components/QueryBoundary';
import { StatusBadge } from '../components/StatusBadge';
import { Timestamp } from '../components/Timestamp';
import { PageHeader, Section, SourceLabel } from '../components/ui';
import { useMessages, useTasks } from '../data/hooks';
import { mentionsJosh, needsJosh } from '../domain/derive';
import { classifyStatus, isOpen } from '../domain/status';

export function ApprovalsView() {
  const tasks = useTasks();
  const messages = useMessages();
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Items that appear to need Josh’s decision. This list is derived from the records; it is a reading aid, not a queue that can act."
      />
      <div
        role="note"
        className="mb-4 rounded-md border px-3 py-2.5 text-[13px]"
        style={{ borderColor: 'var(--st-josh)', background: 'color-mix(in srgb, var(--st-josh) 8%, transparent)' }}
      >
        <strong className="font-semibold">Read-only.</strong> Approve, decline and instruct actions are disabled until an
        authenticated, audited write API exists and Josh has authorised it. Record decisions in the bridge Sheet as usual. One
        agent’s request never authorises another agent to act.
      </div>
      <QueryBoundary query={tasks}>
        {(ts) => (
          <QueryBoundary query={messages} noBanner>
            {(ms) => {
              const known: KnownIds = { tasks: ts.map((t) => t.id), messages: ms.map((m) => m.id) };
              const joshTasks = ts.filter(needsJosh);
              const toJosh = ms
                // Archived statuses are frozen history, so they never count as open.
                .filter((m) => !m.archived && mentionsJosh(m.to) && isOpen(classifyStatus(m.status).category))
                .sort((a, b) => Date.parse(b.writtenAt.iso ?? '0') - Date.parse(a.writtenAt.iso ?? '0'));
              return (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Section title="Tasks needing Josh" aside={`${joshTasks.length}`}>
                    {joshTasks.length === 0 ? (
                      <p className="text-[13px] text-muted">No open tasks name Josh.</p>
                    ) : (
                      <ul className="divide-y divide-line" data-testid="approval-tasks">
                        {joshTasks.map((t) => (
                          <li key={t.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <Link to={taskHref(t.id)} className="font-mono text-[12px] text-accent hover:underline">
                                {t.id}
                              </Link>
                              <span className="text-[13px] font-medium">{t.workstream}</span>
                            </div>
                            <div className="mt-1">
                              <StatusBadge raw={t.status} />
                            </div>
                            {t.nextAction && (
                              <p className="mt-1 text-[13px] text-muted">
                                <LinkedText text={t.nextAction} known={known} />
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
                              <span>
                                Owner: <AgentChip name={t.owner} />
                              </span>
                              <span>
                                Due <Timestamp value={t.deadline} emptyLabel="none set" />
                              </span>
                              <SourceLabel source={t.source} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <Section title="Open messages addressed to Josh" aside={`${toJosh.length}`}>
                    {toJosh.length === 0 ? (
                      <p className="text-[13px] text-muted">No open messages to Josh.</p>
                    ) : (
                      <ul className="divide-y divide-line" data-testid="approval-messages">
                        {toJosh.map((m) => (
                          <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                              <Link to={messageHref(m.id)} className="font-mono text-[12px] text-accent hover:underline">
                                {m.id}
                              </Link>
                              <span className="text-muted">from</span>
                              <AgentChip name={m.from} />
                              <Timestamp value={m.writtenAt} />
                            </div>
                            <div className="mt-1">
                              <StatusBadge raw={m.status} />
                            </div>
                            <p className="mt-1 text-[13px]">
                              <LinkedText text={m.body} known={known} />
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </div>
              );
            }}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </>
  );
}
