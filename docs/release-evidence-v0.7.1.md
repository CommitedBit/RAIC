# Release Evidence: v0.7.1 Reliability Hardening

Date: 2026-07-14
Target release: `v0.7.1`
Evidence status: implementation and clean non-iCloud Node 24 unit verification complete; preview, merge, production smoke, tag, and GitHub release evidence pending.

## Baseline

- Base: `main` at `602c2f12e8f73792f3b88193b50831f8b9e1e99b`, including merged provider request-failure telemetry from PR #70.
- Selective backport snapshot: `68cb53e`, replayed without stale commit `dad57b8`.
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

Clean temporary checkout: `/tmp/openraic-v071.ssJqpw/repo`

- `pnpm exec vitest run` focused hardening set: 8 files, 146 tests passed.
- Provider-base-URL and source-required route set: 2 files, 16 tests passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run lint`: passed.
- `pnpm run check`: passed.
- `pnpm test`: 152 files passed, 1 skipped; 960 tests passed, 3 skipped.

## Release Gates

Pending until the candidate is pushed and merged:

- GitHub CI and Vercel preview, including MiroFish contract and Playwright gates.
- Clean-main secrets scan, drift checks, i18n, TypeScript, formatting, lint, unit tests, build, MiroFish gates, Playwright, benchmark, and `ops:verify`.
- Production milestone and classroom smokes plus `/api/health` capability verification.
- Immutable `v0.7.1` tag and GitHub release publication.

## Rollback

- Revert iframe isolation, bounded retries/telemetry, and networking redaction independently.
- No schema migration or public request/response rollback is required.
