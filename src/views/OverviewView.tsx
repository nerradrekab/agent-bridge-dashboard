import { Link } from 'react-router-dom';
import { AgentChip } from '../components/AgentChip';
import { EvidenceTag } from '../components/EvidenceTag';
import { Kpi } from '../components/Kpi';
import { QueryBoundary } from '../components/QueryBoundary';
import { StatusBadge } from '../components/StatusBadge';
import { IsoTime, Timestamp } from '../components/Timestamp';
import { PageHeader, Section, SourceLabel } from '../components/ui';
import { useOverview, useTasks } from '../data/hooks';
import { needsJosh } from '../domain/derive';
import { classifyStatus, isOpen } from '../domain/status';
import type { BridgeTask, TimelineEvent } from '../domain/types';

const KIND_GLYPH: Record<TimelineEvent['kind'], string> = { message: '✉', delivery: '⇢', task: '▤' };

function evidenceGaps(tasks: BridgeTask[]) {
  const open = tasks.filter((t) => isOpen(classifyStatus(t.status).category));
  return {
    noEvidence: open.filter((t) => t.evidence.class === 'unknown' || !t.evidence.text),
    unparsedDeadline: open.filter((t) => t.deadline.raw && !t.deadline.iso),
  };
}

function EvidenceWarnings({ tasks }: { tasks: BridgeTask[] }) {
  const { noEvidence, unparsedDeadline } = evidenceGaps(tasks);
  if (!noEvidence.length && !unparsedDeadline.length) return null;
  return (
    <ul className="space-y-1.5 text-[13px]">
      {noEvidence.length > 0 && (
        <li>
          <span style={{ color: 'var(--st-josh)' }} aria-hidden="true">
            ?{' '}
          </span>
          {noEvidence.length} open task{noEvidence.length === 1 ? ' has' : 's have'} no recorded evidence:{' '}
          <span className="font-mono text-[12px]">{noEvidence.map((t) => t.id).join(', ')}</span>
        </li>
      )}
      {unparsedDeadline.length > 0 && (
        <li>
          <span style={{ color: 'var(--st-josh)' }} aria-hidden="true">
            ?{' '}
          </span>
          {unparsedDeadline.length} open task{unparsedDeadline.length === 1 ? ' has a deadline' : 's have deadlines'} that
          could not be read as a date:{' '}
          <span className="font-mono text-[12px]">{unparsedDeadline.map((t) => t.id).join(', ')}</span>
        </li>
      )}
    </ul>
  );
}

export function OverviewView() {
  const overview = useOverview();
  const tasks = useTasks();

  return (
    <>
      <PageHeader
        title="Overview"
        description="What needs attention across the bridge. Counts are derived from Sheet records; status categories are interpretations of the raw text."
      />
      <QueryBoundary query={overview}>
        {(o) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Open tasks" value={o.kpis.openTasks} to="/tasks" hint="Not done or historical" />
              <Kpi label="Needs Josh" value={o.kpis.joshActionTasks} tone="var(--st-josh)" to="/approvals" hint="Decision or approval" />
              <Kpi label="Blocked" value={o.kpis.blockedTasks} tone="var(--st-blocked)" to="/tasks?cat=blocked" />
              <Kpi label="Handoffs" value={o.kpis.recentHandoffs} to="/messages" hint={`Written in last ${o.recentWindowHours} h`} />
              <Kpi
                label="Delivery problems"
                value={o.kpis.recentDeliveryFailures}
                tone="var(--st-failed)"
                to="/deliveries"
                hint={`Failed, stalled, no signal or unknown · ${o.recentWindowHours} h`}
              />
              <Kpi label="Unclassified statuses" value={o.kpis.unclassifiedStatuses} tone="var(--st-josh)" to="/tasks?cat=unclassified" hint="Raw text not interpreted" />
            </div>

            <Section title="Last verified bridge activity" aside="Observed evidence only">
              {o.lastVerifiedActivity ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                  <IsoTime iso={o.lastVerifiedActivity.at} />
                  <EvidenceTag value="observed" />
                  <span>{o.lastVerifiedActivity.title}</span>
                  <SourceLabel source={o.lastVerifiedActivity.source} />
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: 'var(--st-josh)' }}>
                  No activity with observed evidence. The bridge’s operational state cannot be confirmed from this data.
                </p>
              )}
              <p className="mt-2 text-[12px] text-faint">
                This is the newest timestamp written by bridge automation. It is not a live connection status.
              </p>
            </Section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Section title="Current priorities" aside="Needs Josh → blocked → by deadline">
                {o.priorities.length === 0 ? (
                  <p className="text-[13px] text-muted">No open tasks.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {o.priorities.map((t) => (
                      <li key={t.id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <Link to={`/tasks?task=${encodeURIComponent(t.id)}`} className="font-mono text-[12px] text-accent hover:underline">
                            {t.id}
                          </Link>
                          <span className="min-w-0 text-[13px] font-medium">{t.workstream}</span>
                          {needsJosh(t) && (
                            <span className="text-[11px] font-semibold" style={{ color: 'var(--st-josh)' }}>
                              ! Needs Josh
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-1">
                          <StatusBadge raw={t.status} />
                          <AgentChip name={t.owner} />
                          <span className="text-[12px] text-muted">
                            Due <Timestamp value={t.deadline} emptyLabel="none set" />
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Recent activity" aside="Newest first">
                {o.timeline.length === 0 ? (
                  <p className="text-[13px] text-muted">No dated activity.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {o.timeline.map((e, i) => (
                      <li key={`${e.kind}-${e.refId}-${i}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 text-[13px]">
                        <span aria-hidden="true" className="text-faint">
                          {KIND_GLYPH[e.kind]}
                        </span>
                        <div className="min-w-0">
                          <div className="break-words">{e.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                            <IsoTime iso={e.at} />
                            <EvidenceTag value={e.evidence} />
                            <SourceLabel source={e.source} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>

            <QueryBoundary query={tasks} noBanner>
              {(ts) => {
                const gaps = evidenceGaps(ts);
                const hasGaps = gaps.noEvidence.length > 0 || gaps.unparsedDeadline.length > 0;
                return o.kpis.unclassifiedStatuses > 0 || hasGaps ? (
                  <Section title="Evidence warnings">
                    {o.kpis.unclassifiedStatuses > 0 && (
                      <p className="mb-1.5 text-[13px]">
                        <span aria-hidden="true" style={{ color: 'var(--st-josh)' }}>
                          ?{' '}
                        </span>
                        {o.kpis.unclassifiedStatuses} task status
                        {o.kpis.unclassifiedStatuses === 1 ? ' does' : 'es do'} not match a known pattern. The raw text is
                        shown as written;{' '}
                        <Link to="/tasks?cat=unclassified" className="text-accent hover:underline">
                          review them
                        </Link>
                        .
                      </p>
                    )}
                    <EvidenceWarnings tasks={ts} />
                  </Section>
                ) : null;
              }}
            </QueryBoundary>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
