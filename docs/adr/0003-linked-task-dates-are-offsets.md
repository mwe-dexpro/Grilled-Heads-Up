# Linked task dates are stored as Offsets from their Event

A Linked task stores an Offset (e.g. −7 days) and its date is derived from the Event, rather than storing an absolute date plus a reference. This matches how the user thinks ("7 days before the birthday"), makes Moving an Event a per-task choice between following (keep Offset) and Pinned, and lets Series Occurrences and future suggested tasks copy Tasks without recalculating dates. Rescheduling a Linked task changes its Offset.
