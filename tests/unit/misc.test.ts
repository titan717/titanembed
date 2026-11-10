import { describe, expect, it } from "vitest";
import {
  clock,
  hms,
  delta,
  normalizeKey,
  isMediaKey,
  seekStep,
  detectPlayerClass,
  deviceKind,
  resolveTheme,
  contrast,
  StateMachine,
  type DeviceHints
} from "@titan/core";

describe("format", () => {
  it("formats clocks", () => {
    expect(clock(83)).toBe("1:23");
    expect(clock(3723)).toBe("1:02:03");
    expect(clock(NaN)).toBe("0:00");
    expect(hms(6280)).toBe("01:44:40");
    expect(delta(-90)).toBe("\u22121:30");
    expect(delta(30)).toBe("+0:30");
  });
});

const k = (key: string, keyCode = 0) => normalizeKey({ key, keyCode, target: null, ctrlKey: false, metaKey: false, altKey: false });

describe("keys", () => {
  it("maps remotes across platforms", () => {
    expect(k("ArrowLeft")).toBe("left");
    expect(k("Unidentified", 461)).toBe("back"); // webOS
    expect(k("XF86Back")).toBe("back");
    expect(k("Unidentified", 10009)).toBe("back"); // Tizen
    expect(k("MediaPlayPause")).toBe("playpause");
    expect(k("Unidentified", 415)).toBe("play");
    expect(k("Enter")).toBe("enter");
    expect(k(" ")).toBe("space");
  });
  it("separates media keys", () => {
    expect(isMediaKey("playpause")).toBe(true);
    expect(isMediaKey("left")).toBe(false);
  });
  it("accumulates seek steps", () => {
    expect([0, 3, 4, 9, 10, 17, 18, 40].map(seekStep)).toEqual([10, 10, 20, 20, 30, 30, 60, 60]);
  });
});

const hints = (p: Partial<DeviceHints>): DeviceHints => ({
  ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140",
  width: 1280,
  height: 720,
  coarse: false,
  fine: true,
  hover: true,
  touchPoints: 0,
  ...p
});

describe("device detection", () => {
  it("honours overrides", () => {
    expect(detectPlayerClass("mobile", hints({}))).toBe("mobile");
    expect(detectPlayerClass("tv", hints({ ua: "iPhone", coarse: true, fine: false }))).toBe("tv");
  });
  it("detects TV platforms", () => {
    for (const ua of [
      "Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit Chrome",
      "Mozilla/5.0 (Web0S; Linux/SmartTV)",
      "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)",
      "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233)"
    ]) {
      expect(detectPlayerClass(null, hints({ ua })), ua).toBe("tv");
    }
  });
  it("detects phones and tablets", () => {
    expect(
      deviceKind(
        hints({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", width: 390, height: 844, coarse: true, fine: false, touchPoints: 5 })
      )
    ).toBe("phone");
    expect(
      deviceKind(
        hints({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", width: 820, height: 1180, coarse: true, fine: false, touchPoints: 5 })
      )
    ).toBe("tablet");
    expect(
      detectPlayerClass(null, hints({ ua: "Android Mobile", width: 844, height: 390, coarse: true, fine: false, touchPoints: 5 }))
    ).toBe("mobile");
  });
  it("uses frame size on desktop", () => {
    expect(detectPlayerClass(null, hints({ width: 1280, height: 720 }))).toBe("tv");
    expect(detectPlayerClass(null, hints({ width: 640, height: 360 }))).toBe("mobile");
    expect(detectPlayerClass(null, hints({ width: 1000, height: 1200 }))).toBe("mobile");
  });
});

describe("theme", () => {
  it("rejects low-contrast accents", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
    const t = resolveTheme({ accent: "#111111" }, "tv");
    expect(t.accent).toBe("#ffffff");
    expect(t.warnings).toHaveLength(1);
    expect(resolveTheme({ accent: "#e07bd8" }, "mobile").accent).toBe("#e07bd8");
  });
});

describe("state machine", () => {
  it("allows only listed transitions", () => {
    const seen: string[] = [];
    const sm = new StateMachine((n) => seen.push(n));
    expect(sm.to("playing")).toBe(false);
    expect(sm.to("loading")).toBe(true);
    expect(sm.to("ready")).toBe(true);
    expect(sm.to("playing")).toBe(true);
    expect(sm.to("playing")).toBe(false);
    sm.reset("idle");
    expect(seen).toEqual(["loading", "ready", "playing", "idle"]);
  });
});
