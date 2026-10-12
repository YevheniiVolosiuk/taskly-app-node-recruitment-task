# Find tasks

Find tasks lets a user narrow the list by text and status and reorder it by creation, priority, or due date. Filters reset on reload.

## Sub-features

- `find-search` matches the query against title and description, case-insensitively.
- `find-status` shows all, active (`To do`), completed, overdue, or due-today tasks. Overdue means not completed and due before today (UTC). Due today means not completed and due today (UTC).
- `find-sort` orders by `Newest`, `Priority` (high first), or `Due date` (soonest first, undated last).
- `find-empty` shows `No matching tasks` when filters hide every task.

## How to get to it (user POV)

- Use the `Task filters` region under the page header: `Search tasks`, `Status`, and `Sort by`.

## Driving it with ui.sh

Preconditions:

- Baseline state plus four tasks created through `POST /api/todos`, in this order: `{"title":"Alpha","priority":"low","due_date":"2030-03-01"}`, `{"title":"Bravo","priority":"high"}`, `{"title":"Charlie","description":"release prep","priority":"medium","due_date":"2030-01-01","completed":true}`, and `{"title":"Delta","due_date":"2020-01-01"}`. Then run `$U reload`.

- **Search.** Run `$U fill "getByRole('textbox', { name: 'Search tasks' })" "release"`. Only `Charlie` is listed, matched by its description. Clear it with `$U fill "getByRole('textbox', { name: 'Search tasks' })" ""`.
- **Status.** Run `$U select "getByRole('combobox', { name: 'Status' })" active`. `Delta`, `Bravo`, and `Alpha` are listed. Run it again with `completed`. Only `Charlie` is listed. Run it again with `overdue`. Only `Delta` is listed. Reset with `all`.
- **Empty.** Set status `completed` and search `Alpha`. The heading `No matching tasks` appears.
- **Sort.** Run `$U select "getByRole('combobox', { name: 'Sort by' })" priority`. The order is `Bravo`, `Delta`, `Charlie`, `Alpha`. With `due`, the order is `Delta`, `Charlie`, `Alpha`, `Bravo`. With `newest`, the order is `Delta`, `Charlie`, `Bravo`, `Alpha`.
- **Due today.** Create `{"title":"Echo","due_date":"<today>"}` (`<today>` is `date -u +%F`) through `POST /api/todos`, then run `$U reload`. Set status `due_today`. Only `Echo` is listed, and its badge reads ` · due today`. Set status `overdue`. Only `Delta` is listed.
- **Proof.** Snapshot each state (`find-tasks.<step>.aria.yml`) and read the order of the level-3 headings in the `Task list` region.

## Gotchas

- `select` takes option values (`all`, `active`, `completed`, `overdue`, `due_today`, `newest`, `priority`, `due`), not the visible labels.
- Filters are not in the URL or storage. A reload resets them to `All statuses` and `Newest`.
- Switching status shows `Loading your tasks…` until the list arrives. Wait for the expected headings before you snapshot.
