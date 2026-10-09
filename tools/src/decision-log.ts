export const decisions = ['tested', 'updated', 'skipped', 'suspected_bug'] as const;

export type Decision = (typeof decisions)[number];

export type FileLog = {
  path: string;
  decision: Decision;
  reason: string;
  behaviors: string[];
  tests: string[];
  attempts: number;
};

export type DecisionLog = {
  summary: string;
  files: FileLog[];
};

export type ParseResult = { ok: true; log: DecisionLog } | { ok: false; error: string };

const limits = {
  input: 100_000,
  summary: 300,
  files: 100,
  path: 300,
  reason: 600,
  behaviors: 10,
  tests: 20,
  item: 200,
  attempts: 3,
};

// No single quotes: the workflow passes this schema to claude_args inside single quotes.
export const decisionLogSchema = {
  description:
    `The Test Agent Decision Log, under ${limits.input} characters in total. ` +
    'summary and reason are plain text: no HTML, markdown links or images, URLs, or @mentions. ' +
    'No field may contain line breaks or control characters.',
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'files'],
  properties: {
    summary: { type: 'string', maxLength: limits.summary },
    files: {
      type: 'array',
      maxItems: limits.files,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'decision', 'reason', 'behaviors', 'tests', 'attempts'],
        properties: {
          path: { type: 'string', minLength: 1, maxLength: limits.path },
          decision: { enum: decisions },
          reason: { type: 'string', maxLength: limits.reason },
          behaviors: { type: 'array', maxItems: limits.behaviors, items: { type: 'string', maxLength: limits.item } },
          tests: { type: 'array', maxItems: limits.tests, items: { type: 'string', maxLength: limits.item } },
          attempts: { type: 'integer', minimum: 0, maximum: limits.attempts },
        },
      },
    },
  },
};

type UnsafeText = { pattern: RegExp; label: string };

// Paths, Behaviors, and tests render as code spans, where markup is inert: refuse only what breaks or disguises a line.
const unsafeCode: readonly UnsafeText[] = [
  { pattern: /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/, label: 'a control, line break, or bidirectional character' },
];

// The summary and reasons render as escaped prose: also refuse what a reader could still take for markup or a link.
const unsafeProse: readonly UnsafeText[] = [
  ...unsafeCode,
  { pattern: /<[A-Za-z!/?]/, label: 'HTML' },
  { pattern: /\]\(|!\[/, label: 'a markdown link or image' },
  { pattern: /[A-Za-z][\w+.-]*:\/\/|\bwww\./i, label: 'a URL' },
  { pattern: /(^|\W)@\w/, label: 'an @mention' },
];

class InvalidLog extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDecision(value: unknown): value is Decision {
  return decisions.some((decision) => decision === value);
}

function closedObject(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new InvalidLog(`${field} is not an object`);
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) throw new InvalidLog(`${field} has an unknown key`);
  return value;
}

function boundedString(value: unknown, field: string, maxLength: number, unsafeText: readonly UnsafeText[]): string {
  if (typeof value !== 'string') throw new InvalidLog(`${field} is not a string`);
  if (value.length > maxLength) throw new InvalidLog(`${field} is longer than ${maxLength} characters`);
  const unsafe = unsafeText.find(({ pattern }) => pattern.test(value));
  if (unsafe) throw new InvalidLog(`${field} contains ${unsafe.label}`);
  return value;
}

function boundedArray(value: unknown, field: string, maxItems: number): unknown[] {
  if (!Array.isArray(value)) throw new InvalidLog(`${field} is not an array`);
  if (value.length > maxItems) throw new InvalidLog(`${field} has more than ${maxItems} items`);
  return value;
}

function fileLog(value: unknown, field: string): FileLog {
  const entry = closedObject(value, field, Object.keys(decisionLogSchema.properties.files.items.properties));

  const path = boundedString(entry.path, `${field}.path`, limits.path, unsafeCode);
  if (path === '') throw new InvalidLog(`${field}.path is empty`);

  const decision = entry.decision;
  if (!isDecision(decision)) throw new InvalidLog(`${field}.decision is not a known decision`);

  const attempts = entry.attempts;
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0 || attempts > limits.attempts) {
    throw new InvalidLog(`${field}.attempts is not an integer from 0 to ${limits.attempts}`);
  }

  return {
    path,
    decision,
    reason: boundedString(entry.reason, `${field}.reason`, limits.reason, unsafeProse),
    behaviors: boundedArray(entry.behaviors, `${field}.behaviors`, limits.behaviors).map((item, i) =>
      boundedString(item, `${field}.behaviors[${i}]`, limits.item, unsafeCode),
    ),
    tests: boundedArray(entry.tests, `${field}.tests`, limits.tests).map((item, i) =>
      boundedString(item, `${field}.tests[${i}]`, limits.item, unsafeCode),
    ),
    attempts,
  };
}

// Validates the Test Agent's structured output. Errors name the field but never quote it, since the input is untrusted.
export function parseDecisionLog(untrustedJson: string): ParseResult {
  if (untrustedJson.length > limits.input) {
    return { ok: false, error: `Decision Log is longer than ${limits.input} characters` };
  }

  let value: unknown;
  try {
    value = JSON.parse(untrustedJson);
  } catch {
    return { ok: false, error: 'Decision Log is not valid JSON' };
  }

  try {
    const root = closedObject(value, 'Decision Log', Object.keys(decisionLogSchema.properties));
    const summary = boundedString(root.summary, 'summary', limits.summary, unsafeProse);
    const files = boundedArray(root.files, 'files', limits.files).map((entry, i) => fileLog(entry, `files[${i}]`));

    const paths = new Set<string>();
    for (const [i, file] of files.entries()) {
      if (paths.has(file.path)) throw new InvalidLog(`files[${i}].path repeats an earlier file`);
      paths.add(file.path);
    }

    return { ok: true, log: { summary, files } };
  } catch (error) {
    if (error instanceof InvalidLog) return { ok: false, error: error.message };
    throw error;
  }
}
