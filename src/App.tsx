import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataSourceContext } from './data/hooks';
import type { BridgeDataSource } from './data/source';
import { NowContext } from './lib/now';
import { AgentsView } from './views/AgentsView';
import { ApprovalsView } from './views/ApprovalsView';
import { ConnectionsView } from './views/ConnectionsView';
import { DeliveriesView } from './views/DeliveriesView';
import { MessagesView } from './views/MessagesView';
import { NotFound } from './views/NotFound';
import { OverviewView } from './views/OverviewView';
import { TasksView } from './views/TasksView';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewView />} />
        <Route path="tasks" element={<TasksView />} />
        <Route path="agents" element={<AgentsView />} />
        <Route path="messages" element={<MessagesView />} />
        <Route path="deliveries" element={<DeliveriesView />} />
        <Route path="approvals" element={<ApprovalsView />} />
        <Route path="connections" element={<ConnectionsView />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

interface AppProps {
  dataSource: BridgeDataSource;
  /** Tests pass a fixed clock and an in-memory route. */
  now?: () => Date;
  initialPath?: string;
  queryClient?: QueryClient;
}

export function App({ dataSource, now, initialPath, queryClient }: AppProps) {
  // In-memory cache only; nothing is persisted (see data/hooks.ts).
  const [qc] = useState(() => queryClient ?? new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <DataSourceContext.Provider value={dataSource}>
        <NowContext.Provider value={now ?? null}>
          {initialPath !== undefined ? (
            <MemoryRouter initialEntries={[initialPath]}>
              <AppRoutes />
            </MemoryRouter>
          ) : (
            // Hash routing: GitHub Pages cannot rewrite deep links to index.html.
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          )}
        </NowContext.Provider>
      </DataSourceContext.Provider>
    </QueryClientProvider>
  );
}
