import { MAX_PRACTICE_CONTACTS, isOutputKind, contactCount, findInstruction, type EditableKind, type PracticeProject, type PracticeRung } from "./practiceDocument.ts";

export const LADDER_DRAG_MIME = "application/x-designersimulator-ladder-instruction";
export const LADDER_MOVE_MIME = "application/x-designersimulator-ladder-move";
export const LADDER_TAG_MIME = "application/x-designersimulator-ladder-tag";
// Compact rung layout: keep room above symbols for two-line comments and
// Studio-style selection. Most reclaimed space is BELOW the instructions.
export const PRACTICE_MAIN_Y = 81;
export const PRACTICE_BRANCH_Y = 160;
export const PRACTICE_BRANCH_GAP = 85;
export const PRACTICE_MAIN_HEIGHT = 98;
export const PRACTICE_OR_HEIGHT = 178;
export const branchLaneY = (index: number) => PRACTICE_BRANCH_Y + index * PRACTICE_BRANCH_GAP;

/** Height of the visible rung: expand only for actual OR lanes or a drag preview. */
export function getPracticeRungHeight(orLaneCount: number, showDropLane = false): number {
  const laneCount = Math.max(0, Math.floor(orLaneCount) || 0);
  if (laneCount === 0 && !showDropLane) return PRACTICE_MAIN_HEIGHT;
  return PRACTICE_OR_HEIGHT + (Math.max(1, laneCount) - 1) * PRACTICE_BRANCH_GAP;
}
// Compact cells allow five serial contacts plus an OTE in a 760 px editor.
export const CONTACT_STEP = 104;
export const FIRST_CONTACT_X = 136;
export const GROUP_HALF_WIDTH = 43;
export const MIN_RUNG_WIDTH = 480;
export const COIL_RIGHT_INSET = 89;
export const LAST_CONTACT_TO_COIL = 117;

export function isEditableKind(value: string): value is EditableKind {
  return ["XIC", "XIO", "ONS", "OTE", "OTL", "OTU"].includes(value);
}

export interface LadderGroupGeometry {
  anchorId: string;
  endId: string;
  mainIds: string[];
  mainCenters: number[];
  x: number;
  left: number;
  right: number;
  branchCenters: number[];
  branchLanes: { id: string; centers: number[]; y: number }[];
}
export interface LadderGeometry {
  width: number;
  coilX: number;
  groups: LadderGroupGeometry[];
  mainSlots: number[];
}

/**
 * One visual group can now contain several main-line contacts in series,
 * bypassed by one or more OR lanes. Other contacts remain single-cell groups.
 */
export function getRungGeometry(rung: PracticeRung, viewportWidth = 760): LadderGeometry {
  const contacts = rung.instructions.filter((item) => !isOutputKind(item.kind));
  const groups: LadderGroupGeometry[] = [];
  const mainSlots = [98];
  let consumed = 0;
  let index = 0;
  while (index < contacts.length) {
    const anchor = contacts[index];
    const branches = (rung.parallelBranches ?? []).filter((item) => item.anchorId === anchor.id);
    const endId = branches[0]?.endId ?? anchor.id;
    const endIndex = branches.length ? contacts.findIndex((item) => item.id === endId) : index;
    const last = Math.max(index, endIndex);
    const main = contacts.slice(index, last + 1);
    const count = Math.max(main.length, 1, ...branches.map((branch) => branch.instructions.length));
    const firstX = FIRST_CONTACT_X + consumed;
    consumed += count * CONTACT_STEP;
    const centers = main.length <= 1
      ? [firstX + (count - 1) * CONTACT_STEP / 2]
      : main.map((_, i) => firstX + i * ((count - 1) * CONTACT_STEP) / (main.length - 1));
    const left = firstX - GROUP_HALF_WIDTH;
    const right = firstX + (count - 1) * CONTACT_STEP + GROUP_HALF_WIDTH;
    groups.push({
      anchorId: anchor.id, endId: main.at(-1)?.id ?? anchor.id,
      mainIds: main.map((item) => item.id), mainCenters: centers,
      x: centers[0], left, right,
      branchCenters: (branches[0]?.instructions ?? []).map((_, i) => firstX + i * CONTACT_STEP),
      branchLanes: branches.map((branch, laneIndex) => ({
        id: branch.id, y: branchLaneY(laneIndex),
        centers: branch.instructions.map((_, i) => firstX + i * CONTACT_STEP),
      })),
    });
    for (let i = 0; i < centers.length; i++) {
      mainSlots.push(i === centers.length - 1 ? right + 9 : (centers[i] + centers[i + 1]) / 2);
    }
    index = last + 1;
  }
  const lastContactX = consumed > 0
    ? FIRST_CONTACT_X + consumed - CONTACT_STEP
    : FIRST_CONTACT_X;
  const minWidth = consumed > 0
    ? lastContactX + LAST_CONTACT_TO_COIL + COIL_RIGHT_INSET
    : MIN_RUNG_WIDTH;
  const width = Math.max(MIN_RUNG_WIDTH, viewportWidth, minWidth);
  return { width, coilX: width - COIL_RIGHT_INSET, groups, mainSlots };
}

