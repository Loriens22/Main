// Promise wrapper around the lab worker (one shared instance).
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; progress?: (p: any) => void }>();

function get(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/lab.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type, payload } = e.data;
      const p = pending.get(id);
      if (!p) return;
      if (type === 'progress') p.progress?.(payload);
      else { pending.delete(id); type === 'done' ? p.resolve(payload) : p.reject(new Error(payload)); }
    };
    worker.onerror = (e) => { pending.forEach((p) => p.reject(new Error(e.message || 'worker failed'))); pending.clear(); worker = null; };
  }
  return worker;
}

export function task<T = any>(name: string, args: any, progress?: (p: any) => void): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    get().postMessage({ id, task: name, args });
  });
}

/** Abort everything in flight (terminates the worker; a fresh one starts on the next task). */
export function cancelAll() {
  worker?.terminate();
  worker = null;
  pending.forEach((p) => p.reject(new Error('cancelled')));
  pending.clear();
}
