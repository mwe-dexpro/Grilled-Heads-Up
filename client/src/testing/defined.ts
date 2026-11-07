/**
 * The value, failing the test with a clear message when there is none: for a list entry or a record field the test
 * has just made sure exists. (A `!` would say the same without saying what was missing when it is not there.)
 */
export function defined<T>(value: T | undefined, what = "value"): T {
  if (value === undefined) throw new Error(`Expected a ${what}, but there was none.`);
  return value;
}
