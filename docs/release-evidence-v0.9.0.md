# Release Evidence: v0.9.0 Governed PDF Source Foundation

Date: 2026-07-15
Target release: `v0.9.0`

Evidence status: release-ready. The merged-main gate, protected preview, production deployment, health checks, and production smokes are complete. The immutable tag and GitHub release remain the final open step.

## Scope

- Internal PDF `DocumentArtifact`, block, asset, citation, context, and diagnostic contracts.
- Authenticated teacher upload intents and direct multipart upload to a separate private Blob store.
- Ownership-bound one-hour capabilities, MIME and signature validation, bounded extraction, immediate raw-file deletion, and hourly cleanup.
- Backward-compatible `/api/parse-pdf` response shape with a 4 MB request boundary, sanitized failures, and bounded inline images.
- Truthful `sourceDocumentsV2` health capability and a source picker with progress, validation, page count, warnings, replace, and remove states.

## Node 24 Verification

- [x] Frozen install under Node 24.14.0 and pnpm 10.28.0
- [x] Drift and secrets checks on clean merged `main`
- [x] Dependency audit: zero low-or-higher advisories across 1,373 locked packages
- [x] i18n key alignment, TypeScript, formatting, and lint
- [x] Full unit suite: 162 files passed, 1 skipped; 1,008 tests passed, 3 skipped
- [x] Production build: all routes compiled, including private upload, extraction, and cleanup
- [x] MiroFish contract gate: 20 files passed, 97 tests passed, 2 skipped; dedicated E2E: 3 passed
- [x] Full Playwright on the normal built server: 36 passed, 1 intentionally skipped
- [x] Milestone benchmark: first meaningful paint 748 ms; classroom start 2,519 ms; provider p95 21 ms; reconnect 163 ms; every threshold passed
- [x] `ops:verify`: canonical drift, secrets, formatting, build, MiroFish, and full Playwright gates passed

## Preview Evidence

- [x] Protected preview `dpl_GcQTuksBxnq3NasFv4JaKMUiojbT` is Ready.
- [x] `/api/health` reports version `0.9.0`, `sourceDocumentsV2: true`, and keeps web search, TTS, video, and MiroFish false.
- [x] A 5,504,721-byte synthetic PDF uploaded through the multipart browser client-upload protocol.
- [x] The extracted one-page artifact generated a complete 10-scene source-required classroom.
- [x] An exact private-store listing confirmed the raw Blob was absent after extraction.
- [x] The preview smoke removed the classroom, generation job, session, membership, user, organization, audit rows, and branch-only smoke configuration.

The first valid-provider run exposed the route's legacy 30-second function limit after nine outlines were generated. The merge candidate raises that limit to the project's existing 300-second ceiling and includes a regression test; the successful proof above ran on that corrected revision.

## Production And Release

- [x] Production deployment `dpl_HU5sasmpiYcA7vi7Ae8m1UVJfwQg` is Ready; `dpl_6cqpAwKNY9qR54siecsaxAtkCRr2` is the `v0.8.1` rollback target.
- [x] `https://open-raic.com` resolves to the new production deployment and `/api/health` returns HTTP 200 with version `0.9.0`.
- [x] Production capability reporting is truthful: source documents, image generation, auth, Discord, encryption, and Postgres storage are ready; web search, TTS, video, and MiroFish remain unavailable.
- [x] Production milestone smoke: 12 passed, 0 failed, 0 blocked, and 4 optional unavailable capabilities skipped. Classroom smoke: 3 automated guards passed, 0 failed, and 5 signed-in manual checks were listed without production mutation.
- [ ] Immutable `v0.9.0` tag pushed and GitHub release published.

## Rollback

- Disable the new path by removing `RAIC_SOURCE_BLOB_READ_WRITE_TOKEN`.
- Roll production back to the recorded `v0.8.1` deployment.
- The legacy parser remains available; no database or classroom persistence migration is required.
