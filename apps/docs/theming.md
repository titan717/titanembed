---
title: Theming
---
# Theming

| Option | URL parameter | Values |
| --- | --- | --- |
| `accent` | `accent=e07bd8` | Any hex colour with at least 3:1 contrast on black. Used only for the progress bar, focus and selection. |
| `logo` | `logo=https://…/logo.svg` | Shown in the top bar of both players. |
| `radius` | `radius=12` | 0–32 px, for buttons, sheets and panels. |
| `font` | `font=system` | `inter` (default, bundled), `system`, `serif`, `rounded`. |
| `controlsOpacity` | `controlsOpacity=0.7` | 0.4–1, the strength of the shade behind the controls. |

Colours that fail the contrast check fall back to the default accent (white on TV, blue on mobile) and `setTheme` returns a warning. Theme changes apply live.

Viewers can change caption size, colour, background and edge style in Settings → Caption style; those choices are stored in the embed's own storage and never sent anywhere.
