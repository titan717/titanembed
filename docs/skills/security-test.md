# Skill: security test

Run before every release and after any change to the bridge, descriptor, subtitles or headers.

1. Unit hostile-input suites: `npx vitest run tests/unit/descriptor.test.ts tests/unit/protocol.test.ts tests/unit/subtitles.test.ts`.
2. Cross-origin suite: `npx playwright test tests/e2e/api.spec.ts` (host page on another origin from tests/e2e/fixtures/serve.mjs).
3. Code search — each must return nothing outside comments:
   `rg -n "innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|window\.open|top\.location|postMessage\([^)]*['\"]\*['\"]" packages site`
4. Headers on the live deploy: `curl -sI https://titanembed.vercel.app/embed/ | rg -i "content-security|permissions|referrer|nosniff|strict-transport"` and compare with docs/SECURITY.md.
5. Dependencies: `npm audit --audit-level=high --omit=dev` and `npm run licenses`.
6. Try the player in `sandbox="allow-scripts allow-same-origin"` (the demo does this) and confirm no console errors about blocked popups or navigation.
7. Record anything found in docs/SECURITY.md and fix it in the same release.
