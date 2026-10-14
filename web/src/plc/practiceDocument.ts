/**
 * Immutable Ladder document model.
 * First editing increment: serial contacts, one OTE, and a single parallel
 * contact per primary contact (no nested or overlapping OR networks yet).
 * PracticeRoutine is NOT connected to the PLC execution engine.
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

export interface ParallelContact {
  anchorId: string;
  contact: PracticeInstruction;
}

export interface PracticeRung {
  id: string;
  instructions: PracticeInstruction[];
  parallelBranches?: ParallelContact[];
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
    rungs: [{ id: "rung-1", instructions: [], parallelBranches: [] }],
  };
}

function allInstructions(rung: PracticeRung): PracticeInstruction[] {
  return [...rung.instructions, ...(rung.parallelBranches ?? []).map((branch) => branch.contact)];
}

function instructionExists(project: PracticeProject, id: string): boolean {
  return project.rungs.some((rung) => allInstructions(rung).some((item) => item.id === id));
}

function assertUniqueTag(project: PracticeProject, tag: string): void {
  if (!project.tags.some((item) => item.name === tag)) {
    throw new Error("Selecciona un tag existente.");
  }
}

function assertNewInstruction(project: PracticeProject, instruction: PracticeInstruction): void {
  if (!["XIC", "XIO", "OTE"].includes(instruction.kind)) {
    throw new Error("Esta instrucción aún no está habilitada para edición.");
  }
  assertUniqueTag(project, instruction.tag);
  if (instructionExists(project, instruction.id)) {
    throw new Error("El identificador de instrucción ya existe.");
  }
}

function getRung(project: PracticeProject, id: string): PracticeRung {
  const rung = project.rungs.find((item) => item.id === id);
  if (!rung) throw new Error("No se encontró el rung.");
  return rung;
}

function contactCount(rung: PracticeRung): number {
  return rung.instructions.filter((item) => item.kind !== "OTE").length
    + (rung.parallelBranches?.length ?? 0);
}

export function createRung(project: PracticeProject, id: string): PracticeProject {
  if (project.rungs.some((rung) => rung.id === id)) {
    throw new Error("El identificador del rung ya existe.");
  }
  return {
    ...project,
    rungs: [...project.rungs, { id, instructions: [], parallelBranches: [] }],
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
  assertNewInstruction(project, instruction);
  const rung = getRung(project, rungId);
  const hasCoil = rung.instructions.some((item) => item.kind === "OTE");

  let updated: PracticeInstruction[];
  if (instruction.kind === "OTE") {
    if (hasCoil) throw new Error("El rung ya contiene una salida OTE.");
    updated = [...rung.instructions, instruction];
  } else {
    if (contactCount(rung) >= 8) throw new Error("Máximo 8 contactos por rung en esta etapa.");
    const primaryCount = rung.instructions.filter((item) => item.kind !== "OTE").length;
    const at = Math.min(Math.max(0, position), primaryCount);
    updated = [
      ...rung.instructions.slice(0, at),
      instruction,
      ...rung.instructions.slice(at),
    ];
  }
  return {
    ...project,
    rungs: project.rungs.map((item) =>
      item.id === rungId ? { ...item, instructions: updated } : item,
    ),
  };
}

export function addParallelContact(
  project: PracticeProject,
  rungId: string,
  anchorId: string,
  instruction: PracticeInstruction,
): PracticeProject {
  assertNewInstruction(project, instruction);
  if (instruction.kind === "OTE") {
    throw new Error("Las ramas OR solo admiten XIC y XIO en esta etapa.");
  }
  const rung = getRung(project, rungId);
  const anchor = rung.instructions.find((item) => item.id === anchorId);
  if (!anchor || anchor.kind === "OTE") {
    throw new Error("Selecciona un contacto principal válido para crear el OR.");
  }
  if ((rung.parallelBranches ?? []).some((branch) => branch.anchorId === anchorId)) {
    throw new Error("Este contacto ya tiene una rama paralela.");
  }
  if (contactCount(rung) >= 8) throw new Error("Máximo 8 contactos por rung en esta etapa.");
  return {
    ...project,
    rungs: project.rungs.map((item) => item.id === rungId
      ? {
          ...item,
          parallelBranches: [
            ...(item.parallelBranches ?? []),
            { anchorId, contact: instruction },
          ],
        }
      : item,
    ),
  };
}

export interface InstructionLocation {
  rungId: string;
  position: number;
  lane: "main" | "parallel";
  instruction: PracticeInstruction;
  anchorId?: string;
}

export function findInstruction(
  project: PracticeProject,
  id: string,
): InstructionLocation | null {
  for (const rung of project.rungs) {
    const position = rung.instructions.findIndex((item) => item.id === id);
    if (position !== -1) {
      return { rungId: rung.id, position, lane: "main", instruction: rung.instructions[position] };
    }
    const branch = rung.parallelBranches?.find((item) => item.contact.id === id);
    if (branch) {
      return {
        rungId: rung.id,
        position: rung.instructions.findIndex((item) => item.id === branch.anchorId),
        lane: "parallel",
        anchorId: branch.anchorId,
        instruction: branch.contact,
      };
    }
  }
  return null;
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
      parallelBranches: rung.parallelBranches?.map((branch) => ({
        ...branch,
        contact: branch.contact.id === instructionId ? { ...branch.contact, tag } : branch.contact,
      })),
    })),
  };
}

export function removeInstruction(project: PracticeProject, id: string): PracticeProject {
  const source = findInstruction(project, id);
  if (!source) return project;
  return {
    ...project,
    rungs: project.rungs.map((rung) => {
      if (rung.id !== source.rungId) return rung;
      if (source.lane === "parallel") {
        return {
          ...rung,
          parallelBranches: (rung.parallelBranches ?? []).filter((branch) => branch.contact.id !== id),
        };
      }
      // Deleting an OR anchor promotes its parallel contact to the main path.
      const paired = rung.parallelBranches?.find((branch) => branch.anchorId === id);
      return {
        ...rung,
        instructions: rung.instructions.flatMap((item) =>
          item.id !== id ? [item] : paired ? [paired.contact] : [],
        ),
        parallelBranches: (rung.parallelBranches ?? []).filter((branch) => branch.anchorId !== id),
      };
    }),
  };
}

/**
 * Atomic move, preserving identity, tags and attached OR branch. Invalid moves
 * throw without changing the source document. Position is a slot in the *original*
 * destination rung, so moving right within the same rung adjusts by one.
 */
