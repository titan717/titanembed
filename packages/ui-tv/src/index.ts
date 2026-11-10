import { clamp, clock, delta, hms, normalizeKey, seekStep, type EpisodeInput, type Key, type TitanCore } from "@titan/core";
import {
  Bag,
  CaptionLayer,
  StateViews,
  Track,
  audioGroup,
  captionGroups,
  captionPreview,
  clear,
  cls,
  focusEl,
  focusables,
  h,
  icon,
  img,
  issueGroup,
  nearest,
  qualityGroup,
  skipGroup,
  sleepGroup,
  speedGroup,
  sourceGroup,
  type SourceMenu,
  subtitleGroup,
  t,
  text,
  timingGroup,
  type Dir,
  type MenuGroup
} from "@titan/ui-common";
import "@titan/ui-common/base.css";
import "./tv.css";

export interface TvOptions {
  /** Back pressed with nothing left to close (the host decides what "exit" means). */
  onExit?: () => void;
  /** The viewer picked an issue under "Report an Issue". */
  onReport?: (kind: string) => void;
  /** Hide the controls after this many ms of inactivity while playing (default 4500, blueprint 4–5 s). */
  hideAfter?: number;
  /** Source switching (shown in Settings when there is more than one source). */
  sources?: SourceMenu;
}

type PanelKind = "quality" | "audio" | "settings" | null;

/** Hidden-seek commit delay and the burst window used for the 10/20/30/60 s acceleration. */
const SEEK_COMMIT_MS = 700;
const SEEK_BURST_MS = 1000;

/**
 * Player A — the 10-foot TV player (TV PLAYER blueprint; docs/BLUEPRINT_SPEC.md §A). D-pad first, with mouse
 * and keyboard support for desktop browsers that get the TV class.
 */
export class TvPlayer {
  readonly root: HTMLElement;
  private bag = new Bag();
  private views: StateViews;
  private captions = new CaptionLayer();
  private track = new Track();
  private trackEl: HTMLDivElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private timeEl: HTMLElement;
  private qualityPill: HTMLButtonElement;
  private qualityValue: HTMLElement;
  private audioPill: HTMLButtonElement;
  private settingsPill: HTMLButtonElement;
  private watchPill: HTMLButtonElement;
  private bottomRow: HTMLElement;
  private paused: HTMLElement;
  private strip: HTMLElement;
  private stripThumbs: HTMLElement[] = [];
  private bubble: HTMLElement;
  private langs: HTMLElement;
  private panelEl: HTMLElement;
  private watchEl: HTMLElement;
  private panel: PanelKind = null;
  private panelStack: (() => void)[] = [];
  private panelOpener: HTMLElement | null = null;
  private watchOpen = false;
  private visible = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private seekTarget: number | null = null;
  private seekRepeats = 0;
  private seekLastAt = 0;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private hideAfter: number;

