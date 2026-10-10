# Complete a task

Complete a task lets a user tick a task done from the list and untick it back to active, with the status badge and a notice confirming each change.

## Sub-features

- `complete-mark` marks an active task completed.
- `complete-unmark` returns a completed task to active.

## How to get to it (user POV)

- Click the checkbox at the right of a task in the list.

## Driving it with ui.sh

Preconditions:

- Baseline state plus one active task titled `Toggle me`, created with `curl -s -X POST -H 'Content-Type: application/json' -d '{"title":"Toggle me"}' "$WEB/api/todos"` and `$U reload`.

- **Mark completed.** Click the checkbox's visible box through its label. Run `$U click "getByRole('checkbox', { name: 'Complete: Toggle me' }).locator('xpath=..')"`. The status reads `Another task complete. Well done!`, the checkbox is renamed `Mark as active: Toggle me` and is `[checked]`, and the badge reads `Completed`.
- **Mark active.** Run `$U click "getByRole('checkbox', { name: 'Mark as active: Toggle me' }).locator('xpath=..')"`. The status reads `Task marked as active.` and the badge reads `To do`.
- **Proof.** Snapshot after each toggle (`complete-task.marked.aria.yml`, `complete-task.unmarked.aria.yml`) and save `curl -s "$API/api/todos"` after the first toggle. The stored row has `"completed":true`.

## Gotchas

- Toggle by clicking the parent label, as a user does. The real input is visually hidden under a decorative box, so `$U check` on it times out.
- The checkbox's accessible name changes after each toggle. Re-target by the new name.
- A due-date badge gains ` · overdue` only for active tasks with a past due date. Completing such a task removes it.
