# Release Evidence: v0.8.1 Dependency Security

Target release: `v0.8.1`

Evidence status: implementation in progress.

## Scope

- Patch direct vulnerable lines for Vitest, Vite, Undici 7, js-yaml 4, and ECharts.
- Upgrade compatible parent packages for the Blob and LangChain dependency trees.
- Refresh compatible transitive resolutions and retain only documented, temporary overrides.
- Add the low-threshold dependency audit to CI and a weekly scheduled workflow.
- Make no public API, persistence, capability, or runtime feature changes.

## Branch Evidence

- Development uses the non-iCloud checkout at `/Users/matthewgore/Developer/open-raic-milestones` with Node `24.14.0` and pnpm `10.28.0`.
- Baseline normalization merged through PR #78 before this dependency slice.
- `pnpm install --frozen-lockfile`: pass.
- `pnpm security:dependencies`: pass with zero low-or-higher locked dependency advisories.
- `pnpm check`, `pnpm lint`, `tsc --noEmit`, and `pnpm check:i18n-keys`: pass.
- `pnpm test`: 155 files passed, 1 intentionally skipped; 977 tests passed, 3 skipped.
- `pnpm build`: pass with all application routes compiled and 52 static pages generated.
- `pnpm test:mirofish:gate`: 20 files passed; 97 tests passed, 2 skipped; TypeScript pass.
- PR #79 hosted checks: Ops Drift, MiroFish Contract Gate, Lint/Typecheck/Unit Tests, E2E Tests, and Vercel all pass. The full hosted E2E gate completed in 3m38s.
- Protected preview deployment `dpl_7xSviZD2qssmZUizqgf1o49WawqN` is Ready. Its `/api/health` response reports `success: true`, `status: ok`, and version `0.8.1`.
- Preview capability truth remains explicit: image generation and storage are ready; web search, video, TTS, and MiroFish remain unavailable. Preview encryption is not ready because its isolated environment does not configure `RAIC_SECRET_ENCRYPTION_KEY`; production readiness remains a separate release gate.
- Strict clean-main gates, benchmark, `ops:verify`, production health proof, zero GitHub Dependabot alerts, immutable tag, and GitHub release evidence remain required before publication.
