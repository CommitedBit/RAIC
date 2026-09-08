# Formula content security — September 8, 2026 (UTC)

Stored or imported formula snapshots previously reached both the playback and editor HTML sinks without sanitization. A formula containing an image error handler survived static rendering in both views. Standard KaTeX formulas and the legacy SVG path representation were legitimate controls.

`lib/utils/sanitize-latex-html.ts` provides the shared formula policy. It retains KaTeX layout spans, SVG path/line geometry and presentation MathML, including accessible TeX annotations. It removes executable elements, event handlers, URL-bearing attributes, embedded resources, SVG animation and unsafe CSS. This policy is distinct from the existing prose policy because formulas require SVG geometry and positioning that prose does not.

Both formula renderers sanitize immediately before inserting HTML. Server classroom normalization applies the same formula-only policy on JSON/Postgres reads and writes, including updates and older records. Local scene saves, legacy loads, thumbnails and backup import/export use it as well. The data traversal covers nested canvases and both whiteboard representations without rewriting code examples, plain table text, interactive HTML strings, TeX source or legacy SVG fields. Read-time normalization returns a safe copy; it does not silently migrate historical data on disk.

Regression coverage includes the original render-sink trigger, alternate SVG/MathML/raw-text/CSS inputs, 34 comparisons against the installed KaTeX renderer, shared/deep JSON containers, JSON persistence, the Postgres repository boundary, and the IndexedDB helper boundary. PostgreSQL and Dexie I/O are mocked in the focused storage tests; those tests do not claim a live database check. The browser regression seeds unsafe legacy records into a real browser database, checks formula rendering and accessible MathML, and verifies that opening and reloading the classroom causes neither the probe request nor its event handler.

Run the focused checks with:

```sh
corepack pnpm exec tsc --noEmit
corepack pnpm exec vitest run tests/server/latex-content-safety.test.ts tests/lib/sanitize-latex-html.test.ts tests/server/classroom-formula-storage.test.ts tests/lib/formula-local-storage.test.ts tests/server/classroom-storage.test.ts tests/server/sanitize-slide-html.test.ts
PLAYWRIGHT_USE_SYSTEM_CHROME=true CI=1 corepack pnpm exec playwright test e2e/tests/formula-safety.spec.ts
```

The standard unit, lint, formatting, build, browser, dependency and benchmark gates remain required for integration. Keep exact candidate verification receipts with the release package. No existing lesson requires a destructive migration. If a valid formula representation needs an additional inert attribute, add a compatibility fixture and update the shared policy; reverting to the raw HTML sink would reopen the defect.