  constructor(
    root: HTMLElement,
    private core: TitanCore,
    private opts: TvOptions = {}
  ) {
    this.root = root;
    this.hideAfter = opts.hideAfter ?? 4500;
    root.classList.add("titan", "is-tv");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", t("player"));
    root.tabIndex = -1;

    // top bar (blueprint p3/p7): title + episode line left, pills right
    this.titleEl = h("strong", { class: "tv-title-main" });
    this.subEl = h("span", { class: "tv-title-sub" });
    this.qualityValue = h("span", { class: "tv-pill-value" }, t("qualityAuto"));
    this.qualityPill = this.pill("quality", [h("span", null, t("quality")), this.qualityValue], () =>
      this.openPanel("quality", this.qualityPill)
    );
    this.audioPill = this.pill("subtitles", [h("span", null, t("audioSubtitles"))], () => this.openPanel("audio", this.audioPill));
    this.settingsPill = this.pill("settings", [], () => this.openPanel("settings", this.settingsPill), t("settings"));
    this.settingsPill.classList.add("is-icon");
    const top = h(
      "div",
      { class: "tv-top" },
      h("div", { class: "tv-title" }, this.titleEl, this.subEl),
      h("div", { class: "tv-actions" }, this.qualityPill, this.audioPill, this.settingsPill)
    );

    // bottom: track + remaining time (p7, p19), Watch Next below-left (p3)
    this.trackEl = h("div", {
      class: "tv-track",
      "data-nav": "track",
      tabindex: "0",
      role: "slider",
      "aria-label": t("seekBar"),
      "aria-valuemin": "0"
    });
    this.trackEl.appendChild(this.track.el);
    this.timeEl = h("span", { class: "tv-time" });
    this.watchPill = this.pill("watchnext", [h("span", null, t("watchNext"))], () => this.openWatch());
    this.bottomRow = h("div", { class: "tv-bottom-row" }, this.watchPill);
    const bottom = h("div", { class: "tv-bottom" }, h("div", { class: "tv-track-row" }, this.trackEl, this.timeEl), this.bottomRow);

    // seek preview strip (p19) + delta bubble
    for (let i = 0; i < 3; i++) {
      const th = h(
        "div",
        { class: `tv-thumb${i === 1 ? " is-center" : ""}` },
        h("div", { class: "tv-thumb-img" }),
        h("span", { class: "tv-thumb-time" })
      );
      this.stripThumbs.push(th);
    }
    this.strip = h("div", { class: "tv-strip", "aria-hidden": "true" }, ...this.stripThumbs);
    this.bubble = h("div", { class: "tv-bubble", "aria-live": "polite" });

    this.paused = h("div", { class: "tv-paused", "aria-hidden": "true" }, icon("play"));
    this.langs = h("div", { class: "tv-langs", "aria-hidden": "true" });
    this.panelEl = h("div", { class: "tv-panel", role: "dialog", "aria-modal": "true" });
    this.watchEl = h("div", { class: "tv-watch", role: "dialog", "aria-modal": "true", "aria-label": t("watchNext") });

    root.append(
      h("div", { class: "tv-scrim" }),
      this.captions.el,
      this.captions.liveRegion,
      this.paused,
      this.langs,
      this.strip,
      this.bubble,
      top,
      bottom,
      this.watchEl,
      this.panelEl
    );
    this.views = new StateViews(core, root, "tv");
    this.views.onModal = (el) => this.onModal(el);
    this.views.onSkip = (on) => this.onSkip(on);
    this.captions.style(core.preferences);
    this.bindCore();
    this.bindInput();
    this.wake(false);
  }

