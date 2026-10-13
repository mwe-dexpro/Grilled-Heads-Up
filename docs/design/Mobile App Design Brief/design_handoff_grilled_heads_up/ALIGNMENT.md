# Alignment: prototype ↔ repo concept

Compared against `CONTEXT.md`, `docs/v1-scope.md`, `docs/Konzept.md` and ADRs 0001–0007 (repo `main`, 2026-10-13). Rule: **terminology and behaviour follow the repo; look and layout follow the prototype.**

## 1. Copy to fix (prototype uses terms CONTEXT.md avoids)
- "Snooze", "Snooze all to today", "snoozed 3×", "Snoozed 1×" (4a, 4d) → **Reschedule** ("Reschedule all", "rescheduled 3×")
- Swipe "Done", button "Mark done" (4a, 4c) → **Complete**
- "Move" next to a Linked task (4b) and "Move to" chips (4c), "Move" sheet header (4d) → **Reschedule**. *Move* is only for Events.
- "Focus · next 3 days" segment (4i) → drop it, or make it **Zen mode** (which is today-only)
- "milestones" / "milestone 'Sorted' next" (4i, basement) → **Events** in the Project
- Overdue bulk action "…all to today": v1-scope says Reschedule without a date = **tomorrow**. Decide on "Reschedule all to tomorrow".

## 2. Prototype shows behaviour the domain doesn't have
- **Task dependencies**: "Wrap gift waits on it", "Latest safe date: Fri Oct 10", "Day before wrapping · latest safe" (4b, 4d). Tasks have no dependencies in the model. Either drop this copy (show "Event in 8 days" instead) or add a concept to CONTEXT.md first.
- **Progress ring "4 of 9 done"** (4a): define its scope. Suggested: Progress of the Today bucket incl. today's completed, excluding Overdue.
- **Count badge on Overdue** is missing in 4a. v1-scope: the badge always shows the count, with stronger emphasis from 5 items. Add a count pill next to "Overdue" and design the ≥5 state.

## 3. After-v1 features drawn in the prototype
- Planning wizard (4e, 4f) and the **Plan** tab: after v1 (#2). For v1, hide the tab (3 tabs: Today · Calendar · Projects), or let Plan open bulk-select on the Inbox.
- Suggested tasks (4h): after v1 (#3). For v1 the new-Event form is 4h without the suggestion card.
- Smart hint "rescheduled 3×" (4a): after v1 (#4). For v1 just show the age.

## 4. v1 features with no screen yet (Claude Code: build these in the same visual language)
Home
- **Later** and **Inbox** buckets (the prototype stops at Next 3 days)
- **Late** state (due today, time passed): stays in Today, needs a subtle marker
- **Zen mode** view + toggle: today only, no risk colours, Overdue collapsed to one line
- **Bulk-select** + assign date (home, Inbox, Project view)
- **"Show completed"** toggle (per List/Project/Event)

Task actions
- **Delete** swipe action + **undo toast** + **Trash** (30 days). Choose a Delete colour (Tile has none; suggestion: ink `#1d1d1f` bg, white text)
- Reschedule a Linked task past its Event → warning (4d hints at it; also needed in Task detail)
- **Reminders** editor: several per Task/Event, default 08:00 (adjustable in settings)
- **Tags** on Tasks; **Lists** that are not Projects; assigning List/Event in Task detail

Events
- **Critical** status (Event today/tomorrow with open Preparation tasks): needs its own treatment, distinct from At risk
- **Follow-up tasks** (after the Event): a separate "Follow-up" group in Event detail; they count toward Progress, never toward risk
- **Pinned** indicator on Linked tasks that no longer follow their Event
- **Series** editor (RRULE: daily / weekly weekdays / monthly / yearly / every N; end by date / count / never) and the "This occurrence / This and following" prompt
- Move question (4g) **expandable per task** (follow / stay toggle per row); "moved earlier → follow" variant; notice when tasks land in the past (→ Overdue)
- **Delete Event with Tasks** dialog (default: delete open, keep completed)
- Calendar: **week and day views** (Tasks as a strip at the top of each day, Events in time slots), **drag an Event** → same Move question, "passed with N open tasks" marker

App
- Quick add **"+" on every screen** (prototype: home only) → Inbox; Android share-sheet target
- Passkey sign-in + recovery code, push-permission prompt, sync/offline status
- Settings: language EN/DE, default reminder time, JSON export, Trash
- Empty states (empty Overdue = a calm "nothing overdue" line, empty day, empty Project)
- German strings: check row and chip lengths (e.g. "Nächste 3 Tage", "überfällig", "verschieben")

## 5. Platform
- The prototype is drawn in an iPhone frame; v1 is an **Android/Chrome PWA** (ADR-0001). Keep the layout and use safe-area insets. The text back button ("‹ Calendar") stays as an in-app control alongside Android system back. Bottom sheets and swipe rows work as drawn.
- Fonts: SF Pro isn't available on Android. Ship Inter (Tile fallback) or accept Roboto.

## 6. Open decisions for the product owner
1. Tab bar in v1: 3 tabs, or keep Plan (what does it open)?
2. Overdue bulk action target: tomorrow (spec) or today?
3. Drop dependency copy, or add a dependency concept?
4. Colours for Critical and Delete
5. Progress ring scope on home
