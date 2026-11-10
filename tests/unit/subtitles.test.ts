import { describe, expect, it } from "vitest";
import { parseSubtitles, activeCues, parseThumbnails, cueText, timestamp, SUB_LIMITS } from "@titan/core";

describe("timestamp", () => {
  it("parses VTT and SRT times", () => {
    expect(timestamp("00:01:02.500")).toBe(62.5);
    expect(timestamp("01:02.250")).toBe(62.25);
    expect(timestamp("00:00:01,000")).toBe(1);
    expect(timestamp("nope")).toBeNull();
  });
});

describe("parseSubtitles", () => {
  it("parses WebVTT with settings and styling spans", () => {
    const cues = parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:03.000 line:10%\n<b>Bold</b> and <i>it</i>\nsecond line\n");
    expect(cues).toHaveLength(1);
    expect(cues[0]!.start).toBe(1);
    expect(cues[0]!.lines[0]).toEqual([{ text: "Bold", b: true }, { text: " and " }, { text: "it", i: true }]);
    expect(cueText(cues[0]!)).toBe("Bold and it\nsecond line");
  });
  it("parses SRT", () => {
    const cues = parseSubtitles("1\r\n00:00:01,000 --> 00:00:02,000\r\nHola\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nAdiós\r\n");
    expect(cues.map(cueText)).toEqual(["Hola", "Adiós"]);
  });
  it("treats markup as text, never as HTML", () => {
    const cues = parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<script>alert(1)</script><img src=x onerror=alert(1)>\n");
    const text = cueText(cues[0]!);
    expect(text).not.toContain("<script");
    expect(text).not.toContain("<img");
  });
  it("decodes entities", () => {
    const cues = parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAudio &amp; Subtitles &lt;3\n");
    expect(cueText(cues[0]!)).toBe("Audio & Subtitles <3");
  });
  it("skips NOTE and STYLE blocks and bad timings", () => {
    const cues = parseSubtitles(
      "WEBVTT\n\nNOTE hi\n\nSTYLE\n::cue { color: red }\n\n00:00:05.000 --> 00:00:01.000\nbackwards\n\n00:00:01.000 --> 00:00:02.000\nok\n"
    );
    expect(cues.map(cueText)).toEqual(["ok"]);
  });
  it("caps hostile input", () => {
    const big =
      "WEBVTT\n\n" +
      Array.from(
        { length: SUB_LIMITS.cues + 50 },
        (_, i) => `00:00:${String(i % 60).padStart(2, "0")}.000 --> 00:00:${String(i % 60).padStart(2, "0")}.500\nx`
      ).join("\n\n");
    expect(parseSubtitles(big).length).toBeLessThanOrEqual(SUB_LIMITS.cues);
    const longLine = parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n" + "a".repeat(5000));
    expect(cueText(longLine[0]!).length).toBeLessThanOrEqual(SUB_LIMITS.lineChars);
  });
  it("finds active cues", () => {
    const cues = parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\na\n\n00:00:02.000 --> 00:00:04.000\nb\n");
    expect(activeCues(cues, 2.5).map(cueText)).toEqual(["a", "b"]);
    expect(activeCues(cues, 5)).toEqual([]);
  });
});

describe("parseThumbnails", () => {
  it("resolves sprite fragments relative to the VTT", () => {
    const t = parseThumbnails(
      "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nthumbs.jpg#xywh=160,0,160,90\n",
      "https://a.example/media/thumbs.vtt"
    );
    expect(t[0]).toMatchObject({ start: 0, end: 2, url: "https://a.example/media/thumbs.jpg", xywh: [160, 0, 160, 90] });
  });
  it("drops unsafe image URLs", () => {
    expect(parseThumbnails("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\njavascript:alert(1)\n", "https://a.example/t.vtt")).toEqual([]);
  });
});
