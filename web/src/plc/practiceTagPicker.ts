import { isTimerKind, type EditableKind, type PracticeTag } from "./practiceDocument.ts";

export interface TagPickerRow {
  name: string;
  type: "BOOL" | "DINT" | "TIMER";
  description: string;
  selectable: boolean;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}

/**
 * Studio-style selector: TIMER parents are collapsible; members belong to the
 * parent, not to a flat list of standalone variables.
 *
 * XIC/XIO can read .EN/.TT/.DN; PRE/ACC remain visible but disabled.
 * OTE/OTL/OTU/ONS only receive declared BOOLs. Timer tools get TIMER roots.
 */
export function getTagPickerRows(
  tags: readonly PracticeTag[],
  kind: EditableKind,
  query: string,
  expanded: readonly string[] = [],
): TagPickerRow[] {
  const term = query.trim().toLocaleLowerCase();
  const matches = (name: string, desc: string) =>
    (name + " " + desc).toLocaleLowerCase().includes(term);
  const roots = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  const rows: TagPickerRow[] = [];
  const boolContact = kind === "XIC" || kind === "XIO";
  for (const tag of roots) {
    if (isTimerKind(kind)) {
      if (tag.type === "TIMER" && matches(tag.name, tag.description)) {
        rows.push({ name: tag.name, type: "TIMER", description: tag.description,
          selectable: true, depth: 0, expandable: false, expanded: false });
      }
      continue;
    }
    if (tag.type === "BOOL") {
      if (matches(tag.name, tag.description)) {
        rows.push({ name: tag.name, type: "BOOL", description: tag.description,
          selectable: true, depth: 0, expandable: false, expanded: false });
      }
      continue;
    }
    if (!boolContact || tag.type !== "TIMER") continue;
    const members = (["PRE", "ACC", "EN", "TT", "DN"] as const).map((member) => ({
      name: tag.name + "." + member,
      type: ["PRE", "ACC"].includes(member) ? "DINT" as const : "BOOL" as const,
      description: member + " · " + tag.description,
      selectable: member === "EN" || member === "TT" || member === "DN",
      depth: 1, expandable: false, expanded: false,
    }));
    const parentMatches = matches(tag.name, tag.description);
    const hits = term ? members.filter((member) => matches(member.name, member.description)) : members;
    if (term && !parentMatches && !hits.length) continue;
    const open = Boolean(term) || expanded.includes(tag.name);
    rows.push({ name: tag.name, type: "TIMER", description: tag.description,
      selectable: false, depth: 0, expandable: true, expanded: open });
    if (open) rows.push(...(parentMatches ? members : hits));
  }
  return rows;
}
