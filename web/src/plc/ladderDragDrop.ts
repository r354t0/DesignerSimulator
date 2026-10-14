import { contactCount, findInstruction, type EditableKind, type PracticeProject, type PracticeRung } from "./practiceDocument.ts";

export const LADDER_DRAG_MIME = "application/x-designersimulator-ladder-instruction";
export const LADDER_MOVE_MIME = "application/x-designersimulator-ladder-move";
export const LADDER_TAG_MIME = "application/x-designersimulator-ladder-tag";
export const PRACTICE_MAIN_Y = 87;
export const PRACTICE_BRANCH_Y = 166;
export const PRACTICE_BRANCH_GAP = 85;
export const branchLaneY = (index: number) => PRACTICE_BRANCH_Y + index * PRACTICE_BRANCH_GAP;
// Compact cells allow five serial contacts plus an OTE in a 760 px editor.
export const CONTACT_STEP = 104;
export const FIRST_CONTACT_X = 136;
export const GROUP_HALF_WIDTH = 43;
export const MIN_RUNG_WIDTH = 480;
export const COIL_RIGHT_INSET = 89;
export const LAST_CONTACT_TO_COIL = 117;

export function isEditableKind(value: string): value is EditableKind {
  return value === "XIC" || value === "XIO" || value === "OTE";
}

export interface LadderGroupGeometry {
  anchorId: string;
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
 * Expanded OR branches reserve horizontal room for their series instructions,
 * so tags never collide with adjacent main-line contacts.
 */
export function getRungGeometry(rung: PracticeRung, viewportWidth = 760): LadderGeometry {
  const contacts = rung.instructions.filter((item) => item.kind !== "OTE");
  const totalCells = contacts.reduce((count, contact) => {
    const branches = (rung.parallelBranches ?? []).filter((item) => item.anchorId === contact.id);
    return count + Math.max(1, ...branches.map((branch) => branch.instructions.length));
  }, 0);
  const lastContactX = totalCells > 0
    ? FIRST_CONTACT_X + (totalCells - 1) * CONTACT_STEP
    : FIRST_CONTACT_X;
  // Reserve room around the coil, growing only when the total contact
  // count (including the longest OR branch) actually needs more space.
  const minWidth = totalCells > 0
    ? lastContactX + LAST_CONTACT_TO_COIL + COIL_RIGHT_INSET
    : MIN_RUNG_WIDTH;
  const width = Math.max(MIN_RUNG_WIDTH, viewportWidth, minWidth);
  let consumed = 0;
  const groups = contacts.map((item) => {
    const branches = (rung.parallelBranches ?? []).filter((part) => part.anchorId === item.id);
    const count = Math.max(1, ...branches.map((branch) => branch.instructions.length));
    const firstX = FIRST_CONTACT_X + consumed;
    consumed += count * CONTACT_STEP;
    return {
      anchorId: item.id,
      x: firstX + (count - 1) * CONTACT_STEP / 2,
      left: firstX - GROUP_HALF_WIDTH,
      right: firstX + (count - 1) * CONTACT_STEP + GROUP_HALF_WIDTH,
      branchCenters: (branches[0]?.instructions ?? []).map((_, i) => firstX + i * CONTACT_STEP),
      branchLanes: branches.map((branch, index) => ({
        id: branch.id, y: branchLaneY(index),
        centers: branch.instructions.map((_, i) => firstX + i * CONTACT_STEP),
      })),
    };
  });
  return {
    width,
    coilX: width - COIL_RIGHT_INSET,
    groups,
    mainSlots: [98, ...groups.map((group) => group.right + 9)],
  };
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
  const contacts = rung.instructions.filter((item) => item.kind !== "OTE");

  if (kind === "OTE") {
    if (rung.instructions.some((item) => item.kind === "OTE")) return null;
    return { kind, position: contacts.length, x: geometry.coilX };
  }
  if (contactCount(rung) >= 8 || pointerX > geometry.coilX - 54) return null;
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

  if (y >= 126 && kind !== "OTE") {
    const group = geometry.groups.find((item) => x >= item.left - 12 && x <= item.right + 12);
    if (!group || movingId === group.anchorId) return null;
    if (moving?.lane === "main" && project.rungs.some((r) =>
      r.parallelBranches?.some((b) => b.anchorId === movingId))) return null;
    if (contactCount(rung) >= 8 && moving?.rungId !== rungId) return null;

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
  if (moving?.instruction.kind === "OTE" && moving.rungId === rungId) {
    return { kind, lane: "main", position: rung.instructions.length - 1,
      x: geometry.coilX, y: PRACTICE_MAIN_Y };
  }
  if (kind !== "OTE" && moving?.rungId === rungId) {
    if (x < 63 || x > geometry.coilX - 54) return null;
    const position = nearestSlot(geometry.mainSlots, x);
    return { kind, lane: "main", position,
      x: geometry.mainSlots[position], y: PRACTICE_MAIN_Y };
  }
  const target = findLadderDropTarget(project, rungId, kind, x, geometry.width);
  return target ? { ...target, lane: "main", y: PRACTICE_MAIN_Y } : null;
}
