import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BridgeDataSource } from './source';
import { ApiError } from './source';

export const DataSourceContext = createContext<BridgeDataSource | null>(null);

export function useDataSource(): BridgeDataSource {
  const ds = useContext(DataSourceContext);
  if (!ds) throw new Error('DataSourceContext missing');
  return ds;
}

// In-memory cache only. Nothing is persisted to localStorage/IndexedDB, so
// bridge records never outlive the tab.
const opts = {
  staleTime: 60_000,
  retry: (count: number, err: unknown) =>
    !(err instanceof ApiError && ['unauthorised', 'forbidden', 'not_configured', 'contract'].includes(err.kind)) &&
    count < 2,
};

export const useOverview = () => {
  const ds = useDataSource();
  return useQuery({ queryKey: ['overview'], queryFn: () => ds.getOverview(), ...opts });
};
export const useTasks = () => {
  const ds = useDataSource();
  return useQuery({ queryKey: ['tasks'], queryFn: () => ds.getTasks(), ...opts });
};
export const useMessages = () => {
  const ds = useDataSource();
  return useQuery({ queryKey: ['messages'], queryFn: () => ds.getMessages(), ...opts });
};
export const useDeliveries = () => {
  const ds = useDataSource();
  return useQuery({ queryKey: ['deliveries'], queryFn: () => ds.getDeliveryEvents(), ...opts });
};
export const useAgents = () => {
  const ds = useDataSource();
  return useQuery({ queryKey: ['agents'], queryFn: () => ds.getAgentInventories(), ...opts });
};
export const useHealth = () => {
  const ds = useDataSource();
  return useQuery({ queryKey: ['health'], queryFn: () => ds.getHealth(), ...opts });
};