export interface LadderDropTarget {
  kind: EditableKind;
  position: number;
  x: number;
}
export interface VisualLadderDropTarget extends LadderDropTarget {
  lane: "main" | "parallel";
  y: number;
  anchorId?: string;
  branchId?: string;
}

function nearestSlot(slots: number[], x: number): number {
  let position = 0;
  for (let i = 1; i < slots.length; i++) {
    if (Math.abs(x - slots[i]) < Math.abs(x - slots[position])) position = i;
  }
  return position;
}

/** Legacy main-lane locator is also used by existing drag/drop tests. */
export function findLadderDropTarget(
  project: PracticeProject,
  rungId: string,
  kind: EditableKind,
  pointerX: number,
  width: number,
): LadderDropTarget | null {
  const rung = project.rungs.find((item) => item.id === rungId);
  if (!rung || !Number.isFinite(pointerX) || !Number.isFinite(width)) return null;
  if (pointerX < 63 || pointerX > width - 30) return null;
  const geometry = getRungGeometry(rung, width);
  const contacts = rung.instructions.filter((item) => !isOutputKind(item.kind));

  if (isOutputKind(kind)) {
    return { kind, position: contacts.length, x: geometry.coilX };
  }
  if (contactCount(rung) >= MAX_PRACTICE_CONTACTS || pointerX > geometry.coilX - 54) return null;
  const position = nearestSlot(geometry.mainSlots, pointerX);
  return { kind, position, x: geometry.mainSlots[position] };
}

/**
 * Finds the closest insertion position in main or OR path. Existing branch
 * contacts may be reordered; empty OR paths offer a visible single drop slot.
 */
export function findVisualLadderDropTarget(
  project: PracticeProject,
  rungId: string,
  kind: EditableKind,
  x: number,
  y: number,
  width: number,
  movingId?: string,
): VisualLadderDropTarget | null {
  const rung = project.rungs.find((item) => item.id === rungId);
  if (!rung || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const geometry = getRungGeometry(rung, width);
  const moving = movingId ? findInstruction(project, movingId) : null;

  if (y >= 126 && !isOutputKind(kind)) {
    const group = geometry.groups.find((item) => x >= item.left - 12 && x <= item.right + 12);
    if (!group || movingId === group.anchorId) return null;
    if (moving?.lane === "main" && project.rungs.some((r) =>
      r.parallelBranches?.some((b) => b.anchorId === movingId))) return null;
    if (contactCount(rung) >= MAX_PRACTICE_CONTACTS && moving?.rungId !== rungId) return null;

    // The first lower lane may be created by dropping on it when no branches
    // exist. When multiple lanes exist, each has its own snapped target.
    const lane = group.branchLanes.length
      ? group.branchLanes.find((item) => Math.abs(item.y - y) <= PRACTICE_BRANCH_GAP / 2)
      : (Math.abs(y - PRACTICE_BRANCH_Y) <= PRACTICE_BRANCH_GAP / 2
        ? { id: undefined, centers: [] as number[], y: PRACTICE_BRANCH_Y } : undefined);
    if (!lane) return null;
    const branch = rung.parallelBranches?.find((item) => item.id === lane.id);
    const slots = branch?.instructions.length
      ? [group.left + 20,
        ...lane.centers.slice(0, -1).map((center, i) =>
          (center + lane.centers[i + 1]) / 2),
        group.right - 20]
      : [group.x];
    const position = nearestSlot(slots, x);
    return { kind, lane: "parallel", position, x: slots[position],
      y: lane.y, anchorId: group.anchorId, branchId: lane.id };
  }

  if (y < 13 || y > 125) return null;
  if (moving?.isOutputKind(instruction.kind) && moving.rungId === rungId) {
    return { kind, lane: "main", position: rung.instructions.length - 1,
      x: geometry.coilX, y: PRACTICE_MAIN_Y };
  }
  if (!isOutputKind(kind) && moving?.rungId === rungId) {
    if (x < 63 || x > geometry.coilX - 54) return null;
    const position = nearestSlot(geometry.mainSlots, x);
    return { kind, lane: "main", position,
      x: geometry.mainSlots[position], y: PRACTICE_MAIN_Y };
  }
  const target = findLadderDropTarget(project, rungId, kind, x, geometry.width);
  return target ? { ...target, lane: "main", y: PRACTICE_MAIN_Y } : null;
}
