// Usage: node tools/src/cli/files-to-mutate.ts <classification.json> >> "$GITHUB_OUTPUT"
// Run from the repository root at the commit under verification. Prints one `<package>=<JSON array>` line per package:
// the changed source files Stryker mutates, relative to the package, without the files the PR deleted.
import { existsSync, readFileSync } from 'node:fs';
import type { Classification } from '../classify.ts';
import { filesToMutate, mutationPackages } from '../mutation.ts';

const [classificationPath] = process.argv.slice(2);
if (!classificationPath) throw new Error('usage: files-to-mutate.ts <classification.json>');

const files = filesToMutate(JSON.parse(readFileSync(classificationPath, 'utf8')) as Classification);
for (const pkg of mutationPackages) {
  const existing = files[pkg].filter((path) => existsSync(`${pkg}/${path}`));
  console.log(`${pkg}=${JSON.stringify(existing)}`);
}
