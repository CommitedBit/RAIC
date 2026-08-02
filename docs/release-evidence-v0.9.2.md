# Release Evidence: v0.9.2 Cohesive Stabilization

Date: 2026-08-01
Target release: `v0.9.2`

Evidence status: in progress and blocked from production. Code slices are prepared, but database migration, protected preview, complete release gates, live Google authentication, production deployment, observation, tag, and release publication remain required.

## Candidate Scope

- Preserve immutable Google account ownership, fail closed on subject conflicts, sanitize authentication failures, and revoke presented web and classroom sessions on same-origin logout.
- Return truthful redacted core readiness while leaving optional disabled capabilities out of overall status.
- Selectively adopt governed provider-probe SSRF protection, final-JSON reasoning parsing, quiz pre-submission safety, export and rendering corrections, and default-off widget synchronization.
- Preserve AGPL-3.0, Node 24, provider governance, persistence schemas, and existing capability decisions.

## Prepared Slices

- [x] PR [#86](https://github.com/CommitedBit/RAIC/pull/86): Google identity, logout, session, and health hardening; 43 focused tests and TypeScript passed locally.
- [x] PR [#87](https://github.com/CommitedBit/RAIC/pull/87): SSRF, reasoning JSON, and quiz-safety backports; 81 focused tests and TypeScript passed locally.
- [x] PR [#88](https://github.com/CommitedBit/RAIC/pull/88): export, rendering, storage, Playwright fixture, and default-off widget corrections; 36 focused tests and TypeScript passed locally.
- [x] Dependency refresh candidate: patched direct dependencies and narrowly pinned unresolved transitive advisories; the low-threshold audit, TypeScript, lint, 1,082 unit tests, and production build passed locally on Node 24.14.0.
- [x] Fresh frozen install completed with Node 24.14.0 and pnpm 10.28.0 in a temporary non-iCloud release worktree.
- [ ] Serial slice PRs merged into `release/v0.9.2` after required checks.

### Dependency Override Rationale

The release candidate uses `pnpm` overrides only where the newest compatible parent packages still resolve an advisory-affected transitive version:

- `@hono/node-server@2.0.12` stays within the MCP SDK's supported range and replaces its older server resolution.
- `body-parser@2.3.0` stays within Express 5's accepted range.
- `brace-expansion@1.1.17` and `brace-expansion@5.0.8` cover the independent ESLint and shadcn dependency paths.
- `fast-uri@3.1.5` covers the schema-validation dependency path.
- `postcss@8.5.25` covers Next.js, Vite, and sanitize-html paths.
- `sharp@0.35.3` replaces Next.js's still-vulnerable optional resolution and matches the direct runtime dependency.

## Infrastructure And Migration

- [x] Source Vercel Marketplace resource identified as `neon-rose-bell`.
- [x] Live `v0.9.1` health confirmed HTTP 200 with auth, Discord, encryption, source documents, and image generation configured; storage was unready because the source database exceeded its compute quota.
- [ ] A distinct paid Vercel Marketplace Neon destination provisioned through the required Web UI with point-in-time recovery.
- [ ] Temporary source read/export access restored or a provider-native snapshot obtained.
- [ ] Checksummed custom-format export created without ownership or grants and restored into an empty destination.
- [ ] Schema, constraints, complete table counts, ownership relationships, encrypted provider settings, and read-only teacher/classroom flows verified.
- [ ] Brief maintenance cutover completed, `DATABASE_URL` switched atomically, and existing `v0.9.1` proven against the destination before deploying `v0.9.2`.
- [ ] Source database retained read-only for seven days; post-cutover rollback remains on the destination database.

## Release Gates

- [ ] Dependency audit, secrets, drift, i18n, formatting, and lint.
- [ ] Complete unit suite, TypeScript, and production build.
- [ ] MiroFish contract and browser gates, complete Playwright, milestone benchmark, and `ops:verify` on the exact tree in a temporary branch literally named `main`.
- [ ] Protected preview against an isolated destination branch.
- [ ] Current GitHub and Vercel checks green. Initial PR previews failed before build logs with `BUILD_FAILED: Resource provisioning failed`; this is an unresolved platform gate, not passing preview evidence.

## Production Proof

- [ ] Canonical-origin first-time and returning Google sign-in, subject-conflict handling, and dual-session logout.
- [ ] Classroom read, scheduling, generation, example flow, browser console, production milestone smoke, and classroom smoke.
- [ ] `/api/health` returns HTTP 200 with version `0.9.2`, status `ok`, and storage ready. Source documents and image generation remain available; web search, video, TTS, and MiroFish remain unavailable.
- [ ] Production remains healthy for at least 24 hours before `v0.10.0` begins.
- [ ] Verified merge commit tagged immutably as `v0.9.2` and GitHub release published.

## Rollback

- Before writes reopen, restore the old database URL and prior production deployment.
- After writes reopen, promote the previous application deployment against the new Neon database; never point production at the stale source database.
- For destination data failure, enter maintenance and restore Neon from its verified snapshot before reopening writes.
