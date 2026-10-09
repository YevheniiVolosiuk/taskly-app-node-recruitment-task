# The Test Agent writes only test files; Suspected Bugs are reported, not committed

The Test Agent may create or edit test files only, enforced by tool and path restrictions rather than by prompt. When a generated test still fails after three fix attempts and the evidence points at production code, the test is not committed: it is reported in the PR as a Suspected Bug with the failing assertion. The obvious alternative, letting the agent "fix" code or adjust the test until it goes green, produces tests that lock in bugs and a green suite over a broken app.
