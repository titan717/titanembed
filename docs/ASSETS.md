# Assets

Every image, video, font and icon that ships or is used in demos, with its origin and license. Viewer-facing credits: apps/docs/assets.md (/docs/assets.html).

## Generated test clip (in this repository)

`scripts/gen-media.sh` builds everything in `public/media/test/` with ffmpeg from synthetic sources (no third-party footage). Re-run with `npm run media`.

| File | What it is |
| --- | --- |
| `master.m3u8` | HLS master: 480p and 720p H.264 video renditions, alternate audio groups English (`audio_en`) and Español (`audio_es`) |
| `480p/`, `720p/`, `audio_en/`, `audio_es/` | HLS media playlists and segments |
| `clip-360p.mp4` | Progressive MP4 fallback (H.264/AAC) |
| `clip-short.webm` | Short VP9/Opus WebM for format tests |
| `en.vtt`, `es.srt` | English WebVTT and Spanish SRT captions (sources in `scripts/media/`) |
| `poster.jpg` | Poster frame |
| `thumbs.jpg`, `thumbs.vtt` | Seek-preview sprite sheet and its WebVTT index (`#xywh=` fragments) |

Clip facts: 60 s, ffmpeg's `testsrc2` moving pattern with burned-in title and timecode, a different tone per audio language, intro marker 4–14 s, credits 50–60 s. License: CC0 / public domain, part of this repository. Size ≈ 15 MB.

## Public test streams used in the demo

| Media | Source | License |
| --- | --- | --- |
| Big Buck Bunny | © Blender Foundation, [peach.blender.org](https://peach.blender.org/); HLS from [Mux test streams](https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Tears of Steel | © Blender Foundation, [mango.blender.org](https://mango.blender.org/); HLS from the [Unified Streaming demo](https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

These are streamed from their hosts at play time; nothing from them is stored in the repository.

## Font

Inter Variable via `@fontsource-variable/inter` 5.3.0, © The Inter Project Authors, [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt). Bundled and served from the embed origin.

## Icons

All player icons are original 24×24 SVG paths in `packages/ui-common/src/icons.ts`, drawn for this project to match the blueprint glyphs (MIT, part of this repository). `public/favicon.svg` is original too.
