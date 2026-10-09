// Usage: node tools/src/cli/decision-log-schema.ts
// Prints the Decision Log JSON Schema on one line, for the agent's --json-schema.
import { decisionLogSchema } from '../decision-log.ts';

console.log(JSON.stringify(decisionLogSchema));
