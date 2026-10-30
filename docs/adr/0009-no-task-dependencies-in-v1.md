---
status: proposed
---

# No Task dependencies in v1 (possible future feature)

The UI prototype showed Tasks waiting on each other ("Wrap gift waits on it", "Latest safe date: Fri Oct 10"). v1 has no dependencies between Tasks: each Linked task relates only to its Event through its Offset, and At risk depends only on Overdue Preparation tasks. Dependencies would need a graph with cycle checks, extra sync fields (ADR-0004) and their own risk rules, and no v1 success criterion depends on them. The Reschedule sheet offers "Day before the event" instead, which follows from the Offset alone.

This may well be a useful feature later: a "latest safe date" per Task, derived from the Tasks that wait on it, would warn earlier than At risk does. Revisit it once v1 is in daily use; if accepted, add the concept to CONTEXT.md first.
