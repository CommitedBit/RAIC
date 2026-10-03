const SEVERITY_RANK = {
  info: -1,
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function normalizeAdvisory(packageName, advisory, packageVersions) {
  if (
    !isRecord(advisory) ||
    !Object.hasOwn(SEVERITY_RANK, advisory.severity) ||
    typeof advisory.vulnerable_versions !== 'string' ||
    !advisory.vulnerable_versions ||
    !Array.isArray(packageVersions[packageName]) ||
    packageVersions[packageName].length === 0
  ) {
    throw new Error('Invalid dependency advisory for ' + packageName);
  }
  const advisoryId =
    String(advisory.url ?? '')
      .match(/GHSA-[a-z0-9-]+/i)?.[0]
      ?.toUpperCase() ?? (advisory.id !== undefined ? 'npm:' + String(advisory.id) : null);
  if (!advisoryId) throw new Error('Missing dependency advisory identity');
  return {
    packageName,
    versions: packageVersions[packageName],
    severity: advisory.severity,
    advisoryId,
    vulnerableVersions: advisory.vulnerable_versions,
  };
}

export function normalizeNativeAudit(response, packageVersions) {
  if (
    !isRecord(response) ||
    response.error ||
    !isRecord(response.advisories) ||
    !Array.isArray(response.muted) ||
    response.muted.length > 0 ||
    !isRecord(response.metadata?.vulnerabilities)
  ) {
    throw new Error('Invalid or muted native dependency audit response');
  }
  const findings = Object.values(response.advisories).map((advisory) =>
    normalizeAdvisory(advisory?.module_name, advisory, packageVersions),
  );
  for (const severity of Object.keys(SEVERITY_RANK)) {
    const count = response.metadata.vulnerabilities[severity];
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count !== findings.filter((finding) => finding.severity === severity).length
    ) {
      throw new Error('Native dependency audit count mismatch: ' + severity);
    }
  }
  return findings.filter((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK.low);
}

export function collectLockfilePackageVersions(lockfile) {
  const packageVersions = {};

  for (const key of Object.keys(lockfile?.packages ?? {})) {
    const packageKey = key.split('(')[0];
    const versionSeparator = packageKey.lastIndexOf('@');
    if (versionSeparator <= 0) continue;

    const name = packageKey.slice(0, versionSeparator);
    const version = packageKey.slice(versionSeparator + 1);
    if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(version)) continue;

    packageVersions[name] ??= [];
    packageVersions[name].push(version);
  }

  return Object.fromEntries(
    Object.entries(packageVersions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...new Set(versions)].sort()]),
  );
}

export function isRetiredPnpmAuditEndpoint(result) {
  const output = [result?.stdout, result?.stderr, result?.error?.message]
    .filter(Boolean)
    .join('\n');

  return (
    output.includes('ERR_PNPM_AUDIT_BAD_RESPONSE') &&
    (/\b410\b/.test(output) || /endpoint is being retired/i.test(output))
  );
}

export function normalizeBulkAdvisories(
  advisoryResponse,
  packageVersions,
  minimumSeverity = 'low',
) {
  const minimumRank = SEVERITY_RANK[minimumSeverity];
  if (minimumRank === undefined) {
    throw new Error(`Unsupported audit severity: ${minimumSeverity}`);
  }
  if (!isRecord(advisoryResponse)) throw new Error('Invalid bulk dependency audit response');

  return Object.entries(advisoryResponse)
    .flatMap(([packageName, advisories]) => {
      if (!Array.isArray(advisories)) throw new Error('Invalid bulk advisories for ' + packageName);
      return advisories.map((advisory) =>
        normalizeAdvisory(packageName, advisory, packageVersions),
      );
    })
    .filter((finding) => (SEVERITY_RANK[finding.severity] ?? -1) >= minimumRank)
    .sort(
      (left, right) =>
        (SEVERITY_RANK[right.severity] ?? -1) - (SEVERITY_RANK[left.severity] ?? -1) ||
        left.packageName.localeCompare(right.packageName) ||
        left.advisoryId.localeCompare(right.advisoryId),
    );
}

export async function fetchBulkAdvisories(packageVersions, fetchImplementation = fetch) {
  const response = await fetchImplementation(
    'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'openraic-dependency-audit',
      },
      body: JSON.stringify(packageVersions),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`npm bulk advisory endpoint returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('npm bulk advisory endpoint returned an invalid response');
  }
  return body;
}
