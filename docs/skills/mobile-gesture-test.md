# Skill: mobile gesture test

Checks Player B touch behaviour.

1. `npm run build && npm run preview`.
2. Automated: `npx playwright test tests/e2e/mobile.spec.ts` (390×844 portrait and 844×390 landscape, `hasTouch`, `isMobile`).
3. Manual checks with `node scripts/qa/tap.mjs "<url>" 390 844 out.png` and a real phone on the preview URL:
   - Single tap on the video toggles the controls after 280 ms; taps on controls never toggle.
   - Double tap on the left/right third seeks ∓/±10 s, further taps in the burst add 10 s each, with a ripple showing the total.
   - Double tap in the centre toggles fit/fill.
   - Vertical drags on the left half change brightness, on the right half volume; a long press holds 2× speed.
   - Dragging the seek bar shows the thumbnail preview; releasing commits.
   - Lock controls blocks every gesture; a tap shows the Unlock button for 2.5 s and tapping it restores controls.
   - Sheets open from the bottom, close with the close button, a tap on the scrim, or by dragging the grip/title bar down (portrait) or right (landscape) past 30% of the sheet, or with a fast flick.
4. Tap targets: every control must be at least 24×24 CSS px (WCAG 2.2 target size) — the responsive spec checks that nothing overlaps.
