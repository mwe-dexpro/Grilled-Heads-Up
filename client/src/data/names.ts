/**
 * How Lists and Tags are ordered and told apart by name. Case does not matter ("errand" is "Errand"), accents do
 * ("Cafe" is not "Café"), and a letter written as one character or as two (é) is the same letter.
 */

/** By the alphabet, ignoring case and accents; equal names in the order they were created. */
export function byName(a: { name: string; createdAt: string }, b: { name: string; createdAt: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.createdAt.localeCompare(b.createdAt);
}

/** Whether two names are the same Tag or List name: spaces around them and case are ignored, accents are not. */
export function sameName(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;
}
