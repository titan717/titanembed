import "@fontsource-variable/inter/wght.css";
import "./demo.css";
import { createPlayer, VERSION, type MediaDescriptor, type PlayerClass, type SourceSpec, type TitanPlayer } from "@titan/sdk";
import { mark } from "@titan/ui-common/icons";

const $ = (id: string) => document.getElementById(id)!;
const base = location.origin;
// Local test runs can point the embed at the loopback mock provider (tests/e2e/fixtures); never on a public host.
const embedUrl = (() => {
  const q = new URLSearchParams(location.search);
  const u = new URL(`${base}/embed/`);
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && q.get("mock")) {
    u.searchParams.set("mock", q.get("mock")!);
    if (q.get("mockcfg")) u.searchParams.set("mockcfg", q.get("mockcfg")!);
  }
  return u.toString();
})();
// with the loopback mock, play only the mock sources so local runs never reach a real provider
const mockIds = new URL(embedUrl).searchParams.has("mock")
  ? (new URL(embedUrl).searchParams.get("mockcfg") ?? "mock").split(",").map((c) => c.split(".")[0]!)
  : null;

const MEDIA: { id: string; label: string; media: MediaDescriptor }[] = [
  {
    id: "test",
    label: "Test clip",
    media: {
      id: "titan-test-clip",
      title: "Titan Embed test clip",
      subtitle: "Two audio languages · captions · intro and credits markers",
      rating: "All ages",
      genres: "Test pattern",
      poster: `${base}/media/test/poster.jpg`,
      thumbnails: `${base}/media/test/thumbs.vtt`,
      sources: [
        { url: `${base}/media/test/master.m3u8`, type: "hls" },
        { url: `${base}/media/test/clip-360p.mp4`, type: "mp4", label: "360p" }
      ],
      subtitles: [
        { url: `${base}/media/test/en.vtt`, lang: "en", label: "English", default: true },
        { url: `${base}/media/test/es.srt`, lang: "es", label: "Español" }
      ],
      markers: [
        { type: "intro", start: 4, end: 14 },
        { type: "credits", start: 50, end: 60 }
      ],
      next: {
        id: "bbb",
        title: "Big Buck Bunny",
        subtitle: "Blender Foundation",
        sources: [{ url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", type: "hls" }]
      }
    }
  },
  {
    id: "bbb",
    label: "Big Buck Bunny",
    media: {
      id: "big-buck-bunny",
      title: "Big Buck Bunny",
      subtitle: "Blender Foundation · 2008",
      rating: "All ages",
      genres: "Animation · Comedy",
      sources: [{ url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", type: "hls" }],
      markers: [
        { type: "intro", start: 0, end: 23 },
        { type: "credits", start: 490, end: 596 }
      ]
    }
  },
  {
    id: "tos",
    label: "Tears of Steel",
    media: {
      id: "tears-of-steel",
      title: "Tears of Steel",
      subtitle: "Blender Foundation · 2012",
      rating: "12+",
      advisory: "Mild science-fiction violence",
      genres: "Science fiction",
      sources: [
        { url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8", type: "hls" }
      ],
      markers: [{ type: "credits", start: 650, end: 734 }]
    }
  }
];

const DEVICES: { id: string; label: string; player: PlayerClass; w: number; h: number }[] = [
  { id: "tv", label: "TV", player: "tv", w: 16, h: 9 },
  { id: "phone", label: "Phone", player: "mobile", w: 19.5, h: 9 },
  { id: "portrait", label: "Phone portrait", player: "mobile", w: 9, h: 19.5 },
  { id: "tablet", label: "Tablet", player: "mobile", w: 4, h: 3 }
];
const ACCENTS = [
  { id: "default", label: "Default", value: undefined },
  { id: "violet", label: "Violet", value: "#a78bfa" },
  { id: "amber", label: "Amber", value: "#f5b041" },
  { id: "green", label: "Green", value: "#34d399" }
];

const params = new URLSearchParams(location.search);
const state = {
  device: DEVICES.find((d) => d.id === params.get("device"))?.id ?? "tv",
  media: MEDIA.find((m) => m.id === params.get("media"))?.id ?? "test",
  accent: "default",
  tab: "iframe" as "iframe" | "sdk" | "react",
  // a catalogue title played through the source registry, or null for the sample videos
  source: readSource(params)
};

function readSource(q: URLSearchParams): (Required<Pick<SourceSpec, "tmdb" | "type">> & { season?: number; episode?: number }) | null {
  const id = q.get("tmdb") ?? "";
  if (!/^\d{1,9}$/.test(id)) return null;
  const type = q.get("type") === "tv" ? "tv" : "movie";
  const n = (v: string | null, max: number) => (v && /^\d{1,4}$/.test(v) && Number(v) <= max ? Number(v) : 1);
  return type === "tv" ? { tmdb: id, type, season: n(q.get("s"), 999), episode: n(q.get("e"), 9999) } : { tmdb: id, type };
}

$("brand-mark").appendChild(mark("brand-svg"));
$("ver").textContent = `v${VERSION}`;

function seg<T extends { id: string; label: string }>(el: HTMLElement, items: T[], current: () => string, pick: (id: string) => void) {
  const render = () => {
    el.replaceChildren(
      ...items.map((it) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = it.label;
        b.setAttribute("aria-pressed", String(current() === it.id));
        b.addEventListener("click", () => {
          pick(it.id);
          render();
        });
        return b;
      })
    );
  };
  render();
}

let player: TitanPlayer | null = null;
const log = $("log");
const LOG_SKIP = new Set(["timeupdate", "progress"]);
let lastTime = 0;

function addLog(event: string, data: unknown) {
  const li = document.createElement("li");
  const name = document.createElement("span");
  name.className = "ev";
  name.textContent = event;
  const body = document.createElement("span");
  body.className = "data";
  body.textContent = data === undefined ? "" : JSON.stringify(data).slice(0, 140);
  li.append(name, body);
  log.prepend(li);
  while (log.childElementCount > 40) log.lastElementChild?.remove();
}

function current() {
  const device = DEVICES.find((d) => d.id === state.device)!;
  const media = MEDIA.find((m) => m.id === state.media)!.media;
  const accent = ACCENTS.find((a) => a.id === state.accent)!.value;
  return { device, media, accent };
}

function mount() {
  player?.destroy();
  log.replaceChildren();
  const { device, media, accent } = current();
  const frame = $("frame");
  frame.style.aspectRatio = `${device.w} / ${device.h}`;
  frame.dataset.device = device.id;
  const src = state.source;
  const label = src ? `TMDB ${src.tmdb}${src.type === "tv" ? ` S${src.season} E${src.episode}` : ""}` : media.title;
  player = createPlayer(frame, {
    embedUrl,
    ...(src ? { source: src, ...(mockIds ? { sources: mockIds } : { preferredSource: "embedmaster" }) } : { media }),
    player: device.player,
    theme: accent ? { accent } : undefined,
    title: `${label} — Titan Embed ${device.label} player`
  });
  let sourceName = "";
  player.on("sourcechange", (d) => {
    sourceName = d.name;
    $("tmdb-msg").textContent = src ? `Loading from ${d.name}…` : "";
  });
  player.on("play", () => {
    if (src && sourceName) $("tmdb-msg").textContent = `Playing from ${sourceName}.`;
  });
  player.on("sourcefail", (d) => {
    $("tmdb-msg").textContent = d.next ? `${d.id} failed, trying ${d.next}…` : `No source could play ${label}. Try another ID.`;
  });
  player.on("*", (e) => {
    const { event, data } = e as unknown as { event: string; data: unknown };
    if (event === "timeupdate") lastTime = (data as { time: number }).time;
    if (!LOG_SKIP.has(event)) addLog(event, data);
  });
  $("hint").textContent =
    device.player === "tv"
      ? "Click the player, then use the arrow keys, Enter and Backspace (Back). Media keys work too."
      : "Tap to show controls, double-tap the sides to skip 10 s, swipe to seek. Touch emulation in DevTools gives the full gesture set.";
  renderCode();
}

seg(
  $("device"),
  DEVICES,
  () => state.device,
  (id) => ((state.device = id), mount())
);
seg(
  $("media"),
  MEDIA,
  () => state.media,
  (id) => {
    state.media = id;
    if (state.source) {
      // leave catalogue mode: a media frame is sandboxed again, so it needs a new iframe
      state.source = null;
      $("tmdb-msg").textContent = "";
      syncUrl();
      mount();
      return;
    }
    void player?.load(current().media).catch((err: Error) => addLog("error", err.message));
    renderCode();
  }
);

/* ---------- play by TMDB ID ---------- */

const form = $("tmdb-form") as HTMLFormElement;
const idInput = $("tmdb-id") as HTMLInputElement;
const typeSel = $("tmdb-type") as HTMLSelectElement;
const sInput = $("tmdb-s") as HTMLInputElement;
const eInput = $("tmdb-e") as HTMLInputElement;
const syncType = () => {
  const tv = typeSel.value === "tv";
  $("tmdb-s-wrap").hidden = !tv;
  $("tmdb-e-wrap").hidden = !tv;
};
if (state.source) {
  idInput.value = String(state.source.tmdb);
  typeSel.value = state.source.type;
  if (state.source.season) sInput.value = String(state.source.season);
  if (state.source.episode) eInput.value = String(state.source.episode);
  for (const b of $("media").querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
}
syncType();
typeSel.addEventListener("change", syncType);
idInput.addEventListener("input", () => idInput.removeAttribute("aria-invalid"));
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = new URLSearchParams({ tmdb: idInput.value.trim(), type: typeSel.value, s: sInput.value, e: eInput.value });
  const next = readSource(q);
  if (!next) {
    idInput.setAttribute("aria-invalid", "true");
    $("tmdb-msg").textContent = "Enter a TMDB ID: digits only, for example 550.";
    idInput.focus();
    return;
  }
  state.source = next;
  $("tmdb-msg").textContent = "Finding a source…";
  syncUrl();
  // the media seg no longer reflects what plays
  for (const b of $("media").querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
  mount();
});

function syncUrl() {
  const u = new URL(location.href);
  for (const k of ["tmdb", "type", "s", "e"]) u.searchParams.delete(k);
  const src = state.source;
  if (src) {
    u.searchParams.set("tmdb", String(src.tmdb));
    if (src.type === "tv") {
      u.searchParams.set("type", "tv");
      u.searchParams.set("s", String(src.season));
      u.searchParams.set("e", String(src.episode));
    }
  }
  history.replaceState(null, "", u);
}
seg(
  $("accent"),
  ACCENTS,
  () => state.accent,
  (id) => {
    state.accent = id;
    const a = current().accent;
    void player?.setTheme(a ? { accent: a } : {}).catch((err: Error) => addLog("error", err.message));
    renderCode();
  }
);

const CMDS: { label: string; run: (p: TitanPlayer) => Promise<unknown> }[] = [
  { label: "Play", run: (p) => p.play() },
  { label: "Pause", run: (p) => p.pause() },
  { label: "−10 s", run: (p) => p.seek(Math.max(0, lastTime - 10)) },
  { label: "+30 s", run: (p) => p.seek(lastTime + 30) },
  { label: "Mute", run: (p) => p.setMuted(true) },
  { label: "Unmute", run: (p) => p.setMuted(false) },
  { label: "1.5×", run: (p) => p.setRate(1.5) },
  { label: "1×", run: (p) => p.setRate(1) },
  { label: "Get tracks", run: (p) => p.getTracks().then((t) => addLog("getTracks →", t)) },
  { label: "Get qualities", run: (p) => p.getQualities().then((q) => addLog("getQualities →", q)) },
  { label: "Get sources", run: (p) => p.getSources().then((s) => addLog("getSources →", s)) }
];
$("cmds").replaceChildren(
  ...CMDS.map((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.label;
    b.addEventListener("click", () => {
      if (player) void c.run(player).catch((err: Error) => addLog("error", err.message));
    });
    return b;
  })
);

const TABS = [
  { id: "iframe", label: "iframe" },
  { id: "sdk", label: "SDK" },
  { id: "react", label: "React" }
] as const;
seg(
  $("code-tabs"),
  [...TABS],
  () => state.tab,
  (id) => ((state.tab = id as typeof state.tab), renderCode())
);

function renderCode() {
  const { device, media, accent } = current();
  const src = state.source;
  const mediaSrc = media.sources[0]!.url;
  const tv = src?.type === "tv";
  let code = "";
  if (state.tab === "iframe") {
    const url = new URL(`${base}/embed/`);
    if (src) {
      url.searchParams.set("tmdb", String(src.tmdb));
      if (tv) {
        url.searchParams.set("type", "tv");
        url.searchParams.set("s", String(src.season));
        url.searchParams.set("e", String(src.episode));
      }
    } else {
      url.searchParams.set("src", mediaSrc);
      url.searchParams.set("title", media.title);
    }
    url.searchParams.set("player", device.player);
    if (accent) url.searchParams.set("accent", accent.slice(1));
    // catalogue providers refuse a sandbox (inherited by nested frames); Titan keeps the provider inert instead
    const sandbox = src ? "" : `\n  sandbox="allow-scripts allow-same-origin"`;
    const title = src ? `TMDB ${src.tmdb}` : media.title;
    code = `<iframe\n  src="${url.toString().replace(/&/g, "&amp;")}"\n  title="${title}"${sandbox}\n  allow="autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock"\n  allowfullscreen\n  style="width:100%;aspect-ratio:16/9;border:0"\n></iframe>`;
    if (src) code = `<!-- no sandbox attribute: sources such as EmbedMaster refuse to play in one -->\n${code}`;
  } else if (state.tab === "sdk") {
    const what = src
      ? `  source: { tmdb: ${JSON.stringify(String(src.tmdb))}${tv ? `, type: "tv", season: ${src.season}, episode: ${src.episode}` : ""} },\n  preferredSource: "embedmaster"`
      : `  media: {\n    title: ${JSON.stringify(media.title)},\n    sources: [{ url: ${JSON.stringify(mediaSrc)} }]\n  }`;
    const after = src
      ? `player.on("sourcechange", ({ name }) => console.log("playing from", name));`
      : `player.on("ended", () => player.next());`;
    code = `import { createPlayer } from "titan-embed";\n\nconst player = createPlayer("#player", {\n  player: "${device.player}",${accent ? `\n  theme: { accent: "${accent}" },` : ""}\n${what}\n});\n\n${after}`;
  } else {
    const what = src
      ? `source={{ tmdb: ${JSON.stringify(String(src.tmdb))}${tv ? `, type: "tv", season: ${src.season}, episode: ${src.episode}` : ""} }}\n      preferredSource="embedmaster"`
      : `media={{ title: ${JSON.stringify(media.title)}, sources: [{ url: ${JSON.stringify(mediaSrc)} }] }}`;
    code = `import { TitanEmbed } from "titan-embed/react";\n\nexport function Watch() {\n  return (\n    <TitanEmbed\n      player="${device.player}"${accent ? `\n      theme={{ accent: "${accent}" }}` : ""}\n      ${what}\n      onEnded={() => console.log("done")}\n    />\n  );\n}`;
  }
  $("code").textContent = code;
}

$("copy").addEventListener("click", () => {
  const btn = $("copy");
  void navigator.clipboard.writeText($("code").textContent ?? "").then(
    () => {
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    },
    () => {
      btn.textContent = "Select and copy";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    }
  );
});

mount();
