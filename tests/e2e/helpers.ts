import type { Page } from "@playwright/test";

export const CLIP = {
  hls: "/media/test/master.m3u8",
  mp4: "/media/test/clip-360p.mp4",
  webm: "/media/test/clip-short.webm",
  poster: "/media/test/poster.jpg",
  thumbs: "/media/test/thumbs.vtt",
  en: "/media/test/en.vtt",
  es: "/media/test/es.srt"
};

/** Embed URL for the generated test clip with captions, markers and thumbnails. */
export function embedUrl(params: Record<string, string> = {}) {
  const p = new URLSearchParams({
    src: CLIP.hls,
    title: "Titan test clip",
    poster: CLIP.poster,
    thumbnails: CLIP.thumbs,
    intro: "4-14",
    credits: "50-60",
    ...params
  });
  p.append("sub", `${CLIP.en}|en|English`);
  p.append("sub", `${CLIP.es}|es|Español`);
  return `/embed/?${p}`;
}

export async function waitPlaying(page: Page) {
  await page.waitForFunction(
    () => {
      const v = document.querySelector("video");
      return !!v && v.currentTime > 0.2 && !v.paused;
    },
    null,
    { timeout: 20_000 }
  );
}

export const videoTime = (page: Page) => page.evaluate(() => document.querySelector("video")!.currentTime);
