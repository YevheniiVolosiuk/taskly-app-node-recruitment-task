# The Test Agent does not run on fork pull requests

The workflow triggers on `pull_request` only, and the Test Agent job is skipped when the PR head lives in a fork; plain test suites still run. A fork PR is untrusted code: running an agent that holds the Anthropic credential and a write path next to it invites secret theft, prompt injection through the diff, and the "pwn request" pattern. GitHub already withholds secrets from fork PRs on `pull_request`, so this aligns with the platform's model instead of working around it.

## Considered Options

- **`pull_request_target`**: gives fork PRs secrets and a write token; checking out and executing PR code there is the pwn-request pattern. Rejected.
- **Maintainer-applied label triggering a locked-down comment-only run**: viable, deferred as a production extension.
