import { findInstruction, setTagValue, isOutputKind, type PracticeProject } from "./practiceDocument.ts";

/**
 * Bit changes from an instruction's context menu are intended for monitored
 * input BOOLs. An OTE-owned tag must remain controlled by the running logic.
 */
export interface BitMenuTarget {
  instructionId: string;
  tagName: string;
  value: boolean;
  editable: boolean;
  reason?: string;
}

export function getBitMenuTarget(
  project: PracticeProject,
  instructionId: string,
  running: boolean,
): BitMenuTarget | null {
  const location = findInstruction(project, instructionId);
  if (!location) return null;
  const tagName = location.instruction.tag;
  const tag = project.tags.find((item) => item.name === tagName);
  if (!tagName || !tag || tag.type !== "BOOL" || typeof tag.value !== "boolean") {
    return { instructionId, tagName: tagName || "??", value: false,
      editable: false, reason: "Asigna primero una variable BOOL válida." };
  }
  if (!running) return { instructionId, tagName, value: tag.value,
    editable: false, reason: "Inicia RUN para cambiar el bit desde el Ladder." };
  if (tag.constant) return { instructionId, tagName, value: tag.value,
    editable: false, reason: "El tag está definido como constante." };
  const outputOwned = project.rungs.some((rung) => rung.instructions.some((item) =>
    isOutputKind(item.kind) && item.tag === tag.name));
  const onsOwned = project.rungs.some((rung) =>
    [...rung.instructions, ...(rung.parallelBranches ?? []).flatMap((branch) => branch.instructions)]
      .some((item) => item.kind === "ONS" && item.tag === tag.name));
  if (outputOwned || onsOwned) return { instructionId, tagName, value: tag.value,
    editable: false, reason: outputOwned
      ? "El tag es una salida controlada por OTE/OTL/OTU durante RUN."
      : "El tag es la memoria interna de ONS durante RUN." };
  return { instructionId, tagName, value: tag.value, editable: true };
}


/** Flip the selected BOOL exactly once, respecting RUN and OTE ownership. */
export function invertInstructionBit(
  project: PracticeProject, instructionId: string, running: boolean,
): PracticeProject {
  const target = getBitMenuTarget(project, instructionId, running);
  if (!target?.editable) {
    throw new Error(target?.reason ?? "No se encontró una variable BOOL editable.");
  }
  return setTagValue(project, target.tagName, !target.value);
}
