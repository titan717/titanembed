/**
 * Minimal DOM builder. Text is always set with textContent and attributes with setAttribute, so untrusted strings
 * can never become markup (SECURITY.md T-2).
 */
type Child = Node | string | number | false | null | undefined;
type Props = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "class") el.className = String(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function text(el: Element, value: string) {
  if (el.textContent !== value) el.textContent = value;
}

/** Toggles a class only when it changes (cheap enough to call on every timeupdate). */
export function cls(el: Element, name: string, on: boolean) {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

export function img(src: string | undefined, alt = "", className = "t-img"): HTMLImageElement | null {
  if (!src) return null;
  const i = h("img", { class: className, alt, decoding: "async", loading: "lazy", referrerpolicy: "no-referrer", draggable: "false" });
  i.addEventListener("error", () => i.remove(), { once: true });
  i.src = src;
  return i;
}

/** A disposable bag of listeners and timers. */
export class Bag {
  private fns: (() => void)[] = [];
  on<T extends EventTarget>(t: T, type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions | boolean) {
    t.addEventListener(type, fn, opts);
    this.fns.push(() => t.removeEventListener(type, fn, opts));
  }
  add(fn: () => void) {
    this.fns.push(fn);
  }
  timeout(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    this.fns.push(() => clearTimeout(id));
    return id;
  }
  dispose() {
    for (const f of this.fns.splice(0)) {
      try {
        f();
      } catch {
        /* ignore */
      }
    }
  }
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
