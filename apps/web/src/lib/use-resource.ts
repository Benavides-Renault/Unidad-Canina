'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type PageData } from './api';

export function useResource<T>(path: string | null, refreshKey = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<T>(path)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision, refreshKey]);
  return { data, error, loading, reload };
}

/** Small private catalogues: traverse API pages so selectors never silently omit records after 100. */
export function useCatalog<T>(path: string | null) {
  const [data, setData] = useState<PageData<T> | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    (async () => {
      const items: T[] = [];
      let page = 1;
      let total: number;
      do {
        const result = await api<PageData<T>>(
          `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`,
        );
        if (!active) return;
        items.push(...result.items);
        total = result.total;
        page++;
        if (!result.items.length) break;
      } while (items.length < total);
      if (active) setData({ items, total: items.length, page: 1, pageSize: 100 });
    })()
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, reload };
}
