# Governed Source Documents

The `sourceDocumentsV2` path gives authenticated teachers a private, ephemeral PDF source boundary without sending the file through a Vercel Function request body.

## Storage Boundary

- Create a dedicated Vercel Blob store with private access.
- Set its read-write token as `RAIC_SOURCE_BLOB_READ_WRITE_TOKEN` in each environment that should enable governed PDF sources.
- Do not reuse the public `BLOB_READ_WRITE_TOKEN` used by classroom publishing.
- Keep `RAIC_SECRET_ENCRYPTION_KEY` configured. It signs one-hour upload capabilities bound to the teacher, organization, and server-issued pathname.
- Keep `CRON_SECRET` configured so Vercel can invoke hourly abandoned-upload cleanup.

`/api/health` reports `capabilities.sourceDocumentsV2: true` only when the private token and signing key are configured. The source picker stays disabled otherwise.

## Request Flow

1. An authenticated teacher requests a short-lived upload intent.
2. The browser uploads directly to the private Blob store with multipart client upload.
3. The extraction route verifies teacher ownership, private-store metadata, MIME type, and the `%PDF-` signature.
4. Extraction produces a bounded `DocumentArtifact` with page blocks, citation IDs, diagnostics, and generation context.
5. The extraction route deletes the raw Blob before returning the artifact. If deletion fails, the request fails closed.
6. The hourly cleanup deletes unconsumed uploads older than one hour.

## Limits

| Boundary | Limit |
| --- | ---: |
| Private client upload | 50 MB |
| Legacy `/api/parse-pdf` multipart request | 4 MB |
| Pages | 200 |
| Artifact source text | 200,000 characters |
| Generation context | 50,000 characters |
| Extraction | 240 seconds |
| Upload capability and abandonment window | 1 hour |

The legacy route remains available for local and anonymous callers. It verifies MIME and signature, sanitizes failures, and bounds inline image output.

## Data Handling

- Artifacts do not contain original filenames, inline asset data, provider response bodies, or raw provider errors.
- Logs may contain artifact IDs, counts, safe error categories, and timing, but never source text, filenames, URL credentials, query strings, inline assets, or provider messages.
- Raw PDFs are not persisted with classrooms. Only the bounded artifact is available to the in-progress authoring session.
