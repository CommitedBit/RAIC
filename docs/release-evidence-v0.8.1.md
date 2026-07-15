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
- Strict clean-main gates, browser automation, benchmark, `ops:verify`, preview proof, production health proof, zero GitHub Dependabot alerts, immutable tag, and GitHub release evidence remain required before publication.
