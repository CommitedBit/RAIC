# Release Evidence: v0.9.2 Cohesive Stabilization

Date: 2026-08-23
Target release: `v0.9.2`

Evidence status: candidate validated locally and in protected Preview; production remains blocked on serial merges, canonical-origin Google authentication, governed generation, production smoke checks, tagging, and release publication.

## Candidate Scope

- Preserve immutable Google account ownership, fail closed on subject conflicts, sanitize authentication failures, and revoke presented web and classroom sessions on same-origin logout.
- Return truthful redacted core readiness while leaving optional disabled capabilities out of overall status.
- Selectively adopt governed provider-probe SSRF protection, final-JSON reasoning parsing, quiz pre-submission safety, export and rendering corrections, and default-off widget synchronization.
- Resolve post-candidate dependency advisories without changing runtime contracts or adding a second database.
- Preserve AGPL-3.0, Node 24, provider governance, persistence schemas, and existing capability decisions.

## Prepared Slices

- [x] PR [#86](https://github.com/CommitedBit/RAIC/pull/86): Google identity, logout, session, and health hardening; 43 focused tests and TypeScript passed locally.
- [x] PR [#87](https://github.com/CommitedBit/RAIC/pull/87): SSRF, reasoning JSON, and quiz-safety backports; 81 focused tests and TypeScript passed locally.
- [x] PR [#88](https://github.com/CommitedBit/RAIC/pull/88): export, rendering, storage, Playwright fixture, and default-off widget corrections; 36 focused tests and TypeScript passed locally.
- [x] PR [#90](https://github.com/CommitedBit/RAIC/pull/90): patched direct dependencies and narrowly pinned unresolved transitive advisories. Post-candidate advisories were refreshed at `b7c061d`; the low-threshold audit now reports zero findings.
- [x] PR [#91](https://github.com/CommitedBit/RAIC/pull/91): aligned the legitimate Playwright logout request with the new exact same-origin requirement; the focused browser proof passed locally.
- [x] Final stacked candidate `a578850` merges the refreshed dependency baseline into PR #91. Its Vercel build completed successfully.
- [x] Fresh frozen install completed with Node 24.19.0 and pnpm 10.28.0 in a temporary non-iCloud branch literally named `main`.
- [ ] Serial slice PRs merged into `release/v0.9.2` after required checks.

### Dependency Override Rationale

The release candidate uses `pnpm` overrides only where the newest compatible parent packages still resolve an advisory-affected transitive version:

- `@hono/node-server@2.0.12` stays within the MCP SDK's supported range and replaces its older server resolution.
- `body-parser@2.3.0` stays within Express 5's accepted range.
- `brace-expansion@1.1.18` and `brace-expansion@5.0.9` cover the independent ESLint and shadcn dependency paths.
- `fast-uri@3.1.5` covers the schema-validation dependency path.
- `hono@4.13.3`, `ip-address@10.5.0`, `js-yaml@3.15.1`, and `nanoid@3.3.18` cover current MCP, Jest, and PostCSS transitive paths.
- `postcss@8.5.25` covers Next.js, Vite, and sanitize-html paths.
- `sharp@0.35.3` replaces Next.js's still-vulnerable optional resolution and matches the direct runtime dependency.
- `undici@6.28.0` covers the current Vercel Blob transitive path; direct Undici is `7.29.0`.
- The unused `image-size` dependency was removed from the bundled PptxGenJS workspace; its only source reference was inside an explicitly unused commented block.

## Infrastructure And Migration

- [x] Source Vercel Marketplace resource identified as `neon-rose-bell`.
- [x] The existing Marketplace resource was upgraded in place from Free to Launch. No second database was created, no production environment variable changed, and no data cutover is required.
- [x] Live `v0.9.1` health recovered to HTTP 200 with Postgres storage, auth, Discord, encryption, source documents, and image generation ready.
- [x] A custom-format, ownership-free, ACL-free Postgres snapshot was captured from the unpooled connection: 304 KiB, 108 TOC entries, 17 application tables, SHA-256 `4be765051873d7a00d7f7bdd28aa29afdf2f3f11ecc12bb17ed4fb6379ff7b02`.
- [x] Complete per-table counts were recorded; checked session, classroom, membership, scheduling, user, and organization relationships had zero orphans. Five organization and eleven user provider secrets retained non-short encrypted shapes without exposing values.
- [x] The snapshot, checksum, archive listing, and database audit were moved to a mode-700 non-iCloud private release archive; none are stored in Git.
- [x] The existing Neon Preview action remained separate from fixed Production credentials. Protected Preview storage reported ready without replacing the production URL.
- [ ] Capture provider-native recovery-window or point-in-time-recovery evidence from the Neon console.

## Release Gates

- [x] Dependency audit reported zero low-or-higher advisories after the 2026-08-23 refresh; built-in secrets scan, drift, four-locale i18n alignment, formatting, and lint passed.
- [x] TypeScript, all 1,082 unit tests with 3 intentional skips, and the Next.js 16.2.12 production build passed.
- [x] MiroFish contract gate passed 97 tests with 2 intentional skips; its browser gate passed 3 flows; complete Playwright passed 40 flows with 1 intentional skip.
- [x] Milestone benchmark passed with first meaningful paint 240 ms, classroom start 542 ms, provider p95 13 ms, and classroom reconnect 154 ms.
- [x] Consolidated `ops:verify` passed on the clean candidate using Node 24.19.0 and pnpm 10.28.0.
- [x] Protected Preview `dpl_59jqPA4hRf5TiuWW5amCUWaqqag7` built candidate `a578850` and returned healthy `0.9.2` capability truth.
- [x] The protected source flow accepted a synthetic PDF larger than 4.5 MB, extracted it, deleted the raw Blob, and cleaned disposable teacher data.
- [ ] Disposable Preview classroom generation stopped at governed provider authentication. Do not copy a teacher key or weaken organization governance to satisfy this test; prove generation with the canonical live account before release.
- [x] Current Vercel checks are green on PR #90 and PR #91. Earlier resource-provisioning failures were cleared by the in-place Launch upgrade.

## Production Proof

- [ ] Canonical-origin first-time and returning Google sign-in, subject-conflict handling, and dual-session logout.
- [ ] Classroom read, scheduling, generation, example flow, browser console, production milestone smoke, and classroom smoke.
- [ ] `/api/health` returns HTTP 200 with version `0.9.2`, status `ok`, and storage ready. Source documents and image generation remain available; web search, video, TTS, and MiroFish remain unavailable.
- [ ] Production remains healthy for at least 24 hours before `v0.10.0` begins.
- [ ] Verified merge commit tagged immutably as `v0.9.2` and GitHub release published.

## Rollback

- Database rollback is no longer a URL cutover: Production remains on the same upgraded Neon resource.
- For application regressions, promote the verified `v0.9.1` production deployment while retaining the current Neon connection.
- For data failure, enter maintenance and use Neon recovery or restore the checksummed private snapshot before reopening writes.
