/**
 * Makes a function that reads something and hands it on, where reads can overlap (the app reloads after a local
 * change and after a sync, and either can come while another read is under way). Only the read that started last
 * hands its result on: it saw the newest data, however late an older read finishes. A read that finds nothing
 * (`null`, e.g. the stores are not open yet) hands nothing on.
 *
 * The promise a call returns ends when what is shown is at least as new as the call: an older read that was passed
 * over waits for the newest one to hand its result on, so whoever awaits it (a drop that ends its drag when its move
 * is shown) never sees the screen before the newer data arrives.
 */
export function createListReader<T>(read: () => Promise<T | null>, deliver: (value: T) => void): () => Promise<void> {
  let latest = 0;
  // The newest call's promise; a call that is passed over waits for it (it, in turn, waits for any newer one).
  let newest: Promise<void> = Promise.resolve();
  return () => {
    const mine = ++latest;
    const run = (async () => {
      const value = await read();
      if (mine !== latest) await newest.catch(() => undefined);
      else if (value !== null) deliver(value);
    })();
    newest = run;
    return run;
  };
}
