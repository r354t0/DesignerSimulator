/**
 * Immutable PLC practice document model. Editable routines are not executed yet.
 * For this increment, each main contact may own one parallel path containing
 * zero or more series contacts. Nested OR and parallel coils are not supported.
 */
export type EditableKind = "XIC" | "XIO" | "OTE";

export interface PracticeTag { name: string; description: string }
export interface PracticeInstruction { id: string; kind: EditableKind; tag: string }
export interface ParallelBranch {
  anchorId: string;
  instructions: PracticeInstruction[];
}
export interface PracticeRung {
  id: string;
  instructions: PracticeInstruction[];
  parallelBranches?: ParallelBranch[];
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
  return [...rung.instructions, ...(rung.parallelBranches ?? []).flatMap((branch) => branch.instructions)];
}

function ensureTag(project: PracticeProject, tag: string): void {
  if (!project.tags.some((item) => item.name === tag)) {
    throw new Error("Selecciona un tag existente.");
  }
}

function ensureNewInstruction(project: PracticeProject, item: PracticeInstruction): void {
  if (!["XIC", "XIO", "OTE"].includes(item.kind)) {
    throw new Error("Esta instrucción aún no está habilitada para edición.");
  }
  ensureTag(project, item.tag);
  if (project.rungs.some((rung) => allInstructions(rung).some((part) => part.id === item.id))) {
    throw new Error("El identificador de instrucción ya existe.");
  }
}

function getRung(project: PracticeProject, id: string): PracticeRung {
  const rung = project.rungs.find((item) => item.id === id);
  if (!rung) throw new Error("No se encontró el rung.");
  return rung;
}

export function contactCount(rung: PracticeRung): number {
  return rung.instructions.filter((item) => item.kind !== "OTE").length +
    (rung.parallelBranches ?? []).reduce((sum, branch) => sum + branch.instructions.length, 0);
}

export function createRung(project: PracticeProject, id: string): PracticeProject {
  if (project.rungs.some((rung) => rung.id === id)) {
    throw new Error("El identificador del rung ya existe.");
  }
  return { ...project, rungs: [...project.rungs, { id, instructions: [], parallelBranches: [] }] };
}

export function removeRung(project: PracticeProject, id: string): PracticeProject {
  return { ...project, rungs: project.rungs.filter((rung) => rung.id !== id) };
}

export function insertInstruction(
  project: PracticeProject, rungId: string, position: number, item: PracticeInstruction,
): PracticeProject {
  ensureNewInstruction(project, item);
  const rung = getRung(project, rungId);
  let updated: PracticeInstruction[];

  if (item.kind === "OTE") {
    if (rung.instructions.some((existing) => existing.kind === "OTE")) {
      throw new Error("El rung ya contiene una salida OTE.");
    }
    updated = [...rung.instructions, item];
  } else {
    if (contactCount(rung) >= 8) throw new Error("Máximo 8 contactos por rung en esta etapa.");
    const limit = rung.instructions.filter((part) => part.kind !== "OTE").length;
    const at = Math.min(Math.max(0, position), limit);
    updated = [...rung.instructions.slice(0, at), item, ...rung.instructions.slice(at)];
  }

  return { ...project, rungs: project.rungs.map((part) =>
    part.id === rungId ? { ...part, instructions: updated } : part,
  ) };
}

/** Create an independent, initially empty OR path below an existing contact. */
export function createParallelBranch(
  project: PracticeProject, rungId: string, anchorId: string,
): PracticeProject {
  const rung = getRung(project, rungId);
  const anchor = rung.instructions.find((item) => item.id === anchorId && item.kind !== "OTE");
  if (!anchor) throw new Error("Selecciona un contacto principal válido para crear el OR.");
  if ((rung.parallelBranches ?? []).some((branch) => branch.anchorId === anchorId)) {
    throw new Error("Este contacto ya tiene una rama paralela.");
  }
  return { ...project, rungs: project.rungs.map((part) => part.id === rungId ? {
    ...part,
    parallelBranches: [...(part.parallelBranches ?? []), { anchorId, instructions: [] }],
  } : part) };
}

export function removeParallelBranch(
  project: PracticeProject, rungId: string, anchorId: string,
): PracticeProject {
  getRung(project, rungId);
  return { ...project, rungs: project.rungs.map((part) => part.id === rungId ? {
    ...part,
    parallelBranches: (part.parallelBranches ?? []).filter((branch) => branch.anchorId !== anchorId),
  } : part) };
}

