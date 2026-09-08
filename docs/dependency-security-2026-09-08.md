# Dependency security refresh — September 8, 2026 (UTC)

The graph at `2aa083cddb237cd5e7f55de953abb9029d898c41` contains 11 low-or-higher advisories across six package families. This slice updates those families within the existing parents' accepted release lines. It changes dependency resolution only; formula-content and outbound-transport findings are separate stabilization work.

| Package | Resolution | Reason and compatible parent |
| --- | --- | --- |
| `sanitize-html` | `2.17.7`, direct minimum `^2.17.7` | Patches the SVG SMIL URI-list policy bypass; retains the application's existing formatting policy. |
| `fast-uri` | `3.1.6` | Refreshes the existing pin for Ajv 8's `^3.0.1` range and fixes four URI normalization advisories. |
| `qs` | `6.16.0` | Refreshes the existing pin within Express 5/body-parser 2 ranges; fixes the array-limit bypass and attacker-controlled `isBuffer` denial of service. |
| `browserslist@4` | `4.28.7` | Fits Babel and shadcn's existing v4 ranges; fixes the cache-growth and custom-stats advisories. |
| `@humanfs/node` | `0.16.8` | Fits ESLint 9's `^0.16.6` range; fixes symlink-following recursive copies. |
| `postcss-selector-parser@7` | `7.1.3` | Fits shadcn's `^7.1.0` range; fixes unbounded AST recursion while preserving independent older-major paths. |

The targeted pnpm update retained the vulnerable transitive Browserslist, humanfs and selector-parser entries. The explicit overrides make their security floors deterministic without upgrading their parent tools. Remove each override once the corresponding parents require a patched version, or a separately reviewed removal produces a frozen graph with no affected resolution and passes the same low-threshold audit and compatibility checks. The existing fast-uri/qs overrides have the same removal condition.

The regenerated lockfile also refreshes dependencies of the affected families: humanfs core/types, Browserslist's browser/version datasets, and sanitizer dependencies. Node 24 satisfies their engine requirements. The existing OpenAI 4/Zod 4 peer warning predates this slice and remains a separate compatibility concern.

Verification uses `pnpm install --frozen-lockfile`, `pnpm security:dependencies`, the existing sanitizer/table-text and export regressions, and the normal Node 24 type/lint/build/unit/browser/benchmark gates. The dependency audit proves the locked graph's advisory status, not the absence of unrelated application vulnerabilities. Keep prior release evidence dated; do not treat its older audit result as current evidence.

For a functional regression, select a compatible patched replacement and repeat the gates before promotion. The current production deployment remains the rollback reference until a replacement candidate is verified and authorized for deployment.