  private pill(ic: Parameters<typeof icon>[0], label: Node[], onClick: () => void, aria?: string) {
    const b = h("button", { type: "button", class: "tv-pill", "aria-label": aria ?? null }, icon(ic), ...label);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /* ---------------- core → UI ---------------- */

  private bindCore() {
    const c = this.core;
    const b = this.bag;
    b.add(
      c.on("load", ({ media }) => {
        text(this.titleEl, media.title);
        text(this.subEl, media.subtitle ?? "");
        this.watchPill.hidden = !this.episodeList().length;
        this.closePanel();
        this.closeWatch();
        this.renderLangs();
        this.track.markers(media.markers ?? [], 0);
      })
    );
    b.add(c.on("timeupdate", ({ time, duration }) => this.paintTime(time, duration)));
    b.add(c.on("progress", () => this.paintTime(c.time, c.duration)));
    b.add(c.on("loadedmetadata", ({ duration }) => this.track.markers(c.markers, duration)));
    b.add(c.on("markers", ({ markers }) => this.track.markers(markers, c.duration)));
    b.add(
      c.on("statechange", ({ state }) => {
        cls(this.root, "is-paused", state === "paused" || state === "ready");
        cls(this.root, "is-playing", state === "playing");
        if (state === "paused" || state === "ended") this.wake(false, true);
        else if (state === "playing") this.armHide();
      })
    );
    b.add(c.on("cues", ({ cues }) => this.captions.render(cues)));
    b.add(
      c.on("qualitychange", ({ active }) => {
        const q = c.qualities.find((x) => x.id === active);
        text(this.qualityValue, !q || q.id === "auto" ? t("qualityAuto") : q.id === "data-saver" ? t("dataSaver") : q.label);
        this.qualityPill.hidden = c.qualities.length < 2;
        if (this.panel === "quality") this.rerender();
      })
    );
    b.add(
      c.on("tracks", () => {
        this.renderLangs();
        if (this.panel === "audio") this.rerender();
      })
    );
    b.add(
      c.on("ready", () => {
        this.qualityPill.hidden = c.qualities.length < 2;
        this.paintTime(c.time, c.duration);
      })
    );
    b.add(
      c.on("sleep", () => {
        if (this.panel === "settings") this.rerender();
      })
    );
  }

  private paintTime(time: number, duration: number) {
    const shown = this.seekTarget ?? time;
    this.track.set(shown, duration, this.core.buffered);
    text(this.timeEl, duration > 0 ? hms(Math.max(0, duration - shown)) : "");
    this.trackEl.setAttribute("aria-valuemax", String(Math.round(duration || 0)));
    this.trackEl.setAttribute("aria-valuenow", String(Math.round(shown)));
    this.trackEl.setAttribute("aria-valuetext", `${clock(shown)} / ${clock(duration)}`);
  }

  private renderLangs() {
    clear(this.langs);
    const list = this.core.audioTracks;
    if (list.length < 2) return;
    for (const a of list) {
      const active = a.id === this.core.audioTrack;
      this.langs.appendChild(
        h(
          "span",
          { class: `tv-lang${active ? " is-active" : ""}` },
          active ? icon("check") : null,
          a.label,
          a.original ? h("small", null, t("original")) : null
        )
      );
    }
    this.langs.classList.remove("is-on");
    void this.langs.offsetWidth;
    this.langs.classList.add("is-on");
    this.bag.timeout(() => this.langs.classList.remove("is-on"), 6000);
  }

  /* ---------------- visibility ---------------- */

  /** Shows the controls. `focusTrack` moves focus to the progress track (the default landing spot). */
  wake(focusTrack = true, keep = false) {
    const was = this.visible;
    this.visible = true;
    cls(this.root, "is-controls", true);
    this.views.controlsVisible(true);
    if (focusTrack && !was && !this.panel && !this.watchOpen) focusEl(this.views.skipVisible ? this.views.skip : this.trackEl);
    if (keep) this.clearHide();
    else this.armHide();
  }

  hide() {
    if (this.panel || this.watchOpen) return;
    this.visible = false;
    cls(this.root, "is-controls", false);
    this.views.controlsVisible(false);
    this.clearHide();
    if (this.views.skipVisible) focusEl(this.views.skip);
    else (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private armHide() {
    this.clearHide();
    if (this.core.state !== "playing" || this.panel || this.watchOpen) return;
    this.hideTimer = setTimeout(() => this.hide(), this.hideAfter);
  }
  private clearHide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  /* ---------------- input ---------------- */

  private bindInput() {
    const b = this.bag;
    b.on(window, "keydown", ((e: KeyboardEvent) => this.onKeyEvent(e)) as EventListener);
    // pointer (desktop TV class)
    b.on(this.root, "pointermove", (() => {
      if (!this.visible) this.wake(false);
      else this.armHide();
    }) as EventListener);
    b.on(this.root, "click", ((e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, .tv-track, .tv-panel, .tv-watch, .t-modal, .t-next")) return;
      if (this.panel) return this.closePanel();
      if (this.watchOpen) return this.closeWatch();
      if (!this.visible) return this.wake(false);
      this.core.userGesture();
      this.core.toggle();
    }) as EventListener);
    b.on(this.root, "dblclick", ((e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, .tv-panel, .tv-watch")) return;
      if (this.core.isFullscreen) void this.core.exitFullscreen();
      else void this.core.enterFullscreen(this.root);
    }) as EventListener);
    let dragging = false;
    const seekTo = (x: number) => {
      const d = this.core.duration;
      if (d > 0) this.core.seek(this.track.fractionAt(x) * d);
    };
    b.on(this.trackEl, "pointerdown", ((e: PointerEvent) => {
      e.stopPropagation();
      dragging = true;
      this.trackEl.setPointerCapture?.(e.pointerId);
      seekTo(e.clientX);
    }) as EventListener);
    b.on(this.trackEl, "pointermove", ((e: PointerEvent) => dragging && seekTo(e.clientX)) as EventListener);
    b.on(this.trackEl, "pointerup", (() => (dragging = false)) as EventListener);
    b.on(this.trackEl, "click", ((e: Event) => e.stopPropagation()) as EventListener);
    // hover mirrors focus for mouse users on the TV class
    b.on(this.root, "pointerover", ((e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("button, [data-nav]");
      if (el && this.root.contains(el) && this.inScope(el)) focusEl(el);
    }) as EventListener);
  }

  private inScope(el: HTMLElement) {
    return this.scope().contains(el);
  }

  /** The element whose focusables the D-pad moves between. */
  private scope(): HTMLElement {
    const m = this.views.modal;
    if (m) return m;
    if (this.panel) return this.panelEl;
    if (this.watchOpen) return this.watchEl;
    return this.root;
  }

  private chromeFocusables(): HTMLElement[] {
    const scope = this.scope();
    if (scope !== this.root) return focusables(scope);
    return focusables(this.root).filter((el) => !el.closest(".tv-panel, .tv-watch, .t-modal, .t-next"));
  }

  private onKeyEvent(e: KeyboardEvent) {
    const k = normalizeKey(e);
    if (!k) return;
    if (this.handle(k, e.repeat)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** Handles one normalised key. Returns true when the key was used. Public for tests and the embed bridge. */
  handle(k: Exclude<Key, null>, repeat = false): boolean {
    const c = this.core;
    // media keys act immediately, even with the controls hidden
    switch (k) {
      case "playpause":
      case "space":
        c.userGesture();
        c.toggle();
        this.wake(false);
        return true;
      case "play":
        c.userGesture();
        void c.play();
        return true;
      case "pause":
        c.pause();
        this.wake(false, true);
        return true;
      case "stop":
        c.pause();
        c.seek(0);
        return true;
      case "ff":
        this.accumulate(1, repeat, true);
        return true;
      case "rw":
        this.accumulate(-1, repeat, true);
        return true;
      case "next":
        c.next(false);
        return true;
      case "prev":
        c.previous();
        return true;
      case "mute":
        c.setMuted(!c.muted);
        this.views.toast(c.muted ? t("mute") : t("unmute"), 1200);
        return true;
      case "captions":
        this.cycleCaptions();
        return true;
      case "fullscreen":
        if (c.isFullscreen) void c.exitFullscreen();
        else void c.enterFullscreen(this.root);
        return true;
      case "info":
        this.wake(true);
        return true;
      case "volup":
      case "voldown":
        return false;
    }

    // modal views (error / resume / ended / next-up) take the D-pad
    const modal = this.views.modal;
    if (modal) {
      if (k === "back") {
        if (modal === this.views.nextUp) this.views.cancelNext();
        else this.opts.onExit?.();
        return true;
      }
      if (k === "enter") {
        const f = document.activeElement as HTMLElement | null;
        if (f && modal.contains(f)) f.click();
        else focusEl(focusables(modal)[0] ?? null);
        return true;
      }
      this.move(k as Dir, focusables(modal));
      return true;
    }

    if (this.panel) {
      if (k === "back") {
        this.panelBack();
        return true;
      }
      if (k === "enter") {
        (document.activeElement as HTMLElement | null)?.click();
        return true;
      }
      this.move(k as Dir, focusables(this.panelEl));
      return true;
    }

    if (this.watchOpen) {
      if (k === "back") {
        this.closeWatch();
        return true;
      }
      if (k === "enter") {
        (document.activeElement as HTMLElement | null)?.click();
        return true;
      }
      if (k === "up" && !nearest(document.activeElement as HTMLElement, "up", focusables(this.watchEl))) {
        this.closeWatch();
        return true;
      }
      this.move(k as Dir, focusables(this.watchEl));
      return true;
    }

    if (!this.visible) {
      // the skip button keeps focus while it is on screen without the controls
      if (k === "enter" && this.views.skipVisible) {
        c.userGesture();
        this.views.skip.click();
        return true;
      }
      if (k === "left" || k === "right") {
        c.userGesture();
        this.accumulate(k === "right" ? 1 : -1, repeat, false);
        return true;
      }
      if (k === "back") {
        this.opts.onExit?.();
        return true;
      }
      // first press only wakes
      c.userGesture();
      this.wake(true);
      return true;
    }

    // controls visible
    this.armHide();
    const f = document.activeElement as HTMLElement | null;
    if (k === "back") {
      this.hide();
      return true;
    }
    if (f === this.trackEl && (k === "left" || k === "right")) {
      this.accumulate(k === "right" ? 1 : -1, repeat, true);
      return true;
    }
    if (k === "enter") {
      c.userGesture();
      if ((!f || f === this.root || !this.root.contains(f)) && this.views.skipVisible && this.seekTarget === null) {
        // nothing focused yet: OK acts on the on-screen Skip button, as it does with the controls hidden
        this.views.skip.click();
        return true;
      }
      if (!f || f === this.root || f === this.trackEl || !this.root.contains(f)) {
        if (this.seekTarget !== null) this.commitSeek();
        else c.toggle();
        if (!f || !this.root.contains(f)) focusEl(this.trackEl);
      } else f.click();
      return true;
    }
    if (!f || !this.root.contains(f) || f === this.root) {
      focusEl(this.trackEl);
      return true;
    }
    this.move(k as Dir, this.chromeFocusables());
    return true;
  }

  private move(dir: Dir, list: HTMLElement[]) {
    if (!["left", "right", "up", "down"].includes(dir)) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !list.includes(cur)) {
      focusEl(list.find((x) => x.classList.contains("is-selected")) ?? list[0] ?? null);
      return;
    }
    const next = nearest(cur, dir, list);
    if (next) focusEl(next);
  }

  /* ---------------- seeking ---------------- */

  /** Left/Right accumulate 10/20/30/60 s steps and commit after a short pause (blueprint p19 strip). */
  private accumulate(sign: 1 | -1, repeat: boolean, showControls: boolean) {
    const c = this.core;
    const d = c.duration;
    if (!(d > 0)) return;
    const now = performance.now();
    if (now - this.seekLastAt > SEEK_BURST_MS && !repeat) this.seekRepeats = 0;
    this.seekLastAt = now;
    const step = seekStep(this.seekRepeats++);
    const base = this.seekTarget ?? c.time;
    this.seekTarget = clamp(base + sign * step, 0, Math.max(0, d - 1));
    cls(this.root, "is-seeking", true);
    if (showControls && !this.visible) this.wake(true);
    if (this.visible) this.armHide();
    this.paintSeek();
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => this.commitSeek(), SEEK_COMMIT_MS);
  }

  private paintSeek() {
    const target = this.seekTarget;
    if (target === null) return;
    const diff = target - this.core.time;
    text(this.bubble, "");
    this.bubble.append(h("strong", null, delta(Math.round(diff))), h("span", null, hms(target)));
    this.paintTime(this.core.time, this.core.duration);
    const has = this.core.thumbnails.length > 0;
    cls(this.strip, "has-frames", has);
    [-10, 0, 10].forEach((off, i) => {
      const th = this.stripThumbs[i]!;
      const at = clamp(target + off, 0, this.core.duration);
      text(th.querySelector(".tv-thumb-time")!, hms(at));
      const box = th.querySelector<HTMLElement>(".tv-thumb-img")!;
      const cue = this.core.thumbnailAt(at);
      th.hidden = !has || (off !== 0 && (target + off < 0 || target + off > this.core.duration));
      if (cue) paintThumb(box, cue.url, cue.xywh);
    });
  }

  private commitSeek() {
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    const target = this.seekTarget;
    this.seekTarget = null;
    cls(this.root, "is-seeking", false);
    if (target !== null) this.core.seek(target);
  }

  private cycleCaptions() {
    const list = this.core.subtitleTracks;
    if (!list.length) return;
    const ids: (string | null)[] = [null, ...list.map((x) => x.id)];
    const i = ids.indexOf(this.core.subtitleTrack);
    const next = ids[(i + 1) % ids.length] ?? null;
    void this.core.setSubtitleTrack(next);
    this.views.toast(`${t("subtitles")}: ${next ? (list.find((x) => x.id === next)?.label ?? "") : t("off")}`, 1400);
  }

  /* ---------------- modal + skip focus ---------------- */

  private onModal(el: HTMLElement | null) {
    if (el) {
      this.closePanel();
      this.closeWatch();
      this.wake(false, true);
      const first = el.querySelector<HTMLElement>(".t-btn.is-primary:not([hidden])") ?? focusables(el)[0] ?? null;
      requestAnimationFrame(() => focusEl(first));
    } else if (this.visible) {
      requestAnimationFrame(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !this.root.contains(a) || a.closest(".t-modal, .t-next")) focusEl(this.trackEl);
      });
    }
  }

  private onSkip(on: boolean) {
    const a = document.activeElement as HTMLElement | null;
    if (on) {
      // Skip takes focus unless the viewer is already working somewhere other than the default landing spot
      const idle = !this.visible || !a || a === this.trackEl || !this.root.contains(a);
      if (idle && !this.panel && !this.watchOpen && !this.views.modal && this.seekTarget === null) focusEl(this.views.skip);
    } else if (a === this.views.skip) {
      if (this.visible) focusEl(this.trackEl);
      else a.blur();
    }
  }

  /* ---------------- panels ---------------- */

  private openPanel(kind: Exclude<PanelKind, null>, opener: HTMLElement) {
    this.panel = kind;
    this.panelOpener = opener;
    this.panelStack = [];
    cls(this.root, "has-panel", true);
    this.clearHide();
    this.renderPanel(kind);
    this.panelEl.classList.remove("is-on");
    void this.panelEl.offsetWidth;
    this.panelEl.classList.add("is-on");
  }

  private rerender() {
    if (!this.panel) return;
    const focusIdx = focusables(this.panelEl).indexOf(document.activeElement as HTMLElement);
    const top = this.panelStack[this.panelStack.length - 1];
    if (top) top();
    else this.renderPanel(this.panel);
    const list = focusables(this.panelEl);
    focusEl(list[focusIdx] ?? list.find((x) => x.classList.contains("is-selected")) ?? list[0] ?? null);
  }

  private panelBack() {
    if (this.panelStack.length > 0) {
      this.panelStack.pop();
      const prev = this.panelStack[this.panelStack.length - 1];
      if (prev) prev();
      else if (this.panel) this.renderPanel(this.panel);
      const list = focusables(this.panelEl);
      focusEl(list.find((x) => x.classList.contains("is-selected")) ?? list[0] ?? null);
      return;
    }
    this.closePanel();
  }

  closePanel() {
    if (!this.panel) return;
    this.panel = null;
    this.panelStack = [];
    cls(this.panelEl, "is-on", false);
    cls(this.root, "has-panel", false);
    this.panelEl.className = "tv-panel";
    focusEl(this.panelOpener ?? this.trackEl);
    this.armHide();
  }

  private renderPanel(kind: Exclude<PanelKind, null>) {
    const c = this.core;
    clear(this.panelEl);
    this.panelEl.className = `tv-panel is-on is-${kind}`;
    if (kind === "quality") {
      const g = qualityGroup(c);
      this.panelEl.setAttribute("aria-label", g.title);
      this.panelEl.append(
        h("h2", { class: "tv-panel-title" }, g.title),
        h("div", { class: "tv-panel-body", "data-scroll": "" }, this.list(g, true)),
        h("div", { class: "tv-panel-foot" }, this.reportRow())
      );
    } else if (kind === "audio") {
      const a = audioGroup(c);
      const s = subtitleGroup(c);
      this.panelEl.setAttribute("aria-label", t("audioSubtitles"));
      this.panelEl.append(
        h(
          "div",
          { class: `tv-cols${a ? "" : " is-single"}` },
          a ? h("div", { class: "tv-col", "data-scroll": "" }, h("h2", { class: "tv-col-title" }, a.title), this.list(a, false)) : null,
          h("div", { class: "tv-col", "data-scroll": "" }, h("h2", { class: "tv-col-title" }, s.title), this.list(s, false))
        ),
        h("div", { class: "tv-panel-foot" }, this.reportRow())
      );
    } else {
      this.renderSettings();
    }
    requestAnimationFrame(() => {
      if (!this.panel) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && this.panelEl.contains(a)) return;
      const list = focusables(this.panelEl);
      focusEl(list.find((x) => x.classList.contains("is-selected")) ?? list[0] ?? null);
    });
  }

