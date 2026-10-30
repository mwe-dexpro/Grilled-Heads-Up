# Alignment: prototype ↔ repo concept

Compared against `CONTEXT.md`, `docs/v1-scope.md`, `docs/Konzept.md` and ADRs 0001–0009 (updated 2026-10-30). Every item below is decided; §4 and §5 list what is out of scope or still to build. Rule: **terminology and behaviour follow the repo; look and layout follow the prototype.** Where this file and the README disagree, this file wins.

## 1. Decided: behaviour and layout (product owner, 2026-10-16)

Navigation and home
- **Tab bar: 3 tabs**, Today · Calendar · Projects. No Plan tab in v1; it returns with the Planning wizard.
- **Projects tab**: replace the "Focus · next 3 days" segment with **"Projects & Lists" | "Events"**. "Projects & Lists" shows Projects as cards with Progress and plain Lists as rows. "Events" shows upcoming Events with Linked tasks, At risk first (the 4i cards for Mom's birthday, Leo's home game and the weekend belong here).
- **Progress ring** (4a) = Progress of the Today bucket. It must agree with the "N left" next to the Today heading. Overdue is not part of it; it has its own count.
- **Overdue count badge**: a count pill next to "Overdue"; from 5 items it becomes a filled amber pill.
- **Overdue bulk action**: "Reschedule all…" opens the Reschedule sheet (4d) for every Overdue Task at once, with Tomorrow first.
- **Overdue Tasks are rescheduled to tomorrow or later, never to today.** The Reschedule sheet has no "Today" option, and "Pick a date" starts at tomorrow for an Overdue Task.
- **Late** (due today, time passed): the time in the second line turns amber; the Task stays in Today and the check circle stays grey.
- **Second line of a Task row**: the Event name in blue if Linked, else the List name in blue, else nothing; then " · " and the Offset, date or Subtask count.

Events
- **No Task dependencies.** Drop "Wrap gift waits on it", "Latest safe date", "Day before wrapping · latest safe" (4b, 4d). In 4d the Event-aware option becomes **"Day before the event"**; in 4b the explanation line names the Event instead ("Gift is 1 day overdue. Mom's birthday is in 8 days."). Kept as a possible future feature in ADR-0009.
- **Risk band shows overall Progress**, not a Preparation-only count: "1 of 3 prepared" → **"1 of 3 done"** (4b, 4j). Progress means the same everywhere (CONTEXT.md).
- **Critical**: a filled `#b35600` pill with white text (e.g. "Tomorrow · 2 open"). When an Event is both At risk and Critical, Critical is shown. No red is introduced.
- **Multi-day Events** (4c "Fri Oct 17 – Sun Oct 19"): Offsets count from the start day; Linked tasks after the start day are Follow-up tasks (CONTEXT.md, ADR-0003).
- **Move question** (4g): completed Tasks never move; Pinned Tasks are left out and shown collapsed ("2 pinned tasks stay"); Follow-up tasks get the same default as the rest.
- **New-Event form** (4h without the suggestion card): Title, All-day, Start/End, Repeats, List/Project, Reminders, Location, Notes.
- **Overdue Tasks in the Calendar** (4j): in today's Task strip, not as dots on their original past day.

Tasks
- **Reminders** are distances from the Task's or Event's date and time ("1 day before", "at 9 am on the day"), ADR-0008. The editor offers presets plus a custom distance; 08:00 is the default time for Tasks without a time.
- **Reschedule count** is stored from v1 on but not shown until Smart hints (after v1). The prototype's "snoozed 3×" / "Snoozed 1×" are not shown in v1.
- **Delete** swipe action and buttons: ink `#1d1d1f` background, white text.

