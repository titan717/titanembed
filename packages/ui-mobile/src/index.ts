import { clamp, clock, delta, type EpisodeInput, type TitanCore } from "@titan/core";
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
  h,
  icon,
  img,
  issueGroup,
  qualityGroup,
  skipGroup,
  sleepGroup,
  speedGroup,
  subtitleGroup,
  t,
  text,
  timingGroup,
  type IconName,
  type MenuGroup
} from "@titan/ui-common";
import "@titan/ui-common/base.css";
import "./mobile.css";

export interface MobileOptions {
  onExit?: () => void;
  onReport?: (kind: string) => void;
  /** Show a back arrow in the top bar (the host handles `exit`). */
  showBack?: boolean;
  hideAfter?: number;
}

const DOUBLE_TAP_MS = 280;
const HOLD_MS = 480;
const DRAG_START = 12;

type Sheet = "quality" | "audio" | "settings" | "episodes" | null;

/** Player B — the touch-first mobile player (docs/BLUEPRINT_SPEC.md §B). */
export class MobilePlayer {
  readonly root: HTMLElement;
  private bag = new Bag();
  private views: StateViews;
  private captions = new CaptionLayer();
  private track = new Track();
  private trackEl: HTMLDivElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private curEl: HTMLElement;
  private durEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private episodesBtn: HTMLButtonElement;
  private pipBtn: HTMLButtonElement;
  private fsBtn: HTMLButtonElement;
  private fitBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private qualityBtn: HTMLButtonElement;
  private gesture: HTMLElement;
  private dim: HTMLElement;
  private hud: HTMLElement;
  private rippleL: HTMLElement;
  private rippleR: HTMLElement;
  private unlockBtn: HTMLButtonElement;
  private sheetEl: HTMLElement;
  private sheetBack: HTMLElement;
  private sheet: Sheet = null;
  private sheetStack: (() => void)[] = [];
  private visible = false;
  private locked = false;
  private fill = false;
  private brightness = 1;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private hudTimer: ReturnType<typeof setTimeout> | null = null;
  private hideAfter: number;
  // gesture state
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTap = 0;
  private lastTapSide: "l" | "r" | "c" = "c";
  private tapSeek = 0;
  private tapSeekTimer: ReturnType<typeof setTimeout> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holding = false;
  private holdRate = 1;
  private drag: {
    id: number;
    x: number;
    y: number;
    kind: "none" | "seek" | "volume" | "brightness";
    startTime: number;
    startVal: number;
    target: number;
  } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;

