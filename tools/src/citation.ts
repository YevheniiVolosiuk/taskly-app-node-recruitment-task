import { parseCitation, type FileLog } from './decision-log.ts';

// A string or template literal: `raw` as written between its quotes, `value` with escapes decoded.
type Literal = { start: number; end: number; raw: string; value: string };

// `code` is the source with comments, regular expressions, and literal contents blanked, so only code is left to read.
type Scan = { code: string; literals: Literal[] };

// `it`, `test`, `describe`, or `suite`, with modifiers such as `.only` or `.concurrent` in group 1.
const testFunction = /(?<![\w$.])(?:it|test|describe|suite)((?:\s*\.\s*\w+)*)\s*$/;
// Modifiers that keep a test, or every test in a describe, from running.
const notRun = /\.\s*(?:skip|todo)\b/;
// A call that returns a test function: `.each(table)`, `` .each`table` ``, `.for(table)`, `.skipIf(condition)`, `.runIf(condition)`.
const returnsTestFunction = /\.\s*(?:each|for|skipIf|runIf)\s*$/;
// What may follow a whole title: the next argument or the end of the call, not a `+` that extends it.
const titleEnd = /\s*[,)]/y;
const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

function decode(raw: string): string {
  return raw.replace(
    /\\(?:u\{([\da-fA-F]+)\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|\r?\n|(.))/gs,
    (_, codePoint?: string, unit?: string, byte?: string, other?: string) => {
      const hex = codePoint ?? unit ?? byte;
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return other === undefined ? '' : (escapes[other] ?? other);
    },
  );
}

// Index just past the string or template literal that opens at `start`.
function literalEnd(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') i += 2;
    else if (c === quote) return i + 1;
    else if (c === '\n' && quote !== '`') return i;
    else if (c === '$' && quote === '`' && source[i + 1] === '{') i = interpolationEnd(source, i + 2);
    else i++;
  }
  return i;
}

function interpolationEnd(source: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i = literalEnd(source, i);
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return i;
}

function regexEnd(source: string, start: number): number {
  let inClass = false;
  let i = start + 1;
  while (i < source.length && source[i] !== '\n') {
    const c = source[i];
    if (c === '\\') i++;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1 + (/^\w*/.exec(source.slice(i + 1))?.[0].length ?? 0);
    i++;
  }
  return i;
}

// Index just past the comment, literal, or regular expression that opens at `i`, or null when code starts there.
function skippedEnd(source: string, i: number, regexAllowed: boolean): number | null {
  const c = source[i];
  const next = source[i + 1];
  if (c === '/' && next === '/') {
    const end = source.indexOf('\n', i);
    return end === -1 ? source.length : end;
  }
  if (c === '/' && next === '*') {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (c === '/' && regexAllowed) return regexEnd(source, i);
  if (c === "'" || c === '"' || c === '`') return literalEnd(source, i);
  return null;
}

// A `/` after a name, a number, or a closing bracket divides; anywhere else it opens a regular expression.
function scan(source: string): Scan {
  const code = source.split('');
  const literals: Literal[] = [];
  let regexAllowed = true;
  let i = 0;
  while (i < source.length) {
    const c = source[i] ?? '';
    const end = skippedEnd(source, i, regexAllowed);
    if (end === null) {
      if (!/\s/.test(c)) regexAllowed = !/[\w$)\]]/.test(c);
      i++;
      continue;
    }
    const isLiteral = c === "'" || c === '"' || c === '`';
    if (isLiteral) {
      const raw = source.slice(i + 1, end - 1);
      literals.push({ start: i, end, raw, value: decode(raw) });
      code.fill(' ', i + 1, end - 1);
    } else {
      code.fill(' ', i, end);
    }
    if (isLiteral || c === '/') regexAllowed = false;
    i = end;
  }
  return { code: code.join(''), literals };
}

// Index of the `(` or `` ` `` that opens the arguments `text` ends with, or -1.
function argumentsStart(text: string): number {
  if (text.endsWith('`')) return text.lastIndexOf('`', text.length - 2);
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ')') depth++;
    else if (text[i] === '(' && --depth === 0) return i;
  }
  return -1;
}

// Whether `callee` is a test function, and whether a run executes what it is given.
function testCall(callee: string): 'runs' | 'not_run' | null {
  const text = callee.trimEnd();
  if (!text.endsWith(')') && !text.endsWith('`')) {
    const match = testFunction.exec(text);
    if (!match) return null;
    return notRun.test(match[1] ?? '') ? 'not_run' : 'runs';
  }
  const start = argumentsStart(text);
  if (start === -1) return null;
  const head = text.slice(0, start).trimEnd();
  return returnsTestFunction.test(head) ? testCall(head.replace(returnsTestFunction, '')) : null;
}

// Whether a call enclosing the one that opens at `open` is a describe a run skips.
function insideSkipped(code: string, open: number): boolean {
  let depth = 0;
  for (let i = open - 1; i >= 0; i--) {
    if (code[i] === ')') depth++;
    else if (code[i] === '(') {
      if (depth > 0) depth--;
      else if (testCall(code.slice(0, i)) === 'not_run') return true;
    }
  }
  return false;
}

function isRunTitle(code: string, { start, end }: Literal): boolean {
  const before = code.slice(0, start).trimEnd();
  titleEnd.lastIndex = end;
  if (!before.endsWith('(') || !titleEnd.test(code)) return false;
  const open = before.length - 1;
  return testCall(before.slice(0, open)) === 'runs' && !insideSkipped(code, open);
}

// Whether `title` is the first argument of a test or describe call a run executes. It matches the literal as written,
// where `%s`, `$name`, and `\n` stay unexpanded, or the literal's value, where `\'` and `é` read as `'` and `é`.
export function citesTest(source: string, title: string): boolean {
  const { code, literals } = scan(source);
  return literals.some((literal) => (literal.raw === title || literal.value === title) && isRunTitle(code, literal));
}

// The Skipped files whose `already covered` citation names a test file `read` cannot find or a title it does not hold.
export function findMissingCitations(files: readonly FileLog[], read: (path: string) => string | null): Set<string> {
  return new Set(
    files.flatMap(({ path, decision, reason }) => {
      const cited = decision === 'skipped' ? parseCitation(reason) : null;
      if (!cited) return [];
      const source = read(cited.file);
      return source !== null && citesTest(source, cited.test) ? [] : [path];
    }),
  );
}
