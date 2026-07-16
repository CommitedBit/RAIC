# Future Roadmap: Reliable Adaptive Learning Platform

This roadmap translates the current single-branch model into a dated execution sequence with one validated slice landing at a time.

The completed v0.4.0 cycle plan is documented in [Execution Plan: v0.4.0 Reliable Adaptive Learning Platform (2026-05-17)](./execution-plans/2026-05-17-v0.4.0-reliable-adaptive-learning-platform.md). The v0.5.0 release evidence is captured in [Release Evidence: v0.5.0 Source-Grounded Experience Presets (2026-05-18)](./release-evidence-v0.5.0.md). The completed release line is tracked in [v0.7.1 Reliability Hardening](./release-evidence-v0.7.1.md) and [v0.8.0 Governed Co-Thinking](./release-evidence-v0.8.0.md). The next release sequence is defined in [Execution Plan: v0.8.1-v0.11.0 Improvement Milestones (2026-07-15)](./execution-plans/2026-07-15-v0.8.1-v0.11.0-improvement-milestones.md).

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

- Completed feature milestone: `v0.8.0` Governed Co-Thinking
  - Result: the Course-mode Co-Thinking preset, focused prompt context, i18n, reflection template, and shared dialog close-state fix are live.
  - Release: clean Node 24 gates, preview generation, production health, and teacher reflection save/reload evidence are complete.
  - Evidence: [v0.8.0 Governed Co-Thinking](./release-evidence-v0.8.0.md).

- Completed patch milestone: `v0.8.1` Dependency Security
  - Result: all 34 dependency alerts are closed, the locked graph audits clean at the low threshold, and CI plus a weekly workflow enforce the audit without changing public behavior or persistence contracts.
  - Release: clean Node 24 gates, protected preview, production health/smokes, immutable tag, and GitHub release are complete.
  - Evidence: [v0.8.1 Dependency Security](./release-evidence-v0.8.1.md).

- Completed feature milestone: `v0.9.0` Governed PDF Source Foundation
  - Result: PDF sources use a governed internal artifact boundary, teacher-authenticated private direct uploads, bounded extraction, immediate raw-file deletion, and truthful capability reporting.
  - Release: legacy PDF callers remain compatible, a protected preview proved a 5.5 MB upload and source-required classroom generation with no raw Blob left behind, and production health/smokes, the immutable tag, and GitHub release are complete.
  - Evidence: [v0.9.0 Governed PDF Source Foundation](./release-evidence-v0.9.0.md).

- Active patch milestone: `v0.9.1` Homepage Simplification
  - Goal: move the public composer into the first mobile viewport by replacing the duplicate demo and empty schedule surfaces with compact actions and constraining the agent selector.
  - Acceptance: demo seeding, scheduling, teacher Discord controls, and populated events remain available; desktop and mobile have no horizontal overflow.
  - Evidence: [v0.9.1 Homepage Simplification](./release-evidence-v0.9.1.md).

- Active feature milestone: `v0.10.0` Source-Grounded Authoring
  - Goal: let teachers inspect source pages before generation and carry validated citation evidence into classrooms and scenes.
  - Acceptance: source-required presets fail closed on unusable input, persisted excerpts are bounded and teacher-only, and public/student responses strip private source details.

- Planned feature milestone: `v0.11.0` Governed Edit with AI
  - Goal: provide teacher-only, preview-before-apply slide edits through a validated patch language and the existing undo history.
  - Acceptance: the default-off feature flag is the rollback, stale or unsafe patches are rejected, and preview/production edit-apply-undo proof passes before enablement.

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

- `v0.8.1`: patched dependency graph, reproducible dependency audit, and no runtime or API behavior changes.
- `v0.9.0`: authenticated private upload, ownership/limit/redaction coverage, legacy compatibility, and raw-file cleanup.
- `v0.10.0`: deterministic page selection, validated citations, teacher-only source evidence, and public/student sanitization.
- `v0.11.0`: authorized structured patches, stale-state rejection, atomic apply, one-step undo, and feature-flag rollback.
- Adaptive-student follow-up: privacy/retention tests plus confirmed student path disabled by default and fully rollback-safe via feature-flag disable.

Required milestone merge checks:

- `corepack pnpm run secrets:scan`
- `corepack pnpm run security:dependencies`
- `corepack pnpm run ops:drift`
- `corepack pnpm run check:i18n-keys`
- `corepack pnpm exec tsc --noEmit`
- `corepack pnpm run check`
- `corepack pnpm run lint`
- `corepack pnpm test`
- `corepack pnpm run build`
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
