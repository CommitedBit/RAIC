# Outbound request protection

The stabilization candidate repairs roadmap finding R3: request-supplied provider base URLs previously skipped SSRF checks in development and test mode, and most provider requests followed redirects without checking the next destination. The original regression run reproduced eight failures: two environment-dependent bypasses and six internal address forms accepted through DNS.

## Enforcement

- API base URL checks run in every environment. The server injects a validated transport into language, image, video, speech, transcription, PDF and web-search adapters, including their SDKs, polling requests, uploads and returned download URLs. Browser-direct local-model calls retain their existing transport.
- Native Node fetch retains Request objects, body streams, FormData, init overrides, cancellation and HTTP redirect method rules. A request-specific Undici dispatcher checks each followed destination before dispatch, with at most five follow-ups. Existing routes that reject redirects still do so.
- Cross-origin redirects retain only a small set of non-credential request headers. They cannot replay a request body, even for 307/308 responses. HTTPS-to-HTTP redirects are rejected. These restrictions prevent forwarding provider keys in headers or request bodies to another origin.
- Public socket connections resolve the hostname through the address guard and use those same vetted addresses. A DNS answer changing between URL validation and connection is checked again, closing that rebinding gap. All returned addresses must be acceptable.
- Public HTTP(S) proxy tunnels use a vetted IP in CONNECT, while the target HTTP Host header and TLS server name remain the original hostname. This prevents a proxy-side second DNS lookup from bypassing the guard. Environment proxy selection, protocol-specific settings, NO_PROXY and an explicitly configured Google provider proxy are retained.
- IPv4 shared, benchmarking, documentation, multicast and reserved ranges are blocked alongside private and loopback addresses. IPv6 comparisons use numeric words so compressed, expanded and mixed IPv4 forms agree. Mapped IPv4 and well-known NAT64 addresses are checked for embedded private destinations; non-global-unicast, local translation and selected special ranges are blocked. Address-space references: [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/), [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/).

## Self-hosted compatibility

An effective provider base URL supplied by organization configuration or server bootstrap configuration can access its exact configured origin. This server-only provenance survives a personal key or model override but is removed when a personal or legacy request replaces the base URL. A changed scheme, hostname or port loses the exception. Request-scoped image overrides cannot supply it.

`ALLOW_LOCAL_NETWORKS=true` or `1` remains the explicit deployment-wide opt-in for trusted self-hosted installations. It does not enable non-HTTP protocols, URL credentials, credential forwarding on cross-origin redirects or HTTPS downgrades. Provider defaults alone do not authorize arbitrary private destinations.

Public proxy targets now require the configured proxy to support CONNECT to a public IP. A proxy enforcing hostname-only CONNECT rules may require an administrator to update those rules; the transport fails closed rather than performing a second unvalidated DNS lookup. Explicitly configured local provider origins retain hostname-based tunnels. Only HTTP(S) proxies are supported by this transport.

## Verification and release boundary

Tests use synthetic credentials, mocked providers, native fetch with network-disabled Undici fixtures, and owned loopback HTTP/proxy fixtures. They cover the original triggers, public-address controls, redirects, credential stripping, body semantics, cancellation, direct and proxy DNS rebinding, all image/video adapters, language SDKs, Whisper, returned TTS/PDF URLs, and background media downloads. Governance controls distinguish server-owned endpoints from personal and request-scoped values.

Independent review found a candidate URL-parser mismatch for paths beginning `//` and cancellation delayed by first-hop DNS validation. The parent reproduced three failing diagnostics, corrected the shared boundary, and retained permanent regressions. The reviewer stopped before its final consolidated report because of an automatic security-content flag. Its saved evidence and the parent's subsequent verification are retained; this is not an independent clean sign-off.

The exact candidate commit, independent-review artifact and completed repository gates are recorded in the accompanying implementation evidence. Local results do not establish live provider connectivity, authenticated production behavior or production deployment. No paid provider calls are required for these checks. Deployment network policy should still restrict egress; application address checks cannot establish the trustworthiness of an approved provider or administrator-controlled proxy.

This slice keeps package version 0.9.2. It does not change provider enablement, credentials, consent, retention, production configuration or deployment state. Rollback is the preceding validated commit together with its lockfile; use the release runbook and preserve the current production artifact until an authorized candidate has passed its separate release gates.
