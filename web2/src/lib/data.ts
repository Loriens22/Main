import { useEffect, useState } from 'react';

const cache = new Map<string, Promise<any>>();

/** Fetch a published JSON result (relative path, works locally and when hosted as an artifact). */
export function loadJSON<T = any>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}.json: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(name)!;
}

export function useData<T = any>(name: string): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadJSON<T>(name).then((d) => live && setData(d)).catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [name]);
  return { data, error };
}

export const fmt = {
  sci: (x: number, d = 2) => (x === 0 ? '0' : Math.abs(x) >= 1e-2 && Math.abs(x) < 1e4 ? x.toFixed(Math.max(0, d + 1 - Math.ceil(Math.log10(Math.abs(x)) || 1))) : x.toExponential(d - 1)),
  pct: (x: number, d = 1) => `${(100 * x).toFixed(d)} %`,
  num: (x: number, d = 2) => x.toLocaleString('en-US', { maximumFractionDigits: d }),
};
