// A path segment without dots keeps out dotfiles, `*.config.ts`, `*.d.ts`, and `..`.
const testPathPatterns: readonly RegExp[] = [
  /^backend\/tests\/([\w-]+\/)*[\w-]+(\.test)?\.ts$/,
  /^frontend\/src\/([\w-]+\/)*[\w-]+(\.seam)?\.test\.tsx?$/,
  /^frontend\/src\/test\/([\w-]+\/)*[\w-]+\.tsx?$/,
];

// Loaded by the test runner for every test, so editing it changes what all tests mean.
const setupFile = /(^|\/)setup\.tsx?$/;

// Whether a repository-relative path is one the Test Agent may write (see docs/test-seams.md).
export function isTestPath(path: string): boolean {
  return testPathPatterns.some((pattern) => pattern.test(path)) && !setupFile.test(path);
}
