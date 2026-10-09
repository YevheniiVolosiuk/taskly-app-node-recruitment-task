// Usage: node tools/src/cli/report.ts <classification.json> <report.md>
import { readFileSync, writeFileSync } from 'node:fs';
import type { Classification } from '../classify.ts';
import { renderReport } from '../report.ts';

const [classificationPath, outputPath] = process.argv.slice(2);
if (!classificationPath || !outputPath) throw new Error('usage: report.ts <classification.json> <report.md>');

const classification = JSON.parse(readFileSync(classificationPath, 'utf8')) as Classification;
writeFileSync(outputPath, renderReport({ classification }));
