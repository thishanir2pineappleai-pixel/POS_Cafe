import { useEffect, useState } from 'react';

// The value, but only after it stopped changing for `ms` (so typing in a search box does not send a request per key).
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
