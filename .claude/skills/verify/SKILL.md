---
name: verify
description: Verify a Taskly todos change end to end. The skill launches an isolated stack, drives the API and the UI in a real browser, and keeps evidence. Use it to prove that a feature or fix works, or to reproduce a bug a user would see.
---

# Verify Taskly

**Evidence** is the deliverable. A claim that something works stands on artifacts captured from the real app, driven the way a user drives it.

## Instance

- `stack.sh up` starts one isolated instance per machine: Postgres in a tmpfs container, the built API, and the built UI on fixed ports. Drive only that instance. The Compose stack on ports 8000/8080 holds the developer's real data.
- The instance is built from the working tree. After a code edit, run `down` and then `up` to rebuild.
- Requirements: Linux or WSL, Docker, and network access for `npx` the first time it fetches `@playwright/cli`.
- Shell state resets between commands. Start every command with `eval "$(.claude/skills/verify/scripts/stack.sh env)"`. It sets `S` (stack.sh), `U` (ui.sh), `WEB` (the UI, which proxies `/api`), `API` (the backend), and `EVIDENCE`.

## Steps

1. **Launch.** Run `.claude/skills/verify/scripts/stack.sh up`. Done when it prints `ready:` and `evidence:`. On failure it names the build log. Run `down`, fix the cause, and run `up` again.
2. **Doctor.** Run `$S doctor`. Done when every line reads `ok`. Run it again whenever a drive step misbehaves.
3. **Drive.** Pick the features the change touches from [features/README.md](features/README.md) and read each feature file. Run `$U open "$WEB"`, then drive every sub-feature with its recipe. Done when every sub-feature of each touched feature is either driven, or reported unreachable with the attempted command and the unmet precondition.
4. **Evidence.** Done when the following are all in `$EVIDENCE`, each named `<feature>.<step>`:
   - an ARIA snapshot for every state change,
   - a screenshot of the final state,
   - the stored rows after every mutation.
5. **Cleanup.** Run `$U close` and `$S down`, after failed runs too. Done when it prints `stopped; evidence kept at <dir>` and that directory still lists the artifacts.

## Proof standards

- Drive the **user path**: UI controls by role and accessible name, or the public HTTP API. Create fixtures through the UI or with `POST $WEB/api/todos`.
- Capture the action and the state it produced, not only the final screen.
- Prove the side effect. After each UI mutation, run `curl -s "$API/api/todos" > "$EVIDENCE/<feature>.<step>.api.json"` and check the stored row.
- A success notice such as `New task added.` is only a claim. The list item and the stored row are the proof.

## Helpers

All three are in `.claude/skills/verify/scripts/`:

- `stack.sh up | doctor | env | down` manages the instance. `down` kills only the process groups and the labelled container that `up` recorded. It keeps `$EVIDENCE` along with the build and server logs.
- `smoke-api.mjs <origin> [transcript]` checks health, then runs todos create, list, read, patch, delete, and validation over HTTP. It ends with `smoke-api: PASS` or `FAIL`. The Verification Job runs the same script in CI.
- `ui.sh <playwright-cli command>` drives the browser session `taskly-verify` from `$EVIDENCE`, so a relative `--filename` lands there. It exits 1 when an action fails. `$U --help` lists the commands.
