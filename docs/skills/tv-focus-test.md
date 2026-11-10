# Skill: TV focus test

Proves every Player A control is reachable and leavable with a D-pad only.

1. `npm run build && npm run preview`.
2. Run the automated part: `npx playwright test tests/e2e/tv.spec.ts`.
3. Manual walk with `node scripts/qa/keys.mjs "/embed/?src=/media/test/master.m3u8&player=tv&t=20" 1920 1080 2500 <keys>` — it prints the focused element after each key:
   - First key wakes the controls and focuses the track (or Skip during an intro).
   - Up from the track reaches the top pills; Left/Right walks them; Down returns to the track.
   - Enter opens a panel; focus lands on the selected row; Back closes and returns focus to the pill that opened it.
   - Left/Right with controls hidden seeks without showing the top bar; repeated presses grow the step (10 → 20 → 30 → 60 s).
   - Back with controls visible hides them; Back with them hidden emits `exit`.
4. Repeat at 1280×720 and 3840×2160: the focus ring must stay fully visible (not clipped by a panel edge) and the scale must stay 1.08 on pills.
5. Remote key codes: unit tests in tests/unit/misc.test.ts cover webOS (461), Tizen (10009), Fire TV/Android (`XF86Back`, 4) and media keys. Add a test for any new device before adding its code.
