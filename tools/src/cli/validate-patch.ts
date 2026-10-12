// Usage: node tools/src/cli/validate-patch.ts <test-changes.patch> <patch-validation.json>
// The patch is the agent's untrusted output. Writes the validation, sets the changes output in GITHUB_OUTPUT,
// and exits 1 when the patch is rejected. Rejections are printed as one JSON line, so no path can start a
// workflow command.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { validatePatch } from '../patch.ts';

const [patchPath, outputPath] = process.argv.slice(2);
if (!patchPath || !outputPath) throw new Error('usage: validate-patch.ts <test-changes.patch> <patch-validation.json>');

const validation = validatePatch(readFileSync(patchPath, 'utf8'));
writeFileSync(outputPath, JSON.stringify(validation, null, 2));

if (!validation.ok) {
  console.error(`Patch rejected: ${JSON.stringify(validation.rejected)}`);
  process.exit(1);
}
const changes = validation.changesContent;
console.log(changes ? `Patch touches test files: ${validation.paths.length}.` : 'Patch changes no content.');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changes=${changes}\n`);
