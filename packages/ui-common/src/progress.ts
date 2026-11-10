import type { Marker } from "@titan/core";
import { h } from "./dom";

/** Progress track: buffered range, accent fill, knob and marker ranges (intro/recap/credits). */
export class Track {
  readonly el: HTMLDivElement;
  private buf: HTMLDivElement;
  private fill: HTMLDivElement;
  readonly knob: HTMLDivElement;
  private marks: HTMLDivElement;
  private lastFrac = -1;
  constructor() {
    this.buf = h("div", { class: "t-track-buf" });
    this.fill = h("div", { class: "t-track-fill" });
    this.knob = h("div", { class: "t-track-knob" });
    this.marks = h("div", { class: "t-track-marks" });
    this.el = h("div", { class: "t-track" }, this.buf, this.marks, this.fill, this.knob);
  }
  set(time: number, duration: number, buffered: number) {
    const f = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
    if (Math.abs(f - this.lastFrac) > 0.0002) {
      this.lastFrac = f;
      this.fill.style.transform = `scaleX(${f})`;
      this.knob.style.left = `${f * 100}%`;
    }
    const b = duration > 0 ? Math.min(1, buffered / duration) : 0;
    this.buf.style.transform = `scaleX(${b})`;
  }
  markers(list: Marker[], duration: number) {
    while (this.marks.firstChild) this.marks.removeChild(this.marks.firstChild);
    if (!(duration > 0)) return;
    for (const m of list) {
      const s = Math.max(0, m.start / duration);
      const e = Math.min(1, m.end / duration);
      if (e <= s) continue;
      const d = h("div", { class: `t-track-marker is-${m.type}` });
      d.style.left = `${s * 100}%`;
      d.style.width = `${(e - s) * 100}%`;
      this.marks.appendChild(d);
    }
  }
  /** Fraction 0..1 for a client X coordinate (pointer seeking). */
  fractionAt(clientX: number): number {
    const r = this.el.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }
}
