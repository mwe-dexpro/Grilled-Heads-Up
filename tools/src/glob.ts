/** One folder level of a path against one level of a glob: `*` stands for any text (also none), `?` for one character. */
function levelMatches(pattern: string, text: string): boolean {
  if (pattern === "") return text === "";
  if (pattern.startsWith("*")) return levelMatches(pattern.slice(1), text) || (text !== "" && levelMatches(pattern, text.slice(1)));
  return text !== "" && (pattern.startsWith("?") || pattern.startsWith(text.slice(0, 1))) && levelMatches(pattern.slice(1), text.slice(1));
}

function levelsMatch(globs: string[], parts: string[]): boolean {
  const [glob, ...moreGlobs] = globs;
  if (glob === undefined) return parts.length === 0;
  if (glob === "**") return levelsMatch(moreGlobs, parts) || (parts.length > 0 && levelsMatch(globs, parts.slice(1)));
  const [part, ...moreParts] = parts;
  return part !== undefined && levelMatches(glob, part) && levelsMatch(moreGlobs, moreParts);
}

/**
 * Whether a path (`server/src/auth.ts`, with `/`) is one the glob names. A glob is a path in which `*` stands for any text
 * inside one folder level, `?` for one character, and a level that is `**` for any number of folders (also none). Written by
 * hand, not with a regular expression built from text or `path.matchesGlob` (Node 22.20 and later; the engines field says 22.5).
 */
export function matchesGlob(glob: string, path: string): boolean {
  return levelsMatch(glob.split("/"), path.split("/"));
}
