/**
 * The longest texts a person can enter, in characters. Far more than anyone needs, and far below what the server
 * takes in one sync request (1 MB), so a single value is never too big to sync.
 */
export const maxTitleLength = 200;
export const maxLocationLength = 200;
export const maxNotesLength = 10_000;
/** A Tag's name: short, since it is a label and shows as a chip. */
export const maxTagLength = 50;
