import type { TitanCore } from "@titan/core";
import type { Prefs } from "@titan/core/storage";
import { t } from "./i18n";

export interface MenuOption {
  id: string;
  label: string;
  note?: string;
  badge?: string;
  selected: boolean;
}
export interface MenuGroup {
  id: string;
  title: string;
  options: MenuOption[];
  select: (id: string) => void;
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const SLEEP = ["off", "15", "30", "45", "60", "episode"] as const;
export const ISSUES = ["video", "audio", "subtitles", "quality"] as const;

/** Menus built from live core state. Both players render the same groups (one list per group). */
export function qualityGroup(core: TitanCore): MenuGroup {
  const active = core.quality;
  return {
    id: "quality",
    title: t("quality"),
    options: core.qualities.map((q) => ({
      id: q.id,
      label: q.id === "auto" ? t("qualityAuto") : q.id === "data-saver" ? t("dataSaver") : q.label,
      note: q.note,
      selected: q.id === active
    })),
    select: (id) => core.setQuality(id)
  };
}

export function audioGroup(core: TitanCore): MenuGroup | null {
  const list = core.audioTracks;
  if (!list.length) return null;
  return {
    id: "audio",
    title: t("audio"),
    options: list.map((a) => ({
      id: a.id,
      label: a.label + (a.original ? ` (${t("original")})` : ""),
      badge: a.channels,
      selected: a.id === core.audioTrack
    })),
    select: (id) => core.setAudioTrack(id)
  };
}

export function subtitleGroup(core: TitanCore): MenuGroup {
  const list = core.subtitleTracks;
  return {
    id: "subtitles",
    title: t("subtitles"),
    options: [
      { id: "off", label: t("off"), selected: core.subtitleTrack === null },
      ...list.map((s) => ({ id: s.id, label: s.label, badge: s.sdh ? "CC" : undefined, selected: s.id === core.subtitleTrack }))
    ],
    select: (id) => void core.setSubtitleTrack(id === "off" ? null : id)
  };
}

export function speedGroup(core: TitanCore): MenuGroup {
  return {
    id: "speed",
    title: t("speed"),
    options: SPEEDS.map((s) => ({ id: String(s), label: s === 1 ? t("normal") : `${s}×`, selected: Math.abs(core.rate - s) < 0.01 })),
    select: (id) => core.setRate(Number(id))
  };
}

export function sleepGroup(core: TitanCore): MenuGroup {
  const st = core.sleepTimer;
  const minutes = st.at ? Math.max(1, Math.round((st.at - Date.now()) / 60000)) : 0;
  const cur = st.episode ? "episode" : st.at ? "custom" : "off";
  return {
    id: "sleep",
    title: t("sleepTimer"),
    options: SLEEP.map((s) => ({
      id: s,
      label: s === "off" ? t("sleepOff") : s === "episode" ? t("sleepEpisode") : t("sleepMinutes", { n: s }),
      note: cur === "custom" && s === "off" ? t("sleepSet", { v: t("sleepMinutes", { n: minutes }) }) : undefined,
      selected: s === cur
    })),
    select: (id) => core.setSleepTimer(id === "off" ? null : id === "episode" ? "episode" : Number(id))
  };
}

export function skipGroup(core: TitanCore): MenuGroup {
  const auto = core.preferences.autoSkip;
  return {
    id: "skip",
    title: t("skipBehaviour"),
    options: [
      { id: "ask", label: t("skipAsk"), selected: !auto },
      { id: "auto", label: t("skipAuto"), selected: auto }
    ],
    select: (id) => core.setPreferences({ autoSkip: id === "auto" })
  };
}

type CapKey = "captionSize" | "captionColor" | "captionBg" | "captionEdge";
const CAP: Record<CapKey, { title: Parameters<typeof t>[0]; values: [string, Parameters<typeof t>[0]][] }> = {
  captionSize: {
    title: "captionSize",
    values: [
      ["s", "sizeS"],
      ["m", "sizeM"],
      ["l", "sizeL"],
      ["xl", "sizeXL"]
    ]
  },
  captionColor: {
    title: "captionColor",
    values: [
      ["white", "colorWhite"],
      ["yellow", "colorYellow"],
      ["cyan", "colorCyan"],
      ["green", "colorGreen"]
    ]
  },
  captionBg: {
    title: "captionBackground",
    values: [
      ["none", "bgNone"],
      ["dim", "bgDim"],
      ["box", "bgBox"]
    ]
  },
  captionEdge: {
    title: "captionEdge",
    values: [
      ["shadow", "edgeShadow"],
      ["outline", "edgeOutline"],
      ["none", "edgeNone"]
    ]
  }
};

export function captionGroups(core: TitanCore, onChange: (p: Prefs) => void): MenuGroup[] {
  const p = core.preferences;
  return (Object.keys(CAP) as CapKey[]).map((k) => ({
    id: k,
    title: t(CAP[k].title),
    options: CAP[k].values.map(([v, label]) => ({ id: v, label: t(label), selected: p[k] === v })),
    select: (id: string) => {
      core.setPreferences({ [k]: id } as Partial<Prefs>);
      onChange(core.preferences);
    }
  }));
}

export function timingGroup(core: TitanCore): MenuGroup {
  const o = core.subtitleOffset;
  const steps = [-2, -1, -0.5, 0, 0.5, 1, 2];
  return {
    id: "timing",
    title: t("timing"),
    options: steps.map((s) => ({
      id: String(s),
      label: s === 0 ? t("offsetNone") : t("offsetValue", { v: (s > 0 ? "+" : "") + s }),
      note: s < 0 ? t("earlier") : s > 0 ? t("later") : undefined,
      selected: Math.abs(o - s) < 0.01
    })),
    select: (id) => core.setSubtitleOffset(Number(id))
  };
}

export function issueGroup(send: (kind: string) => void): MenuGroup {
  const labels = { video: t("reportVideo"), audio: t("reportAudio"), subtitles: t("reportSubs"), quality: t("reportQuality") };
  return {
    id: "report",
    title: t("reportTitle"),
    options: ISSUES.map((i) => ({ id: i, label: labels[i], selected: false })),
    select: send
  };
}
