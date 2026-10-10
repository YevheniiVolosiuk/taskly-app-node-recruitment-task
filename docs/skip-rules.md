# Skip rules

Before the Test Agent runs, the classification decides each changed file by its path alone. A file that matches a rule below is a Skip with that rule's reason; the first match wins. A file under `backend/src/` or `frontend/src/` that matches no rule is a Candidate. Every other file is a Skip with reason `Not app source code`. The rules live in `skipRules` in `tools/src/classify.ts`; change both together.

| Category | Reason | Matches |
| --- | --- | --- |
| `docs` | Documentation | `*.md`, `*.mdx`, anything under `docs/` |
| `lockfile` | Lockfile | `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml` |
| `generated` | Generated code | `backend/src/generated/` |
| `migration` | Database schema or migration | `prisma/migrations/`, `prisma/schema.prisma` |
| `config` | Configuration | any dotfile or dot-directory, `Dockerfile*`, `*.json`, `*.yaml`, `*.yml`, `*.toml`, `*.config.{js,ts,cjs,mjs,cts,mts}` |
| `test` | Test-only change | `backend/tests/`, `frontend/src/test/`, `*.test.ts(x)`, `*.spec.ts(x)`, `__tests__/` |
| `type-only` | Type-only declarations | `types.ts`, `*.types.ts`, `*.d.ts` |
| `style` | Styles only | `*.css`, `*.scss`, `*.sass`, `*.less`, `*.styles.ts(x)`, `frontend/src/design-system/theme/` |
| `non-logic` | Storybook story | `*.stories.ts(x)` |
| `non-logic` | Design-system render-only component | `frontend/src/design-system/` |
| `non-logic` | Barrel re-export | `index.ts(x)` |
| `non-logic` | Entry point | `backend/src/main.ts`, `frontend/src/main.tsx` |
| `non-logic` | Constants | `constants.ts(x)`, `*.constants.ts(x)` |

## Blind spots

The rules read file names, not contents. Logic placed in a file whose name matches a rule is Skipped without warning: a function in `types.ts`, `constants.ts`, `index.ts`, a `*.config.ts`, or a `*.styles.tsx`, or any logic under `frontend/src/design-system/`. Keep logic out of these files; review is the only check.
