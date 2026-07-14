# Release Evidence: v0.8.0 Governed Co-Thinking

Date: 2026-07-14
Target release: `v0.8.0`
Evidence status: focused implementation and local Node 24 verification complete; PR preview generation, merged-main release gates, production reflection smoke, tag, and GitHub release evidence pending.

## Baseline And Scope

- Base: post-`v0.7.1` `main` at `e5063ea`, with the reliability release tagged at `49b7c2df2dc75365866fee8778b61b96e064e58e`.
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

Clean temporary checkout: `/tmp/openraic-v071-main.LsCdzw/repo`.

- Focused preset, prompt, route, generation, reflection, shared-dialog, classroom-share, and scheduled-class tests: 8 files, 60 tests passed.
- Complete branch unit suite: 154 files passed, 1 skipped; 969 tests passed, 3 skipped.
- `pnpm run check:i18n-keys`: passed for all four locales.
- `pnpm run check`: passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run lint`: passed.
- `pnpm run build`: passed, including TypeScript validation and 52 generated static pages.
- Governed Co-Thinking home-to-generation Playwright with retries disabled: 1 test passed, including contextual composer behavior.
- Governed reflection Playwright with retries disabled: 1 test passed, including save/reload persistence.

## Release Gates

Pending until the candidate is pushed and merged:

- GitHub CI and Vercel preview.
- Preview Co-Thinking generation plus signed-in teacher reflection save/reload smoke.
- Complete clean-main Node 24 release gate: secrets, drift, i18n, TypeScript, formatting, lint, unit tests, build, MiroFish contract/E2E, Playwright, benchmark, and `ops:verify`.
- Production milestone/classroom smokes and `/api/health` capability verification.
- Immutable `v0.8.0` tag and GitHub release publication.

## Rollback

- Revert the preset/composer, shared dialog hardening, and release metadata independently.
- No schema rollback or data migration is required.
