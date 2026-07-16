# Release Evidence: v0.9.1 Homepage Simplification

Date: 2026-07-15
Target release: `v0.9.1`

Evidence status: in progress. The candidate must pass the clean Node 24 gate, protected preview review, production deployment, live homepage checks, production smokes, immutable tag, and GitHub release publication.

## Scope

- Replace the duplicate public demo card with one unframed `/example` link while preserving the existing test hook and example seed flow.
- Replace the public empty schedule panel with a compact action and flatten populated or teacher/Discord schedule presentation.
- Keep the visible slogan removed while retaining the accessible page heading.
- Constrain the agent selector to one representative avatar on mobile and a viewport-bounded dropdown.
- No request, response, persistence, capability, authentication, or provider-governance changes.

## Node 24 Verification

- [ ] Frozen install in a temporary non-iCloud `main` harness
- [ ] Secrets scan, dependency audit, drift, and i18n checks
- [ ] TypeScript, formatting, lint, unit tests, and production build
- [ ] MiroFish contract gate and dedicated E2E
- [ ] Full Playwright suite at desktop and mobile viewports
- [ ] Milestone benchmark and `ops:verify`

## Preview Evidence

- [ ] GitHub CI and Vercel preview checks pass for the exact candidate commit
- [ ] Protected preview inspected through authenticated access without weakening deployment protection
- [ ] Screenshots captured at `1680x1000`, `390x844`, and `320x568`
- [ ] No horizontal overflow; prompt appears in the first mobile viewport
- [ ] Demo seeding, schedule dialog, populated schedule, and teacher Discord states verified

## Production And Release

- [ ] Production deployment is Ready and serves the merged candidate commit
- [ ] `https://open-raic.com` renders the simplified homepage at all three target viewports
- [ ] `/api/health` returns HTTP 200 with version `0.9.1` and unchanged capability truth
- [ ] Production milestone and classroom smokes pass
- [ ] Immutable `v0.9.1` tag pushed and GitHub release published

## Rollback

- Promote Vercel deployment `GNSvVKhDsSGwYMgECjeR82UDJj2K`, the last verified `v0.9.0` production state.
- Revert the focused homepage pull request if a forward fix is preferable.
- No data or schema rollback is required.
