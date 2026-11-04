/**
 * Makes a function that reads something and hands it on, where reads can overlap (the app reloads after a local
 * change and after a sync, and either can come while another read is under way). Only the read that started last
 * hands its result on: it saw the newest data, however late an older read finishes. A read that finds nothing
 * (`null`, e.g. the stores are not open yet) hands nothing on.
 */
export function createListReader<T>(read: () => Promise<T | null>, deliver: (value: T) => void): () => Promise<void> {
  let latest = 0;
  return async () => {
    const mine = ++latest;
    const value = await read();
    if (mine === latest && value !== null) deliver(value);
  };
}
