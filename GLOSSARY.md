# Taskly Test Automation

The agent, skills, and PR workflow that add and maintain unit tests for the Taskly app (frontend and backend).

## Language

**Test Agent**:
The custom agent that reads a pull request's changes and writes or updates unit tests for changed behavior.
_Avoid_: bot, test generator, AI reviewer

**PR Run**:
One execution of the Test Agent against one pull request head commit.
_Avoid_: job, build, pipeline run

**Behavior**:
An observable outcome of a module's public interface (return value, HTTP response, rendered output, call at a system boundary). The only thing tests assert on.
_Avoid_: implementation detail, internals

**Skip**:
A Test Agent decision not to write tests for a changed file, always recorded with a reason (no behavior change, non-logic file, already covered).
_Avoid_: ignore, exclusion

**Candidate**:
A changed file that the classification passes to the Test Agent because it holds app logic; every other changed file is a Skip.
_Avoid_: target, testable file

**Seam**:
An agreed public interface where tests drive the app, with the one thing a test may fake there. Listed per package in `docs/test-seams.md`; a Behavior with no Seam is a Skip.
_Avoid_: mock point, test hook

**Suspected Bug**:
A generated test that fails because production code appears wrong rather than the test. Reported in the PR, never committed.
_Avoid_: failing test, flaky test

**Verification Job**:
The workflow step, independent of the Test Agent, that runs the full test suites, coverage, mutation testing, and smoke checks on the final commit. Its results, not the agent's claims, decide the PR check status.
_Avoid_: agent self-check, test step

**Decision Log**:
The Test Agent's structured record of one run: per changed file, its decision, reason, Behaviors, tests, and attempts, plus a run summary.
_Avoid_: agent output, run log
