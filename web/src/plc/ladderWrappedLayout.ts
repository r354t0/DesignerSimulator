import {
  COIL_RIGHT_INSET, CONTACT_STEP, FIRST_CONTACT_X, GROUP_HALF_WIDTH,
  MIN_RUNG_WIDTH, PRACTICE_MAIN_Y, PRACTICE_BRANCH_GAP,
  PRACTICE_BRANCH_Y, getPracticeRungHeight, getRungGeometry,
  type LadderGroupGeometry, type VisualLadderDropTarget,
} from "./ladderDragDrop.ts";
import {
  MAX_PRACTICE_CONTACTS, isOutputKind, isTimerKind, contactCount, findInstruction,
  type EditableKind, type PracticeProject, type PracticeRung,
} from "./practiceDocument.ts";

export interface WrappedGroup extends LadderGroupGeometry {
  row: number;
  mainY: number;
}
export interface WrappedRow {
  index: number;
  top: number;
  mainY: number;
  height: number;
  groups: WrappedGroup[];
}
export const OUTPUT_BRANCH_STEP = 88;
export const outputBranchY = (coilY: number, index: number) => coilY + index * OUTPUT_BRANCH_STEP;

export interface WrappedRungLayout {
  width: number;
  height: number;
  rows: WrappedRow[];
  groups: WrappedGroup[];
  coilX: number;
  coilY: number;
  outputYs: number[];
  emptyOutputYs: number[];
  wrapped: boolean;
}

/**
 * Fold long rungs at group boundaries, keeping every OR network connected
 * and indivisible. A single exceptionally wide OR group remains scrollable,
 * avoiding broken bypass paths.
 */
export function getWrappedRungLayout(
  rung: PracticeRung, viewport = 760, showDropLane = false, previewOutput = false,
): WrappedRungLayout {
  const base = getRungGeometry(rung, viewport);
  const maxGroupSpan = Math.max(0, ...base.groups.map((group) => group.right - group.left));
  const width = Math.max(MIN_RUNG_WIDTH, viewport,
    maxGroupSpan + FIRST_CONTACT_X - GROUP_HALF_WIDTH + 65);
  const endLimit = width - 47;
  const lead = FIRST_CONTACT_X - GROUP_HALF_WIDTH;
  const gap = CONTACT_STEP - 2 * GROUP_HALF_WIDTH;
  const packed: LadderGroupGeometry[][] = [[]];
  let right = lead;
  for (const group of base.groups) {
    const span = group.right - group.left;
    const candidate = (packed.at(-1)!.length ? right + gap : lead) + span;
    if (candidate > endLimit && packed.at(-1)!.length) {
      packed.push([]);
      right = lead;
    }
    packed.at(-1)!.push(group);
    right = (packed.at(-1)!.length === 1 ? lead : right + gap) + span;
  }

  const coilX = width - COIL_RIGHT_INSET;
  const last = packed.at(-1)!;
  const lastRequiredRight = last.reduce((value, group, i) =>
    value + (i ? gap : 0) + (group.right - group.left), lead);
  // Reserve space for TIMER blocks or coils on the last line. Move the final group down so the
  // continuation contains real contacts instead of a lonely output coil.
  const hasTimer = rung.instructions.some((item) => isTimerKind(item.kind));
  const terminalClearance = hasTimer ? 155 : 64;
  if (lastRequiredRight > coilX - terminalClearance && last.length > 1) {
    packed.push([last.pop()!]);
  } else if (lastRequiredRight > coilX - terminalClearance && last.length === 1) {
    packed.push([]);
  }

  const rows: WrappedRow[] = [];
  const groups: WrappedGroup[] = [];
  let top = 0;
  packed.forEach((sourceGroups, index) => {
    const maxLanes = Math.max(0, ...sourceGroups.map((item) => item.branchLanes.length));
    const outputs = index === packed.length - 1
      ? rung.instructions.filter((item) => isOutputKind(item.kind)).length +
        (rung.emptyOutputBranches?.length ?? 0) + (previewOutput ? 1 : 0)
      : 0;
    const outputExtension = Math.max(0, outputs - 1) * OUTPUT_BRANCH_STEP;
    // TIMER blocks extend 41px below the conductor rather than a coil's ~8px.
    // Give them a local bottom margin; ordinary Bit rungs stay compact.
    const timerBottomClearance = index === packed.length - 1 && hasTimer ? 17 : 0;
    const height = Math.max(getPracticeRungHeight(maxLanes, showDropLane),
      getPracticeRungHeight(0) + outputExtension + timerBottomClearance
    ) + (index < packed.length - 1 ? 29 : 0);
    const actual: WrappedGroup[] = [];
    let nextLeft = lead;
    sourceGroups.forEach((group) => {
      const offset = nextLeft - group.left;
      const move = (x: number) => x + offset;
      const rowGroup: WrappedGroup = {
        ...group, row: index, mainY: top + PRACTICE_MAIN_Y,
        x: move(group.x), left: move(group.left), right: move(group.right),
        mainCenters: group.mainCenters.map(move),
        branchCenters: group.branchCenters.map(move),
        branchLanes: group.branchLanes.map((lane) => ({
          ...lane, y: top + lane.y, centers: lane.centers.map(move),
        })),
      };
      actual.push(rowGroup);
      groups.push(rowGroup);
      nextLeft = rowGroup.right + gap;
    });
    rows.push({ index, top, mainY: top + PRACTICE_MAIN_Y, height, groups: actual });
    top += height;
  });
  const coilY = rows.at(-1)!.mainY;
  return {
    width, height: top, rows, groups,
    coilX, coilY, outputYs: rung.instructions.filter((item) => isOutputKind(item.kind))
      .map((_, index) => outputBranchY(coilY, index)),
    emptyOutputYs: (rung.emptyOutputBranches ?? []).map((_, index) =>
      outputBranchY(coilY, rung.instructions.filter((item) => isOutputKind(item.kind)).length + index)),
    wrapped: rows.length > 1,
  };
}

