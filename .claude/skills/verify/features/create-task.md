# Create a task

Create a task lets a user add a titled task with an optional description, priority, and due date from a side drawer, and see it at the top of the task list.

## Sub-features

- `create-open` opens the `New task` drawer from the header button or the empty state.
- `create-save` persists title, description, priority, and due date.
- `create-validate` blocks saving an empty title with an inline message.
- `create-cancel` closes the drawer without creating a task.

## How to get to it (user POV)

- Choose the `New task` button in the page header.
- Choose `Add your first task` in the empty state, shown only when no tasks exist.

## Driving it with ui.sh

Preconditions:

- Baseline state from the [map README](./README.md), with no tasks.

- **Open from empty state.** Run `$U click "getByRole('button', { name: 'Add your first task' })"`. A dialog appears with focus in the `Task title *` textbox.
- **Validate.** Run `$U click "getByRole('button', { name: 'Save task' })"` with the title empty. `Enter a task title.` appears and the dialog stays open.
- **Enter fields.** Run `$U fill "getByRole('textbox', { name: 'Task title *' })" "Verify release notes"`, `$U fill "getByRole('textbox', { name: 'Description (optional)' })" "Driven by the verify skill"`, `$U select "getByRole('combobox', { name: 'Priority' })" high`, and `$U fill "getByRole('textbox', { name: 'Due date (optional)' })" 2030-01-15`.
- **Save.** Run `$U click "getByRole('button', { name: 'Save task' })"`. The dialog closes, the status reads `New task added.`, and the `Task list` region has a heading `Verify release notes` with badges `To do`, `High`, and `15 Jan 2030`.
- **Open from header.** Run `$U click "getByRole('button', { name: 'New task' })"`, fill `Task title *` with `Discard me`, then run `$U click "getByRole('button', { name: 'Cancel' })"`. No `Discard me` heading appears.
- **Proof.** Run `$U snapshot --filename=create-task.saved.aria.yml`, `$U screenshot --filename=create-task.saved.png`, and `curl -s "$API/api/todos" > "$EVIDENCE/create-task.saved.api.json"`. The stored row has `"priority":"high"` and `"due_date":"2030-01-15"`.

## Gotchas

- The drawer is a `dialog` with no accessible name. Target the controls inside it by name.
- The `New task` header button is disabled while the list loads. Wait for the list or the empty state before clicking it.
- The date textbox takes `YYYY-MM-DD` through `fill`. The list renders it as `15 Jan 2030`.
- `Add your first task` exists only while the database is empty.
