# PR test-agent CI: claude-code-action, GitHub Actions security, StrykerJS

Research date: 2026-10-09. Every claim carries the URL it was read from. Claims without a fetched source were cut.

Short refs used below:
- `AY` = https://raw.githubusercontent.com/anthropics/claude-code-action/main/action.yml
- `SEC` = https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/security.md
- `GHA` = https://code.claude.com/docs/en/github-actions

## Summary (recommendations for classify -> agent -> apply -> verify -> report)

- Trigger on `pull_request` only. Fork PRs get no secrets and a read-only token, so the agent job cannot authenticate and must be skipped [events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). Do NOT use `pull_request_target` or `workflow_run` for PR-head code: they carry base-repo secrets and a write token [Security Lab](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/), [secure-use](https://docs.github.com/en/actions/reference/security/secure-use).
- Agent job: pass `github_token: ${{ secrets.GITHUB_TOKEN }}` with job `permissions: contents: read`. Without `github_token` the action exchanges OIDC for a GitHub App token whose default permissions are contents/pull_requests/issues write ([token.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/github/token.ts)). That breaks "agent holds no write token".
- Agent job: set `prompt` (automation mode), no `track_progress`, no `use_commit_signing`, no `use_sticky_comment`. Then the action creates no tracking comment ([custom-automations](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/custom-automations.md), [agent/index.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/modes/agent/index.ts)). Set `classify_inline_comments: "false"` to skip the post-run inline-comment step [AY].
- Agent definitions must be merged to the base branch first. On `pull_request`, the action restores `.claude/`, `CLAUDE.md`, `.mcp.json` etc. from the base branch and removes PR-added ones [SEC]. Alternative that avoids this: define subagents via `--agents` JSON in `claude_args` (see A5). This contradicts "custom subagent+skills live in the PR under test" for the PR that introduces them.
- Set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"` in the agent step env so Bash/hook subprocesses (running PR code via vitest) do not inherit the Anthropic key [env-vars](https://code.claude.com/docs/en/env-vars.md); the action forwards a user-set value [AY].
- Restrict tools with `--allowedTools` / `--disallowedTools` plus `--max-turns`; Bash is off by default [faq](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/faq.md). Bash deny rules are not a security boundary [permissions](https://code.claude.com/docs/en/permissions), so the read-only token and the apply-job path validation are the real controls.
- Hand off via artifacts: the agent job uploads the patch + decisions JSON. Treat them as untrusted in apply ("Artifacts resulting from untrusted PR data are themselves untrusted") [Security Lab]. Validate paths there, never execute artifact content.
- apply pushes with `GITHUB_TOKEN`: that push triggers no new workflow runs [github_token](https://docs.github.com/en/actions/concepts/security/github_token). verify must run inside the same run against the new SHA; other `pull_request` workflows will not run on that commit.
- Never interpolate `${{ ... }}` of PR title/body/head_ref or of LLM output (`structured_output`) into `run:`; pass via `env:` [secure-use]. The action's own docs example interpolates `fromJSON(steps.analyze.outputs.structured_output)` into a shell line; do not copy it.
- Pin every third-party action to a full commit SHA; set top-level `permissions: contents: read` and raise per job; `timeout-minutes` and `concurrency` on every job [secure-use], [workflow-syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
- Stryker: `@stryker-mutator/vitest-runner`, `--mutate` with changed files only, `reporters: [clear-text, json]`, `thresholds.break`; cache `reports/stryker-incremental.json` with `--incremental` (A caveat: only mutated+test files are diffed) [Stryker docs, section E].

## A. claude-code-action

### A1. Inputs relevant to PR automation (defaults from [AY])

| input | default | note |
|---|---|---|
| `prompt` | none | with a prompt the action runs "automation mode", no @claude needed [GHA] |
| `claude_args` | none | "Additional arguments to pass directly to Claude CLI" |
| `settings` | none | "Claude Code settings as JSON string or path to settings JSON file" |
| `track_progress` | `false` | "Force tag mode with tracking comments for pull_request and issue events" |
| `use_sticky_comment` | `false` | "Use just one comment to deliver issue/PR comments" |
| `github_token` | none | "GitHub token with repo and pull request permissions (optional if using GitHub App)" |
| `anthropic_api_key` | none | |
| `claude_code_oauth_token` | none | "alternative to anthropic_api_key" |
| `anthropic_federation_rule_id`, `anthropic_organization_id`, `anthropic_service_account_id`, `anthropic_workspace_id`, `anthropic_oidc_audience` | none | workload identity federation |
| `allowed_bots` | `""` | "Empty string (default) allows no bots" |
| `allowed_non_write_users` | none | "Only works when github_token input is provided"; high risk, avoid |
| `use_commit_signing` | `false` | |
| `classify_inline_comments` | `true` | "Set to 'false' to post immediately"; the post-step runs `if: always() && inputs.classify_inline_comments != 'false'` |
| `branch_prefix` / `base_branch` | `claude/` / none | |
| `display_report` | `false` | "Whether to display the Claude Code Report in GitHub Step Summary" |
| `show_full_output` | `false` | logs all messages; unsafe on public logs [SEC] |
| `plugins`, `plugin_marketplaces` | none | |

Mode detection (source: [detector.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/modes/detector.ts)): `track_progress` on a PR event forces tag mode; otherwise a `prompt` selects agent mode. Agent mode: "In v1, automation mode intentionally does not create tracking comments by default" [custom-automations](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/custom-automations.md). By default results go to the run log, not a comment [GHA].

### A2. Read-only token; no push, no comment

- Default auth is the Claude GitHub App: needs `id-token: write` [GHA]; the OIDC exchange requests `contents: write, pull_requests: write, issues: write` by default ([token.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/github/token.ts)).
- If `github_token` is set, the action returns it and skips OIDC entirely: `const providedToken = process.env.OVERRIDE_GITHUB_TOKEN; if (providedToken) { ... return providedToken; }` (token.ts above); `OVERRIDE_GITHUB_TOKEN: ${{ inputs.github_token }}` in [AY]. So `id-token: write` is not needed for API-key auth + own token. Exception: with workload identity federation, "`id-token: write` ... needed for the federation exchange even when you pass your own `github_token`" [GHA].
- The action removes `ACTIONS_ID_TOKEN_REQUEST_URL`/`ACTIONS_ID_TOKEN_REQUEST_TOKEN` from the env passed to Claude ("so Claude cannot mint new tokens") ([parse-sdk-options.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/base-action/src/parse-sdk-options.ts)).
- Defaults when triggered interactively: on an open PR it "Always pushes directly to the existing PR branch"; updates a single comment [capabilities](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/capabilities-and-limitations.md). In agent mode: `claudeCommentId: undefined // No tracking comment in agent mode`; git auth is configured with the supplied token [agent/index.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/modes/agent/index.ts). With a read-only token a push would be rejected by GitHub (token scope; see C2).
- MCP servers in agent mode: the `github_comment` server is added only if `mcp__github_comment*` is in allowed tools (`shouldIncludeCommentServer = !isAgentMode || hasGitHubCommentTools`); `github_file_ops` only with `use_commit_signing`; CI server only with explicit CI tools ([install-mcp-server.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/mcp/install-mcp-server.ts)). Do not list those tools.
- Write check: the action calls `repos.getCollaboratorPermissionLevel` and requires admin/write for the actor ([permissions.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/github/validation/permissions.ts)); `checkHumanActor` rejects bots unless in `allowed_bots` [GHA].
- The action replaces the `actions/checkout` credential in `.git/config` with its own token ([git-config.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/github/operations/git-config.ts)); with `github_token: GITHUB_TOKEN` that is the read-only job token.

### A3. Outputs ([AY])

`conclusion` ("success" or "failure"), `execution_file`, `branch_name`, `github_token`, `structured_output` ("JSON string containing all structured output fields when --json-schema is provided in claude_args"), `session_id`.

- `execution_file` = `$RUNNER_TEMP/claude-execution-output.json`, content `JSON.stringify(messages, null, 2)`, i.e. a JSON array of SDK messages ([execution-file.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/base-action/src/execution-file.ts)).
- `structured_output` comes from the result message: `JSON.stringify(resultMessage.structured_output)`; conclusion is success only if `subtype === "success" && !is_error` ([run-claude-sdk.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/base-action/src/run-claude-sdk.ts)).
- Schema usage from [usage.md](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/usage.md):

```yaml
claude_args: |
  --json-schema '{"type":"object","properties":{"is_flaky":{"type":"boolean"}},"required":["is_flaky"]}'
```

### A4. Restricting tools

- `claude_args` accepts `--allowedTools`, `--disallowedTools`, `--max-turns`, `--model` ([usage.md](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/usage.md)); the action merges them into SDK options ([parse-sdk-options.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/base-action/src/parse-sdk-options.ts)). "Bash tool is **disabled by default**"; enable specific commands via `claude_args` [faq](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/faq.md). For a plain-text prompt "Claude has no shell or GitHub API access until you grant the tools" [GHA].
- `--allowedTools` = tools that run without prompting; `--tools` restricts which built-ins exist; `--disallowedTools "Edit"` removes the tool, `Bash(rm *)` denies matching calls only [cli-reference](https://code.claude.com/docs/en/cli-reference).
- Rule order is deny, ask, allow; first match wins [permissions](https://code.claude.com/docs/en/permissions). "A Bash rule matches the command text Claude writes ... isn't a security boundary around the program"; use sandboxing or a PreToolUse hook for stronger enforcement (same page).
- `settings` input accepts JSON with `permissions.allow/deny` and `hooks`; "The `claude_args` input takes precedence over settings when both are specified" ([configuration.md](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/configuration.md)). Documented example:

```yaml
settings: |
  {
    "permissions": { "allow": ["Bash"], "deny": ["WebFetch"] },
    "hooks": { "PreToolUse": [{ "matcher": "Bash",
      "hooks": [{"type": "command", "command": "echo Running..."}] }] }
  }
```

- PreToolUse hook contract ([hooks](https://code.claude.com/docs/en/hooks)): stdin JSON has `tool_name`, `tool_input`, `agent_type`; output `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`; exit code 2 blocks. "A hook that exits with code 2 stops the tool call before permission rules are evaluated" [permissions]. The action's own SDK call uses default setting sources `["user","project","local"]` (override with `--setting-sources`) [parse-sdk-options.ts], so project-level hooks run - but after the base-branch restore in A5.
- Hooks that call `npm run`/`make` resolve through PR-head files; "invoke the tool directly with a pinned version" [SEC]. Use self-contained hook scripts committed to the base branch.
- Inline-comment/gh tools are opt-in via `--allowedTools` (e.g. `mcp__github_inline_comment__create_inline_comment`) [GHA]; leave them out.

### A5. Project agents, skills, settings in the action

- Skills: "For a skill in your repository's `.claude/skills/` directory, run `actions/checkout` before the ... step ... then pass `/skill-name` as the `prompt`" [GHA].
- Setting sources include `project`, so `.claude/settings.json`, `.claude/agents/`, `.claude/skills/` are read (parse-sdk-options.ts above), BUT on PR events the action first runs `restoreConfigFromBase`: "On PRs, .claude/ and .mcp.json in the checkout are attacker-controlled. Restore them from the base branch before the CLI reads them." ([run.ts](https://raw.githubusercontent.com/anthropics/claude-code-action/main/src/entrypoints/run.ts)). Restored list: `.claude, .mcp.json, .claude.json, .gitmodules, .ripgreprc, CLAUDE.md, CLAUDE.local.md, .husky`; "Paths in that list that do not exist on the base branch are removed, and the PR-authored versions are kept under `.claude-pr/` for reference only" [SEC]. Everything else (package.json, lockfiles, vitest config, node_modules) stays at PR head [SEC].
- Subagent locations/priority: managed settings > `--agents` CLI flag > `.claude/agents/` > `~/.claude/agents/` > plugin [sub-agents](https://code.claude.com/docs/en/sub-agents). In non-interactive mode `--agents` takes JSON (or a file path from v2.1.281); keys are agent names with `prompt` and frontmatter fields (same page). Alternative to the base-branch constraint: `claude_args: --agents '{...}'`.
- Subagent frontmatter (sub-agents page): required `name`, `description`; optional `tools`, `disallowedTools`, `model`, `permissionMode` (`default|acceptEdits|auto|dontAsk|bypassPermissions|plan|manual`), `maxTurns`, `skills` (preloaded; full content injected), `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt`. Omitted `tools` = inherits every tool. Subagents inherit session permission rules; in `bypassPermissions`/`acceptEdits`/`auto` parent modes the subagent's `permissionMode` is ignored.
- Skill frontmatter ([skills](https://code.claude.com/docs/en/skills)): all optional - `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context` (`fork`), `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`. A skill's `allowed-tools` pre-approves tools [GHA], but MCP inline-comment tools still need `--allowedTools` in `claude_args` [GHA].
- `--bare` skips auto-discovery of hooks, skills, subagents, CLAUDE.md [cli-reference]; do not use it if relying on `.claude/`.

### A6. Security docs [SEC]

- "The action can only be triggered by users with write access to the repository" for issue/PR/comment/review events; `workflow_dispatch`, `repository_dispatch`, `schedule` not checked separately. Bots blocked unless in `allowed_bots` (those are "not checked for repository permissions").
- `allowed_non_write_users` "is a significant security risk"; only with `github_token`; best-effort scrub of secrets, "reduces but does not eliminate prompt injection risk". Not needed for same-repo PRs.
- `pull_request_target`/`workflow_run`: "Do not check out an untrusted ref into the workspace root before this action."
- Input sanitisation: strips HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, HTML entities, "but new bypass techniques may emerge". Warning: "Beware of potential hidden markdown when tagging Claude on untrusted content."
- `show_full_output` prints all tool outputs; auto-enabled when Actions debug is on.
- Same-repo PRs only for secrets: "On public repositories, GitHub withholds secrets from runs triggered by fork pull requests, so the review runs only on pull requests from branches in the same repository" [GHA].
- Guard expression for the job: REST pull request object exposes `head.repo.full_name` and `head.repo.fork` ([REST pulls](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#get-a-pull-request)); the action reads `context.payload.pull_request.base.ref` from the event payload (run.ts above).

### A7. Auth

- `ANTHROPIC_API_KEY` -> `anthropic_api_key`; `CLAUDE_CODE_OAUTH_TOKEN` -> `claude_code_oauth_token`, available on Pro/Max/Team/Enterprise, generated by `claude setup-token` [GHA]. `claude setup-token`: "generate a one-year OAuth token" [authentication](https://code.claude.com/docs/en/authentication.md). Org-shared secret: use an API key because an OAuth token "is tied to the subscription of the person who ran `claude setup-token`" [GHA].
- Workload identity federation: inputs `anthropic_federation_rule_id`, `anthropic_organization_id`, optional service account/workspace; "Do not set `anthropic_api_key` or `claude_code_oauth_token` alongside federation inputs" ([setup.md](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/setup.md)); needs `id-token: write` [GHA]. Example: [claude-wif.yml](https://raw.githubusercontent.com/anthropics/claude-code-action/main/examples/claude-wif.yml).
- Bedrock/Vertex/Foundry: `use_bedrock`/`use_vertex`/`use_foundry: "true"`, OIDC, `permissions: id-token: write` ([cloud-providers.md](https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/cloud-providers.md)).
- Secrets belong in GitHub Secrets only [SEC].

Minimal agent step consistent with the above:

```yaml
agent:
  runs-on: ubuntu-latest
  timeout-minutes: 30
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@<full-sha>   # v6/v7
      with: { persist-credentials: false }
    - id: claude
      uses: anthropics/claude-code-action@<full-sha>
      env:
        CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"
      with:
        anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
        github_token: ${{ secrets.GITHUB_TOKEN }}
        classify_inline_comments: "false"
        prompt: "/test-agent"
        claude_args: |
          --max-turns 30
          --allowedTools "Read,Write,Edit,Bash(npx vitest run:*)"
          --json-schema '{...}'
```

(`persist-credentials` semantics: [checkout README](https://raw.githubusercontent.com/actions/checkout/main/README.md): "Set `persist-credentials: false` to opt-out"; the action replaces the checkout credential anyway, git-config.ts above.)

## C. GitHub Actions security

### C1. Events, secrets, token

- `pull_request`, forks: "With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository. The `GITHUB_TOKEN` has read-only permissions in pull requests from forked repositories." Default activity types: `opened`, `synchronize`, `reopened`. `GITHUB_REF` is `refs/pull/PR/merge` [events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
- `pull_request_target`: runs in the default-branch context; "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities" (events page). Security Lab: "Workflows triggered via `pull_request_target` have write permission to the target repository. They also have access to target repository secrets." and "Combining `pull_request_target` workflow trigger with an explicit checkout of an untrusted PR is a dangerous practice that may lead to repository compromise." Even without secrets it holds "the read/write repository token in memory" [Security Lab](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/).
- `workflow_run`: "is able to access secrets and write tokens, even if the previous workflow was not"; only triggers if the workflow file is on the default branch [events].
- Pwn-request pattern (Security Lab):

```yaml
on: pull_request_target
jobs:
  build:
    steps:
    - uses: actions/checkout@v2
      with:
        ref: ${{ github.event.pull_request.head.sha }}
    - run: npm install && npm build
```

- Safe split per Security Lab: unprivileged `pull_request` builds and uploads artifacts; privileged `workflow_run` downloads them. "Artifacts resulting from untrusted PR data are themselves untrusted and should be treated as such when handled in privileged contexts."
- secure-use: "Workflows that use these triggers must not explicitly check out untrusted code, including from pull request forks." and "Avoid using the `pull_request_target` workflow trigger if it's not necessary." [secure-use](https://docs.github.com/en/actions/reference/security/secure-use).
- `actions/checkout` v7: "checkout now refuses to check out fork pull request code by default when the workflow is triggered by `pull_request_target` or `workflow_run`" (opt-in `allow-unsafe-pr-checkout: true`) [checkout README](https://raw.githubusercontent.com/actions/checkout/main/README.md).

### C2. `permissions:` keys

- Valid keys: `actions, artifact-metadata, attestations, checks, code-quality, contents, deployments, discussions, id-token, issues, packages, pages, pull-requests, security-events, statuses, vulnerability-alerts`; values `read|write|none`; "If you specify the access for any of these permissions, all of those that are not specified are set to `none`."; per-job override allowed [workflow-syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
- PR comment (`POST /repos/{owner}/{repo}/issues/{issue_number}/comments`): listed under "Pull requests" write. Check run (`POST /repos/{owner}/{repo}/check-runs`): "Checks" write. Push (`PATCH /git/refs/{ref}`, contents PUT/DELETE): "Contents" write [permissions-required](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps).

```yaml
# report job
permissions: { pull-requests: write }        # sticky PR comment
# apply job
permissions: { contents: write }             # push to PR branch
# optional check run
permissions: { checks: write }
# checkout-only jobs
permissions: { contents: read }              # checkout README "Recommended permissions"
```

- Artifacts: download within the same run needs no special permissions; other runs/repos need `github-token` with `actions: read` [download-artifact](https://raw.githubusercontent.com/actions/download-artifact/main/README.md). upload-artifact v4 artifacts are immutable, default retention 90 days (`retention-days`), `if-no-files-found` defaults to `warn` [upload-artifact](https://raw.githubusercontent.com/actions/upload-artifact/main/README.md). Zipped artifacts lose file modes (755/644) (both READMEs).

### C3. Hardening [secure-use](https://docs.github.com/en/actions/reference/security/secure-use)

- "Pinning an action to a full-length commit SHA is currently the only way to use an action as an immutable release."
- Least privilege: "set the default permission for the `GITHUB_TOKEN` to read access only for repository contents. The permissions can then be increased, as required, for individual jobs."
- Script injection: avoid `${{ }}` in `run:`; use an intermediate env var:

```yaml
- name: Check PR title
  env:
    TITLE: ${{ github.event.pull_request.title }}
  run: |
    if [[ "$TITLE" =~ ^octocat ]]; then ...
```

  "the value ... is stored in memory and used as a variable, and doesn't interact with the script generation process."
- `persist-credentials`: checkout "auth token is persisted in the local git config ... Set `persist-credentials: false` to opt-out"; since v6 it is stored in a file under `$RUNNER_TEMP` rather than `.git/config` [checkout README].
- Concurrency: `group` required, `cancel-in-progress` boolean/expression; a queued run in a busy group is `pending` [workflow-syntax]. `timeout-minutes`: "The maximum number of minutes to let a job run before GitHub automatically cancels it." Default 360 (same page).
- Self-hosted runners: "should almost never be used for public repositories" (secure-use).

### C4. GITHUB_TOKEN pushes do not trigger runs

"When you use the repository's `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN` will not create a new workflow run, with the following exceptions" - `workflow_dispatch` and `repository_dispatch` [github_token concept page](https://docs.github.com/en/actions/concepts/security/github_token). Claude Code docs say the same for Claude commits: "GitHub doesn't trigger workflows on commits made with the default `GITHUB_TOKEN`" [GHA]. Also: PRs created/updated by `GITHUB_TOKEN` yield `pull_request` runs that "require approval" [events].

## E. StrykerJS + Vitest

### Runner and config ([vitest-runner docs](https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/docs/vitest-runner.md))

- Install: `npm i --save-dev @stryker-mutator/vitest-runner` (plus `@stryker-mutator/core`; bring your own vitest; peer range `vitest >=2.0.0` per [package.json](https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/vitest-runner/package.json)).
- Config:

```json
{
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts", "related": true }
}
```

- `vitest.related` (default `true`): "Vitest will only run tests that are related to the mutated files. It uses the `related` under the hood." Disable if tests do not import sources directly (API-style integration tests).
- Forced by Stryker (non-overridable): `threads: true, coverage: { enabled: false }, includeTaskLocation: true, singleThread: true, watch: false, bail: options.disableBail ? 0 : 1`. So: single thread per worker (Stryker parallelises itself), bails on first failing test, vitest coverage off, `coverageAnalysis` always `perTest`.
- Limitations: only `threads: true`; Browser Mode unsupported. Vitest in-source tests must be excluded with `// Stryker disable all`.

### Restricting to changed files ([configuration](https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/docs/configuration.md))

- `mutate` default: `{src,lib}/**` js/ts-like files excluding `*.spec|*.test` and `__tests__`. CLI: `--mutate "src/a.ts","!src/**/*.spec.ts"` or a single path. Line ranges: `"src/app.js:1-11"`, `"src/app.js:5:4-6:4"`; ranges cannot be combined with globs on the same entry. "These should be your production code files, and definitely not your test files."
- Incremental ([incremental](https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/docs/incremental.md)): `npx stryker run --incremental`; state in `reports/stryker-incremental.json` (`--incrementalFile`); reuse when killed mutant's test unchanged / survived mutant has no new covering test; `--force` with `--mutate` to force; interrupted runs save partial results. Limits: changes outside mutated and test files (dependencies, env vars, `.snap`) are not detected; Vitest has "Full" test reporting.
- Typical PR command: `npx stryker run --mutate "$(changed files joined)" --reporters clear-text,json` with the changed list passed through an env var, not interpolated.

### Reporters, thresholds, runtime

- `reporters` default `['clear-text','progress','html']`; available: `html, json, progress, clear-text, dots, dashboard, event-recorder, mutation-timings`. `jsonReporter.fileName` default `reports/mutation/mutation.json`. `clearTextReporter` defaults include `reportScoreTable: true`, `skipFull: false` [configuration].
- JSON report follows the mutation-testing report schema: required `schemaVersion, thresholds, files`; per file `language, source, mutants`; mutant required `id, mutatorName, location, status`; status enum `Killed, Survived, NoCoverage, CompileError, RuntimeError, Timeout, Ignored, Pending` ([schema](https://raw.githubusercontent.com/stryker-mutator/mutation-testing-elements/master/packages/report-schema/src/mutation-testing-report-schema.json)).
- `thresholds` default `{ high: 80, low: 60, break: null }`: score `< break` -> exit code 1; all three values must be supplied together; `break: null` never fails [configuration].
- Runtime knobs [configuration]: `concurrency` default `n-1` cores (or `n` if `n <= 4`), accepts `"50%"`; `timeoutMS` 5000, `timeoutFactor` 1.5; `dryRunTimeoutMinutes` 5; `ignoreStatic` false ("big performance penalty" for static mutants); `disableTypeChecks` default true; `tempDirName` `.stryker-tmp` (sandbox copy of sources, deleted after success; `ignorePatterns` excludes files from the copy); `inPlace` false.
- Incremental docs: "mutation testing still takes time", hence incremental for CI [incremental].

```json
{
  "testRunner": "vitest",
  "vitest": { "related": true },
  "reporters": ["clear-text", "json"],
  "jsonReporter": { "fileName": "reports/mutation/mutation.json" },
  "thresholds": { "high": 80, "low": 60, "break": 50 },
  "incremental": true,
  "ignoreStatic": true
}
```

### Vitest CLI for changed code

- `vitest related <files>`: "Run only tests that cover a list of source files. Works with static imports ... but not the dynamic ones"; paths relative to root; pass `--run` to avoid watch mode [CLI](https://vitest.dev/guide/cli).
- `--changed [commit/branch]`: "Run tests that are affected by the changed files"; no value = uncommitted changes; examples `--changed HEAD~1`, `--changed origin/develop`; coverage report then includes only connected files; a change to the Vitest config or `package.json` triggers a full rerun by default via `forceRerunTriggers` [changed](https://vitest.dev/config/changed). In CI this needs the base ref fetched (checkout default fetches only one commit: `fetch-depth` [checkout README](https://raw.githubusercontent.com/actions/checkout/main/README.md)).
- Other CLI options: `--run`, `--passWithNoTests`, `--coverage.enabled`, `--reporter` (includes `json`, `junit`, `github-actions`), `--outputFile`, `--shard <index>/<count>`, `--bail`, `--silent` [CLI].
- Coverage ([guide](https://vitest.dev/guide/coverage), [config](https://vitest.dev/config/coverage)): `npm i -D @vitest/coverage-v8`; `coverage.provider: 'v8'`; reporters `text, json, json-summary, lcov, html, html-spa`; `coverage.include` default "Files that were imported during test run" ("By default only files covered by tests are included"), so set `include: ['src/**/*.{ts,tsx}']` to see untested files; `coverage.thresholds` supports `lines, functions, branches, statements, perFile, autoUpdate` and glob-pattern thresholds; `reportsDirectory` default `./coverage`; reporter default `['text','html','clover','json']`; since 3.2.0 v8 uses AST-based remapping.

## Findings that contradict the planned job split

1. Default claude-code-action auth yields a write-scoped GitHub App token; the agent job holds a write token unless `github_token: secrets.GITHUB_TOKEN` (read-only job perms) is passed.
2. `.claude/agents`, `.claude/skills`, `.claude/settings.json`, `CLAUDE.md` are taken from the PR base branch on `pull_request`; PR-added or PR-edited ones are discarded. Merge them to the base branch first, or use `--agents` JSON.
3. apply's push with `GITHUB_TOKEN` triggers no workflows; verify must run in the same run on the new SHA, and any required check on the new head commit will not be produced by other workflows.
4. The agent job runs PR code (vitest) with the Anthropic key in the Claude process env; scrub subprocess env (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`), since Bash rules are "not a security boundary".
5. `structured_output` is LLM-produced; consuming it with `${{ }}` in `run:` (as the action's docs do) is script injection; use env vars.
