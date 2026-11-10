export type Dir = "left" | "right" | "up" | "down";

const SELECTOR = "button:not([disabled]):not([hidden]), [data-nav]:not([hidden])";

function visible(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}

export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(SELECTOR)].filter((el) => !el.closest(".is-inert") && visible(el));
}

/**
 * Spatial navigation for D-pads: picks the nearest focusable in the pressed direction, weighting the
 * cross-axis offset so moving right stays on the same row whenever there is something to the right.
 */
export function nearest(from: HTMLElement, dir: Dir, candidates: HTMLElement[]): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    let main: number;
    let cross: number;
    switch (dir) {
      case "right":
        if (b.left < a.right - 2 && bx <= ax + 1) continue;
        main = Math.max(0, b.left - a.right);
        cross = overlap(a.top, a.bottom, b.top, b.bottom) ? 0 : Math.abs(by - ay);
        break;
      case "left":
        if (b.right > a.left + 2 && bx >= ax - 1) continue;
        main = Math.max(0, a.left - b.right);
        cross = overlap(a.top, a.bottom, b.top, b.bottom) ? 0 : Math.abs(by - ay);
        break;
      case "down":
        if (b.top < a.bottom - 2 && by <= ay + 1) continue;
        main = Math.max(0, b.top - a.bottom);
        cross = overlap(a.left, a.right, b.left, b.right) ? Math.abs(bx - ax) * 0.1 : Math.abs(bx - ax);
        break;
      case "up":
        if (b.bottom > a.top + 2 && by >= ay - 1) continue;
        main = Math.max(0, a.top - b.bottom);
        cross = overlap(a.left, a.right, b.left, b.right) ? Math.abs(bx - ax) * 0.1 : Math.abs(bx - ax);
        break;
    }
    const score = main + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1) > 1;

/** Moves DOM focus (without scrolling the page) and mirrors it in an .is-focus class for remote-only devices. */
export function focusEl(el: HTMLElement | null) {
  if (!el) return;
  const prev = el.ownerDocument.querySelector(".titan .is-focus");
  if (prev && prev !== el) prev.classList.remove("is-focus");
  el.classList.add("is-focus");
  el.focus({ preventScroll: true });
  // never scrollIntoView: inside an iframe it can scroll the host page too
  const box = el.closest<HTMLElement>("[data-scroll]");
  if (box) {
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = 24;
    if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - b.bottom + pad;
    else if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
    if (r.right > b.right - pad) box.scrollLeft += r.right - b.right + pad;
    else if (r.left < b.left + pad) box.scrollLeft -= b.left + pad - r.left;
  }
}
