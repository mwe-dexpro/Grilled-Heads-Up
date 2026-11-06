import { eventRecordType } from "../events/eventStore";
import { listRecordType } from "../lists/listStore";
import { tagRecordType } from "../tags/tagStore";
import { taskRecordType } from "../tasks/taskStore";
import type { RecordType, Synced } from "./replica";

/**
 * Everything that syncs. To sync a new kind of record, register it here (see "Adding a record type" in the
 * README); the sync engine and the server need no change.
 */
export const recordTypes: Array<RecordType<Synced>> = [taskRecordType, eventRecordType, listRecordType, tagRecordType];
