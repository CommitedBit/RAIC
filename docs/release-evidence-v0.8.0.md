# Release Evidence: v0.8.0 Governed Co-Thinking

Date: 2026-07-14
Target release: `v0.8.0`
Evidence status: complete. The final release commit, clean Node 24 gate, protected preview, production deployment, production smokes, immutable tag, and GitHub release are verified.

## Baseline And Scope

- Base: post-`v0.7.1` `main` at `429000d`, with the reliability release tagged at `49b7c2df2dc75365866fee8778b61b96e064e58e`.
- Includes prerequisite PR #74, which replaces raw AI SDK error logging with an allowlisted provider-error summary while preserving caller error hooks.
- Includes prerequisite PR #75, which applies the same summary to scene-outline retry, exhaustion, and setup logs.
- Includes PR #76, which applies the provider-error summary to outer classroom and asynchronous job-failure logs after the clean-main browser gate exposed the remaining raw-message path.
- Feature merge: `4321fd101b39b5fd905364e2e8e5d3029f6c1377` from PR #73.
- Final release commit: `01ebcd3f10dfc662b9a96a01d6ce1676b58e69b3` from PR #76.
- Replayed only PR #55 commits `3aa70e7` and `4e7049f` for the preset and focused composer context.
- Excluded the old OpenRouter scene fallback, Nemotron registry metadata/tests, registry formatting, audit-date, and no-code preview commits.
- Added `governed-co-thinking` to `ExperiencePreset` as a backward-compatible union member.
- Added the Course-mode preset control, source-free prompt context, contextual composer placeholder, and four-locale labels/hints.
- Added a teacher-only reflection template using existing reflection fields and persistence routes.
- Added no database schema, student adaptation, student-level research scoring, named index, export, or portfolio field.
- Reflection and analytics remain teacher/internal.

## Dialog Close-State Resolution

- Shared dialog overlay and content become invisible and non-interactive while Radix finishes unmounting a `data-state="closed"` node.
- Focused wrapper coverage verifies both safety classes.
- Scheduled-class, classroom-share, and session-reflection component flows remain green.
- The Governed Co-Thinking teacher browser flow now verifies save, close, full reload, persisted-value hydration, and cancel-close behavior.
- Issue: <https://github.com/CommitedBit/RAIC/issues/57>.

## Node 24 Verification

Clean temporary non-iCloud checkout: `/tmp/openraic-v071-main.LsCdzw/repo`.

- Focused preset, prompt, route, generation, reflection, shared-dialog, classroom-share, and scheduled-class tests: 8 files, 60 tests passed.
- Complete final-main unit suite: 154 files passed, 1 skipped; 974 tests passed, 3 skipped.
- `pnpm run check:i18n-keys`: passed for all four locales.
- `pnpm run secrets:scan`: passed with the repository's built-in scan; no optional external scanner was installed.
- `pnpm run ops:drift`: passed with one local branch, one worktree, and only `origin/main` remote tracking state.
- `pnpm run check`: passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run lint`: passed.
- `pnpm run build`: passed, including TypeScript validation and 52 generated static pages.
- `pnpm run test:mirofish:gate`: 97 tests passed, 2 skipped, followed by a passing TypeScript check.
- `pnpm run test:mirofish:e2e`: 3 browser scenarios passed.
- `pnpm run test:e2e`: 36 browser scenarios passed, 1 fixture-dependent access-code scenario skipped.
- Governed Co-Thinking home-to-generation Playwright with retries disabled: 1 test passed, including contextual composer behavior.
- Governed reflection Playwright with retries disabled: 1 test passed, including save/reload persistence.
- `pnpm run benchmark:milestone`: artifact `b457d3fe-f7ea-41f4-a641-c42e64b4ebfb` passed all budgets: first meaningful paint 378 ms, classroom start 804 ms, provider roundtrip p95 24 ms, and reconnect 286 ms.
- `pnpm run ops:verify`: passed its canonical secret, formatting, build, live benchmark, MiroFish contract/E2E, and CI-mode Playwright gates.

## Preview Evidence

- Final PR #73 candidate `c5845e83019ed120527040b3f029799ec021ff86` passed GitHub lint/typecheck/unit, E2E, MiroFish contract, ops drift, and Vercel checks.
- Final protected deployment: `dpl_CjBxGRx1VTCr857WFrogs4EYVcVQ`; branch alias: <https://raic-git-codex-v080-govern-d60510-vangorestudios-6959s-projects.vercel.app>.
- The final protected candidate `/api/health` reported version `0.8.0`; auth, Discord, storage, and image generation were ready, while encryption, web search, TTS, video, and MiroFish remained unavailable in preview.
- A real `scene-outlines-stream` request returned two outlines with `experiencePreset: "governed-co-thinking"` and retained the agency and verification framing.
- The first preview generation exposed missing branch-specific provider routing. The branch was corrected with the existing non-secret preview model/base configuration and redeployed without changing shared credentials.
- Teacher reflection save, close, full reload, persisted-value hydration, and cancel-close behavior passed against the local application and real local storage path with Playwright retries disabled.
- PRs #74 and #75 passed all repository-owned checks and clean Node 24 local gates. Their Vercel checks were documented as integration-resource provisioning failures before build execution.
- PR #76 passed lint/typecheck/unit, E2E, MiroFish contract, ops drift, and Vercel preview checks. Its targeted browser replay logged only `{ "errorCode": "error" }` and `{ "errorName": "Error" }`, with no raw provider message, URL, userinfo, query, fragment, or credential.
- Obsolete PR #55 and its stale previews were removed. Additional uncited closed-branch previews were pruned while the cited `v0.7.1` preview was preserved.

## Release Gates

- PR #73 merged as `4321fd1`; the final release hardening PR #76 merged as `01ebcd3` after all repository and Vercel checks passed.
- Production deployment `dpl_6FkoZ8eSsW1wanT3Pvh4eCuQaVZF` is `READY`, targets production, runs Node 24, and serves the final commit at <https://open-raic.com>.
- Production `/api/health` reports version `0.8.0`; auth, Discord, encryption, Postgres storage, and image generation are ready.
- Production `/api/health` truthfully reports web search, TTS, video, and MiroFish unavailable. None was enabled to satisfy this release.
- `pnpm run smoke:production:milestone`: 12 passed, 0 failed, 0 blocked, and 4 optional unavailable capabilities skipped.
- `pnpm run smoke:production:classroom`: 3 automated guards passed and 0 failed. The script also listed five signed-in manual checks; those are not represented as automated evidence.
- Annotated tag `v0.8.0` resolves to `01ebcd3f10dfc662b9a96a01d6ce1676b58e69b3` and was pushed without moving any prior tag.
- GitHub release: <https://github.com/CommitedBit/RAIC/releases/tag/v0.8.0>.

## Rollback

- Revert the preset/composer, shared dialog hardening, and release metadata independently.
- No schema rollback or data migration is required.
