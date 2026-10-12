import { isTestPath } from './test-paths.ts';

export type PatchRejection = { path: string; reason: string };

// changesContent is false when no file is created, deleted, renamed, or copied and every added or removed line is
// blank, so stray whitespace makes no commit.
export type PatchValidation =
  | { ok: true; paths: readonly string[]; changesContent: boolean }
  | { ok: false; rejected: readonly PatchRejection[] };

const REGULAR_FILE = '100644';
const SYMLINK = '120000';

// Quoted paths (git's form for unusual characters) do not match, so they are rejected.
const fileHeader = /^diff --git a\/(\S+) b\/(\S+)$/;
const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const modeLine = /^(?:old mode|new mode|deleted file mode|new file mode) (\d+)$/;
const indexLine = /^index [0-9a-f]+\.\.[0-9a-f]+ (\d+)$/;
const pathLine = /^(?:rename from |rename to |copy from |copy to |--- a\/|\+\+\+ b\/)(.+)$/;
const fileEventLine = /^(?:new file mode|deleted file mode|rename from|copy from) /;
const otherHeaderLine = /^(?:index [0-9a-f]+\.\.[0-9a-f]+|(?:similarity|dissimilarity) index \d+%|--- \/dev\/null|\+\+\+ \/dev\/null)$/;
const binaryLine = /^(?:GIT binary patch|Binary files .* differ)$/;

// Accepts a `git diff --binary` patch only if every path it names is a test path, every file stays a
// regular file, and nothing is binary. The patch comes from the agent's workspace, so it is untrusted:
// every line must fit git's diff grammar, and hunks are consumed by their line counts, as `git apply`
// does, so no header can hide inside or after a hunk.
export function validatePatch(patch: string): PatchValidation {
  const lines = patch === '' ? [] : patch.replace(/\n$/, '').split('\n');
  const paths: string[] = [];
  const rejected = new Map<string, string>();
  let changesContent = false;

  const reject = (path: string, reason: string) => {
    if (!rejected.has(path)) rejected.set(path, reason);
  };
  const touch = (path: string) => {
    if (!paths.includes(path)) paths.push(path);
    if (!isTestPath(path)) reject(path, 'not a test path');
  };
  const checkMode = (path: string, mode: string) => {
    if (mode === SYMLINK) reject(path, 'symlink');
    else if (mode !== REGULAR_FILE) reject(path, `file mode ${mode}`);
  };
  const result = (): PatchValidation =>
    rejected.size === 0
      ? { ok: true, paths, changesContent }
      : { ok: false, rejected: [...rejected].map(([path, reason]) => ({ path, reason })) };
  const malformed = (line: string): PatchValidation => {
    reject(line, 'not a git diff line');
    return result();
  };

  let i = 0;
  while (i < lines.length) {
    const header = fileHeader.exec(lines[i] ?? '');
    if (!header) return malformed(lines[i] ?? '');
    const [, oldPath = '', newPath = ''] = header;
    touch(oldPath);
    touch(newPath);
    i++;

    let binary = false;
    for (; i < lines.length && !binary; i++) {
      const line = lines[i] ?? '';
      if (line.startsWith('diff --git ') || line.startsWith('@@ ')) break;
      if (fileEventLine.test(line)) changesContent = true;

      const mode = modeLine.exec(line)?.[1] ?? indexLine.exec(line)?.[1];
      const path = pathLine.exec(line)?.[1];
      if (mode) checkMode(newPath, mode);
      else if (path) touch(path);
      else if (binaryLine.test(line)) binary = true;
      else if (!otherHeaderLine.test(line)) return malformed(line);
    }

    if (binary) {
      reject(newPath, 'binary change');
      while (i < lines.length && !lines[i]?.startsWith('diff --git ')) i++;
      continue;
    }

    let hunk: RegExpExecArray | null;
    while ((hunk = hunkHeader.exec(lines[i] ?? ''))) {
      let oldLines = Number(hunk[1] ?? 1);
      let newLines = Number(hunk[2] ?? 1);
      i++;
      while (oldLines > 0 || newLines > 0) {
        const line = lines[i];
        if (line === undefined) {
          reject(newPath, 'hunk is cut short');
          return result();
        }
        if (line.startsWith(' ')) {
          oldLines--;
          newLines--;
        } else if (line.startsWith('-') || line.startsWith('+')) {
          if (line.startsWith('-')) oldLines--;
          else newLines--;
          if (line.slice(1).trim() !== '') changesContent = true;
        } else if (!line.startsWith('\\')) return malformed(line);
        if (oldLines < 0 || newLines < 0) return malformed(line);
        i++;
      }
      if (lines[i]?.startsWith('\\')) i++;
    }
  }

  return result();
}
