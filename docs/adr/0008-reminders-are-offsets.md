# Reminders are stored as Offsets from their Task or Event

A Reminder stores a distance from its Task's or Event's date and time (e.g. 1 day before, 0 = at the time) rather than an absolute moment. It then moves with its Task or Event, including when a Linked task follows a Moved Event or a Series copies Tasks into the next Occurrence, and it maps directly onto iCalendar/Outlook alarms (`VALARM` with a relative `TRIGGER`), which the Outlook sync after v1 needs. For a Task or all-day Event without a time, the distance counts from the date at the default reminder time (08:00, adjustable).

## Considered Options

- Absolute reminder moments: simpler to send, but every Move, Reschedule and Series copy would have to recalculate them, and Outlook sync would need to convert both ways.
