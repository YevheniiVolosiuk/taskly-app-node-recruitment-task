// Percent covered; null when the file has nothing of that kind to cover.
export type FileCoverage = { lines: number | null; branches: number | null };

// Keyed by path from the repository root.
export type CoverageFiles = Record<string, FileCoverage>;

export type CoverageParseResult = { ok: true; files: CoverageFiles } | { ok: false; error: string };

const INPUT_LIMIT = 10_000_000;

class InvalidSummary extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function percent(entry: Record<string, unknown>, metric: 'lines' | 'branches', file: string): number | null {
  const counts = entry[metric];
  if (!isRecord(counts) || !isCount(counts.covered) || !isCount(counts.total) || counts.covered > counts.total) {
    throw new InvalidSummary(`${file} has no ${metric} count`);
  }
  return counts.total === 0 ? null : (counts.covered / counts.total) * 100;
}

// Reads Vitest's json-summary report, whose keys are absolute paths under <root>. It can come from a run of the
// PR's code, so it is validated like any untrusted input.
export function parseCoverageSummary(untrustedJson: string, root: string): CoverageParseResult {
  if (untrustedJson.length > INPUT_LIMIT) return { ok: false, error: `coverage summary is longer than ${INPUT_LIMIT} characters` };

  let value: unknown;
  try {
    value = JSON.parse(untrustedJson);
  } catch {
    return { ok: false, error: 'coverage summary is not valid JSON' };
  }

  try {
    if (!isRecord(value)) throw new InvalidSummary('coverage summary is not an object');

    const prefix = root.endsWith('/') ? root : `${root}/`;
    const files: CoverageFiles = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!key.startsWith(prefix)) continue;
      if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(key)) {
        throw new InvalidSummary('coverage summary has a file name with a control character');
      }
      const file = key.slice(prefix.length);
      if (!isRecord(entry)) throw new InvalidSummary(`${file} is not an object`);
      files[file] = { lines: percent(entry, 'lines', file), branches: percent(entry, 'branches', file) };
    }
    return { ok: true, files };
  } catch (error) {
    if (error instanceof InvalidSummary) return { ok: false, error: error.message };
    throw error;
  }
}
