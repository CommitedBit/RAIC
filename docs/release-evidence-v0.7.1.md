# Release Evidence: v0.7.1 Reliability Hardening

Date: 2026-07-14
Target release: `v0.7.1`
Evidence status: release complete. Preview, merge, clean-main Node 24 gates, production deployment and smokes, immutable tag, and GitHub release publication are recorded.

## Baseline

- Base: `main` at `602c2f12e8f73792f3b88193b50831f8b9e1e99b`, including merged provider request-failure telemetry from PR #70.
- Selective backport snapshot: `68cb53e`, replayed without stale commit `dad57b8`.
- Release PR: #71, merged with rebase at `49b7c2df2dc75365866fee8778b61b96e064e58e`.
- Existing `v0.7.0` tag was not moved or recreated.
- Missing `v0.7.0` GitHub release object was published at <https://github.com/CommitedBit/RAIC/releases/tag/v0.7.0>.

## Scope

- Generated `srcDoc` interactive widgets no longer receive `allow-same-origin`; URL-backed embeds and MiroFish keep their existing sandbox behavior.
- Scene content uses two retries and scene actions use one retry for transient 408/409/425/429/5xx, rate-limit, timeout, network, and explicitly retryable failures.
- Abort, authentication, validation, and governed-provider failures remain terminal. Retry delays are short and capped.
- Internal telemetry records the route, sanitized category, attempt count, delay, and scheduled/recovered/failed outcome. Public API response contracts are unchanged.
- Proxy logs strip credentials, URL userinfo, query strings, and fragments. Provider-base-URL, loopback, `NO_PROXY`, and SSRF paths have focused regression coverage.
- Source-required presets still fail closed when neither attached source content nor configured web search is available.

## Node 24 Verification

Clean temporary checkouts: `/tmp/openraic-v071.ssJqpw/repo` for the candidate and `/tmp/openraic-v071-main.LsCdzw/repo` for merged-main release gates.

- `pnpm exec vitest run` focused hardening set: 8 files, 146 tests passed.
- Provider-base-URL and source-required route set: 2 files, 16 tests passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run lint`: passed.
- `pnpm run check`: passed.
- `pnpm test`: 152 files passed, 1 skipped; 960 tests passed, 3 skipped.
- `pnpm run build`: passed with 52 static pages.
- `pnpm run test:mirofish:gate`: 20 files passed; 97 tests passed, 2 skipped; TypeScript passed.
- `pnpm run test:mirofish:e2e`: 3 browser tests passed.
- `CI=1 pnpm run test:e2e`: 34 browser tests passed, 1 credential-dependent test skipped.
- `pnpm run benchmark:milestone`: passed with artifact `8694f8d3-fac7-4d29-bc2c-06830cd24761`; all four metrics were within budget.
- `pnpm run ops:verify`: passed, including its canonical build and browser-gate replay.

## Preview And Production

- PR #71 passed Ops Drift/secrets, MiroFish Contract Gate, lint/typecheck/unit, E2E, and Vercel preview checks.
- Preview deployment: <https://raic-fmdghgygz-vangorestudios-6959s-projects.vercel.app>. Deployment protection returned the expected unauthenticated SSO redirect for `/api/health`.
- Production deployment for `49b7c2d`: <https://raic-rarau209w-vangorestudios-6959s-projects.vercel.app>.
- `https://open-raic.com/api/health` returned HTTP 200 with version `0.7.1`.
- Production health reported auth, Discord, encryption, Postgres storage, and image generation ready. Web search, TTS, video, and MiroFish remained unavailable.
- `pnpm run smoke:production:milestone`: 12 passed, 0 failed, 0 blocked, 4 optional capabilities skipped.
- `pnpm run smoke:production:classroom`: 3 automated guards passed, 0 failed; 5 signed-in manual checks were listed.

## Release

- Tag: `v0.7.1`, annotated at `49b7c2df2dc75365866fee8778b61b96e064e58e`.
- GitHub release: <https://github.com/CommitedBit/RAIC/releases/tag/v0.7.1>, published 2026-07-14.

## Rollback

- Revert iframe isolation, bounded retries/telemetry, and networking redaction as separate commits.
- No schema migration or public request/response rollback is required.
