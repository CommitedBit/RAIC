# Dependency Security Policy

Open-RAIC treats the frozen `pnpm-lock.yaml` graph, not package manifest ranges, as the release dependency inventory. Every release runs `pnpm security:dependencies` at the `low` threshold. The same gate runs in pull requests and in the weekly `Dependency Security` workflow.

`pnpm audit` currently receives HTTP 410 from npm's retired full-audit endpoint. The project command attempts the required `pnpm audit --audit-level low` invocation first, then uses npm's supported bulk advisory endpoint only for that specific retirement response. Any other package-manager failure remains a hard failure.

## Temporary Overrides

| Package | Pinned version | Current source | Removal condition |
| --- | --- | --- | --- |
| `@babel/core` | `7.29.7` | Legacy Babel resolution retained by Next/Jest tooling | Remove when the normal frozen resolution contains no `@babel/core <=7.29.0`. |
| `esbuild` | `0.28.1` | Vite 7 permits both 0.27 and 0.28 | Remove when Vite's normal frozen resolution selects `esbuild >=0.28.1`. |
| `form-data` | `4.0.6` | OpenAI 4 and `@types/node-fetch` | Remove when the current OpenAI line resolves `form-data >=4.0.6` without an override. |
| `hono` | `4.12.30` | Latest MCP SDK permits an older Hono floor | Remove when the MCP dependency graph selects `hono >=4.12.25` normally. |
| `js-yaml@3` | `3.15.0` | Jest 29/Istanbul legacy toolchain | Remove when the workspace test toolchain no longer resolves js-yaml 3. |
| `qs` | `6.15.3` | Express/body-parser transitive dependency | Remove when the normal Express dependency graph resolves `qs >=6.15.2`. |
| `undici@6` | `6.27.0` | Vercel Blob 2 permits an older Undici 6 floor | Remove when the Blob dependency graph selects `undici >=6.27.0` normally. |
| `ws` | `8.21.1` | OpenAI 4, LangSmith, and jsdom | Remove when every supported parent resolves `ws >=8.21.0` normally. |

The pre-existing `postcss` override is outside the `v0.8.1` security change. Overrides must not be broadened to major-version substitutions, and each removal condition is rechecked during dependency updates.
