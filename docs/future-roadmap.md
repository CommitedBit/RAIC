# Future Roadmap: Reliable Adaptive Learning Platform

This roadmap translates the current single-branch model into a dated execution sequence with one validated slice landing at a time.

The completed v0.4.0 cycle plan is documented in [Execution Plan: v0.4.0 Reliable Adaptive Learning Platform (2026-05-17)](./execution-plans/2026-05-17-v0.4.0-reliable-adaptive-learning-platform.md). The v0.5.0 release evidence is captured in [Release Evidence: v0.5.0 Source-Grounded Experience Presets (2026-05-18)](./release-evidence-v0.5.0.md). The current release line is tracked in [v0.7.0 Discord Scheduled-Class Beta Readiness](./release-evidence-v0.7.0.md) and [v0.7.1 Reliability Hardening](./release-evidence-v0.7.1.md).

Current post-v0.7.0 hardening and adaptive-student follow-up notes are documented in:

- [Execution Plan: post-v0.7.0 Release Hardening](./execution-plans/2026-06-10-v0.4.1-release-hardening.md)
- [Execution Plan: post-v0.7.0 Adaptive Student Beta Follow-up](./execution-plans/2026-06-10-v0.5.0-adaptive-student-beta-readiness.md)

## 1) Operating baseline

- Keep `main` as the only shared branch.
- Keep development in short-lived local scratch branches (`codex/*`).
- For every slice:
  - run slice-targeted checks first,
  - merge into local `main`,
  - run the required gate sequence on `main`,
  - attach benchmark evidence when the slice touches latency-sensitive classroom paths.
- Keep PRs and merge slices one-purpose only. Do not merge multi-objective behavior stacks.

## 2) Active milestone sequence

- Completed milestone: Adaptive Classroom Intelligence v1 (`v0.3.0`)
  - Result: teacher-only repeated-session adaptation is live on `main` with unchanged public/student flows and production smoke evidence.

- Completed milestone: Reliable Adaptive Learning Platform (`v0.4.0`)
  - Result: Provider Composer scene routing, fail-closed provider hardening, and private teacher/internal learning analytics are live on `main`.
  - Public/student request and response payloads remain stable; Adaptive Student Beta is deferred.

- Completed milestone: Source-Grounded Experience Presets (`v0.5.0`)
  - Result: History Vlog is available as a source-required preset with source-mode metadata, source-backed prompt guardrails, and PDF/web fallback behavior.
  - Release note: no separate `v0.4.0` tag was published before `v0.5.0`; the `v0.5.0` tag/release is the next public release after `v0.3.0` and includes the completed v0.4.0 platform work plus Source-Grounded Experience Presets.

- Completed milestone: `v0.6.0` Adaptive Student Beta Readiness
  - Result: student adaptation remains disabled by default behind `RAIC_STUDENT_ADAPTATION_BETA`, with consent-gated access paths and non-leakage tests.
  - Execution plan: [v0.6.0 Adaptive Student Beta Readiness (2026-05-18)](./execution-plans/2026-05-18-v0.6.0-adaptive-student-beta-readiness.md).

- Completed milestone: `v0.7.0` Discord Scheduled-Class Beta Readiness
  - Result: the signed-in teacher Discord scheduled-class production beta, release gates, production smoke evidence, immutable tag, and GitHub release object are complete.
  - Production capability truth: auth, Discord, encryption, storage, and image generation are ready; web search, TTS, video, and MiroFish remain unavailable.
  - Evidence: [v0.7.0 Discord Scheduled-Class Beta Readiness](./release-evidence-v0.7.0.md).

- Completed patch: `v0.7.1` Reliability Hardening
  - Result: generated `srcDoc` widgets are isolated, scene generation has bounded retries with internal telemetry, networking and log-redaction regressions are covered, and public API contracts are unchanged.
  - Release: clean Node 24 gates, preview and production smokes, truthful capability reporting, immutable tag, and GitHub release are complete.
  - Evidence: [v0.7.1 Reliability Hardening](./release-evidence-v0.7.1.md).

- Active feature milestone: `v0.8.0` Governed Co-Thinking
  - Goal: rebuild the Course-mode Co-Thinking preset on `v0.7.1` with focused prompt, i18n, reflection, and dialog-state behavior.
  - Acceptance: no database schema or research-scoring changes; reflection and analytics remain teacher/internal; preview generation and reflection save/reload smokes pass before tag and release.
  - Exclusions: unrelated model-registry, scenario-fallback, audit-date, and formatting-only changes from the earlier feature branch.

- Post-v0.7.0 adaptive-student follow-up
  - Goal: complete privacy/compliance readiness for consent, retention, deletion, leakage controls, and rollback before enabling any broader student-facing adaptation.
  - Scoping: no public/student behavior changes before all beta gates pass.
  - Acceptance: student adaptation entrypoints remain feature-flagged, consent-guarded, rollback-safe, and covered by non-leakage replay tests.
  - Execution source: [post-v0.7.0 Adaptive Student Beta Follow-up](./execution-plans/2026-06-10-v0.5.0-adaptive-student-beta-readiness.md)

## 3) Performance and ops overlap

- Keep benchmark artifact capture and `ops:verify` evidence enforcement active throughout every milestone.
- Track deltas in `data/perf-results/latest.json` and surface the latest benchmark artifact in internal admin ops views.
- Optimize deterministic and low-noise execution as milestones advance:
  - provider capability metadata reuse,
  - repeated classroom state reuse where safe,
  - controlled e2e fixture setup and teardown.

## 4) Reliability hardening

- `ops:drift` and branch hygiene remain mandatory at handoff.
- Keep performance trend visibility in CI as non-blocking reporting unless explicitly promoted to a required gate.
- Maintain rollback preconditions, benchmark evidence links, and single-purpose slice boundaries for every merge.
- Keep follow-up decomposition streams and future reliability work serialized through the same merge model.

## 5) Exit criteria for each slice

- Functional gates: the full release gate set on local `main` for each slice, including `pnpm run ops:verify`.
- Perf gates: a valid non-fixture benchmark artifact when the slice touches latency-sensitive classroom or provider paths.
- Merge hygiene: no stale local branches, worktrees, or parked multi-objective residue after handoff.

Slice-level minimum acceptance:

- `v0.7.1` hardening: retry and error observability coverage plus no behavior regressions in stable generation/presentation flows.
- `v0.8.0` Co-Thinking: preset generation, shared dialog close-state, and teacher reflection save/reload coverage.
- Adaptive-student follow-up: privacy/retention tests plus confirmed student path disabled by default and fully rollback-safe via feature-flag disable.

Required milestone merge checks:

- `corepack pnpm run secrets:scan`
- `corepack pnpm run ops:drift`
- `corepack pnpm run lint`
- `corepack pnpm run build`
- `corepack pnpm run check`
- `corepack pnpm run test:mirofish:gate`
- `corepack pnpm run test:mirofish:e2e`
- `CI=1 corepack pnpm run test:e2e`
- `corepack pnpm run benchmark:milestone`
- `corepack pnpm run ops:verify`

Post-deploy milestone proof:

- `corepack pnpm run smoke:production:milestone`
- `corepack pnpm run smoke:production:classroom` (when classroom-path behavior changed by slice)

## 6) Governance contract

- No public API changes unless explicitly scoped and reviewed as such.
- No mixed "cleanup + feature + reliability" slices.
- Each slice must define rollback conditions before merge.
- Reflection, session-context, and analytics behavior remain teacher/internal until the v0.6.0 student beta milestone explicitly expands scope.
