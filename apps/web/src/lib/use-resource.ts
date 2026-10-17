'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type PageData } from './api';

type ResourceState<T> = { path: string | null; data: T | null; error: string; loading: boolean };
type Reader<T> = (path: string, signal: AbortSignal) => Promise<T>;

function useRead<T>(path: string | null, read: Reader<T>, refreshKey = 0) {
  const [state, setState] = useState<ResourceState<T>>({ path: null, data: null, error: '', loading: false });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) {
      setState({ path: null, data: null, error: '', loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : null,
      error: '',
      loading: true,
    }));
    read(path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, data, error: '', loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ path, data: null, error: errorMessage(error), loading: false });
      });
    return () => controller.abort();
  }, [path, read, revision, refreshKey]);
  // Never expose a previous record during the render before the next effect runs.
  const current = path && state.path === path ? state : { data: null, error: '', loading: !!path };
  return { data: current.data, error: current.error, loading: current.loading, reload };
}

function readResource<T>(path: string, signal: AbortSignal) {
  return api<T>(path, 'GET', undefined, { signal });
}
export function useResource<T>(path: string | null, refreshKey = 0) {
  return useRead<T>(path, readResource, refreshKey);
}

async function readCatalog<T>(path: string, signal: AbortSignal): Promise<PageData<T>> {
  const items: T[] = [];
  let page = 1;
  let total: number;
  do {
    signal.throwIfAborted();
    const result = await api<PageData<T>>(
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`,
      'GET',
      undefined,
      { signal },
    );
    items.push(...result.items);
    total = result.total;
    page++;
    if (!result.items.length) break;
  } while (items.length < total);
  return { items, total: items.length, page: 1, pageSize: 100 };
}
/** Traverse all catalogue pages, stopping when the selector is closed. */
export function useCatalog<T>(path: string | null) {
  return useRead<PageData<T>>(path, readCatalog);
}

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