  constructor(
    root: HTMLElement,
    private core: TitanCore,
    private opts: MobileOptions = {}
  ) {
    this.root = root;
    this.hideAfter = opts.hideAfter ?? 3500;
    root.classList.add("titan", "is-mobile");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", t("player"));

    this.dim = h("div", { class: "m-dim", "aria-hidden": "true" });
    this.gesture = h("div", { class: "m-gesture", "aria-hidden": "true" });
    this.rippleL = h(
      "div",
      { class: "m-ripple is-l", "aria-hidden": "true" },
      h("span", { class: "m-ripple-icon" }, icon("rw10")),
      h("span", { class: "m-ripple-n" })
    );
    this.rippleR = h(
      "div",
      { class: "m-ripple is-r", "aria-hidden": "true" },
      h("span", { class: "m-ripple-icon" }, icon("ff10")),
      h("span", { class: "m-ripple-n" })
    );
    this.hud = h("div", { class: "m-hud", role: "status", "aria-live": "polite" });

    // top bar
    this.titleEl = h("strong", { class: "m-title-main" });
    this.subEl = h("span", { class: "m-title-sub" });
    const back = opts.showBack ? this.btn("back", t("back"), () => this.opts.onExit?.(), "m-back") : null;
    this.qualityBtn = this.btn("quality", t("quality"), () => this.openSheet("quality"));
    this.pipBtn = this.btn("pip", t("pip"), () => void this.core.enterPip());
    const top = h(
      "div",
      { class: "m-top" },
      back,
      h("div", { class: "m-title" }, this.titleEl, this.subEl),
      h(
        "div",
        { class: "m-actions" },
        this.btn("subtitles", t("audioSubtitles"), () => this.openSheet("audio")),
        this.qualityBtn,
        this.pipBtn,
        this.btn("settings", t("settings"), () => this.openSheet("settings"))
      )
    );

    // centre
    this.playBtn = h("button", { type: "button", class: "m-play", "aria-label": t("play") }, icon("play"));
    this.playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.core.userGesture();
      this.core.toggle();
      this.armHide();
    });
    const center = h(
      "div",
      { class: "m-center" },
      this.btn("rw10", t("rewind"), () => this.seekBy(-10), "m-skipbtn"),
      this.playBtn,
      this.btn("ff10", t("forward"), () => this.seekBy(10), "m-skipbtn")
    );

    // bottom
    this.trackEl = h("div", { class: "m-track", role: "slider", tabindex: "0", "aria-label": t("seekBar"), "aria-valuemin": "0" });
    this.trackEl.appendChild(this.track.el);
    this.curEl = h("span", { class: "m-time" });
    this.durEl = h("span", { class: "m-time is-end" });
    this.speedBtn = this.btn("speed", t("speed"), () => this.openSub(() => speedGroup(this.core)), "m-chip", t("normal"));
    this.episodesBtn = this.btn("episodes", t("episodes"), () => this.openSheet("episodes"), "m-chip", t("episodes"));
    this.nextBtn = this.btn("next", t("nextEpisode"), () => this.core.next(false), "m-chip", t("nextEpisode"));
    this.fitBtn = this.btn("fit", t("fill"), () => this.toggleFit());
    this.fsBtn = this.btn("fullscreen", t("fullscreen"), () => void this.toggleFullscreen());
    const bottom = h(
      "div",
      { class: "m-bottom" },
      h("div", { class: "m-track-row" }, this.curEl, this.trackEl, this.durEl),
      h(
        "div",
        { class: "m-bottom-row" },
        h(
          "div",
          { class: "m-row-left" },
          this.btn("lock", t("lock"), () => this.setLocked(true), "m-chip", t("lock")),
          this.speedBtn,
          this.episodesBtn,
          this.nextBtn
        ),
        h("div", { class: "m-row-right" }, this.fitBtn, this.fsBtn)
      )
    );

    this.unlockBtn = h("button", { type: "button", class: "m-unlock" }, icon("unlock"), h("span", null, t("unlock")));
    this.unlockBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setLocked(false);
    });

    this.sheetBack = h("div", { class: "m-sheet-back" });
    this.sheetBack.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeSheet();
    });
    this.sheetEl = h("div", { class: "m-sheet", role: "dialog", "aria-modal": "true" });
    this.bindSheetSwipe();

    root.append(
      this.dim,
      this.captions.el,
      this.captions.liveRegion,
      this.gesture,
      this.rippleL,
      this.rippleR,
      this.hud,
      h("div", { class: "m-scrim" }),
      top,
      center,
      bottom,
      this.unlockBtn,
      this.sheetBack,
      this.sheetEl
    );
    this.views = new StateViews(core, root, "mobile");
    this.views.onModal = (el) => {
      if (el) {
        this.closeSheet();
        this.show(true);
      }
    };
    this.captions.style(core.preferences);
    this.bindCore();
    this.bindGestures();
    this.show(true);
  }

  private btn(ic: IconName, label: string, onClick: () => void, extra = "", visibleLabel?: string) {
    const b = h(
      "button",
      {
        type: "button",
        class: `m-btn ${extra}`.trim(),
        "aria-label": visibleLabel && visibleLabel !== label ? `${label}: ${visibleLabel}` : label
      },
      icon(ic),
      visibleLabel ? h("span", { class: "m-btn-label" }, visibleLabel) : null
    );
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
      this.armHide();
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
        this.closeSheet();
        this.episodesBtn.hidden = !this.episodeList().length;
        this.nextBtn.hidden = !media.next;
        this.pipBtn.hidden = !c.canPip;
        this.track.markers(media.markers ?? [], 0);
      })
    );
    b.add(c.on("timeupdate", ({ time, duration }) => this.paintTime(time, duration)));
    b.add(c.on("progress", () => this.paintTime(c.time, c.duration)));
    b.add(
      c.on("loadedmetadata", ({ duration }) => {
        this.track.markers(c.markers, duration);
        this.pipBtn.hidden = !c.canPip;
      })
    );
    b.add(c.on("markers", ({ markers }) => this.track.markers(markers, c.duration)));
    b.add(
      c.on("statechange", ({ state }) => {
        const playing = state === "playing" || state === "buffering";
        clear(this.playBtn);
        this.playBtn.appendChild(icon(playing ? "pause" : "play"));
        this.playBtn.setAttribute("aria-label", playing ? t("pause") : t("play"));
        cls(this.root, "is-paused", state === "paused" || state === "ready");
        if (state === "paused" || state === "ended") this.show(true);
        else if (state === "playing") this.armHide();
      })
    );
    b.add(c.on("cues", ({ cues }) => this.captions.render(cues)));
    b.add(
      c.on("ratechange", ({ rate }) => {
        if (this.holding) return;
        const rl = rate === 1 ? t("normal") : `${rate}×`;
        text(this.speedBtn.querySelector(".m-btn-label")!, rl);
        this.speedBtn.setAttribute("aria-label", `${t("speed")}: ${rl}`);
      })
    );
    b.add(
      c.on("qualitychange", () => {
        this.qualityBtn.hidden = c.qualities.length < 2;
        if (this.sheet === "quality") this.rerender();
      })
    );
    b.add(
      c.on("tracks", () => {
        if (this.sheet === "audio") this.rerender();
      })
    );
    b.add(
      c.on("fullscreenchange", ({ fullscreen }) => {
        clear(this.fsBtn);
        this.fsBtn.appendChild(icon(fullscreen ? "fullscreenExit" : "fullscreen"));
        this.fsBtn.setAttribute("aria-label", fullscreen ? t("exitFullscreen") : t("fullscreen"));
        cls(this.root, "is-fullscreen", fullscreen);
        if (!fullscreen) c.unlockOrientation();
      })
    );
    b.add(
      c.on("ready", () => {
        this.qualityBtn.hidden = c.qualities.length < 2;
        this.pipBtn.hidden = !c.canPip;
      })
    );
  }

  private paintTime(time: number, duration: number) {
    const shown = this.drag?.kind === "seek" ? this.drag.target : time;
    this.track.set(shown, duration, this.core.buffered);
    text(this.curEl, clock(shown));
    text(this.durEl, duration > 0 ? clock(duration) : "");
    this.trackEl.setAttribute("aria-valuemax", String(Math.round(duration || 0)));
    this.trackEl.setAttribute("aria-valuenow", String(Math.round(shown)));
    this.trackEl.setAttribute("aria-valuetext", `${clock(shown)} / ${clock(duration)}`);
  }

  /* ---------------- visibility ---------------- */

  show(keep = false) {
    if (this.locked) return;
    this.visible = true;
    cls(this.root, "is-controls", true);
    this.views.controlsVisible(true);
    if (keep) this.clearHide();
    else this.armHide();
  }
  hide() {
    if (this.sheet) return;
    this.visible = false;
    cls(this.root, "is-controls", false);
    this.views.controlsVisible(false);
    this.clearHide();
  }
  private armHide() {
    this.clearHide();
    if (this.core.state !== "playing" || this.sheet) return;
    this.hideTimer = setTimeout(() => this.hide(), this.hideAfter);
  }
  private clearHide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private setLocked(on: boolean) {
    this.locked = on;
    cls(this.root, "is-locked", on);
    haptic(on ? 20 : 10);
    if (on) {
      this.hide();
      this.flashUnlock();
      this.views.toast(t("locked"), 1200);
    } else {
      cls(this.unlockBtn, "is-on", false);
      this.show();
    }
  }
  private flashUnlock() {
    cls(this.unlockBtn, "is-on", true);
    if (this.hudTimer) clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => cls(this.unlockBtn, "is-on", false), 2500);
  }

  /* ---------------- gestures ---------------- */

  private side(x: number): "l" | "r" | "c" {
    const r = this.root.getBoundingClientRect();
    const f = (x - r.left) / r.width;
    return f < 0.4 ? "l" : f > 0.6 ? "r" : "c";
  }

  private bindGestures() {
    const g = this.gesture;
    const b = this.bag;
    b.on(g, "pointerdown", ((e: PointerEvent) => this.onDown(e)) as EventListener);
    b.on(g, "pointermove", ((e: PointerEvent) => this.onMove(e)) as EventListener);
    b.on(g, "pointerup", ((e: PointerEvent) => this.onUp(e)) as EventListener);
    b.on(g, "pointercancel", ((e: PointerEvent) => this.onCancel(e)) as EventListener);
    b.on(g, "contextmenu", ((e: Event) => e.preventDefault()) as EventListener);
    // the scrim area between controls passes taps to the gesture layer
    b.on(this.root, "click", ((e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.classList.contains("m-scrim") || el.classList.contains("m-center") || el === this.root) this.hide();
    }) as EventListener);
    // track seeking
    let dragging = false;
    const seekTo = (x: number, commit: boolean) => {
      const d = this.core.duration;
      if (!(d > 0)) return;
      const target = this.track.fractionAt(x) * d;
      this.drag = { id: -1, x: 0, y: 0, kind: "seek", startTime: this.core.time, startVal: 0, target };
      this.paintTime(this.core.time, d);
      this.showHud("seek", target);
      if (commit) {
        this.drag = null;
        this.core.seek(target);
        this.hideHud();
      }
    };
    b.on(this.trackEl, "pointerdown", ((e: PointerEvent) => {
      e.stopPropagation();
      dragging = true;
      this.trackEl.setPointerCapture?.(e.pointerId);
      this.clearHide();
      seekTo(e.clientX, false);
    }) as EventListener);
    b.on(this.trackEl, "pointermove", ((e: PointerEvent) => dragging && seekTo(e.clientX, false)) as EventListener);
    b.on(this.trackEl, "pointerup", ((e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      seekTo(e.clientX, true);
      this.armHide();
    }) as EventListener);
    b.on(this.trackEl, "pointercancel", (() => {
      dragging = false;
      this.drag = null;
      this.hideHud();
    }) as EventListener);
    b.on(this.trackEl, "keydown", ((e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        this.seekBy(e.key === "ArrowRight" ? 10 : -10);
      }
    }) as EventListener);
    b.on(window, "keydown", ((e: KeyboardEvent) => {
      if (e.key === "Escape" && this.sheet) {
        e.preventDefault();
        this.sheetBackStep();
      } else if (e.key === " " && !(e.target as HTMLElement).closest?.("button")) {
        e.preventDefault();
        this.core.toggle();
      }
    }) as EventListener);
    b.on(window, "resize", (() => cls(this.root, "is-portrait", innerHeight > innerWidth)) as EventListener);
    cls(this.root, "is-portrait", innerHeight > innerWidth);
  }

  private onDown(e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      // pinch: fit ↔ fill
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.cancelHold();
      this.drag = null;
      return;
    }
    if (this.locked) return;
    this.gesture.setPointerCapture?.(e.pointerId);
    this.drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      kind: "none",
      startTime: this.core.time,
      startVal: 0,
      target: this.core.time
    };
    this.cancelHold();
    this.holdTimer = setTimeout(() => {
      if (!this.drag || this.drag.kind !== "none" || this.core.state !== "playing") return;
      this.holding = true;
      this.holdRate = this.core.rate;
      this.core.setRate(2);
      haptic(15);
      this.showHud("hold");
    }, HOLD_MS);
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (this.pointers.size === 2 && this.pinchStart > 0) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (d / this.pinchStart > 1.18 && !this.fill) this.setFit(true);
      else if (d / this.pinchStart < 0.85 && this.fill) this.setFit(false);
      return;
    }
    const dr = this.drag;
    if (!dr || dr.id !== e.pointerId || this.locked || this.holding) return;
    const dx = e.clientX - dr.x;
    const dy = e.clientY - dr.y;
    const r = this.root.getBoundingClientRect();
    if (dr.kind === "none") {
      if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
      this.cancelHold();
      if (Math.abs(dx) > Math.abs(dy)) {
        if (!(this.core.duration > 0)) return;
        dr.kind = "seek";
      } else {
        dr.kind = this.side(dr.x) === "l" ? "brightness" : "volume";
        dr.startVal = dr.kind === "volume" ? (this.core.muted ? 0 : this.core.volume) : this.brightness;
      }
    }
    if (dr.kind === "seek") {
      // the full width covers 90 s, or the whole video if it is shorter (finer than the track)
      const span = Math.min(this.core.duration, 90);
      dr.target = clamp(dr.startTime + (dx / r.width) * span, 0, this.core.duration);
      this.paintTime(this.core.time, this.core.duration);
      this.showHud("seek", dr.target);
    } else if (dr.kind === "volume") {
      const v = clamp(dr.startVal - dy / (r.height * 0.7), 0, 1);
      this.core.setVolume(v);
      if (v > 0 && this.core.muted) this.core.setMuted(false);
      this.showHud("volume", v);
    } else if (dr.kind === "brightness") {
      this.brightness = clamp(dr.startVal - dy / (r.height * 0.7), 0.2, 1);
      this.dim.style.opacity = String(1 - this.brightness);
      this.showHud("brightness", (this.brightness - 0.2) / 0.8);
    }
  }

  private onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pinchStart && this.pointers.size < 2) {
      this.pinchStart = 0;
      if (this.pointers.size === 0) this.drag = null;
      return;
    }
    const dr = this.drag;
    this.drag = null;
    if (this.holding) {
      this.holding = false;
      this.core.setRate(this.holdRate);
      this.hideHud();
      return;
    }
    this.cancelHold();
    if (this.locked) {
      this.flashUnlock();
      return;
    }
    if (dr && dr.kind === "seek") {
      this.core.seek(dr.target);
      this.hideHud(400);
      return;
    }
    if (dr && dr.kind !== "none") {
      this.hideHud(500);
      return;
    }
    this.onTap(e.clientX);
  }

  private onCancel(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.cancelHold();
    if (this.holding) {
      this.holding = false;
      this.core.setRate(this.holdRate);
    }
    this.drag = null;
    this.hideHud();
  }

  private cancelHold() {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  /** Single tap toggles the controls; double tap on the left/right third seeks ±10 s (accumulating). */
  private onTap(x: number) {
    this.core.userGesture();
    const now = performance.now();
    const side = this.side(x);
    const inBurst = this.tapSeek !== 0 && side === this.lastTapSide && side !== "c";
    if ((now - this.lastTap < DOUBLE_TAP_MS && side === this.lastTapSide && side !== "c") || inBurst) {
      if (this.tapTimer) clearTimeout(this.tapTimer);
      this.tapTimer = null;
      this.lastTap = now;
      this.doubleTapSeek(side === "l" ? -10 : 10);
      return;
    }
    if (now - this.lastTap < DOUBLE_TAP_MS && side === "c" && this.lastTapSide === "c") {
      // double tap in the centre toggles fit/fill
      if (this.tapTimer) clearTimeout(this.tapTimer);
      this.tapTimer = null;
      this.lastTap = 0;
      this.toggleFit();
      return;
    }
    this.lastTap = now;
    this.lastTapSide = side;
    if (this.tapTimer) clearTimeout(this.tapTimer);
    this.tapTimer = setTimeout(() => {
      this.tapTimer = null;
      if (this.visible) this.hide();
      else this.show();
    }, DOUBLE_TAP_MS);
  }

  private doubleTapSeek(by: number) {
    this.tapSeek += by;
    const el = by < 0 ? this.rippleL : this.rippleR;
    const other = by < 0 ? this.rippleR : this.rippleL;
    if (Math.sign(this.tapSeek) !== Math.sign(by)) this.tapSeek = by;
    cls(other, "is-on", false);
    text(el.querySelector(".m-ripple-n")!, t("seconds", { n: Math.abs(this.tapSeek) }));
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
    haptic(8);
    this.core.seekBy(by);
    if (this.tapSeekTimer) clearTimeout(this.tapSeekTimer);
    this.tapSeekTimer = setTimeout(() => {
      this.tapSeek = 0;
      cls(el, "is-on", false);
    }, 700);
  }

  private seekBy(by: number) {
    this.core.seekBy(by);
    const el = by < 0 ? this.rippleL : this.rippleR;
    text(el.querySelector(".m-ripple-n")!, t("seconds", { n: Math.abs(by) }));
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
    setTimeout(() => cls(el, "is-on", false), 600);
  }

  private showHud(kind: "seek" | "volume" | "brightness" | "hold", v = 0) {
    if (this.hudTimer) clearTimeout(this.hudTimer);
    clear(this.hud);
    this.hud.className = `m-hud is-on is-${kind}`;
    if (kind === "seek") {
      this.hud.append(h("strong", null, clock(v)), h("span", null, delta(Math.round(v - this.core.time))));
    } else if (kind === "hold") {
      this.hud.append(icon("ff10"), h("span", null, t("speed2x")));
    } else {
      const bar = h("span", { class: "m-hud-bar" }, h("span", null));
      (bar.firstChild as HTMLElement).style.transform = `scaleY(${v})`;
      this.hud.append(
        icon(kind === "volume" ? (v === 0 ? "mute" : "volume") : "brightness"),
        bar,
        h("small", null, `${Math.round(v * 100)}%`)
      );
      this.hud.setAttribute("aria-label", `${kind === "volume" ? t("volume") : t("brightness")} ${Math.round(v * 100)}%`);
    }
  }
  private hideHud(after = 0) {
    if (this.hudTimer) clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => cls(this.hud, "is-on", false), after);
  }

  private toggleFit() {
    this.setFit(!this.fill);
  }
  private setFit(fill: boolean) {
    this.fill = fill;
    cls(this.root, "is-fill", fill);
    clear(this.fitBtn);
    this.fitBtn.appendChild(icon("fit"));
    this.fitBtn.setAttribute("aria-label", fill ? t("fitScreen") : t("fill"));
    this.views.toast(fill ? t("fill") : t("fitScreen"), 900);
    haptic(8);
  }

  private async toggleFullscreen() {
    if (this.core.isFullscreen) {
      await this.core.exitFullscreen();
      this.core.unlockOrientation();
    } else {
      await this.core.enterFullscreen(this.root);
      await this.core.lockLandscape();
    }
  }

  /* ---------------- sheets ---------------- */

  private openSheet(kind: Exclude<Sheet, null>) {
    this.sheet = kind;
    this.sheetStack = [];
    this.clearHide();
    cls(this.root, "has-sheet", true);
    this.renderSheet(kind);
    this.sheetEl.classList.remove("is-on");
    void this.sheetEl.offsetWidth;
    cls(this.sheetEl, "is-on", true);
    cls(this.sheetBack, "is-on", true);
    requestAnimationFrame(() =>
      this.sheetEl.querySelector<HTMLElement>(".m-row.is-selected, .m-row, .m-card")?.focus({ preventScroll: true })
    );
  }

  /** Drag the grip or title bar down (portrait) or right (landscape side sheet) to dismiss, like native sheets. */
  private bindSheetSwipe() {
    const el = this.sheetEl;
    let start: { x: number; y: number; id: number; t: number } | null = null;
    let offset = 0;
    const portrait = () => this.root.classList.contains("is-portrait");
    el.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".m-grip, .m-sheet-head") || target.closest("button")) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
      offset = 0;
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      offset = Math.max(0, portrait() ? e.clientY - start.y : e.clientX - start.x);
      el.style.transition = "none";
      el.style.transform = portrait() ? `translateY(${offset}px)` : `translateX(${offset}px)`;
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const size = portrait() ? el.offsetHeight : el.offsetWidth;
      const fast = offset > 40 && performance.now() - start.t < 250;
      start = null;
      el.style.transition = "";
      el.style.transform = "";
      if (offset > size * 0.3 || fast) this.closeSheet();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  private openSub(make: () => MenuGroup) {
    this.openSheet("settings");
    this.sub(make);
  }

  closeSheet() {
    if (!this.sheet) return;
    this.sheet = null;
    this.sheetStack = [];
    cls(this.sheetEl, "is-on", false);
    cls(this.sheetBack, "is-on", false);
    cls(this.root, "has-sheet", false);
    this.armHide();
  }

  private sheetBackStep() {
    if (this.sheetStack.length) {
      this.sheetStack.pop();
      const prev = this.sheetStack[this.sheetStack.length - 1];
      if (prev) prev();
      else if (this.sheet) this.renderSheet(this.sheet);
    } else this.closeSheet();
  }

  private rerender() {
    const top = this.sheetStack[this.sheetStack.length - 1];
    const scroll = this.sheetEl.querySelector(".m-sheet-body")?.scrollTop ?? 0;
    if (top) top();
    else if (this.sheet) this.renderSheet(this.sheet);
    const body = this.sheetEl.querySelector(".m-sheet-body");
    if (body) body.scrollTop = scroll;
  }

  private frame(title: string, back: boolean, ...body: (Node | null)[]) {
    clear(this.sheetEl);
    this.sheetEl.setAttribute("aria-label", title);
    const head = h(
      "div",
      { class: "m-sheet-head" },
      back ? this.btn("back", t("back"), () => this.sheetBackStep(), "m-sheet-x") : null,
      h("h2", { class: "m-sheet-title" }, title),
      this.btn("close", t("close"), () => this.closeSheet(), "m-sheet-x")
    );
    this.sheetEl.append(h("div", { class: "m-grip", "aria-hidden": "true" }), head, h("div", { class: "m-sheet-body" }, ...body));
  }

  private renderSheet(kind: Exclude<Sheet, null>) {
    const c = this.core;
    this.sheetEl.className = `m-sheet is-on is-${kind}`;
    if (kind === "quality") {
      const g = qualityGroup(c);
      this.frame(g.title, false, this.list(g), this.reportRow());
    } else if (kind === "audio") {
      const a = audioGroup(c);
      const s = subtitleGroup(c);
      this.frame(
        t("audioSubtitles"),
        false,
        h(
          "div",
          { class: `m-cols${a ? "" : " is-single"}` },
          a ? h("section", null, h("h3", { class: "m-group" }, a.title), this.list(a)) : null,
          h("section", null, h("h3", { class: "m-group" }, s.title), this.list(s))
        ),
        this.reportRow()
      );
    } else if (kind === "episodes") {
      this.frame(t("episodes"), false, this.episodes());
    } else {
      const sel = (g: MenuGroup) => g.options.find((o) => o.selected)?.label ?? "";
      const entries: [string, string, () => void][] = [
        [t("speed"), sel(speedGroup(c)), () => this.sub(() => speedGroup(c))],
        [t("sleepTimer"), sel(sleepGroup(c)) || t("sleepOff"), () => this.sub(() => sleepGroup(c))],
        [t("captionStyle"), "", () => this.subCaptions()],
        [t("skipBehaviour"), sel(skipGroup(c)), () => this.sub(() => skipGroup(c))]
      ];
      if (c.subtitleTrack) entries.splice(3, 0, [t("timing"), sel(timingGroup(c)), () => this.sub(() => timingGroup(c))]);
      this.frame(
        t("settings"),
        false,
        h(
          "div",
          { class: "m-list" },
          ...entries.map(([label, value, open]) => {
            const b = h(
              "button",
              { type: "button", class: "m-row is-nav" },
              h("span", { class: "m-row-text" }, h("span", null, label)),
              value ? h("small", { class: "m-row-value" }, value) : null,
              icon("back", "t-icon m-chev")
            );
            b.addEventListener("click", (e) => (e.stopPropagation(), open()));
            return b;
          })
        )
      );
    }
  }

  private sub(make: () => MenuGroup) {
    const render = () => {
      const g = make();
      this.frame(g.title, true, this.list(g, true));
    };
    this.sheetStack.push(render);
    render();
  }

  private subCaptions() {
    const render = () => {
      const p = this.core.preferences;
      const groups = captionGroups(this.core, (np) => this.captions.style(np));
      const preview = captionPreview(t("captionPreview"));
      preview.querySelector(".t-captions")!.className =
        `t-captions is-preview cap-s-${p.captionSize} cap-c-${p.captionColor} cap-bg-${p.captionBg} cap-e-${p.captionEdge}`;
      this.frame(
        t("captionStyle"),
        true,
        preview,
        ...groups.map((g) =>
          h(
            "section",
            null,
            h("h3", { class: "m-group" }, g.title),
            h(
              "div",
              { class: "m-chips", role: "radiogroup", "aria-label": g.title },
              ...g.options.map((o) => {
                const b = h(
                  "button",
                  { type: "button", role: "radio", "aria-checked": String(o.selected), class: `m-pill${o.selected ? " is-selected" : ""}` },
                  o.label
                );
                b.addEventListener("click", (e) => {
                  e.stopPropagation();
                  g.select(o.id);
                  this.rerender();
                });
                return b;
              })
            )
          )
        )
      );
    };
    this.sheetStack.push(render);
    render();
  }

  private list(g: MenuGroup, back = false) {
    return h(
      "div",
      { class: "m-list", role: "radiogroup", "aria-label": g.title },
      ...g.options.map((o) => {
        const b = h(
          "button",
          { type: "button", role: "radio", "aria-checked": String(o.selected), class: `m-row${o.selected ? " is-selected" : ""}` },
          h(
            "span",
            { class: "m-row-text" },
            h("span", { class: "m-row-label" }, o.label, o.badge ? h("span", { class: "m-badge" }, o.badge) : null),
            o.note ? h("small", null, o.note) : null
          ),
          h("span", { class: "m-check" }, o.selected ? icon("check") : null)
        );
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          g.select(o.id);
          haptic(6);
          if (back) this.sheetBackStep();
          else this.rerender();
        });
        return b;
      })
    );
  }

  private reportRow() {
    const b = h(
      "button",
      { type: "button", class: "m-row m-report" },
      h("span", { class: "m-row-text" }, h("span", { class: "m-row-label" }, icon("alert"), t("reportIssue")))
    );
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      this.sub(() =>
        issueGroup((kind) => {
          this.opts.onReport?.(kind);
          this.closeSheet();
          this.views.toast(t("reportSent"), 3200);
        })
      );
    });
    return b;
  }

  private episodeList(): EpisodeInput[] {
    const m = this.core.current;
    if (!m) return [];
    const list = [...(m.episodes ?? [])];
    if (m.next && !list.some((e) => e.id === m.next!.id)) list.unshift(m.next);
    return list.filter((e) => e.id !== m.id || (m.episodes ?? []).length > 1);
  }

  private episodes() {
    const cur = this.core.current?.id;
    return h(
      "div",
      { class: "m-cards" },
      ...this.episodeList().map((ep) => {
        const media = h("span", { class: "m-card-media" });
        const art = img(ep.thumbnail, "", "t-img");
        if (art) media.appendChild(art);
        else media.appendChild(h("span", { class: "m-card-fallback" }, ep.episode ? t("episodeShort", { n: ep.episode }) : ep.title));
        media.appendChild(h("span", { class: "m-card-play" }, icon("play")));
        if (ep.progress && ep.progress > 0) {
          const bar = h("span", { class: "m-card-progress" }, h("span", null));
          (bar.firstChild as HTMLElement).style.transform = `scaleX(${Math.min(1, ep.progress)})`;
          media.appendChild(bar);
        }
        const se = ep.season && ep.episode ? `S${ep.season} E${ep.episode}` : ep.episode ? t("episodeShort", { n: ep.episode }) : "";
        const meta = [se, ep.duration ? `${Math.round(ep.duration / 60)}m` : ""].filter(Boolean).join(" · ");
        const b = h(
          "button",
          { type: "button", class: `m-card${ep.id === cur ? " is-current" : ""}` },
          media,
          h(
            "span",
            { class: "m-card-text" },
            h("strong", null, ep.title),
            meta ? h("small", null, meta) : null,
            ep.subtitle ? h("span", { class: "m-card-desc" }, ep.subtitle) : null
          )
        );
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeSheet();
          this.core.playEpisode(ep);
        });
        return b;
      })
    );
  }

  destroy() {
    this.bag.dispose();
    this.views.destroy();
    this.clearHide();
    for (const tm of [this.hudTimer, this.tapTimer, this.tapSeekTimer, this.holdTimer]) if (tm) clearTimeout(tm);
    clear(this.root);
  }
}

function haptic(ms: number) {
  try {
    (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export function mountMobile(root: HTMLElement, core: TitanCore, opts?: MobileOptions) {
  return new MobilePlayer(root, core, opts);
}
