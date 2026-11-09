type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<Handler<any>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  once<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[events] handler for ${String(type)} failed`, e);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}

export interface GameEvents extends Record<string, unknown> {
  notify: { text: string; kind?: 'info' | 'warn' | 'alert' | 'ok'; duration?: number };
  subtitle: { speaker: string; text: string; duration?: number };
  zoneChanged: { from: string | null; to: string };
  vehicleEntered: { id: string };
  vehicleExited: { id: string };
  docked: { vehicle: string; port: string };
  undocked: { vehicle: string; port: string };
  systemDamaged: { vehicle: string; system: string; cause: string };
  systemRepaired: { vehicle: string; system: string; by: string };
  flag: { key: string; value: unknown };
  log: { channel: string; text: string };
  saved: { slot: string };
  loaded: { slot: string };
}
