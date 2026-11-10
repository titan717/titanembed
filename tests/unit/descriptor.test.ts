import { describe, expect, it, beforeEach } from "vitest";
import {
  validateDescriptor,
  safeUrl,
  cleanText,
  encodeDescriptor,
  decodeDescriptor,
  descriptorFromParams,
  validateMarkers,
  validateTheme,
  setPageOrigin,
  LIMITS
} from "@titan/core";

beforeEach(() => setPageOrigin("https://embed.example"));

describe("safeUrl", () => {
  it("keeps https and same-origin paths", () => {
    expect(safeUrl("https://cdn.example/a.m3u8")).toBe("https://cdn.example/a.m3u8");
    expect(safeUrl("/media/test/master.m3u8")).toBe("https://embed.example/media/test/master.m3u8");
  });
  it("rejects dangerous or foreign schemes", () => {
    for (const u of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>1</script>",
      "http://evil.example/a.mp4",
      "file:///etc/passwd",
      "vbscript:x",
      " java\tscript:alert(1)"
    ]) {
      expect(safeUrl(u), u).toBeUndefined();
    }
  });
  it("rejects over-long and control-character URLs", () => {
    expect(safeUrl("https://a.example/" + "x".repeat(LIMITS.url))).toBeUndefined();
    expect(safeUrl("https://a.example/\u0000a")).toBeUndefined();
  });
});

describe("cleanText", () => {
  it("collapses whitespace and strips control characters", () => {
    expect(cleanText("  Hello\n\tworld\u0007 ")).toBe("Hello world");
  });
  it("caps length", () => {
    expect(cleanText("a".repeat(1000))!.length).toBeLessThanOrEqual(LIMITS.text);
  });
});

describe("validateDescriptor", () => {
  it("accepts a minimal descriptor", () => {
    const r = validateDescriptor({ title: "Clip", sources: [{ url: "https://a.example/v.mp4" }] });
    expect(r.ok).toBe(true);
    expect(r.value!.sources[0]!.type).toBe("mp4");
  });
  it("infers hls and webm", () => {
    const r = validateDescriptor({ title: "x", sources: [{ url: "https://a.example/m.m3u8" }, { url: "https://a.example/v.webm" }] });
    expect(r.value!.sources.map((s) => s.type)).toEqual(["hls", "webm"]);
  });
  it("fails without a playable source", () => {
    expect(validateDescriptor({ title: "x", sources: [{ url: "javascript:alert(1)" }] }).ok).toBe(false);
    expect(validateDescriptor(null).ok).toBe(false);
    expect(validateDescriptor("str").ok).toBe(false);
  });
  it("keeps titles as text (no HTML interpretation happens later)", () => {
    const r = validateDescriptor({ title: "<img src=x onerror=alert(1)>", sources: [{ url: "https://a.example/v.mp4" }] });
    expect(r.value!.title).toBe("<img src=x onerror=alert(1)>");
  });
  it("drops unsafe artwork and subtitle URLs", () => {
    const r = validateDescriptor({
      title: "x",
      poster: "javascript:alert(1)",
      sources: [{ url: "https://a.example/v.mp4" }],
      subtitles: [{ url: "data:text/vtt,WEBVTT", lang: "en", label: "English" }]
    });
    expect(r.value!.poster).toBeUndefined();
    expect(r.value!.subtitles).toBeUndefined();
  });
  it("caps list sizes", () => {
    const sources = Array.from({ length: 50 }, (_, i) => ({ url: `https://a.example/${i}.mp4` }));
    expect(validateDescriptor({ title: "x", sources }).value!.sources.length).toBe(LIMITS.sources);
  });
  it("ignores prototype pollution keys", () => {
    const evil = JSON.parse('{"title":"x","sources":[{"url":"https://a.example/v.mp4"}],"__proto__":{"polluted":true}}');
    validateDescriptor(evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("markers and theme", () => {
  it("validates markers", () => {
    expect(
      validateMarkers([
        { type: "intro", start: 5, end: 60 },
        { type: "bogus", start: 1, end: 2 },
        { type: "credits", start: 10, end: 5 }
      ])
    ).toEqual([{ type: "intro", start: 5, end: 60 }]);
    expect(validateMarkers("nope")).toEqual([]);
  });
  it("validates theme values", () => {
    expect(validateTheme({ accent: "#E07BD8", radius: 12, font: "serif", controlsOpacity: 0.5 })).toEqual({
      accent: "#e07bd8",
      radius: 12,
      font: "serif",
      controlsOpacity: 0.5
    });
    expect(validateTheme({ accent: "red; background:url(x)", radius: 999, font: "comic" })).toBeUndefined();
  });
});

describe("URL forms", () => {
  it("round-trips the encoded descriptor (unicode safe)", () => {
    const d = { title: "Español — 日本語", sources: [{ url: "https://a.example/v.mp4" }] };
    expect(decodeDescriptor(encodeDescriptor(d))).toEqual(d);
  });
  it("rejects malformed or oversized m=", () => {
    expect(decodeDescriptor("%%%")).toBeUndefined();
    expect(decodeDescriptor("a".repeat(LIMITS.encoded + 1))).toBeUndefined();
  });
  it("builds a descriptor from short params", () => {
    const p = new URLSearchParams("src=https://a.example/m.m3u8&title=Hi&t=30&intro=5-62&sub=https://a.example/en.vtt|en|English");
    const r = validateDescriptor(descriptorFromParams(p));
    expect(r.value).toMatchObject({
      title: "Hi",
      start: 30,
      markers: [{ type: "intro", start: 5, end: 62 }],
      subtitles: [{ lang: "en", label: "English" }]
    });
  });
});
