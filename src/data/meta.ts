import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { Envelope, ResponseMeta } from '../domain/types';

/**
 * Newest response meta across all cached queries. Lets the top bar show the
 * demo flag and "generated at" without each view reporting upwards.
 */
export function useLatestMeta(): ResponseMeta | null {
  const qc = useQueryClient();
  const cache = qc.getQueryCache();
  const pick = () => {
    let best: ResponseMeta | null = null;
    for (const q of cache.getAll()) {
      const d = q.state.data as Envelope<unknown> | undefined;
      const m = d?.meta;
      if (m && (!best || Date.parse(m.generatedAt) > Date.parse(best.generatedAt))) best = m;
    }
    return best;
  };
  // `pick` returns an object already held in the cache, so the snapshot is
  // referentially stable until a query's data actually changes.
  return useSyncExternalStore((cb) => cache.subscribe(cb), pick, pick);
}
