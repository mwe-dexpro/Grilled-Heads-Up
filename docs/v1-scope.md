# v1 scope and behaviour

Outcome of the grilling session on [the concept](./Konzept.md). Terms are defined in [CONTEXT.md](../CONTEXT.md); hard-to-reverse decisions live in [docs/adr/](./adr/).

## Product

- Personal tool first, built so it can become a product. One user in v1; the data model carries owner/assignee so sharing can come later.
- Baseline to beat: Outlook (checked often for upcoming events, but only one reminder per event) plus Microsoft To Do (lost track of it, barely opened any more).
- v1 succeeds when (a) it is used daily for 4 weeks instead of Outlook + To Do for personal planning, and (b) at least one real Event got its preparation done because the At risk warning caught it.

## In v1

- Events owned by the app (no Outlook sync yet), with Series in iCalendar RRULE form: daily, weekly on chosen weekdays, monthly by date, yearly, every N of each; end by date, count or never. Edit "this occurrence" or "this and following"; single Occurrences can be moved or cancelled.
- Linked tasks with Offsets, Preparation vs Follow-up tasks, At risk and Critical, Progress for Events, Lists/Projects and every Bucket.
- Reminders: several per Task and several per Event. A dated Task reminds on its date at a default time (08:00, adjustable) unless it has its own. One push per Event when it becomes At risk, one when it becomes Critical.
- Subtasks (one level).
- Lists, Projects, Tags.
- Home screen with Buckets, Calendar with month, week and day views (Tasks as a strip at the top of each day, Events in time slots), Project view, Zen mode.
- Capture via a "+" button on every screen (to the Inbox by default) and the Android share sheet (Web Share Target).
- Swipe actions and quick Reschedule on every Task; bulk-select and assign a date in the home screen, Inbox and Project view.
- English and German UI, English default, translation files from the first screen.

## Behaviour rules

- **Moving an Event**: one question covering all its Linked tasks, expandable per task. Default: follow when moved earlier, stay (Pinned) when moved later. Tasks pushed into the past land in the Overdue bucket. Dragging an Event in the Calendar asks the same question.
- **Rescheduling a Linked task past its Event**: allowed, with a warning.
- **Series**: an Occurrence's Tasks are copied from the previous Occurrence once that one has passed; edits therefore carry forward. A copied Task whose date would already be past lands on today.
- **Event passed with open Preparation tasks**: no "missed" status; the Tasks stay in the Overdue bucket, the Event shows "passed with N open tasks" in the Calendar.
- **Deleting an Event with Tasks**: ask; default deletes open Tasks, completed ones are kept.
- **Deleting anything**: undo toast, then Trash for 30 days.
- **Completed Tasks**: stay crossed out in place until the end of the day, then hidden; "Show completed" per List, Project and Event; the Event view always shows them.
- **Overdue bucket**: badge always shows the count, stronger emphasis from 5 items. Rescheduling removes a Task from it immediately. Reschedule without a chosen date means tomorrow.
- **Zen mode**: today's Tasks and Events without risk colours, Overdue collapsed to one line; notifications stay on.
- Weeks start on Monday. Timed Events store their time zone; all-day Events and Task dates are floating.

## After v1, in order

1. Outlook → app sync (personal Outlook.com)
2. Planning wizard
3. Suggested tasks from similar Events
4. Smart hints (e.g. rescheduled too often)
5. Time-blocking Tasks into slots / ordering within a day
6. Natural-language quick add
7. Two-way Outlook sync
8. Sharing / household
9. Rule sets and importer, only if still missed

## Tech summary

TypeScript, React + Vite PWA, offline-first on IndexedDB, Android (Chrome) first. English in code and docs. Small portable Node server in Docker with SQLite (Hetzner, tentative) for sync, Web Push and later Outlook; passkey login with a recovery code; nightly off-site backup and JSON export. See the ADRs for the reasoning.
