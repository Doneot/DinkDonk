#!/usr/bin/env node
// Runs `npm audit` and fails only on a high/critical advisory that isn't on
// the allowlist below. A blanket `npm audit ... || true` (the previous
// approach) doesn't distinguish "the one known, already-tracked advisory
// with no fix available" from "a brand new unrelated vulnerability" - both
// get silently swallowed. This keeps the accepted exception scoped to the
// specific advisory it was meant for, so anything new still fails the build.
//
// To accept a new advisory: add its numeric `source` id below with a
// comment explaining why (no fix available, false positive, accepted risk
// + justification, etc).
const ALLOWED_ADVISORY_IDS = new Set([
  // GHSA-w5hq-g745-h8pq (uuid, via gaxios -> teeny-request -> retry-request
  // -> @google-cloud/storage -> firebase-admin). No non-major fix available;
  // firebase-admin's only fix bump is a semver-major downgrade. Moderate in
  // practice (this codebase never takes attacker-controlled input into the
  // affected uuid code path), tracked here pending a real upstream fix.
  1119441,
]);

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npm",
  ["audit", "--omit=dev", "--audit-level=high", "--json"],
  { encoding: "utf8" },
);

if (result.error) {
  console.error("Failed to run npm audit:", result.error);
  process.exit(1);
}

let report;

try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error("Failed to parse npm audit output as JSON:", error);
  console.error(result.stdout);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const unexpected = [];

for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
  if (vulnerability.severity !== "high" && vulnerability.severity !== "critical") {
    continue;
  }

  for (const via of vulnerability.via) {
    if (typeof via !== "object" || via === null) {
      continue;
    }

    if (!ALLOWED_ADVISORY_IDS.has(via.source)) {
      unexpected.push({
        package: packageName,
        severity: vulnerability.severity,
        advisory: via.source,
        title: via.title,
        url: via.url,
      });
    }
  }
}

if (unexpected.length > 0) {
  console.error(
    `Found ${unexpected.length} high/critical advisory(ies) not on the allowlist:\n`,
  );

  for (const finding of unexpected) {
    console.error(
      `  - ${finding.package} (${finding.severity}): ${finding.title}\n` +
        `    ${finding.url} (advisory id ${finding.advisory})`,
    );
  }

  console.error(
    "\nIf this is a genuine new vulnerability, fix or downgrade the dependency. " +
      "If it must be accepted for now, add its advisory id to ALLOWED_ADVISORY_IDS " +
      "in scripts/check-audit-allowlist.mjs with a comment explaining why.",
  );

  process.exit(1);
}

console.log(
  "npm audit: no high/critical advisories outside the allowlist.",
);
