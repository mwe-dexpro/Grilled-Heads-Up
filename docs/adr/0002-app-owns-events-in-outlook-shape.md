# The app owns Events in v1, modelled in Outlook's shape

In v1 Events are created in the app; there is no Outlook connection. Owning Events keeps the Move question, Series task copying and Offsets fully under the app's control while the core idea (At risk warnings) is proven. Outlook sync (personal Outlook.com, one-way Outlook → app first, two-way later) is the first step after v1, so Events are modelled like Outlook/iCalendar events from day one: iCalendar RRULE for Series, exceptions for moved or cancelled Occurrences, a time zone on timed Events, floating all-day Events, and an external source/ID field.

## Consequences

- With Outlook → app sync, an Event may move outside the app; the Move question must then be raised when the change is detected, not when the user acts.
