import type { PlayerClass, ThemeInput } from "./types";

/**
 * Theming (ROADMAP v0.6.0). The default theme is the Panda blueprint look; a host may change the accent, logo,
 * corner radius, font and controls opacity. An accent that does not reach 3:1 against the black player
 * background (WCAG 1.4.11 non-text contrast) is rejected and the default is kept.
 */
export const DEFAULT_ACCENT: Record<PlayerClass, string> = { tv: "#ffffff", mobile: "#1f80e0" };

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = luminance(ra);
  const lb = luminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ResolvedTheme {
  accent: string;
  /** Text colour that sits on the accent (selected speed pill, etc.). */
  onAccent: string;
  radius: number | null;
  font: string;
  controlsOpacity: number;
  logo: string | null;
  warnings: string[];
}

const FONT_STACKS: Record<NonNullable<ThemeInput["font"]>, string> = {
  inter: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif'
};

export function resolveTheme(input: ThemeInput | undefined, cls: PlayerClass): ResolvedTheme {
  const warnings: string[] = [];
  let accent = DEFAULT_ACCENT[cls];
  if (input?.accent) {
    const c = contrast(input.accent, "#000000");
    if (c >= 3) accent = input.accent;
    else warnings.push(`Accent ${input.accent} has ${c.toFixed(2)}:1 contrast on black (needs 3:1); the default accent is used.`);
  }
  const onAccent = contrast(accent, "#000000") >= contrast(accent, "#ffffff") ? "#000000" : "#ffffff";
  return {
    accent,
    onAccent,
    radius: input?.radius ?? null,
    font: FONT_STACKS[input?.font ?? "inter"],
    controlsOpacity: input?.controlsOpacity ?? 1,
    logo: input?.logo ?? null,
    warnings
  };
}

/** Applies a resolved theme as CSS custom properties on the player root. */
export function applyTheme(root: HTMLElement, t: ResolvedTheme) {
  root.style.setProperty("--t-accent", t.accent);
  root.style.setProperty("--t-on-accent", t.onAccent);
  root.style.setProperty("--t-font", t.font);
  root.style.setProperty("--t-controls-opacity", String(t.controlsOpacity));
  if (t.radius !== null) root.style.setProperty("--t-radius-host", `${t.radius}px`);
  else root.style.removeProperty("--t-radius-host");
}