  private renderSettings() {
    const c = this.core;
    clear(this.panelEl);
    this.panelEl.className = "tv-panel is-on is-settings";
    this.panelEl.setAttribute("aria-label", t("settings"));
    const sel = (g: MenuGroup) => g.options.find((o) => o.selected)?.label ?? "";
    const entries: { label: string; value: string; open: () => void }[] = [
      { label: t("sleepTimer"), value: sel(sleepGroup(c)) || t("sleepOff"), open: () => this.sub(() => sleepGroup(c)) },
      { label: t("captionStyle"), value: "", open: () => this.subCaptions() },
      { label: t("skipBehaviour"), value: sel(skipGroup(c)), open: () => this.sub(() => skipGroup(c)) }
    ];
    if (c.subtitleTrack)
      entries.splice(2, 0, { label: t("timing"), value: sel(timingGroup(c)), open: () => this.sub(() => timingGroup(c)) });
    if (c.canSetRate) entries.unshift({ label: t("speed"), value: sel(speedGroup(c)), open: () => this.sub(() => speedGroup(c)) });
    const src = this.opts.sources;
    if (src && src.list().length > 1)
      entries.unshift({ label: t("source"), value: sel(sourceGroup(src)), open: () => this.sub(() => sourceGroup(src)) });
    const rows = entries.map((e) => {
      const b = h(
        "button",
        { type: "button", class: "tv-row is-nav" },
        h("span", { class: "tv-row-text" }, h("span", null, e.label), e.value ? h("small", null, e.value) : null),
        icon("back", "t-icon tv-chev")
      );
      b.addEventListener("click", (ev) => (ev.stopPropagation(), e.open()));
      return b;
    });
    this.panelEl.append(
      h("h2", { class: "tv-panel-title" }, t("settings")),
      h("div", { class: "tv-panel-body", "data-scroll": "" }, h("div", { class: "tv-list" }, ...rows))
    );
  }

