import { describe, expect, it } from "vitest";
import { parseCommand, parseOrigins, RateLimiter, COMMANDS, EVENTS, protocolSchema, NS, PROTOCOL_VERSION } from "@titan/core";

const cmd = (c: string, args?: unknown, extra: Record<string, unknown> = {}) => ({
  ns: NS,
  v: PROTOCOL_VERSION,
  type: "command",
  id: "1",
  cmd: c,
  args,
  ...extra
});

describe("parseCommand", () => {
  it("accepts every documented command with valid args", () => {
    const valid: Record<string, unknown> = {
      seek: 10,
      setVolume: 0.5,
      setMuted: true,
      setRate: 1.5,
      setAudioTrack: "0",
      setSubtitleTrack: null,
      setQuality: "auto",
      load: { media: {} },
      setTheme: {},
      setMarkers: { markers: [] },
      loadSource: { tmdb: "550" },
      setSource: "embedmaster"
    };
    for (const name of Object.keys(COMMANDS)) {
      const r = parseCommand(cmd(name, valid[name]));
      expect(typeof r, name).toBe("object");
    }
  });
  it("rejects foreign, versioned and unknown messages", () => {
    expect(parseCommand({ cmd: "play" })).toBeTypeOf("string");
    expect(parseCommand(cmd("play", undefined, { v: 2 }))).toMatch(/version/);
    expect(parseCommand(cmd("eval"))).toMatch(/unknown/);
    expect(parseCommand(cmd("constructor"))).toMatch(/unknown/);
    expect(parseCommand(cmd("__proto__"))).toMatch(/unknown/);
  });
  it("validates argument ranges and types", () => {
    expect(parseCommand(cmd("seek", -1))).toBeTypeOf("string");
    expect(parseCommand(cmd("seek", Infinity))).toBeTypeOf("string");
    expect(parseCommand(cmd("setVolume", 2))).toBeTypeOf("string");
    expect(parseCommand(cmd("setMuted", "yes"))).toBeTypeOf("string");
    expect(parseCommand(cmd("load", "https://x"))).toBeTypeOf("string");
    expect(parseCommand(cmd("loadSource", "550"))).toBeTypeOf("string");
    expect(parseCommand(cmd("setSource", 5))).toBeTypeOf("string");
    expect(parseCommand(cmd("setQuality", "x".repeat(100)))).toBeTypeOf("string");
    expect(parseCommand(cmd("play", undefined, { id: "x".repeat(65) }))).toBe("bad id");
  });
  it("rejects oversized payloads", () => {
    expect(parseCommand(cmd("load", { media: { title: "x".repeat(300 * 1024) } }))).toMatch(/too large/);
  });
});

describe("parseOrigins", () => {
  it("normalises https origins and allows http only for localhost", () => {
    expect(
      parseOrigins("https://a.example/path, https://b.example:8443,http://evil.example,http://localhost:5173,*,javascript:alert(1)")
    ).toEqual(["https://a.example", "https://b.example:8443", "http://localhost:5173"]);
    expect(parseOrigins(null)).toEqual([]);
  });
});

describe("RateLimiter", () => {
  it("allows bursts then throttles", () => {
    let now = 0;
    const rl = new RateLimiter(10, 5, () => now);
    const results = Array.from({ length: 8 }, () => rl.take());
    expect(results.filter(Boolean)).toHaveLength(5);
    now += 1000;
    expect(rl.take()).toBe(true);
  });
});

describe("schema", () => {
  it("lists every command and event", () => {
    const s = protocolSchema() as { commands: Record<string, unknown>; events: unknown };
    expect(Object.keys(s.commands)).toEqual(Object.keys(COMMANDS));
    expect(JSON.stringify(s.events)).toContain("playerclass");
    expect(EVENTS).toContain("error");
  });
});