export function moveInstruction(
  project: PracticeProject,
  instructionId: string,
  targetRungId: string,
  position: number,
): PracticeProject {
  const source = findInstruction(project, instructionId);
  if (!source) throw new Error("No se encontró la instrucción.");
  const target = getRung(project, targetRungId);
  const moving = source.instruction;
  const sourceRung = getRung(project, source.rungId);
  const paired = source.lane === "main"
    ? sourceRung.parallelBranches?.find((branch) => branch.anchorId === instructionId)
    : undefined;
  const sourceCount = source.lane === "main" ? 1 + Number(Boolean(paired)) : 1;
  const sameRung = source.rungId === targetRungId;

  if (moving.kind === "OTE") {
    const occupied = target.instructions.some((item) =>
      item.kind === "OTE" && item.id !== instructionId,
    );
    if (occupied) throw new Error("El rung de destino ya contiene una bobina OTE.");
    if (sameRung) return project;
  } else if (contactCount(target) + (sameRung ? 0 : sourceCount) > 8) {
    throw new Error("Máximo 8 contactos por rung en esta etapa.");
  }

  const stripped: PracticeProject = {
    ...project,
    rungs: project.rungs.map((rung) => {
      if (rung.id !== source.rungId) return rung;
      return {
        ...rung,
        instructions: rung.instructions.filter((item) => item.id !== instructionId),
        parallelBranches: (rung.parallelBranches ?? []).filter((branch) =>
          branch.contact.id !== instructionId && branch.anchorId !== instructionId,
        ),
      };
    }),
  };

  const originalTargetCount = target.instructions.filter((item) => item.kind !== "OTE").length;
  const originalAt = Math.min(Math.max(0, position), originalTargetCount);
  const adjustedAt = sameRung && source.lane === "main" &&
    source.position < originalAt ? originalAt - 1 : originalAt;
  const inserted = insertInstruction(stripped, targetRungId, adjustedAt, moving);
  if (!paired) return inserted;
  // Reattach the parallel contact to the moved anchor, in its destination rung.
  return addParallelContact(inserted, targetRungId, moving.id, paired.contact);
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
