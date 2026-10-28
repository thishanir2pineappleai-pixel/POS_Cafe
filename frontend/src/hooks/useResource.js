import { useCallback, useEffect, useState } from 'react';
import { messageFor } from '../api/errorHandler.js';

// Loads data for a screen: load(signal) -> Promise, run again whenever `deps` change or reload() is called.
// -> { data, loading, error, reload, setData }. `data` keeps the previous value while a reload is in flight (no flicker); `error`
// is a sentence for the user, '' when fine. A request that is no longer wanted (the screen changed) is cancelled and ignored.
// setData(updater) changes the loaded data at once: use it to add a record the server just created, so a form that refers to it
// by name can find its id immediately, without waiting for a reload.
export function useResource(load, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); },
      (err) => { if (!controller.signal.aborted) setState((s) => ({ ...s, loading: false, error: messageFor(err) })); },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((update) => setState((s) => ({ ...s, data: update(s.data) })), []);
  return { ...state, reload, setData };
}
