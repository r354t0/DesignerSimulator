import type { PracticeTag } from "./practiceDocument.ts";

/**
 * Search the declared BOOL tags; never fabricate a tag from arbitrary input.
 * Exact prefix matches rank first, then substring matches in name/description.
 */
export function filterPracticeTags(
  tags: readonly PracticeTag[],
  query: string,
): PracticeTag[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...tags].sort((a, b) => a.name.localeCompare(b.name));

  return tags
    .filter((tag) =>
      tag.name.toLocaleLowerCase().includes(normalized) ||
      tag.description.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => {
      const aStarts = a.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1;
      const bStarts = b.name.toLocaleLowerCase().startsWith(normalized) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    });
}
