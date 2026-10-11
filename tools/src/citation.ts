import { parseCitation, type FileLog } from './decision-log.ts';

const quotes = [`'`, '"', '`'] as const;
// `it`, `test`, `describe`, or `suite`, with modifiers such as `.only` or `.concurrent`.
const testFunction = /(?<![\w$.])(?:it|test|describe|suite)(?:\s*\.\s*\w+)*\s*$/;
// A call that returns a test function: `.each(table)`, `` .each`table` ``, `.for(table)`, `.skipIf(condition)`, `.runIf(condition)`.
const returnsTestFunction = /\.\s*(?:each|for|skipIf|runIf)\s*$/;
// What may follow a whole title: the next argument or the end of the call, not a `+` that extends it.
const titleEnd = /\s*[,)]/y;

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

function isTestFunction(callee: string): boolean {
  const text = callee.trimEnd();
  if (!text.endsWith(')') && !text.endsWith('`')) return testFunction.test(text);
  const start = argumentsStart(text);
  if (start === -1) return false;
  const head = text.slice(0, start).trimEnd();
  return returnsTestFunction.test(head) && isTestFunction(head.replace(returnsTestFunction, ''));
}

// Whether `title` is the first argument of a test or describe call, quoted as written: `%s` and `$name` stay unexpanded.
export function citesTest(source: string, title: string): boolean {
  return quotes.some((quote) => {
    const literal = `${quote}${title.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`)}${quote}`;
    for (let at = source.indexOf(literal); at !== -1; at = source.indexOf(literal, at + 1)) {
      const before = source.slice(0, at).trimEnd();
      titleEnd.lastIndex = at + literal.length;
      if (before.endsWith('(') && titleEnd.test(source) && isTestFunction(before.slice(0, -1))) return true;
    }
    return false;
  });
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
