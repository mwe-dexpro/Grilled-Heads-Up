# Grilled Heads-Up

A personal calendar and to-do app that links tasks to the events they prepare for, and warns when an event is at risk because its preparation is not done. The UI is English and German; each term lists its German UI label.

## Planning

**Event**:
Anything dated that tasks can attach to: a timed appointment or an all-day deadline. An Event inside a Project is what the concept calls a milestone; it is not a separate thing.
_German UI_: Termin
_Avoid_: Milestone, Appointment, Deadline (as separate concepts)

**Series**:
The recurrence rule of a recurring Event (e.g. yearly birthday, weekly home game).
_German UI_: Serie
_Avoid_: Recurring template

**Occurrence**:
One dated instance of a Series. Each new Occurrence copies the Tasks of the previous one as they ended up.
_German UI_: Termin der Serie
_Avoid_: Instance, repetition

**Task**:
A single thing to do, with an optional date and time. Belongs to at most one List and at most one Event.
_German UI_: Aufgabe
_Avoid_: To-do, item, action

**Subtask**:
A checklist entry inside a Task (one level only, no own date).
_German UI_: Unteraufgabe
_Avoid_: Child task, step

**Linked task**:
A Task attached to an Event.
_German UI_: verknüpfte Aufgabe

**Offset**:
The distance of a Linked task's date from its Event (e.g. −7 days); the task's date follows the Event when it moves.
_German UI_: Abstand zum Termin
_Avoid_: Relative date, lead time

**Pinned**:
A Linked task whose date is fixed and no longer follows its Event.
_German UI_: fixiert

**Preparation task**:
A Linked task dated on or before its Event. Only these determine At risk and Critical.
_German UI_: Vorbereitung

**Follow-up task**:
A Linked task dated after its Event (e.g. thank-you card). Counts toward Progress, never toward risk.
_German UI_: Nachbereitung

**Reminder**:
A push notification at a chosen moment for a Task or an Event; both can have several.
_German UI_: Erinnerung
_Avoid_: Alarm, notification (for the concept)

## Organising

**List**:
A named group of Tasks and Events.
_German UI_: Liste

**Project**:
A List explicitly marked as a project; it shows its Events with their Progress.
_German UI_: Projekt
_Avoid_: Smart list

**Tag**:
A label on a Task; a Task can have several.
_German UI_: Kategorie
_Avoid_: Category (in code), label

## Status

**Overdue**:
A Task that is not completed and whose date is before today.
_German UI_: überfällig

**Late**:
A Task due today whose time has already passed; it stays in Today, it is not Overdue.
_German UI_: verspätet

**At risk**:
An Event with at least one Overdue Preparation task.
_German UI_: gefährdet
_Avoid_: Endangered, in danger

**Critical**:
An Event that is today or tomorrow and still has open Preparation tasks.
_German UI_: kritisch

**Progress**:
Completed Tasks ÷ all Tasks (deleted ones excluded) of an Event, List or Bucket; whole Tasks only, Subtasks do not count.
_German UI_: Fortschritt
_Avoid_: Completion rate

## Home screen

**Bucket**:
A time-horizon section of the home screen: Overdue, Today, Tomorrow, Next 3 days, Later, Inbox.
_German UI_: Bereich
_Avoid_: Section, group

**Overdue bucket**:
The Bucket at the top holding every Overdue Task until the user completes, reschedules or deletes it.
_German UI_: Überfällig

**Inbox**:
The Bucket for Tasks without a date.
_German UI_: Eingang
_Avoid_: Backlog, Someday

**Zen mode**:
A view showing only today's Tasks and Events, with Overdue collapsed to a single line.
_German UI_: Zen-Modus
_Avoid_: Focus mode

**Project view**:
The view of one List or Project.
_German UI_: Projektansicht
_Avoid_: Focus view

## Actions

**Complete**:
Mark a Task as done.
_German UI_: erledigen
_Avoid_: Check off, finish, close

**Reschedule**:
Give a Task a new date (tomorrow, the day after, next week = next Monday, or a chosen date). For a Linked task this changes its Offset.
_German UI_: verschieben
_Avoid_: Snooze, postpone, defer

**Move** (an Event):
Give an Event a new date; the user decides whether its Linked tasks follow (keep Offset) or stay (become Pinned).
_German UI_: Termin verschieben

**Trash**:
Where deleted Tasks and Events stay for 30 days before they are gone.
_German UI_: Papierkorb

**Planning wizard** (after v1):
A guided flow: brain dump everything into the Inbox first, then assign dates, Lists and Tags in bulk.
_German UI_: Planungsassistent