## 2. Decided: copy to fix (product owner, 2026-10-30)
The prototype uses terms CONTEXT.md avoids. Use the right-hand wording in the EN/DE translation files.
1. "Snooze", "Snooze all to today", "snoozed 3×", "Snoozed 1×" (4a, 4d) → **Reschedule** ("Reschedule all…"; the count is hidden in v1, see §1)
2. Swipe "Done", button "Mark done" (4a, 4c) → **Complete**
3. "Move" next to a Linked task (4b), "Move to" chips (4c), "Move" sheet header (4d) → **Reschedule**. *Move* is only for Events.
4. "milestones" / "milestone 'Sorted' next" (4i, basement) → **Events** in the Project
5. "Move 3 tasks too?" (4g) uses Move for Tasks → "Should its 3 tasks follow?" with the options **Follow** (keep timing) and **Stay** (pin the date)
6. "Packing list" heading and "Add item" (4c; "item" is on the avoid list) → **"Subtasks"** and **"Add subtask"**
7. "On track" / "No deadline" (4c, 4i) are not glossary terms → treat as UI copy only, German "im Plan" / "ohne Termin"
8. "items" in the wizard (4e, 4f) → "tasks" when the wizard is built (after v1)

## 3. Decided: visual and platform (product owner, 2026-10-30)
1. **Amber text contrast**: `#c25e00` is 4.29:1 on white and 3.94:1 on parchment, so 14px 600 fails WCAG AA (it is not "large text"); the 11px "Gift · overdue" label fails worse. Use `#b35600` for all amber text and fills (4.94 / 4.54); `#c25e00` only for dots and icons.
2. **Grey meta text**: `#7a7a7a` is 4.29:1 on white and 3.94:1 on parchment, failing AA at 14px (section counts, 10px tab labels). Darken the token to `#6e6e73` (5.07 / 4.66).
3. **Inter from Google Fonts** (`tokens/fonts.css`): breaks offline use and sends visitor IPs to Google (ruled unlawful by a German court in 2022). Bundle Inter as woff2 (Latin + Latin-extended for umlauts), precache it in the service worker. The screenshots were rendered in Ubuntu, so don't match their font metrics pixel for pixel.
4. **Android back gesture vs swipe rows**: a swipe left from the right edge can trigger system back, and swipes aren't reachable without touch. Ignore swipes that start in the edge zone; offer the same actions via long-press and in Task detail.
5. **German text length**: 34px titles already wrap in English (4c). Set `lang="de"` with `hyphens: auto`; check chips and rows at 360px width ("Nächste 3 Tage", "überfällig", "verschieben").
6. **Dark mode**: not designed, though Tile has dark tokens. Light only in v1, colours as tokens so dark mode can follow.
7. **Demo data contradicts itself** ("Buy gift" 7 days before Oct 12 can't be overdue on Oct 4; "Pick up cake" in 4j is missing from 4b; Leo's game on Oct 10 vs Oct 17; ring "4 of 9"). Don't use it as test fixtures; build fixtures from the domain rules.
8. **Platform** (unchanged): drawn in an iPhone frame, v1 is an Android/Chrome PWA (ADR-0001). Keep the layout, use safe-area insets; the text back button ("‹ Calendar") stays as an in-app control alongside Android system back.

## 4. After-v1 features drawn in the prototype
- Planning wizard (4e, 4f): after v1 (#2). No Plan tab in v1 (§1).
- Suggested tasks (4h): after v1 (#3). For v1 the new-Event form is 4h without the suggestion card.
- Smart hint "rescheduled 3×" (4a): after v1 (#4). For v1 just show the age.

## 5. v1 features with no screen yet (Claude Code: build these in the same visual language)
Suggested order: Later + Inbox buckets and quick add on every screen → Delete/undo/Trash → Critical → Reminders editor → Calendar week/day views → Series editor → Zen mode → bulk-select → Settings, sign-in, empty states.

Home
- **Later** and **Inbox** buckets (the prototype stops at Next 3 days)
- **Zen mode** view + toggle: today only, no risk colours, Overdue collapsed to one line
- **Bulk-select** + assign date (home, Inbox, Project view)
- **"Show completed"** toggle (per List/Project/Event)

Task actions
- **Delete** swipe action + **undo toast** (above the tab bar, never under the FAB) + **Trash** (30 days)
- Reschedule a Linked task past its Event → warning (4d hints at it; also needed in Task detail)
- **Reminders** editor (§1)
- **Tags** on Tasks; assigning List/Event in Task detail

Events
- **Follow-up tasks**: a separate "Follow-up" group in Event detail
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
