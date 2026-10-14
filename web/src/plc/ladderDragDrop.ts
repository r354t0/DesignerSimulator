import type { EditableKind, PracticeProject } from "./practiceDocument";

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
