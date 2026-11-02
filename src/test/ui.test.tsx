import { QueryClient } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { createHttpDataSource } from '../data/adapters/http';
import { createMockDataSource } from '../data/adapters/mock';
import type { BridgeDataSource } from '../data/source';

const NOW = new Date('2026-11-02T22:00:00Z');
const now = () => NOW;

function renderApp(path: string, ds: BridgeDataSource = createMockDataSource({ now, latencyMs: 0 })) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<App dataSource={ds} now={now} initialPath={path} queryClient={queryClient} />);
}

describe('app shell', () => {
  it('shows a persistent DEMO DATA badge with the mock adapter', async () => {
    renderApp('/');
    expect(await screen.findByTestId('demo-badge')).toHaveTextContent('DEMO DATA');
    expect(await screen.findByText(/Every record on this page is fictional/)).toBeInTheDocument();
  });

  it('renders overview KPIs and the last observed activity', async () => {
    renderApp('/');
    const tile = (await screen.findByText('Delivery problems')).closest('a')!;
    expect(within(tile).getByText('3')).toBeInTheDocument();
    const verified = screen.getByText('Last verified bridge activity').closest('section')!;
    expect(within(verified).getByText(/M-0418 processed for Instinct/)).toBeInTheDocument();
    expect(within(verified).getByText('Observed')).toBeInTheDocument();
    // Never claims liveness.
    expect(screen.queryByText(/\bonline\b/i)).not.toBeInTheDocument();
  });
});

describe('task board', () => {
  it('narrows rows when filtering by text and by category', async () => {
    const user = userEvent.setup();
    renderApp('/tasks');
    expect(await screen.findAllByTestId('task-row')).toHaveLength(8);

    await user.type(screen.getByLabelText('Search tasks'), 'fare');
    expect(screen.getAllByTestId('task-row')).toHaveLength(1);
    expect(screen.getByText('T-103')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search tasks'));
    await user.selectOptions(screen.getByLabelText('Category'), 'paused');
    const rows = screen.getAllByTestId('task-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('Paused (on hold until next month)')).toBeInTheDocument();
  });

  it('opens a drawer with every column, provenance and linked messages', async () => {
    const user = userEvent.setup();
    renderApp('/tasks');
    const row = (await screen.findAllByTestId('task-row')).find((r) => within(r).queryByText('T-102'))!;
    await user.click(row);

    const dialog = await screen.findByRole('dialog');
    for (const label of [
      'Status (raw)',
      'Owner',
      'Next action / blocker',
      'Done when',
      'Deadline / timezone',
      'Evidence',
      'Evidence verified at',
      'Related message / dependency',
      'Draft / output',
      'Outcome / next milestone',
      'Updated at',
      'Source',
    ]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Josh to choose proxy host (Worker vs serverless function)')).toBeInTheDocument();
    expect(within(dialog).getByText('Task board · row 3')).toBeInTheDocument();
    expect(within(dialog).getByText('Linked messages')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('link', { name: 'M-0421' }).length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('approvals', () => {
  it('lists items but offers no action buttons', async () => {
    renderApp('/approvals');
    expect(await screen.findByTestId('approval-tasks')).toHaveTextContent('T-102');
    expect(screen.getByTestId('approval-messages')).toHaveTextContent('M-0419');
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('button', { name: /approve|decline|send|instruct/i })).not.toBeInTheDocument();
  });
});

describe('error states', () => {
  it('shows an unauthorised state when the API returns 401', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'No session' } }), { status: 401 }),
    );
    renderApp('/tasks', createHttpDataSource({ baseUrl: 'https://api.example.com', fetchImpl }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-error-kind', 'unauthorised');
    expect(alert).toHaveTextContent('Not signed in');
    expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument();
  });

  it('shows a not-configured state when http is selected without a base URL', async () => {
    renderApp('/deliveries', createHttpDataSource({ baseUrl: null }));
    expect(await screen.findByRole('alert')).toHaveAttribute('data-error-kind', 'not_configured');
  });
});
