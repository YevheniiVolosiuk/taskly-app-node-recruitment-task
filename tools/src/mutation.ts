import type { Classification } from './classify.ts';

export const mutationPackages = ['backend', 'frontend'] as const;

export type MutationPackage = (typeof mutationPackages)[number];

export type Survivor = {
  file: string;
  line: number;
  column: number;
  mutator: string;
  replacement: string | null;
  status: 'Survived' | 'NoCoverage';
};

export type MutationSummary = {
  // Detected over detected plus undetected mutants, in percent; null when no mutant was valid.
  score: number | null;
  detected: number;
  survived: number;
  noCoverage: number;
  survivors: Survivor[];
};

export type MutationParseResult = { ok: true; summary: MutationSummary } | { ok: false; error: string };

// The changed files Stryker mutates in each package: app source the classifier did not Skip, relative to the package.
export function filesToMutate({ files }: Classification): Record<MutationPackage, string[]> {
  const targets: Record<MutationPackage, string[]> = { backend: [], frontend: [] };
  for (const file of files) {
    if (file.decision === 'skipped') continue;
    const pkg = mutationPackages.find((name) => file.path.startsWith(`${name}/`));
    if (pkg) targets[pkg].push(file.path.slice(pkg.length + 1));
  }
  return targets;
}

// The report embeds the source of every mutated and test file, so the cap is generous.
const INPUT_LIMIT = 10_000_000;

// The mutant statuses of the mutation-testing report schema.
const statuses = ['Killed', 'Timeout', 'Survived', 'NoCoverage', 'CompileError', 'RuntimeError', 'Ignored', 'Pending'] as const;

type Status = (typeof statuses)[number];

class InvalidReport extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is Status {
  return statuses.some((status) => status === value);
}

function isPosition(value: unknown): value is { line: number; column: number } {
  return isRecord(value) && Number.isSafeInteger(value.line) && Number.isSafeInteger(value.column);
}

function readMutant(value: unknown, field: string, file: string): { status: Status; survivor?: Survivor } {
  if (!isRecord(value)) throw new InvalidReport(`${field} is not an object`);

  const { status, mutatorName, replacement, location } = value;
  if (!isStatus(status)) throw new InvalidReport(`${field}.status is not a known status`);
  if (typeof mutatorName !== 'string' || !/^\w{1,100}$/.test(mutatorName)) {
    throw new InvalidReport(`${field}.mutatorName is not a mutator name`);
  }
  if (replacement !== undefined && typeof replacement !== 'string') throw new InvalidReport(`${field}.replacement is not a string`);
  if (!isRecord(location) || !isPosition(location.start)) throw new InvalidReport(`${field}.location is not a line and column`);

  if (status !== 'Survived' && status !== 'NoCoverage') return { status };
  const { line, column } = location.start;
  return { status, survivor: { file, line, column, mutator: mutatorName, replacement: replacement ?? null, status } };
}

// Reads Stryker's JSON report. It comes from a run of the PR's code, so it is validated like any untrusted input.
export function parseMutationReport(untrustedJson: string): MutationParseResult {
  if (untrustedJson.length > INPUT_LIMIT) return { ok: false, error: `mutation report is longer than ${INPUT_LIMIT} characters` };

  let value: unknown;
  try {
    value = JSON.parse(untrustedJson);
  } catch {
    return { ok: false, error: 'mutation report is not valid JSON' };
  }

  try {
    if (!isRecord(value) || !isRecord(value.files)) throw new InvalidReport('files is not an object');

    const tally = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<Status, number>;
    const survivors: Survivor[] = [];
    for (const [i, [file, result]] of Object.entries(value.files).entries()) {
      if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(file)) {
        throw new InvalidReport(`files[${i}] has a file name with a control character`);
      }
      if (!isRecord(result) || !Array.isArray(result.mutants)) throw new InvalidReport(`files[${i}].mutants is not an array`);

      for (const [j, entry] of result.mutants.entries()) {
        const { status, survivor } = readMutant(entry, `files[${i}].mutants[${j}]`, file);
        tally[status] += 1;
        if (survivor) survivors.push(survivor);
      }
    }

    // Stryker's score: timeouts count as detected; errors, ignored, and pending mutants do not count.
    const detected = tally.Killed + tally.Timeout;
    const valid = detected + tally.Survived + tally.NoCoverage;
    survivors.sort((a, b) => (a.file === b.file ? a.line - b.line || a.column - b.column : a.file < b.file ? -1 : 1));
    const summary: MutationSummary = {
      score: valid === 0 ? null : (detected / valid) * 100,
      detected,
      survived: tally.Survived,
      noCoverage: tally.NoCoverage,
      survivors,
    };
    return { ok: true, summary };
  } catch (error) {
    if (error instanceof InvalidReport) return { ok: false, error: error.message };
    throw error;
  }
}
