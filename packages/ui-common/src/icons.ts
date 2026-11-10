/** Line icons on a 24 grid, 2 px stroke, round caps (one stroke weight everywhere, BLUEPRINT_SPEC P-30). */
const SVG = "http://www.w3.org/2000/svg";

const P: Record<string, string[]> = {
  play: ["M7 4.5v15l12-7.5z|fill"],
  pause: ["M7 4.5h3.2v15H7z|fill", "M13.8 4.5H17v15h-3.2z|fill"],
  back: ["M15 5l-7 7 7 7"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  // blueprint p7: a play triangle inside a rounded square
  quality: ["M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5z", "M10 9.2v5.6l4.6-2.8z|fill"],
  // blueprint p7: a speech bubble with two lines
  subtitles: ["M4.5 4.5h15A1.5 1.5 0 0 1 21 6v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5h-1A1.5 1.5 0 0 1 3 15V6a1.5 1.5 0 0 1 1.5-1.5z", "M7.5 9h9", "M7.5 12h6"],
  // blueprint p3 "Watch Next": a compass in a circle
  watchnext: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M15.5 8.5l-2 5-5 2 2-5z"],
  next: ["M5 5v14l10-7z|fill", "M18 5v14"],
  prev: ["M19 5v14L9 12z|fill", "M6 5v14"],
  rw10: ["M11 5L7 8.5 11 12", "M7.4 8.5H14a6 6 0 1 1-6 6"],
  ff10: ["M13 5l4 3.5-4 3.5", "M16.6 8.5H10a6 6 0 1 0 6 6"],
  settings: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-2 1.2l-.3 2h-4l-.3-2a7.6 7.6 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7.4 7.4 0 0 1 0-3l-1.6-1.2 2-3.4 1.9.7a7.6 7.6 0 0 1 2-1.2l.3-2h4l.3 2a7.6 7.6 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7.4 7.4 0 0 1 0 3z"],
  speed: ["M5.6 18.4A9 9 0 1 1 18.4 18.4", "M12 13l4-5"],
  moon: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"],
  episodes: ["M4 6h16", "M4 12h16", "M4 18h10"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  alert: ["M12 3.5l9.5 16.5h-19z", "M12 10v4.5", "M12 17.3v.2"],
  lock: ["M6.5 10.5h11v9h-11z", "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"],
  unlock: ["M6.5 10.5h11v9h-11z", "M8.5 10.5V8a3.5 3.5 0 0 1 6.8-1.2"],
  pip: ["M3 5.5h18v13H3z", "M12.5 12h6v4.5h-6z|fill"],
  fullscreen: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  fullscreenExit: ["M9 4v5H4", "M15 4v5h5", "M9 20v-5H4", "M15 20v-5h5"],
  volume: ["M4 9.5h3.5L12 5.5v13l-4.5-4H4z", "M15.5 9a4 4 0 0 1 0 6", "M18 6.5a7.5 7.5 0 0 1 0 11"],
  mute: ["M4 9.5h3.5L12 5.5v13l-4.5-4H4z", "M16 9.5l5 5", "M21 9.5l-5 5"],
  brightness: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2.5v2", "M12 19.5v2", "M2.5 12h2", "M19.5 12h2", "M5.3 5.3l1.4 1.4", "M17.3 17.3l1.4 1.4", "M5.3 18.7l1.4-1.4", "M17.3 6.7l1.4-1.4"],
  retry: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4"],
  rotate: ["M4 12a8 8 0 0 1 14-5.3", "M18 3v4h-4", "M20 12a8 8 0 0 1-14 5.3", "M6 21v-4h4"],
  fit: ["M4 8V4h4", "M16 4h4v4", "M20 16v4h-4", "M8 20H4v-4", "M9 9h6v6H9z"],
  offline: ["M3 3l18 18", "M8.5 16.5a5 5 0 0 1 7 0", "M5 13a10 10 0 0 1 4.5-2.6", "M12.8 10.1A10 10 0 0 1 19 13", "M2 9.5a15 15 0 0 1 3.7-2.4", "M10 5.6A15 15 0 0 1 22 9.5", "M12 20v.2"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5.5", "M12 7.6v.2"]
};

export type IconName = keyof typeof P;

export function icon(name: IconName, cls = "t-icon"): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", cls);
  for (const spec of P[name] ?? []) {
    const [d, mode] = spec.split("|");
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d!);
    if (mode === "fill") {
      p.setAttribute("fill", "currentColor");
      p.setAttribute("stroke", "none");
    }
    svg.appendChild(p);
  }
  return svg;
}

/** The Titan mark: a play triangle inside a rounded hexagon, used in the default loading state. */
export function mark(cls = "t-mark"): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", cls);
  const hex = document.createElementNS(SVG, "path");
  hex.setAttribute("d", "M32 4l24.2 14v28L32 60 7.8 46V18z");
  hex.setAttribute("fill", "none");
  hex.setAttribute("stroke", "currentColor");
  hex.setAttribute("stroke-width", "3");
  hex.setAttribute("stroke-linejoin", "round");
  const tri = document.createElementNS(SVG, "path");
  tri.setAttribute("d", "M26 21.5v21L43 32z");
  tri.setAttribute("fill", "currentColor");
  svg.append(hex, tri);
  return svg;
}
