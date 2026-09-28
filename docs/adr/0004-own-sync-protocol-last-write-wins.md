# Own sync protocol with per-field last-write-wins

The client is offline-first (IndexedDB) and syncs phone and desktop through a small custom protocol: every change is a timestamped, per-field operation pushed to the server; devices pull what they have not seen; on conflict the latest write per field wins; deletions are tombstones (backing the 30-day Trash). One user editing on two devices does not need CRDTs, and sync libraries (RxDB, PowerSync, ElectricSQL) tend to presume a specific backend, which would lock in hosting that is still tentative (ADR-0005).

## Considered Options

- Sync library: less code, but ties the server to Postgres or a vendor.
- CRDTs (Automerge, Yjs): correct merges for concurrent editing, far more complexity than one user needs.