  /** Pushes a sub-list (one menu group) onto the settings panel. */
  private sub(make: () => MenuGroup) {
    const render = () => {
      const g = make();
      clear(this.panelEl);
      this.panelEl.append(
        h("h2", { class: "tv-panel-title" }, g.title),
        h("div", { class: "tv-panel-body", "data-scroll": "" }, this.list(g, true, true))
      );
    };
    this.panelStack.push(render);
    render();
    const list = focusables(this.panelEl);
    focusEl(list.find((x) => x.classList.contains("is-selected")) ?? list[0] ?? null);
  }

  private subCaptions() {
    const render = () => {
      const groups = captionGroups(this.core, (p) => this.captions.style(p));
      const preview = captionPreview(t("captionPreview"));
      preview.querySelector(".t-captions")!.className =
        `t-captions is-preview cap-s-${this.core.preferences.captionSize} cap-c-${this.core.preferences.captionColor} cap-bg-${this.core.preferences.captionBg} cap-e-${this.core.preferences.captionEdge}`;
      clear(this.panelEl);
      this.panelEl.append(
        h("h2", { class: "tv-panel-title" }, t("captionStyle")),
        preview,
        h(
          "div",
          { class: "tv-panel-body", "data-scroll": "" },
          ...groups.map((g) => h("div", { class: "tv-chipgroup" }, h("h3", { class: "tv-group" }, g.title), this.chips(g)))
        )
      );
    };
    this.panelStack.push(render);
    render();
    focusEl(focusables(this.panelEl).find((x) => x.classList.contains("is-selected")) ?? null);
  }

