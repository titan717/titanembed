import type { PlayerState } from "./types";

/**
 * The playback state machine. Every transition the engine asks for is checked against this table, so the UI
 * can trust that, for example, "ended" is never followed by "buffering" without a seek or play first.
 */
export const TRANSITIONS: Record<PlayerState, readonly PlayerState[]> = {
  idle: ["loading", "error"],
  loading: ["loading", "ready", "playing", "paused", "buffering", "error", "idle"],
  ready: ["playing", "paused", "buffering", "seeking", "ended", "loading", "error", "idle"],
  playing: ["paused", "buffering", "seeking", "ended", "loading", "error", "idle"],
  paused: ["playing", "buffering", "seeking", "ended", "loading", "error", "idle"],
  buffering: ["playing", "paused", "seeking", "ended", "loading", "error", "idle"],
  seeking: ["seeking", "playing", "paused", "buffering", "ended", "loading", "error", "idle"],
  ended: ["playing", "paused", "seeking", "loading", "idle", "error"],
  error: ["loading", "idle"]
};

export class StateMachine {
  private current: PlayerState = "idle";
  constructor(private readonly onChange: (next: PlayerState, prev: PlayerState) => void) {}

  get state(): PlayerState {
    return this.current;
  }

  can(next: PlayerState): boolean {
    return TRANSITIONS[this.current].includes(next);
  }

  /** Moves to `next` when the table allows it. Returns whether the state changed. */
  to(next: PlayerState): boolean {
    if (next === this.current && next !== "loading" && next !== "seeking") return false;
    if (!this.can(next)) return false;
    const prev = this.current;
    this.current = next;
    if (prev !== next) this.onChange(next, prev);
    return true;
  }

  /** Hard reset used by destroy() and by load() after an error. */
  reset(to: PlayerState = "idle") {
    const prev = this.current;
    this.current = to;
    if (prev !== to) this.onChange(to, prev);
  }
}
