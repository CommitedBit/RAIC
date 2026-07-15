# Release Evidence: v0.9.0 Governed PDF Source Foundation

Date: 2026-07-15
Target release: `v0.9.0`

Evidence status: in progress. Do not tag or publish until every section below is complete.

## Scope

- Internal PDF `DocumentArtifact`, block, asset, citation, context, and diagnostic contracts.
- Authenticated teacher upload intents and direct multipart upload to a separate private Blob store.
- Ownership-bound one-hour capabilities, MIME and signature validation, bounded extraction, immediate raw-file deletion, and hourly cleanup.
- Backward-compatible `/api/parse-pdf` response shape with a 4 MB request boundary, sanitized failures, and bounded inline images.
- Truthful `sourceDocumentsV2` health capability and a source picker with progress, validation, page count, warnings, replace, and remove states.

## Node 24 Verification

- [x] Frozen install under Node 24.14.0 and pnpm 10.28.0
- [ ] Drift and secrets checks on merged `main` (feature-branch policy correctly refuses certification)
- [x] Dependency audit: zero low-or-higher advisories across 1,373 locked packages
- [x] i18n key alignment, TypeScript, formatting, and lint
- [x] Full unit suite: 161 files passed, 1 skipped; 1,001 tests passed, 3 skipped
- [x] Production build: all routes compiled, including private upload, extraction, and cleanup
- [x] MiroFish contract and E2E gates: PR #81 CI run `29458249716`
- [x] Full Playwright: PR #81 E2E job passed in 3m29s
- [ ] Milestone benchmark
- [ ] `ops:verify`

## Preview Evidence

- [x] Protected preview `dpl_GcQTuksBxnq3NasFv4JaKMUiojbT` is Ready.
- [x] `/api/health` reports version `0.9.0`, `sourceDocumentsV2: true`, and keeps web search, TTS, video, and MiroFish false.
- [x] A 5,504,721-byte synthetic PDF uploaded through the multipart browser client-upload protocol.
- [x] The extracted one-page artifact generated a complete 10-scene source-required classroom.
- [x] An exact private-store listing confirmed the raw Blob was absent after extraction.
- [x] The preview smoke removed the classroom, generation job, session, membership, user, organization, audit rows, and branch-only smoke configuration.

The first valid-provider run exposed the route's legacy 30-second function limit after nine outlines were generated. The merge candidate raises that limit to the project's existing 300-second ceiling and includes a regression test; the successful proof above ran on that corrected revision.

## Production And Release

- [ ] Production deployment identifier and rollback target recorded.
- [ ] Real production alias and `/api/health` verified.
- [ ] Production capability report remains truthful; disabled web search, TTS, video, and MiroFish are not implied ready.
- [ ] Production milestone and classroom smokes pass.
- [ ] Immutable `v0.9.0` tag pushed and GitHub release published.

## Rollback

- Disable the new path by removing `RAIC_SOURCE_BLOB_READ_WRITE_TOKEN`.
- Roll production back to the recorded `v0.8.1` deployment.
- The legacy parser remains available; no database or classroom persistence migration is required.
