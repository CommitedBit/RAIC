# Release Evidence: v0.9.3 Stabilization

Prepared: 2026-10-03. This record distinguishes local candidate proof from Preview, production, and publication. The immutable `v0.9.3` tag and GitHub release must identify the final source commit; the release evidence attached at publication must record that SHA and the matching Vercel deployment.

## Scope and provenance

- The current production baseline is `2aa083cddb237cd5e7f55de953abb9029d898c41`, merged through [PR #92](https://github.com/CommitedBit/RAIC/pull/92). Production health reported version `0.9.2` on 2026-10-03, but no `v0.9.2` tag or GitHub release was published. The [August candidate record](./release-evidence-v0.9.2.md) is historical, not evidence for this release.
- The v0.9.3 candidate adds focused formula, outbound-request, quiz, TTS, classroom layout/completion/widget, and dependency fixes to that baseline. It preserves AGPL-3.0, the existing provider governance and persistence model, and the default-off student adaptation boundary.
- The dependency audit at the low threshold reports one upstream `braces@3.0.3` advisory as **locally mitigated**, with zero unmitigated findings. The exact patch, lock binding, installed source bytes, consumer resolution, and depth/compatibility probes are checked on every audit run. This is not a claim that the upstream advisory has been withdrawn or that every installed package is remotely exploitable.

## Local candidate evidence

- A frozen Node 24.19.0 / pnpm 10.28.0 install and Node 24 Alpine Docker image build passed for the dependency-fix tree later committed as `f96a578`. The Docker build's recorded diff hash matches the `c48a93c..f96a578` commit diff.
- Focused security and compatibility checks passed for formula content, guarded outbound requests, quiz feedback, audio responses, patched braces, AI SDK response bounds, glob/watch patterns, Sharp pixel conversion, and YAML parsing.
- At `f96a578`, 1,325 unit tests passed with 3 pre-existing skips; TypeScript, ESLint, production build, four-locale key alignment, and the low-threshold dependency gate passed. The MiroFish contract gate passed 97 tests with 2 skips, its browser gate passed 3 flows, and the full browser suite passed 47 flows with 1 skip.
- A non-fixture local benchmark at `f96a578` passed all four budgets: first meaningful paint 379 ms, classroom start 1,730 ms, mocked provider p95 18 ms, and reconnect 248 ms. These are local synthetic measurements, not live-provider latency.
- The first consolidated `ops:verify` run at `f96a578` passed but resolved a machine-wide pnpm 11 for its subprocesses. The final release gate must run again on the final clean commit using the repository-pinned pnpm 10.28.0; `ops:verify` now selects it and includes the complete required gate set.

## Release gates still to record

- [ ] Final clean-main `ops:verify`, fresh non-fixture benchmark, dependency audit, and Docker build or matching Docker tree proof on the immutable candidate.
- [ ] Protected Preview deployment reaches READY with matching project, exact clean-tree candidate metadata, successful build logs, and expected unauthenticated SSO redirect. A CLI upload's self-reported SHA must not be mistaken for Git provenance.
- [ ] Preview API and browser journeys verify the public demo, a synthetic teacher classroom flow where authorized credentials are available, keyboard/mobile/zoom behavior, and no new console errors.
- [ ] Push the validated main commit; verify the Git-triggered production deployment reports that exact commit SHA and the `open-raic.com` alias serves it. Run production health and milestone/classroom smoke checks. Record any owner-authenticated journey separately from automated proof.
- [ ] Publish immutable `v0.9.3` tag and GitHub release pointing to the verified production commit, with the deployment ID, smoke results, and limitations. Observe stable production operation for at least 24 hours before starting v0.10.0.

## Rollback

Before publication, the known-good production deployment is `dpl_HFVsa83hvR4H1aRbuapZpMDTG4NA` at baseline SHA `2aa083c`. If the new application build regresses, roll the alias back to that deployment and verify health and alias ownership. Application rollback does not reverse database writes or external provider side effects; this slice does not plan a schema migration.
