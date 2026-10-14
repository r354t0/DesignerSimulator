/**
 * Pure document model for the first interactive Ladder editing increment.
 * Separate from timerCounterDemo: these editable rungs are NOT executed yet.
 */
export type EditableKind = "XIC" | "XIO" | "OTE";

export interface PracticeTag {
  name: string;
  description: string;
}

export interface PracticeInstruction {
  id: string;
  kind: EditableKind;
  tag: string;
}

export interface PracticeRung {
  id: string;
  instructions: PracticeInstruction[];
}

export interface PracticeProject {
  tags: PracticeTag[];
  rungs: PracticeRung[];
}

export function initialPracticeProject(): PracticeProject {
  return {
    tags: [
      { name: "Start_PB", description: "Pulsador de arranque" },
      { name: "Stop_PB", description: "Pulsador de parada" },
      { name: "Motor_Run", description: "Motor habilitado" },
      { name: "Auto_Mode", description: "Modo automático" },
      { name: "Lamp_Run", description: "Indicador de marcha" },
    ],
    rungs: [{ id: "rung-1", instructions: [] }],
  };
}

function assertUniqueTag(project: PracticeProject, tag: string): void {
  if (!project.tags.some((item) => item.name === tag)) {
    throw new Error("Selecciona un tag existente.");
  }
}

export function createRung(project: PracticeProject, id: string): PracticeProject {
  if (project.rungs.some((rung) => rung.id === id)) {
    throw new Error("El identificador del rung ya existe.");
  }
  return {
    ...project,
    rungs: [...project.rungs, { id, instructions: [] }],
  };
}

export function removeRung(project: PracticeProject, id: string): PracticeProject {
  return { ...project, rungs: project.rungs.filter((rung) => rung.id !== id) };
}

export function insertInstruction(
  project: PracticeProject,
  rungId: string,
  position: number,
  instruction: PracticeInstruction,
): PracticeProject {
  if (!["XIC", "XIO", "OTE"].includes(instruction.kind)) {
    throw new Error("Esta instrucción aún no está habilitada para edición.");
  }
  assertUniqueTag(project, instruction.tag);
  const rung = project.rungs.find((item) => item.id === rungId);
  if (!rung) throw new Error("No se encontró el rung.");
  if (project.rungs.some((item) =>
    item.instructions.some((existing) => existing.id === instruction.id)
  )) throw new Error("El identificador de instrucción ya existe.");

  const existing = rung.instructions;
  const hasCoil = existing.some((item) => item.kind === "OTE");
  let updated: PracticeInstruction[];

  if (instruction.kind === "OTE") {
    if (hasCoil) throw new Error("El rung ya contiene una salida OTE.");
    updated = [...existing, instruction];
  } else {
    // Contacts must be before the output and preserve the requested order.
    const contactCount = existing.filter((item) => item.kind !== "OTE").length;
    if (contactCount >= 8) throw new Error("Máximo 8 contactos por rung en esta etapa.");
    const at = Math.min(Math.max(0, position), contactCount);
    updated = [
      ...existing.slice(0, at),
      instruction,
      ...existing.slice(at),
    ];
  }
  return {
    ...project,
    rungs: project.rungs.map((item) =>
      item.id === rungId ? { ...item, instructions: updated } : item,
    ),
  };
}

export function changeInstructionTag(
  project: PracticeProject,
  instructionId: string,
  tag: string,
): PracticeProject {
  assertUniqueTag(project, tag);
  return {
    ...project,
    rungs: project.rungs.map((rung) => ({
      ...rung,
      instructions: rung.instructions.map((item) =>
        item.id === instructionId ? { ...item, tag } : item,
      ),
    })),
  };
}

export function removeInstruction(project: PracticeProject, id: string): PracticeProject {
  return {
    ...project,
    rungs: project.rungs.map((rung) => ({
      ...rung,
      instructions: rung.instructions.filter((item) => item.id !== id),
    })),
  };
}

export function createTag(
  project: PracticeProject,
  name: string,
  description: string,
): PracticeProject {
  const normalized = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(normalized)) {
    throw new Error("El tag debe iniciar con letra o _ y usar máximo 40 caracteres alfanuméricos o _.");
  }
  if (project.tags.some((tag) => tag.name.toLowerCase() === normalized.toLowerCase())) {
    throw new Error("Ya existe un tag con ese nombre.");
  }
  return {
    ...project,
    tags: [...project.tags, { name: normalized, description: description.trim().slice(0, 120) }],
  };
}
