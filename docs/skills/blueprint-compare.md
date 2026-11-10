# Skill: blueprint compare

Checks a player screen against its blueprint page and records drift as a bug.

1. Render the blueprints once: `pdftoppm -r 110 -png <file>.pdf bp/tvp/p` (pages map to screens in docs/BLUEPRINTS.md).
2. Build and serve: `npm run build && npm run preview`.
3. Capture the same state at the blueprint's resolution (1920×1080 for TV pages):
   `node scripts/qa/shot.mjs "http://localhost:4173/embed/?src=/media/test/master.m3u8&player=tv&t=20" 1920 1080 out.png`
   For panels and focus states, drive keys first: `node scripts/qa/keys.mjs "<path>" 1920 1080 2500 ArrowUp,ArrowUp,ArrowRight,Enter`.
4. Put both images side by side (or overlay at 50% opacity) and walk the numbered checklist in docs/BLUEPRINT_SPEC.md for that page: positions, sizes in tu (1 tu = 1px at 1080p), type scale, colours from tokens, focus treatment, copy.
5. Any mismatch: fix it (tokens only, no literal colours outside `base.css`), or, when the blueprint is silent or contradictory, add a G-xx entry to docs/BLUEPRINT_GAPS.md and a D-xxx entry to docs/DECISIONS.md.
6. Re-capture and attach the after image to the commit description.