  private chips(g: MenuGroup) {
    return h(
      "div",
      { class: "tv-chips", role: "radiogroup", "aria-label": g.title },
      ...g.options.map((o) => {
        const b = h(
          "button",
          { type: "button", role: "radio", "aria-checked": String(o.selected), class: `tv-chip${o.selected ? " is-selected" : ""}` },
          o.label
        );
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          g.select(o.id);
          this.rerender();
        });
        return b;
      })
    );
  }

  private list(g: MenuGroup, inline: boolean, closeOnPick = false) {
    return h(
      "div",
      { class: "tv-list", role: "radiogroup", "aria-label": g.title },
      ...g.options.map((o) => {
        const b = h(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": String(o.selected),
            class: `tv-row${o.selected ? " is-selected" : ""}${inline ? " is-inline" : ""}`
          },
          h("span", { class: "tv-check" }, o.selected ? icon("check") : null),
          h(
            "span",
            { class: "tv-row-text" },
            h("span", { class: "tv-row-label" }, o.label, o.badge ? h("span", { class: "tv-badge" }, o.badge) : null),
            o.note ? h("small", null, o.note) : null
          )
        );
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          g.select(o.id);
          if (closeOnPick) this.panelBack();
          else this.rerender();
        });
        return b;
      })
    );
  }

  private reportRow() {
    const b = h("button", { type: "button", class: "tv-row tv-report" }, icon("alert"), h("span", null, t("reportIssue")));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      this.sub(() =>
        issueGroup((kind) => {
          this.opts.onReport?.(kind);
          this.closePanel();
          this.views.toast(t("reportSent"), 3200);
        })
      );
    });
    return b;
  }

  /* ---------------- Watch Next (p3) ---------------- */

  private episodeList(): EpisodeInput[] {
    const m = this.core.current;
    if (!m) return [];
    const list = [...(m.episodes ?? [])];
    if (m.next && !list.some((e) => e.id === m.next!.id)) list.unshift(m.next);
    return list.filter((e) => e.id !== m.id || (m.episodes ?? []).length > 1);
  }

  private openWatch() {
    const eps = this.episodeList();
    if (!eps.length) return;
    this.watchOpen = true;
    this.clearHide();
    cls(this.root, "has-watch", true);
    clear(this.watchEl);
    const cur = this.core.current?.id;
    const cards = eps.map((ep) => {
      const media = h("span", { class: "tv-card-media" });
      const art = img(ep.thumbnail, "", "t-img");
      if (art) media.appendChild(art);
      else media.appendChild(h("span", { class: "tv-card-fallback" }, ep.title));
      media.appendChild(h("span", { class: "tv-card-play" }, icon("play")));
      if (ep.progress && ep.progress > 0) {
        const bar = h("span", { class: "tv-card-progress" }, h("span", null));
        (bar.firstChild as HTMLElement).style.transform = `scaleX(${Math.min(1, ep.progress)})`;
        media.appendChild(bar);
      }
      if (ep.id === cur) media.appendChild(h("span", { class: "tv-card-now" }, t("play")));
      const se = ep.season && ep.episode ? `S${ep.season} E${ep.episode}` : ep.episode ? t("episodeShort", { n: ep.episode }) : "";
      const meta = [se, ep.duration ? `${Math.round(ep.duration / 60)}m` : "", ep.genres ?? ""].filter(Boolean).join(" · ");
      const b = h(
        "button",
        {
          type: "button",
          class: `tv-card${ep.id === this.core.current?.next?.id ? " is-selected" : ""}`,
          "aria-label": [ep.title, meta].filter(Boolean).join(", ")
        },
        media,
        h("strong", null, ep.title),
        meta ? h("small", null, meta) : null
      );
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeWatch();
        this.core.playEpisode(ep);
      });
      return b;
    });
    this.watchEl.append(
      h("div", { class: "tv-watch-head" }, icon("watchnext"), h("span", null, t("watchNext"))),
      h("hr", { class: "tv-watch-rule" }),
      h("div", { class: "tv-watch-row", "data-scroll": "" }, ...cards)
    );
    cls(this.watchEl, "is-on", true);
    requestAnimationFrame(() => focusEl(cards.find((c) => c.classList.contains("is-selected")) ?? cards[0] ?? null));
  }

  closeWatch() {
    if (!this.watchOpen) return;
    this.watchOpen = false;
    cls(this.watchEl, "is-on", false);
    cls(this.root, "has-watch", false);
    focusEl(this.watchPill.hidden ? this.trackEl : this.watchPill);
    this.armHide();
  }

  destroy() {
    this.bag.dispose();
    this.views.destroy();
    this.clearHide();
    if (this.seekTimer) clearTimeout(this.seekTimer);
    clear(this.root);
    this.root.classList.remove("is-tv", "is-controls", "has-panel", "has-watch", "is-seeking", "is-paused", "is-playing");
  }
}

/** Paints a thumbnail cue (whole image or sprite fragment) as a background so no markup is involved. */
export function paintThumb(box: HTMLElement, url: string, xywh?: [number, number, number, number]) {
  const safe = url.replace(/["\\\n\r]/g, "");
  box.style.backgroundImage = `url("${safe}")`;
  if (xywh) {
    const [x, y, w, hgt] = xywh;
    const bw = box.clientWidth || 1;
    const scale = bw / w;
    box.style.backgroundSize = "auto";
    box.style.backgroundPosition = `${-x * scale}px ${-y * scale}px`;
    box.style.backgroundSize = `auto ${hgt * scale}px`;
    // sprite: size the whole sheet so one tile fills the box
    const img = new Image();
    img.onload = () => {
      box.style.backgroundSize = `${img.naturalWidth * scale}px ${img.naturalHeight * scale}px`;
    };
    img.src = safe;
  } else {
    box.style.backgroundSize = "cover";
    box.style.backgroundPosition = "center";
  }
}

export function mountTv(root: HTMLElement, core: TitanCore, opts?: TvOptions) {
  return new TvPlayer(root, core, opts);
}
