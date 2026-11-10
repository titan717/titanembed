import { clock, type TitanCore, type EpisodeInput, type MarkerType, type PlayerState } from "@titan/core";
import { h, img, cls, text, Bag, reducedMotion } from "./dom";
import { icon, mark } from "./icons";
import { t, type StringKey } from "./i18n";

export type Mode = "tv" | "mobile";

export function button(label: string, opts: { icon?: Parameters<typeof icon>[0]; primary?: boolean; cls?: string; onClick: () => void; aria?: string }) {
  const b = h("button", { type: "button", class: `t-btn${opts.primary ? " is-primary" : ""}${opts.cls ? " " + opts.cls : ""}`, "aria-label": opts.aria ?? null });
  if (opts.icon) b.appendChild(icon(opts.icon));
  if (label) b.appendChild(h("span", { class: "t-btn-label" }, label));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onClick();
  });
  return b;
}

const SKIP_LABEL: Record<MarkerType, StringKey> = { intro: "skipIntro", recap: "skipRecap", credits: "skipCredits" };

/**
 * The playback states every player shows: loading, buffering (after 400 ms), error with Retry / Try another,
 * resume prompt, offline banner, paused-unmute prompt, Skip Intro/Recap/Credits, the next-episode card with a
 * 10 s countdown ring, the ended screen, the start-of-playback advisory and transient toasts.
 */
export class StateViews {
  readonly loading: HTMLDivElement;
  readonly buffering: HTMLDivElement;
  readonly error: HTMLDivElement;
  readonly resume: HTMLDivElement;
  readonly offline: HTMLDivElement;
  readonly unmute: HTMLButtonElement;
  readonly skip: HTMLButtonElement;
  readonly nextUp: HTMLDivElement;
  readonly ended: HTMLDivElement;
  readonly advisory: HTMLDivElement;
  readonly toastEl: HTMLDivElement;

  /** Fires when a modal view (error, resume, ended, next-up) opens or closes, for focus management. */
  onModal: (el: HTMLElement | null) => void = () => {};
  /** Fires when the skip button appears or disappears. */
  onSkip: (visible: boolean) => void = () => {};

  private bag = new Bag();
  private bufTimer: ReturnType<typeof setTimeout> | null = null;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipType: MarkerType | null = null;
  private skipHidden = false;
  private nextTimer: ReturnType<typeof setInterval> | null = null;
  private nextLeft = 0;
  private nextCancelled = false;
  private advisoryShown = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private modalEl: HTMLElement | null = null;
  private errorBody: HTMLParagraphElement;
  private errorCode: HTMLParagraphElement;
  private errorAnother: HTMLButtonElement;
  private resumeBtn: HTMLButtonElement;
  private nextTitle: HTMLParagraphElement;
  private nextSub: HTMLParagraphElement;
  private nextThumb: HTMLDivElement;
  private nextCount: HTMLSpanElement;
  private ring: SVGCircleElement;
  private endedNext: HTMLButtonElement;
  private loadingArt: HTMLDivElement;
  private loadingTitle: HTMLParagraphElement;

  static readonly NEXT_SECONDS = 10;
  static readonly SKIP_VISIBLE_MS = 8000;
  static readonly BUFFER_DELAY_MS = 400;

