import { contactCount, findInstruction, type EditableKind, type PracticeProject, type PracticeRung } from "./practiceDocument.ts";

export const LADDER_DRAG_MIME = "application/x-designersimulator-ladder-instruction";
export const LADDER_MOVE_MIME = "application/x-designersimulator-ladder-move";
export const PRACTICE_MAIN_Y = 87;
export const PRACTICE_BRANCH_Y = 166;
export const CONTACT_STEP = 145;

export function isEditableKind(value: string): value is EditableKind {
  return value === "XIC" || value === "XIO" || value === "OTE";
}

export interface LadderGroupGeometry {
  anchorId: string;
  x: number;
  left: number;
  right: number;
  branchCenters: number[];
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
    const branch = rung.parallelBranches?.find((item) => item.anchorId === contact.id);
    return count + Math.max(1, branch?.instructions.length ?? 0);
  }, 0);
  const width = Math.max(760, viewportWidth, 450 + totalCells * CONTACT_STEP);
  let consumed = 0;
  const groups = contacts.map((item) => {
    const branch = rung.parallelBranches?.find((part) => part.anchorId === item.id);
    const count = Math.max(1, branch?.instructions.length ?? 0);
    const firstX = 175 + consumed;
    consumed += count * CONTACT_STEP;
    return {
      anchorId: item.id,
      x: firstX + (count - 1) * CONTACT_STEP / 2,
      left: firstX - 58,
      right: firstX + (count - 1) * CONTACT_STEP + 58,
      branchCenters: (branch?.instructions ?? []).map((_, i) => firstX + i * CONTACT_STEP),
    };
  });
  return {
    width,
    coilX: width - 115,
    groups,
    mainSlots: [107, ...groups.map((group) => group.right + 11)],
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

  if (y >= 126 && y <= 224 && kind !== "OTE") {
    const group = geometry.groups.find((item) => x >= item.left - 12 && x <= item.right + 12);
    if (!group || movingId === group.anchorId) return null;
    if (moving?.lane === "main" && project.rungs.some((r) =>
      r.parallelBranches?.some((b) => b.anchorId === movingId))) return null;
    if (contactCount(rung) >= 8 && moving?.rungId !== rungId) return null;
    const branch = rung.parallelBranches?.find((item) => item.anchorId === group.anchorId);
    const slots = branch?.instructions.length
      ? [group.left + 20,
        ...group.branchCenters.slice(0, -1).map((center, i) =>
          (center + group.branchCenters[i + 1]) / 2),
        group.right - 20]
      : [group.x];
    const position = nearestSlot(slots, x);
    return { kind, lane: "parallel", position, x: slots[position],
      y: PRACTICE_BRANCH_Y, anchorId: group.anchorId };
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
