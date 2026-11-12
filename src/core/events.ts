type Handler = (payload: any) => void;

/** Minimal event bus. Systems communicate through named events rather than direct references. */
export class Emitter {
  private map = new Map<string, Set<Handler>>();

  on(name: string, fn: Handler): () => void {
    let s = this.map.get(name);
    if (!s) this.map.set(name, (s = new Set()));
    s.add(fn);
    return () => s!.delete(fn);
  }

  emit(name: string, payload?: any) {
    const s = this.map.get(name);
    if (s) for (const fn of [...s]) fn(payload);
  }
}

export const bus = new Emitter();
