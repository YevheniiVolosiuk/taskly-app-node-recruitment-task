# Edit and delete a task

Edit and delete let a user change any field of a task in the same drawer used for creation, and permanently remove a task after a confirmation step.

## Sub-features

- `edit-save` changes fields and keeps the task's identity.
- `edit-cancel` closes the drawer without saving.
- `delete-confirm` removes the task after confirmation.
- `delete-cancel` keeps the task when the confirmation is dismissed.

## How to get to it (user POV)

- Choose the pencil button `Edit: <title>` on a task.
- Choose the bin button `Delete: <title>` on a task.

## Driving it with ui.sh

Preconditions:

- Baseline state plus one task titled `Verify release notes` (see [Create a task](./create-task.md)).

- **Open editor.** Run `$U click "getByRole('button', { name: 'Edit: Verify release notes' })"`. A dialog opens with `Task title *` prefilled.
- **Save edit.** Run `$U fill "getByRole('textbox', { name: 'Task title *' })" "Verify release notes v2"` and `$U click "getByRole('button', { name: 'Save task' })"`. The status reads `Changes saved.` and the list heading reads `Verify release notes v2`.
- **Dismiss delete.** Run `$U click "getByRole('button', { name: 'Delete: Verify release notes v2' })"`, then `$U click "getByRole('button', { name: 'Cancel' })"`. The task is still listed.
- **Confirm delete.** Run `$U click "getByRole('button', { name: 'Delete: Verify release notes v2' })"`. The dialog text reads `The task “Verify release notes v2” will be permanently deleted.` Run `$U click "getByRole('button', { name: 'Delete task' })"`. The status reads `Task deleted.` and the list shows `Add your first task` if it was the only task.
- **Proof.** Snapshot after the edit and after the delete (`edit-delete-task.edited.aria.yml`, `edit-delete-task.deleted.aria.yml`). Save `curl -s "$API/api/todos"` after each. The id stays the same across the edit, and the row is gone after the delete.

## Gotchas

- The edit and delete buttons are icon-only. Their accessible names embed the current title, so re-target after renaming.
- The confirmation dialog's quotes are typographic (`“ ”`), not ASCII.
