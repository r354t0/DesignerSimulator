import {
  COIL_RIGHT_INSET, CONTACT_STEP, FIRST_CONTACT_X, GROUP_HALF_WIDTH,
  MIN_RUNG_WIDTH, PRACTICE_MAIN_Y, PRACTICE_BRANCH_GAP,
  PRACTICE_BRANCH_Y, getPracticeRungHeight, getRungGeometry,
  type LadderGroupGeometry, type VisualLadderDropTarget,
} from "./ladderDragDrop.ts";
import {
  OR_JUNCTION_KIND, MAX_PRACTICE_CONTACTS, isOutputKind, isTimerKind, isCounterKind, isCompareKind, isMathKind, contactCount, findInstruction,
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
  rung: PracticeRung, viewport = 760,
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
  // Timer and counter blocks need identical horizontal clearance.
  const hasStructuredOutput = rung.instructions.some((item) =>
    (isTimerKind(item.kind) && item.kind !== "RES") ||
    isCounterKind(item.kind) || isMathKind(item.kind) || item.kind==="GEAR_SEQ");
  const hasComparison = [...rung.instructions,
    ...(rung.parallelBranches ?? []).flatMap((branch) => branch.instructions)]
    .some((item) => isCompareKind(item.kind));
  const terminalClearance = hasStructuredOutput ? 155 : 64;
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
        (rung.emptyOutputBranches?.length ?? 0)
      : 0;
    const outputExtension = Math.max(0, outputs - 1) * OUTPUT_BRANCH_STEP;
    // Timer/counter blocks end 41px beneath the final output center; preserve
    // a 22px margin beneath their frame and status bits, even with OR outputs.
    const hasMathOutput = rung.instructions.some((item) => isMathKind(item.kind));
    const structuredBottomClearance = index === packed.length - 1 && hasStructuredOutput
      ? (hasMathOutput ? 48 : 32) : 0;
    const comparisonClearance = hasComparison ? 32 : 0;
    const height = Math.max(getPracticeRungHeight(maxLanes) + comparisonClearance,
      getPracticeRungHeight(0) + outputExtension + structuredBottomClearance + comparisonClearance
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
  // Hit-testing must use exactly the same geometry as the rendered rung.
  // A dragged tool must not insert provisional OR/output rows and push
  // hundreds of existing rungs downward.
  const layout = getWrappedRungLayout(rung, viewport);
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
    const outputs = rung.instructions.filter((item) => isOutputKind(item.kind));
    const slot = outputs.length
      ? layout.outputYs.findIndex((centerY) => y < centerY - OUTPUT_BRANCH_STEP / 3)
      : -1;
    const outputIndex = slot >= 0 ? slot : outputs.length;
    return { kind, lane: "main", position: contacts.length + outputIndex,
      x: layout.coilX,
      y: outputs.length && outputIndex < outputs.length
        ? layout.outputYs[outputIndex] : (layout.outputYs.at(-1) ?? layout.coilY) };
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

  // Upper path of an independent OR has its own explicit drop area.
  // The space AFTER group.right remains a normal main-line insertion slot.
  const orGroup = row.groups.find((group) => {
    const anchor = rung.instructions.find((part) => part.id === group.anchorId);
    return anchor?.kind === OR_JUNCTION_KIND &&
      x >= group.mainCenters[0] + 16 && x <= group.right &&
      y >= row.mainY - 36 && y <= row.mainY + 38;
  });
  if (orGroup && movingId !== orGroup.anchorId) {
    const endIndex = contacts.findIndex((part) => part.id === orGroup.endId);
    return { kind, lane: "upper", anchorId: orGroup.anchorId,
      position: endIndex + 1, x: orGroup.right - 23, y: row.mainY };
  }

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
