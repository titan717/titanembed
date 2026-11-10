# Skill: player test (full run)

The checks every change must pass before it is merged to main.

```sh
npm ci
npm run check        # lint, prettier, typecheck, unit tests, schema up to date
npm run build
npm run budget       # gzip budgets (docs/PERF.md)
npm run licenses     # license allowlist (docs/LICENSES.md)
npx playwright install chromium   # first time only
npm run e2e          # TV, mobile, API, axe, responsive gates
```

When something fails:

- Unit failures: `npx vitest run tests/unit/<file> -t "<name>"`.
- e2e failures: open `test-results/<test>/error-context.md` (page snapshot) or `npx playwright show-trace test-results/<test>/trace.zip`.
- Playback stuck: `node scripts/qa/dbg.mjs "<embed path>"` prints currentTime, paused, readyState and the root classes every 1.5 s.
- Layout: `node scripts/qa/shot.mjs "<url>" <w> <h> out.png`, then look at it.

Never mark a test as skipped to get green; fix the cause or record a decision.
