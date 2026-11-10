import { createHealthStore, score, type HealthStore, type SourceStats } from "./health";
import type { Capability, SourceAdapter, SourceRequest } from "./types";

export interface SourceInfo {
  id: string;
  name: string;
  kind: "media" | "provider";
  capabilities: Capability[];
  /** "driven": Titan's own UI drives the source; "themed": the provider's controls with Titan's overlay. */
  mode: "driven" | "themed";
  score: number;
  stats: SourceStats;
}

const ID_RE = /^[a-z0-9-]{1,32}$/;

/** Driven when Titan can play it itself, or when the provider takes commands and reports events. */
export function modeOf(a: SourceAdapter): "driven" | "themed" {
  return a.kind === "media" || (a.capabilities.includes("commands") && a.capabilities.includes("events")) ? "driven" : "themed";
}

/**
 * The source registry: adapters register once; `candidates()` returns the ones that can serve a request, ordered by
 * the host's preference, then by measured health. Adding a source means writing one adapter and registering it.
 */
export class SourceRegistry {
  private adapters = new Map<string, SourceAdapter>();
  constructor(readonly health: HealthStore = createHealthStore()) {}

  register(a: SourceAdapter): this {
    if (!ID_RE.test(a.id)) throw new Error(`source id "${a.id}" must be 1–32 lowercase letters, digits or dashes`);
    if (this.adapters.has(a.id)) throw new Error(`source "${a.id}" is already registered`);
    if (a.kind === "provider") {
      if (!a.origins?.length) throw new Error(`provider "${a.id}" must list its origins`);
      for (const o of a.origins) {
        const u = new URL(o);
        const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
        if (u.origin !== o || (u.protocol !== "https:" && !local))
          throw new Error(`provider "${a.id}" origin ${o} must be an https origin`);
      }
      if (!a.sandbox) throw new Error(`provider "${a.id}" needs a sandbox profile`);
      const sb = a.sandbox.sandbox;
      if (sb !== null && /allow-(popups|top-navigation|modals|forms|downloads|popups-to-escape-sandbox)/.test(sb))
        throw new Error(`provider "${a.id}" sandbox may not allow popups, top navigation, modals, forms or downloads`);
      // an unsandboxed provider must be drivable, so its iframe can stay inert and never get a click
      if (sb === null && modeOf(a) !== "driven")
        throw new Error(`provider "${a.id}" refuses a sandbox, so it must support commands and events`);
      if (!a.driver && modeOf(a) === "driven") throw new Error(`provider "${a.id}" needs a driver`);
    }
    this.adapters.set(a.id, a);
    return this;
  }

  get(id: string): SourceAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): SourceAdapter[] {
    return [...this.adapters.values()];
  }

  info(a: SourceAdapter): SourceInfo {
    const stats = this.health.get(a.id);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      capabilities: [...a.capabilities],
      mode: modeOf(a),
      score: Math.round(score(a.rank, stats) * 100) / 100,
      stats
    };
  }

  /** Adapters that can serve `req`, best first. */
  candidates(req: SourceRequest): SourceAdapter[] {
    const need = req.need ?? [];
    const list = this.list().filter(
      (a) => (!req.only?.length || req.only.includes(a.id)) && need.every((c) => a.capabilities.includes(c)) && a.supports(req)
    );
    const s = new Map(list.map((a) => [a.id, score(a.rank, this.health.get(a.id))]));
    return list.sort((a, b) => {
      if (a.id === req.preferred) return -1;
      if (b.id === req.preferred) return 1;
      return s.get(a.id)! - s.get(b.id)!;
    });
  }

  recordSuccess(id: string, ttffMs: number) {
    this.health.update(id, (s) => {
      s.ok++;
      if (Number.isFinite(ttffMs) && ttffMs >= 0) s.ttff.push(Math.round(ttffMs));
    });
  }
  recordFailure(id: string) {
    this.health.update(id, (s) => {
      s.fail++;
      s.lastFail = Date.now();
    });
  }
  recordPopup(id: string) {
    this.health.update(id, (s) => void s.popups++);
  }
  recordRedirect(id: string) {
    this.health.update(id, (s) => void s.redirects++);
  }
}