/** Insert a contact in an OR path. A drop may create that path on demand. */
export function addParallelContact(
  project: PracticeProject,
  rungId: string,
  anchorId: string,
  instruction: PracticeInstruction,
  position = Number.MAX_SAFE_INTEGER,
): PracticeProject {
  ensureNewInstruction(project, instruction);
  if (instruction.kind === "OTE") throw new Error("Las ramas OR solo admiten XIC y XIO en esta etapa.");

  const rung = getRung(project, rungId);
  if (!rung.instructions.some((item) => item.id === anchorId && item.kind !== "OTE")) {
    throw new Error("Selecciona un contacto principal válido para crear el OR.");
  }
  if (contactCount(rung) >= 8) throw new Error("Máximo 8 contactos por rung en esta etapa.");

  const branch = rung.parallelBranches?.find((item) => item.anchorId === anchorId);
  const current = branch?.instructions ?? [];
  const at = Math.min(Math.max(0, position), current.length);
  const nextBranch = { anchorId, instructions: [
    ...current.slice(0, at), instruction, ...current.slice(at),
  ] };
  return { ...project, rungs: project.rungs.map((part) => part.id === rungId ? {
    ...part,
    parallelBranches: [
      ...(part.parallelBranches ?? []).filter((item) => item.anchorId !== anchorId),
      nextBranch,
    ],
  } : part) };
}

export interface InstructionLocation {
  rungId: string;
  position: number;
  lane: "main" | "parallel";
  instruction: PracticeInstruction;
  anchorId?: string;
}

export function findInstruction(project: PracticeProject, id: string): InstructionLocation | null {
  for (const rung of project.rungs) {
    const position = rung.instructions.findIndex((item) => item.id === id);
    if (position !== -1) {
      return { rungId: rung.id, position, lane: "main", instruction: rung.instructions[position] };
    }
    for (const branch of rung.parallelBranches ?? []) {
      const index = branch.instructions.findIndex((item) => item.id === id);
      if (index !== -1) {
        return { rungId: rung.id, position: index, lane: "parallel",
          anchorId: branch.anchorId, instruction: branch.instructions[index] };
      }
    }
  }
  return null;
}

export function changeInstructionTag(
  project: PracticeProject, instructionId: string, tag: string,
): PracticeProject {
  ensureTag(project, tag);
  return { ...project, rungs: project.rungs.map((rung) => ({
    ...rung,
    instructions: rung.instructions.map((item) => item.id === instructionId ? { ...item, tag } : item),
    parallelBranches: rung.parallelBranches?.map((branch) => ({
      ...branch, instructions: branch.instructions.map((item) =>
        item.id === instructionId ? { ...item, tag } : item),
    })),
  })) };
}

/**
 * Copy only the BOOL tag reference from one existing Ladder instruction to
 * another. The source tag must come from this document (not from arbitrary
 * text dropped by the browser). Works across rungs and in OR branches.
 *
 * This does not duplicate or move either instruction, and does not change
 * the tag's declaration in the project.
 */
export function copyInstructionTag(
  project: PracticeProject,
  sourceInstructionId: string,
  targetInstructionId: string,
): PracticeProject {
  const source = findInstruction(project, sourceInstructionId);
  if (!source) throw new Error("No se encontró la instrucción de origen.");
  const target = findInstruction(project, targetInstructionId);
  if (!target) throw new Error("No se encontró la instrucción de destino.");
  if (sourceInstructionId === targetInstructionId ||
      source.instruction.tag === target.instruction.tag) return project;

  return changeInstructionTag(project, targetInstructionId, source.instruction.tag);
}

export function removeInstruction(project: PracticeProject, id: string): PracticeProject {
  const source = findInstruction(project, id);
  if (!source) return project;
  return { ...project, rungs: project.rungs.map((rung) => {
    if (rung.id !== source.rungId) return rung;
    if (source.lane === "parallel") return {
      ...rung,
      parallelBranches: (rung.parallelBranches ?? []).map((branch) => ({
        ...branch, instructions: branch.instructions.filter((item) => item.id !== id),
      })),
    };
    // Once a main-path anchor disappears, its former bypass becomes the only
    // path: promote its serial contacts to main and remove the bypass geometry.
    const paired = rung.parallelBranches?.find((branch) => branch.anchorId === id);
    return {
      ...rung,
      instructions: rung.instructions.flatMap((item) =>
        item.id === id ? (paired?.instructions ?? []) : [item]),
      parallelBranches: (rung.parallelBranches ?? []).filter((branch) => branch.anchorId !== id),
    };
  }) };
}

