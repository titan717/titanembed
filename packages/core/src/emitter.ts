/** A tiny typed event emitter. Listener errors never break the emitter. */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(v: never) => void>>();

  on<K extends keyof E>(type: K, fn: (value: E[K]) => void): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn as (v: never) => void);
    return () => this.off(type, fn);
  }

  off<K extends keyof E>(type: K, fn: (value: E[K]) => void) {
    this.map.get(type)?.delete(fn as (v: never) => void);
  }

  emit<K extends keyof E>(type: K, value: E[K]) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (v: E[K]) => void)(value);
      } catch (err) {
        console.error("[titan] listener failed", err);
      }
    }
  }

  clear() {
    this.map.clear();
  }
}
