import type { Cue } from "@titan/core";
import type { Prefs } from "@titan/core/storage";
import { h, clear } from "./dom";

/**
 * Custom caption renderer. Cue spans become <span> elements with textContent only. The layer lifts above the
 * controls while they are visible (CSS: .is-controls .t-captions) and follows the viewer's caption style.
 */
export class CaptionLayer {
  readonly el: HTMLDivElement;
  private live: HTMLDivElement;
  constructor() {
    this.el = h("div", { class: "t-captions", "aria-hidden": "true" });
    // a polite live region mirrors the text for screen readers (captions are visual for everyone else)
    this.live = h("div", { class: "t-sr", "aria-live": "polite", role: "status" });
  }

  get liveRegion() {
    return this.live;
  }

  style(p: Pick<Prefs, "captionSize" | "captionColor" | "captionBg" | "captionEdge">) {
    this.el.className = `t-captions cap-s-${p.captionSize} cap-c-${p.captionColor} cap-bg-${p.captionBg} cap-e-${p.captionEdge}`;
  }

  render(cues: Cue[]) {
    clear(this.el);
    const plain: string[] = [];
    for (const c of cues) {
      const block = h("div", { class: "t-cue" });
      c.lines.forEach((line, i) => {
        if (i) block.appendChild(h("br"));
        for (const s of line) {
          const span = h("span", { class: [s.i && "i", s.b && "b", s.u && "u"].filter(Boolean).join(" ") || null });
          span.textContent = s.text;
          block.appendChild(span);
        }
        plain.push(line.map((s) => s.text).join(""));
      });
      this.el.appendChild(block);
    }
    this.live.textContent = plain.join(" ");
  }
}

/** A static sample for the caption-style preview. */
export function captionPreview(text: string): HTMLDivElement {
  const box = h("div", { class: "t-cap-preview" });
  const layer = h("div", { class: "t-captions is-preview" });
  layer.appendChild(h("div", { class: "t-cue" }, h("span", null, text)));
  box.appendChild(layer);
  return box;
}