/**
 * Move an instruction to a MAIN rung. Main anchors travel together with their
 * complete OR branches. Invalid transfers never modify the previous document.
 * Position denotes an original destination slot.
 */
export function moveInstruction(
  project: PracticeProject, instructionId: string, targetRungId: string, position: number,
): PracticeProject {
  const source = findInstruction(project, instructionId);
  if (!source) throw new Error("No se encontró la instrucción.");
  const target = getRung(project, targetRungId);
  const origin = getRung(project, source.rungId);
  const attached = source.lane === "main"
    ? origin.parallelBranches?.find((branch) => branch.anchorId === instructionId) : undefined;
  const movingCount = 1 + (attached?.instructions.length ?? 0);
  const sameRung = source.rungId === targetRungId;

  if (source.instruction.kind === "OTE") {
    if (target.instructions.some((item) => item.kind === "OTE" && item.id !== instructionId)) {
      throw new Error("El rung de destino ya contiene una bobina OTE.");
    }
    if (sameRung) return project;
  } else if (contactCount(target) + (sameRung ? 0 : movingCount) > 8) {
    throw new Error("Máximo 8 contactos por rung en esta etapa.");
  }

  const stripped: PracticeProject = { ...project, rungs: project.rungs.map((rung) =>
    rung.id !== source.rungId ? rung : {
      ...rung,
      instructions: rung.instructions.filter((item) => item.id !== instructionId),
      parallelBranches: (rung.parallelBranches ?? [])
        .filter((branch) => branch.anchorId !== instructionId)
        .map((branch) => ({ ...branch,
          instructions: branch.instructions.filter((item) => item.id !== instructionId) })),
    }) };

  const originalContactCount = target.instructions.filter((item) => item.kind !== "OTE").length;
  const originalAt = Math.min(Math.max(0, position), originalContactCount);
  const adjusted = sameRung && source.lane === "main" && source.position < originalAt
    ? originalAt - 1 : originalAt;
  let next = insertInstruction(stripped, targetRungId, adjusted, source.instruction);
  if (attached) {
    next = createParallelBranch(next, targetRungId, instructionId);
    for (const item of attached.instructions) {
      next = addParallelContact(next, targetRungId, instructionId, item);
    }
  }
  return next;
}

/** Move an existing contact into any (possibly empty) OR branch. */
export function moveToParallel(
  project: PracticeProject,
  instructionId: string,
  targetRungId: string,
  anchorId: string,
  position = Number.MAX_SAFE_INTEGER,
): PracticeProject {
  const source = findInstruction(project, instructionId);
  if (!source) throw new Error("No se encontró la instrucción.");
  if (source.instruction.kind === "OTE") throw new Error("La OTE no puede entrar en una rama OR.");
  const target = getRung(project, targetRungId);
  if (!target.instructions.some((item) => item.id === anchorId && item.kind !== "OTE")) {
    throw new Error("El contacto de referencia no existe.");
  }
  if (instructionId === anchorId) throw new Error("El contacto no puede ser paralelo a sí mismo.");
  const origin = getRung(project, source.rungId);
  if (source.lane === "main" &&
    origin.parallelBranches?.some((branch) => branch.anchorId === instructionId)) {
    throw new Error("Mueve o elimina primero la rama asociada a este contacto.");
  }
  const sameRung = source.rungId === targetRungId;
  if (!sameRung && contactCount(target) >= 8) {
    throw new Error("Máximo 8 contactos por rung en esta etapa.");
  }

  const previousBranch = target.parallelBranches?.find((branch) => branch.anchorId === anchorId);
  const slot = Math.min(Math.max(0, position), previousBranch?.instructions.length ?? 0);
  const at = sameRung && source.lane === "parallel" && source.anchorId === anchorId &&
    source.position < slot ? slot - 1 : slot;

  const stripped: PracticeProject = {
    ...project,
    rungs: project.rungs.map((rung) => rung.id === source.rungId ? {
      ...rung,
      instructions: rung.instructions.filter((item) => item.id !== instructionId),
      parallelBranches: (rung.parallelBranches ?? []).map((branch) => ({
        ...branch, instructions: branch.instructions.filter((item) => item.id !== instructionId),
      })),
    } : rung),
  };
  return addParallelContact(stripped, targetRungId, anchorId, source.instruction, at);
}

export function createTag(
  project: PracticeProject, name: string, description: string,
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
    tags: [...project.tags,
      { name: normalized, description: description.trim().slice(0, 120) }],
  };
}
