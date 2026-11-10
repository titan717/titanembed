# Skill: release routine

Every release (see docs/ROADMAP.md) follows these steps in order.

1. Re-check the Drive blueprints (all seven links in docs/BLUEPRINTS.md). New or changed files: update docs/BLUEPRINT_SPEC.md and docs/BLUEPRINT_GAPS.md first.
   1b. Re-check docs/SOURCES.md: re-read each provider's documentation, re-test reachability, update measured behaviour and ranks, and re-check named sources that are not adapted.
2. Land at least four user-visible improvements plus one quality item on main.
3. Three polish passes: (a) blueprint compare on every TV page, (b) mobile portrait/landscape/tablet screenshots at the responsive gates, (c) copy, motion and focus review. Fix what they find.
4. Code review: add a section to docs/CODE_REVIEW.md (what was read, what was found, what was fixed).
5. Run docs/skills/player-test.md and docs/skills/security-test.md. All green.
6. Bump the version in `package.json` and `packages/sdk/package.json`; update CHANGELOG.md.
7. `npm run build`, then deploy production: `vercel deploy --prod --yes --token "$VERCEL_TOKEN"`. Check `/`, `/embed/`, `/docs/` and the headers on the live URL.
8. Tag and release: `git tag vX.Y.Z && git push origin vX.Y.Z`, then `gh release create vX.Y.Z --notes-file <notes>` with the CHANGELOG section, the SRI hash from `dist/sdk/sri.json` and the `npm pack` tarball. The release workflow publishes to npm when `NPM_TOKEN` is set.
9. Update docs/ROADMAP.md (mark the release done, adjust the next ones).