  constructor(
    private core: TitanCore,
    private root: HTMLElement,
    private mode: Mode
  ) {
    // loading
    this.loadingArt = h("div", { class: "t-loading-art" });
    this.loadingTitle = h("p", { class: "t-loading-title" });
    this.loading = h(
      "div",
      { class: "t-loading", role: "status", "aria-label": t("loading") },
      this.loadingArt,
      h("div", { class: "t-loading-center" }, h("div", { class: "t-loading-brand" }), this.loadingTitle, h("div", { class: "t-ring-spin", "aria-hidden": "true" }))
    );

    // buffering
    this.buffering = h("div", { class: "t-buffering", role: "status", "aria-label": t("buffering") }, h("div", { class: "t-ring-spin", "aria-hidden": "true" }));

    // error
    this.errorBody = h("p", { class: "t-modal-body" });
    this.errorCode = h("p", { class: "t-modal-code" });
    this.errorAnother = button(t("tryAnother"), { onClick: () => this.core.tryAnother() });
    this.error = h(
      "div",
      { class: "t-modal t-error", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "t-error-title" },
      h(
        "div",
        { class: "t-modal-card" },
        icon("alert", "t-icon t-modal-icon"),
        h("h2", { class: "t-modal-title", id: "t-error-title" }, t("errorTitle")),
        this.errorBody,
        this.errorCode,
        h("div", { class: "t-modal-actions" }, button(t("retry"), { icon: "retry", primary: true, onClick: () => this.core.retry() }), this.errorAnother)
      )
    );

    // resume prompt
    this.resumeBtn = button("", { icon: "play", primary: true, onClick: () => this.answerResume(true) });
    this.resume = h(
      "div",
      { class: "t-modal t-resume", role: "dialog", "aria-modal": "true", "aria-labelledby": "t-resume-title" },
      h(
        "div",
        { class: "t-modal-card" },
        h("h2", { class: "t-modal-title", id: "t-resume-title" }, t("resumeTitle")),
        h("div", { class: "t-modal-actions" }, this.resumeBtn, button(t("startOver"), { icon: "retry", onClick: () => this.answerResume(false) }))
      )
    );

    // offline
    this.offline = h("div", { class: "t-offline", role: "status" }, icon("offline"), h("div", null, h("strong", null, t("offlineTitle")), h("span", null, t("offlineBody"))));

    // autoplay-muted prompt
    this.unmute = button(mode === "tv" ? t("pressToUnmute") : t("tapToUnmute"), { icon: "mute", cls: "t-unmute", onClick: () => this.core.userGesture() });

    // skip
    this.skip = h("button", { type: "button", class: "t-skip" });
    this.skip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.core.skipMarker();
    });

    // next-up card
    const R = 22;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 52 52");
    svg.setAttribute("class", "t-countdown");
    svg.setAttribute("aria-hidden", "true");
    const track = document.createElementNS(svgNS, "circle");
    this.ring = document.createElementNS(svgNS, "circle");
    for (const c of [track, this.ring]) {
      c.setAttribute("cx", "26");
      c.setAttribute("cy", "26");
      c.setAttribute("r", String(R));
    }
    track.setAttribute("class", "t-countdown-track");
    this.ring.setAttribute("class", "t-countdown-ring");
    this.ring.style.strokeDasharray = String(2 * Math.PI * R);
    svg.append(track, this.ring);
    this.nextCount = h("span", { class: "t-countdown-n" });
    this.nextThumb = h("div", { class: "t-next-thumb" });
    this.nextTitle = h("p", { class: "t-next-title" });
    this.nextSub = h("p", { class: "t-next-sub" });
    this.nextUp = h(
      "div",
      { class: "t-next", role: "dialog", "aria-labelledby": "t-next-label" },
      this.nextThumb,
      h(
        "div",
        { class: "t-next-info" },
        h("p", { class: "t-next-eyebrow", id: "t-next-label" }, t("upNext")),
        this.nextTitle,
        this.nextSub,
        h(
          "div",
          { class: "t-next-actions" },
          h("button", { type: "button", class: "t-btn is-primary t-next-play", onclick: ((e: Event) => (e.stopPropagation(), this.playNext(false))) as EventListener }, h("span", { class: "t-countdown-wrap" }, svg, this.nextCount), h("span", { class: "t-btn-label" }, t("playNow"))),
          button(t("cancel"), { onClick: () => this.cancelNext() })
        )
      )
    );

    // ended
    this.endedNext = button(t("nextEpisode"), { icon: "next", primary: true, onClick: () => this.core.next(false) });
    this.ended = h(
      "div",
      { class: "t-modal t-ended", role: "dialog", "aria-modal": "true", "aria-labelledby": "t-ended-title" },
      h("div", { class: "t-modal-card" }, h("h2", { class: "t-modal-title", id: "t-ended-title" }, t("ended")), h("div", { class: "t-modal-actions" }, this.endedNext, button(t("replay"), { icon: "retry", onClick: () => (this.core.seek(0), void this.core.play()) })))
    );

    this.advisory = h("div", { class: "t-advisory", "aria-live": "polite" });
    this.toastEl = h("div", { class: "t-toast", role: "status", "aria-live": "polite" });

    root.append(this.loading, this.buffering, this.advisory, this.skip, this.unmute, this.nextUp, this.offline, this.resume, this.error, this.ended, this.toastEl);
    this.bind();
  }

  private bind() {
    const c = this.core;
    this.bag.add(c.on("load", ({ media }) => {
      this.hideAll();
      this.advisoryShown = false;
      this.nextCancelled = false;
      while (this.loadingArt.firstChild) this.loadingArt.removeChild(this.loadingArt.firstChild);
      const art = img(media.backdrop ?? media.poster, "", "t-img");
      if (art) this.loadingArt.appendChild(art);
      const brand = this.loading.querySelector(".t-loading-brand")!;
      while (brand.firstChild) brand.removeChild(brand.firstChild);
      const logo = img(media.logo, media.title, "t-loading-logo");
      brand.appendChild(logo ?? mark());
      text(this.loadingTitle, logo ? "" : media.title);
      cls(this.loading, "is-on", true);
    }));
    this.bag.add(c.on("statechange", ({ state }) => this.onState(state)));
    this.bag.add(c.on("error", (e) => {
      text(this.errorBody, e.message);
      text(this.errorCode, e.code);
      this.errorAnother.hidden = !c.canTryAnother;
      cls(this.loading, "is-on", false);
      if (e.code === "E_OFFLINE") cls(this.offline, "is-on", true);
      this.setModal(this.error);
    }));
    this.bag.add(c.on("resumeprompt", ({ time }) => {
      text(this.resumeBtn.querySelector(".t-btn-label") ?? this.resumeBtn.appendChild(h("span", { class: "t-btn-label" })), t("resumeFrom", { t: clock(time) }));
      this.setModal(this.resume);
    }));
    this.bag.add(c.on("autoplaymuted", () => cls(this.unmute, "is-on", true)));
    this.bag.add(c.on("volumechange", ({ muted }) => {
      if (!muted || !c.mutedByPolicy) cls(this.unmute, "is-on", false);
    }));
    this.bag.add(c.on("markers", ({ active }) => this.showSkip(active?.type ?? null)));
    this.bag.add(c.on("nextup", ({ next }) => this.showNext(next)));
    this.bag.add(c.on("seeking", () => {
      if (this.nextTimer && c.time < c.duration - 30) this.cancelNext(true);
    }));
    const on = () => cls(this.offline, "is-on", false);
    const off = () => cls(this.offline, "is-on", true);
    this.bag.on(window, "online", on);
    this.bag.on(window, "offline", off);
    if (typeof navigator !== "undefined" && navigator.onLine === false) off();
  }

  private onState(s: PlayerState) {
    if (this.bufTimer) clearTimeout(this.bufTimer);
    this.bufTimer = null;
    if (s === "buffering" || s === "seeking") {
      this.bufTimer = setTimeout(() => cls(this.buffering, "is-on", true), StateViews.BUFFER_DELAY_MS);
    } else cls(this.buffering, "is-on", false);
    if (s === "ready" || s === "playing" || s === "paused") cls(this.loading, "is-on", false);
    if (s === "playing") {
      if (this.modalEl === this.error || this.modalEl === this.ended || this.modalEl === this.resume) this.setModal(null);
      cls(this.offline, "is-on", typeof navigator !== "undefined" && navigator.onLine === false);
      this.showAdvisory();
    }
    if (s === "ended") {
      this.stopNextTimer();
      cls(this.nextUp, "is-on", false);
      const n = this.core.current?.next;
      if (n && !this.nextCancelled) {
        this.core.next(true);
        return;
      }
      this.endedNext.hidden = !n;
      this.setModal(this.ended);
    }
  }

  private setModal(el: HTMLElement | null) {
    for (const m of [this.error, this.resume, this.ended]) cls(m, "is-on", m === el);
    if (el) cls(this.loading, "is-on", el === this.resume ? false : this.loading.classList.contains("is-on"));
    this.modalEl = el;
    this.onModal(el);
  }

  get modal(): HTMLElement | null {
    if (this.modalEl) return this.modalEl;
    return this.nextUp.classList.contains("is-on") ? this.nextUp : null;
  }

  private answerResume(fromSaved: boolean) {
    this.setModal(null);
    this.core.resume(fromSaved);
  }

  /* ---- skip ---- */

  private showSkip(type: MarkerType | null) {
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipType = type;
    this.skipHidden = false;
    if (!type) {
      cls(this.skip, "is-on", false);
      this.onSkip(false);
      return;
    }
    const label = type === "credits" && this.core.current?.next ? t("nextEpisode") : t(SKIP_LABEL[type]);
    text(this.skip, label);
    cls(this.skip, "is-on", true);
    this.onSkip(true);
    this.skipTimer = setTimeout(() => {
      this.skipHidden = true;
      cls(this.skip, "is-on", false);
      this.onSkip(false);
    }, StateViews.SKIP_VISIBLE_MS);
  }

  /** While the controls are visible the skip button stays reachable even after its 8 s window. */
  controlsVisible(visible: boolean) {
    if (this.skipType && this.skipHidden) {
      cls(this.skip, "is-on", visible);
      this.onSkip(visible);
    }
  }

  get skipVisible() {
    return this.skip.classList.contains("is-on");
  }

  /* ---- next up ---- */

  private showNext(n: EpisodeInput) {
    if (this.nextCancelled) return;
    while (this.nextThumb.firstChild) this.nextThumb.removeChild(this.nextThumb.firstChild);
    const th = img(n.thumbnail, "", "t-img");
    if (th) this.nextThumb.appendChild(th);
    cls(this.nextThumb, "is-empty", !th);
    const se = n.season && n.episode ? `S${n.season} E${n.episode}` : n.episode ? t("episodeShort", { n: n.episode }) : "";
    text(this.nextTitle, n.title);
    text(this.nextSub, [se, n.subtitle].filter(Boolean).join(" · "));
    this.nextLeft = StateViews.NEXT_SECONDS;
    this.paintRing();
    cls(this.nextUp, "is-on", true);
    this.onModal(this.nextUp);
    this.stopNextTimer();
    this.nextTimer = setInterval(() => {
      if (this.core.paused) return;
      this.nextLeft -= 1;
      this.paintRing();
      if (this.nextLeft <= 0) this.playNext(true);
    }, 1000);
  }

  private paintRing() {
    const len = 2 * Math.PI * 22;
    this.ring.style.strokeDashoffset = String(len * (1 - this.nextLeft / StateViews.NEXT_SECONDS));
    if (reducedMotion()) this.ring.style.transition = "none";
    text(this.nextCount, String(Math.max(0, this.nextLeft)));
    this.nextUp.querySelector(".t-next-play")?.setAttribute("aria-label", `${t("playNow")}, ${t("nextIn", { n: Math.max(0, this.nextLeft) })}`);
  }

  private playNext(auto: boolean) {
    this.stopNextTimer();
    cls(this.nextUp, "is-on", false);
    this.onModal(this.modalEl);
    this.core.next(auto);
  }

  cancelNext(silent = false) {
    this.stopNextTimer();
    if (!silent) this.nextCancelled = true;
    else this.nextCancelled = false;
    cls(this.nextUp, "is-on", false);
    this.onModal(this.modalEl);
  }

  get nextUpVisible() {
    return this.nextUp.classList.contains("is-on");
  }

  private stopNextTimer() {
    if (this.nextTimer) clearInterval(this.nextTimer);
    this.nextTimer = null;
  }

  /* ---- advisory & toast ---- */

  private showAdvisory() {
    const m = this.core.current;
    if (this.advisoryShown || !m?.rating) return;
    this.advisoryShown = true;
    while (this.advisory.firstChild) this.advisory.removeChild(this.advisory.firstChild);
    this.advisory.append(h("span", { class: "t-advisory-bar", "aria-hidden": "true" }), h("div", null, h("p", { class: "t-advisory-rating" }, `Rated ${m.rating}`), m.advisory ? h("p", { class: "t-advisory-desc" }, m.advisory) : null));
    cls(this.advisory, "is-on", true);
    setTimeout(() => cls(this.advisory, "is-on", false), 6000);
  }

  toast(message: string, ms = 2200) {
    text(this.toastEl, message);
    cls(this.toastEl, "is-on", true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => cls(this.toastEl, "is-on", false), ms);
  }

  private hideAll() {
    this.setModal(null);
    this.stopNextTimer();
    for (const el of [this.nextUp, this.skip, this.unmute, this.advisory, this.buffering]) cls(el, "is-on", false);
  }

  destroy() {
    this.bag.dispose();
    this.stopNextTimer();
    for (const tm of [this.bufTimer, this.skipTimer, this.toastTimer]) if (tm) clearTimeout(tm);
  }
}
