import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
  /** Replace the data locally, e.g. with the server's reply to an update. */
  setData: (data: T) => void;
}

/**
 * Runs `load` on mount (and when `reload` is called), keeping the last good data while reloading.
 * The first `load` is used for the component's lifetime; give the component a `key` to load something else.
 */
export function useAsync<T>(load: () => Promise<T>, { refreshMs }: { refreshMs?: number } = {}): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [loader] = useState(() => load);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => setState({ data, loading: false }))
      .catch((error: Error) => setState((s) => ({ ...s, error: error.message, loading: false })));
  }, [loader]);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => !cancelled && setState({ data, loading: false }))
      .catch((error: Error) => !cancelled && setState({ error: error.message, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [loader]);

  useEffect(() => {
    if (!refreshMs) return;
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, reload]);

  const setData = useCallback((data: T) => setState({ data, loading: false }), []);
  return { ...state, reload, setData };
}
