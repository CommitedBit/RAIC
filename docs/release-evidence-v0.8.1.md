# Release Evidence: v0.8.1 Dependency Security

Date: 2026-07-15
Target release: `v0.8.1`

Evidence status: complete. The dependency audit, clean Node 24 gate, protected preview, production deployment, production smokes, immutable tag, and GitHub release are verified.

## Baseline And Scope

- Baseline normalization merged through PR #78 as `d432d3632824d7c326d69e1bfff7faaf18f92aee`.
- Dependency security merged through PR #79 as `f6b78acd30b268d83631f6015c8799dd950ecb33`.
- Direct vulnerable lines were upgraded for Vitest, Vite, Undici 7, js-yaml 4, and ECharts.
- Compatible parent packages were upgraded for the Vercel Blob and LangChain dependency trees.
- Residual transitive advisories use eight narrow, documented overrides with explicit removal conditions in [Dependency Security Policy](./dependency-security.md).
- `security:dependencies` attempts `pnpm audit --audit-level low`, then uses npm's supported bulk endpoint only for the current HTTP 410 retirement response.
- The audit runs in CI and in the weekly `Dependency Security` workflow.
- No public request, response, persistence, capability, or runtime feature behavior changed.

## Node 24 Verification

- Development uses the non-iCloud checkout at `/Users/matthewgore/Developer/open-raic-milestones` with Node `24.14.0` and pnpm `10.28.0`.
- `pnpm install --frozen-lockfile`: pass.
- `pnpm security:dependencies`: zero low-or-higher advisories across 1,373 locked registry packages.
- GitHub Dependabot API after merge: zero open alerts, reduced from 34.
- `pnpm check`, `pnpm lint`, `tsc --noEmit`, and `pnpm check:i18n-keys`: pass.
- `pnpm test`: 155 files passed, 1 intentionally skipped; 977 tests passed, 3 skipped.
- `pnpm build`: pass with all application routes compiled and 52 static pages generated.
- `pnpm test:mirofish:gate`: 20 files passed; 97 tests passed, 2 skipped; TypeScript pass.
- `pnpm test:mirofish:e2e`: all 3 browser scenarios passed.
- `pnpm test:e2e`: 36 browser scenarios passed, 1 fixture-dependent scenario skipped.
- `pnpm benchmark:milestone`: artifact `19532933-df71-4433-96b9-56f0d30b0d21` passed all budgets: first meaningful paint 1,156 ms, classroom start 3,730 ms, provider roundtrip p95 41 ms, and reconnect 494 ms.
- `pnpm ops:verify`: passed its canonical drift, secret, formatting, build, benchmark, MiroFish contract/E2E, and full Playwright gates with Node 24 and Corepack pnpm 10.28.
- Final main CI run [29453210262](https://github.com/CommitedBit/RAIC/actions/runs/29453210262): Ops Drift, MiroFish Contract Gate, Lint/Typecheck/Unit Tests, dependency audit, and E2E all passed.

## Preview Evidence

- PR #79 passed all repository-owned checks and Vercel deployment checks.
- Protected preview deployment `dpl_7xSviZD2qssmZUizqgf1o49WawqN` is Ready. Its `/api/health` response reports `success: true`, `status: ok`, and version `0.8.1`.
- Preview capability truth remains explicit: image generation and storage are ready; web search, video, TTS, and MiroFish remain unavailable. Preview encryption is not ready because its isolated environment does not configure `RAIC_SECRET_ENCRYPTION_KEY`; production readiness remains a separate release gate.

## Production And Release

- Production deployment `dpl_G6HwUmEVxYSDVeEomi6vs2Zy8HB7` is Ready and serves <https://open-raic.com>.
- Production `/api/health` reports version `0.8.1`; auth, Discord, encryption, Postgres storage, and image generation are ready.
- Production truthfully reports web search, TTS, video, and MiroFish unavailable. None was enabled to satisfy this release.
- `pnpm smoke:production:milestone`: 12 passed, 0 failed, 0 blocked, and 4 optional unavailable capabilities skipped.
- `pnpm smoke:production:classroom`: 3 automated authorization/health guards passed and 0 failed. The five signed-in mutation checks were listed but not run because this patch changes no classroom behavior.
- Annotated tag `v0.8.1` resolves to `f6b78acd30b268d83631f6015c8799dd950ecb33` and was pushed without moving any prior tag.
- GitHub release: <https://github.com/CommitedBit/RAIC/releases/tag/v0.8.1>.

## Rollback

- Roll back production to `dpl_8dLQTSE5JXs61utc6DQ9bppkFFQ3` at <https://raic-mkjwfawqp-vangorestudios-6959s-projects.vercel.app>.
- Revert PR #79 to restore the prior dependency graph and remove the new audit workflow.
- No schema, data, request, response, or capability rollback is required.
