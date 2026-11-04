# A hybrid logical clock orders sync changes

Every synced field change carries a hybrid logical clock timestamp (ADR-0004): the device's wall-clock time in milliseconds, a counter, and the device id, written as fixed-width text so that comparing two timestamps as strings orders them. The later timestamp wins per field, on the devices and on the server. A device moves its clock past every timestamp it sees, including the server's time sent with each push and pull, so an edit made after seeing another device's change always wins over it, even when the device's own clock runs slow. All fields a store operation writes share one timestamp, so fields that belong together (a Linked task's Event, Offset and date; an Event's all-day flag, dates, times and time zone) are won or lost as a unit. This holds only if a store operation writes all of them whenever it changes any: the Event form writes only the fields a person changed, except that a change to when the Event is writes all six time fields. The device id breaks ties, so two devices never produce equal timestamps. A device whose clock runs far ahead wins concurrent conflicts until real time catches up and pulls other devices' clocks forward; that is acceptable for one person on two devices.

## Considered Options

- Server-assigned ordering: the order in which changes reach the server decides. Breaks "the later edit wins" for offline edits, because the device that syncs last would win even if its edit was made first.
- Plain wall clock: a slow clock makes a later edit lose to an earlier one from a device with a faster clock.
- Vector clocks or CRDTs: detect and merge truly concurrent edits, far more than one person on two devices needs.
