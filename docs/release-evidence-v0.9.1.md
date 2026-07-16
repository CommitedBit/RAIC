# Release Evidence: v0.9.1 Homepage Simplification

Date: 2026-07-15
Target release: `v0.9.1`

Evidence status: complete. The clean Node 24 gate, protected preview review, production deployment, live homepage checks, production smokes, immutable tag, and GitHub release publication are verified.

## Scope

- Replace the duplicate public demo card with one unframed `/example` link while preserving the existing test hook and example seed flow.
- Replace the public empty schedule panel with a compact action and flatten populated or teacher/Discord schedule presentation.
- Keep the visible slogan removed while retaining the accessible page heading.
- Constrain the agent selector to one representative avatar on mobile and a viewport-bounded dropdown.
- No request, response, persistence, capability, authentication, or provider-governance changes.

## Node 24 Verification

- [x] Frozen install with Node 24.14.0 and pnpm 10.28.0 in a temporary non-iCloud `main` harness at candidate `15e6511`
- [x] Secrets scan, zero low-or-higher dependency advisories across 1,373 locked packages, drift, and i18n checks
- [x] TypeScript, formatting, lint, 162 passing unit files with 1 skipped, 1,009 passing tests with 3 skipped, and the production build
- [x] MiroFish contract gate: 20 files and 97 tests passed with 2 skipped; dedicated E2E: 3 passed
- [x] Full Playwright suite: 40 passed with 1 intentional skip
- [x] Milestone benchmark: first meaningful paint 484 ms, classroom start 989 ms, provider p95 22 ms, and reconnect 411 ms; every threshold passed
- [x] `ops:verify` repeated the canonical build, MiroFish, and full Playwright gates successfully

## Preview Evidence

- [x] PR [#84](https://github.com/CommitedBit/RAIC/pull/84) passed Ops Drift, MiroFish Contract, lint/typecheck/unit, E2E, and Vercel checks for candidate `15e6511`
- [x] Protected preview `B1ZbTFV7b7e695kanDNUMEuMTT7F` was inspected through temporary authenticated access without changing deployment protection
- [x] Preview screenshots captured at `1680x1000`, `390x844`, and `320x568`; page widths exactly matched each viewport
- [x] Prompt top positions were 610.5 px, 439.9 px, and 421.6 px respectively; the mobile agent trigger was 74 px wide and its 320 px dropdown remained between x=19 and x=291
- [x] One demo link seeded the four-scene classroom, the schedule dialog opened and closed, the mobile agent menu expanded accessibly, and the browser console had no errors
- [x] Preview `/api/health` returned HTTP 200 with version `0.9.1` and unchanged capability truth

## Production And Release

- [x] Production deployment `GVBQVZNtPVSQWcqhAypHCMPoKinL` is Ready at `raic-osp0sdc7u-vangorestudios-6959s-projects.vercel.app` and serves merge commit `34589dc`
- [x] `https://open-raic.com` renders the simplified homepage at all three target viewports with no horizontal overflow, no visible legacy demo or empty-schedule copy, and only the screen-reader page heading
- [x] The live demo seeded and opened the example classroom; the compact schedule dialog opened and closed; the production browser console had no errors
- [x] `/api/health` returns HTTP 200 with version `0.9.1`; source documents, image generation, auth, Discord, encryption, and Postgres are ready while web search, video, TTS, and MiroFish remain unavailable
- [x] Production milestone smoke: 12 passed and 4 optional capabilities skipped; classroom smoke: 3 automated guards passed with 5 signed-in mutation checks explicitly manual
- [x] Post-merge GitHub CI run `29475317191` passed all four jobs
- [x] Immutable `v0.9.1` tag pushed and [GitHub release published](https://github.com/CommitedBit/RAIC/releases/tag/v0.9.1)

## Rollback

- Promote Vercel deployment `GNSvVKhDsSGwYMgECjeR82UDJj2K`, the last verified `v0.9.0` production state.
- Revert the focused homepage pull request if a forward fix is preferable.
- No data or schema rollback is required.
