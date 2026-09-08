/**
 * SSRF (Server-Side Request Forgery) protection utilities.
 *
 * Validates URLs to prevent requests to internal/private network addresses.
 * Used by any API route that fetches a user-supplied URL server-side.
 */
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

const LOCAL_NETWORKS_BLOCKED_MESSAGE =
  'Local/private network URLs are not allowed. ' +
  'Set ALLOW_LOCAL_NETWORKS=true only for trusted self-hosted deployments.';

function normalizeAddress(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\.+$/, '');
}

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }
    return Number.parseInt(part, 10);
  });

  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets;
}

/** Expand an IPv6 address into 8 numeric hextets. Returns null for invalid input. */
function expandIPv6(ip: string): number[] | null {
  let normalized = normalizeAddress(ip);
  if (!normalized.includes(':')) return null;

  const lastPart = normalized.split(':').pop() || '';
  if (lastPart.includes('.')) {
    const dottedIPv4 = parseIPv4(lastPart);
    if (!dottedIPv4) return null;

    const [first, second, third, fourth] = dottedIPv4;
    const high = ((first << 8) | second).toString(16);
    const low = ((third << 8) | fourth).toString(16);
    normalized = `${normalized.slice(0, -lastPart.length)}${high}:${low}`;
  }

  const sides = normalized.split('::');
  if (sides.length > 2) return null;

  let parts: string[];
  if (sides.length === 2) {
    const left = sides[0] ? sides[0].split(':') : [];
    const right = sides[1] ? sides[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    // `::` must compress at least one hextet.
    if (missing <= 0) return null;
    parts = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    parts = normalized.split(':');
  }

  if (parts.length !== 8) return null;
  if (parts.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null;

  return parts.map((p) => Number.parseInt(p, 16));
}

export function isPrivateIP(ip: string): boolean {
  const normalized = normalizeAddress(ip);
  // Scoped interface addresses are local even when Node accepts them as IPv6.
  if (normalized.includes('%')) return true;
  const ipv4 = parseIPv4(normalized);
  if (ipv4) {
    const [first, second, third, fourth] = ipv4;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) || // shared address space
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0 && fourth !== 9 && fourth !== 10) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224 // multicast and reserved space
    );
  }

  const hextets = expandIPv6(normalized);
  if (!hextets) return false;
  const ipv6FirstHextet = hextets[0];
  const embeddedIPv4 = (high: number, low: number) =>
    `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;

  // Compare numeric words so compressed, expanded and dotted-tail forms agree.
  if (hextets.slice(0, 5).every((word) => word === 0) && hextets[5] === 0xffff) {
    return isPrivateIP(embeddedIPv4(hextets[6], hextets[7]));
  }
  // Well-known NAT64 /96. Local-use translation prefixes are blocked below.
  if (
    hextets[0] === 0x64 &&
    hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((word) => word === 0)
  ) {
    return isPrivateIP(embeddedIPv4(hextets[6], hextets[7]));
  }

  if (
    (ipv6FirstHextet & 0xe000) !== 0x2000 || // not global unicast
    (ipv6FirstHextet === 0x2001 && hextets[1] === 0xdb8) || // documentation
    (ipv6FirstHextet === 0x2001 && (hextets[1] & 0xfff0) === 0x0010) || // ORCHID
    (ipv6FirstHextet === 0x2001 && (hextets[1] & 0xfff0) === 0x0020) || // ORCHIDv2
    (ipv6FirstHextet === 0x2001 && hextets[1] === 0x0002) || // benchmarking
    (ipv6FirstHextet === 0x3fff && (hextets[1] & 0xf000) === 0) // documentation /20
  ) {
    return true;
  }

  // 6to4 tunnel: 2002::/16 — embedded IPv4 sits in bits 16-47
  if (ipv6FirstHextet === 0x2002) {
    if (hextets) {
      const embedded = `${hextets[1] >> 8}.${hextets[1] & 0xff}.${hextets[2] >> 8}.${hextets[2] & 0xff}`;
      if (isPrivateIP(embedded)) return true;
    }
  }

  // Teredo: both the tunnel server and the XOR-inverted client must be public.
  if (ipv6FirstHextet === 0x2001) {
    if (hextets && hextets[1] === 0x0000) {
      if (isPrivateIP(embeddedIPv4(hextets[2], hextets[3]))) return true;
      const high = hextets[6] ^ 0xffff;
      const low = hextets[7] ^ 0xffff;
      const embedded = `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
      if (isPrivateIP(embedded)) return true;
    }
  }

  // ISATAP interface ID: 0000:5efe:<IPv4> or 0200:5efe:<IPv4>.
  if (hextets && (hextets[4] === 0x0000 || hextets[4] === 0x0200) && hextets[5] === 0x5efe) {
    const embedded = `${hextets[6] >> 8}.${hextets[6] & 0xff}.${hextets[7] >> 8}.${hextets[7] & 0xff}`;
    if (isPrivateIP(embedded)) return true;
  }

  return false;
}

/**
 * Validate a URL against SSRF attacks.
 * Returns null if the URL is safe, or an error message string if blocked.
 */
export function localNetworksAllowed(): boolean {
  return process.env.ALLOW_LOCAL_NETWORKS === 'true' || process.env.ALLOW_LOCAL_NETWORKS === '1';
}

/** Resolve and return the exact vetted addresses used by the socket connector. */
export async function resolvePublicAddresses(host: string) {
  const hostname = normalizeAddress(host);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error(LOCAL_NETWORKS_BLOCKED_MESSAGE);
  }
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await dns.lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw new Error('Unable to verify hostname safety');
      });
  if (!addresses.length || addresses.some(({ address }) => !isIP(address))) {
    throw new Error('Unable to verify hostname safety');
  }
  if (addresses.some(({ address }) => isPrivateIP(address))) {
    throw new Error(LOCAL_NETWORKS_BLOCKED_MESSAGE);
  }
  return addresses;
}

export async function validateUrlForSSRF(
  url: string,
  options: { trustedOrigin?: string } = {},
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only HTTP(S) URLs are allowed';
  }
  if (parsed.username || parsed.password) return 'URL credentials are not allowed';

  // This exception is supplied only by server-owned provider resolution.
  if (localNetworksAllowed() || parsed.origin === options.trustedOrigin) {
    return null;
  }
  try {
    await resolvePublicAddresses(parsed.hostname);
  } catch (error) {
    return error instanceof Error ? error.message : 'Unable to verify hostname safety';
  }

  return null;
}
