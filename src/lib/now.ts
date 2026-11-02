import { createContext, useContext, useEffect, useState } from 'react';

/** Tests inject a fixed clock; the app uses a ticking one. */
export const NowContext = createContext<(() => Date) | null>(null);

/** Current time, refreshed every minute so relative times and staleness stay honest. */
export function useNow(): Date {
  const fixed = useContext(NowContext);
  const [now, setNow] = useState(() => (fixed ? fixed() : new Date()));
  useEffect(() => {
    if (fixed) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [fixed]);
  return fixed ? fixed() : now;
}
