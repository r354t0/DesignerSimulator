import { findInstruction, type EditableKind, type PracticeProject } from "./practiceDocument";

/**
 * Find a valid insertion slot in SVG coordinates. Drag/drop and keyboard/click
 * insertion share the same rung invariants from practiceDocument.ts.
 */
export interface LadderDropTarget {
  kind: EditableKind;
  position: number;
  x: number;
}

export const LADDER_DRAG_MIME = "application/x-designersimulator-ladder-instruction";

export function isEditableKind(value: string): value is EditableKind {
  return value === "XIC" || value === "XIO" || value === "OTE";
}

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

  const contacts = rung.instructions.filter((item) => item.kind !== "OTE");
  const coilX = width - 115;

  if (kind === "OTE") {
    if (rung.instructions.some((item) => item.kind === "OTE")) return null;
    // OTE snaps to the output terminal at the far right of the rung.
    return { kind, position: contacts.length, x: coilX };
  }

  if (contacts.length >= 8 || pointerX > coilX - 54) return null;
  const slots = [
    107, // Before the first contact.
    ...contacts.map((_, index) => 175 + index * 145 + 69),
  ];

  let position = 0;
  for (let index = 1; index < slots.length; index++) {
    if (Math.abs(pointerX - slots[index]) < Math.abs(pointerX - slots[position])) {
      position = index;
    }
  }
  return { kind, position, x: slots[position] };
}


export const LADDER_MOVE_MIME = "application/x-designersimulator-ladder-move";
export const PRACTICE_MAIN_Y = 87;
export const PRACTICE_BRANCH_Y = 166;

export interface VisualLadderDropTarget extends LadderDropTarget {
  lane: "main" | "parallel";
  y: number;
  anchorId?: string;
}

/**
 * Determines a snapped insertion target in either the main conductor or a
 * lower parallel contact. Uses document geometry, not pixel scaling.
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
  if (!rung || !Number.isFinite(y)) return null;
  const moving = movingId ? findInstruction(project, movingId) : null;

  // The lower area is a drop-to-create-OR zone. An existing branch is never
  // silently overwritten or nested.
  if (y >= 126 && y <= 219 && kind !== "OTE") {
    const contacts = rung.instructions.filter((item) => item.kind !== "OTE");
    let nearest = -1;
    let distance = 65;
    for (let i = 0; i < contacts.length; i++) {
      const d = Math.abs(x - (175 + i * 145));
      if (d < distance) { distance = d; nearest = i; }
    }
    if (nearest === -1) return null;
    const anchor = contacts[nearest];
    if (anchor.id === movingId ||
      (rung.parallelBranches ?? []).some((branch) => branch.anchorId === anchor.id)) return null;
    if (moving?.lane === "main" && project.rungs.some((r) =>
      (r.parallelBranches ?? []).some((b) => b.anchorId === movingId))) return null;
    const targetCount = contacts.length + (rung.parallelBranches?.length ?? 0);
    if (targetCount >= 8 && moving?.rungId !== rungId) return null;
    return {
      kind, position: nearest, x: 175 + nearest * 145,
      y: PRACTICE_BRANCH_Y, anchorId: anchor.id, lane: "parallel",
    };
  }

  if (y < 13 || y > 125) return null;
  if (moving?.instruction.kind === "OTE" && moving.rungId === rungId) {
    return { kind, lane: "main", position: rung.instructions.length - 1,
      x: width - 115, y: PRACTICE_MAIN_Y };
  }
  if (kind !== "OTE" && moving?.rungId === rungId) {
    // Temporarily remove the source for capacity checks, but keep the original
    // slots; moveInstruction adjusts positions from the original rung.
    const contacts = rung.instructions.filter((item) => item.kind !== "OTE");
    const count = contacts.length + (rung.parallelBranches?.length ?? 0);
    if (count >= 8 && !movingId) return null;
    if (x < 63 || x > width - 169) return null;
    const slots = [107, ...contacts.map((_, i) => 175 + i * 145 + 69)];
    let position = 0;
    for (let i = 1; i < slots.length; i++) {
      if (Math.abs(x - slots[i]) < Math.abs(x - slots[position])) position = i;
    }
    return { kind, lane: "main", position, x: slots[position], y: PRACTICE_MAIN_Y };
  }
  const original = findLadderDropTarget(project, rungId, kind, x, width);
  return original ? { ...original, lane: "main", y: PRACTICE_MAIN_Y } : null;
}