export function findWrappedLadderDropTarget(
  project: PracticeProject, rungId: string, kind: EditableKind,
  x: number, y: number, viewport: number, movingId?: string,
): VisualLadderDropTarget | null {
  const rung = project.rungs.find((item) => item.id === rungId);
  if (!rung || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const layout = getWrappedRungLayout(rung, viewport, true,
    isOutputKind(kind) && !movingId && !(rung.emptyOutputBranches?.length));
  const row = layout.rows.find((candidate) =>
    y >= candidate.top && y <= candidate.top + candidate.height);
  if (!row) return null;
  const moving = movingId ? findInstruction(project, movingId) : null;
  const contacts = rung.instructions.filter((item) => !isOutputKind(item.kind));

  if (isOutputKind(kind)) {
    if (row.index !== layout.rows.length - 1) return null;
    const emptyIndex = layout.emptyOutputYs.findIndex((laneY) =>
      Math.abs(laneY - y) <= OUTPUT_BRANCH_STEP / 2);
    const emptyId = emptyIndex >= 0 && x >= layout.coilX - 105
      ? rung.emptyOutputBranches?.[emptyIndex] : undefined;
    if (emptyId) {
      return { kind, lane: "main", branchId: emptyId, position: contacts.length,
        x: layout.coilX, y: layout.emptyOutputYs[emptyIndex] };
    }
    return { kind, lane: "main", position: contacts.length,
      x: layout.coilX,
      y: layout.outputYs.at(-1) !== undefined
        ? layout.outputYs.at(-1)! + (moving ? 0 : OUTPUT_BRANCH_STEP)
        : layout.coilY };
  }

  if (y - row.top >= 126) {
    const group = row.groups.find((item) => x >= item.left - 12 && x <= item.right + 12);
    if (!group || movingId === group.anchorId) return null;
    if (moving?.lane === "main" && rung.parallelBranches?.some((branch) => branch.anchorId === movingId)) return null;
    if (contactCount(rung) >= MAX_PRACTICE_CONTACTS && moving?.rungId !== rungId) return null;
    const lane = group.branchLanes.length
      ? group.branchLanes.find((item) => Math.abs(item.y - y) <= PRACTICE_BRANCH_GAP / 2)
      : Math.abs((row.top + PRACTICE_BRANCH_Y) - y) <= PRACTICE_BRANCH_GAP / 2
        ? { id: undefined, centers: [] as number[], y: row.top + PRACTICE_BRANCH_Y } : undefined;
    if (!lane) return null;
    const branch = rung.parallelBranches?.find((item) => item.id === lane.id);
    const slots = branch?.instructions.length
      ? [group.left + 20,
        ...lane.centers.slice(0, -1).map((center, i) => (center + lane.centers[i + 1]) / 2),
        group.right - 20]
      : [group.x];
    const position = slots.reduce((best, current, i) =>
      Math.abs(current - x) < Math.abs(slots[best] - x) ? i : best, 0);
    return { kind, lane: "parallel", position, x: slots[position], y: lane.y,
      anchorId: group.anchorId, branchId: lane.id };
  }

  if (Math.abs(y - row.mainY) > 55 || x < 63 || x > layout.width - 48) return null;
  if (contactCount(rung) >= MAX_PRACTICE_CONTACTS && moving?.rungId !== rungId) return null;

  const slots: { x: number; position: number }[] = [];
  for (const group of row.groups) {
    for (let i = 0; i < group.mainIds.length; i++) {
      const globalPosition = contacts.findIndex((item) => item.id === group.mainIds[i]);
      if (globalPosition < 0) continue;
      if (!slots.length) slots.push({ x: group.mainCenters[i] - 43, position: globalPosition });
      slots.push({ x: i === group.mainIds.length - 1 ? group.right + 9 :
        (group.mainCenters[i] + group.mainCenters[i + 1]) / 2, position: globalPosition + 1 });
    }
  }
  if (!slots.length) slots.push({ x: 98, position: contacts.length });
  const chosen = slots.reduce((best, item, index) =>
    Math.abs(item.x - x) < Math.abs(slots[best].x - x) ? index : best, 0);
  return { kind, lane: "main", position: slots[chosen].position,
    x: slots[chosen].x, y: row.mainY };
}
