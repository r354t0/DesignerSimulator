/**
 * Immutable PLC practice document model. Editable routines are not executed yet.
 * Main contacts can own multiple independent parallel OR lanes, each with
 * series contacts. Nested OR and parallel coils are not supported.
 */
export type EditableKind = "XIC" | "XIO" | "OTE";

export type TagType = "BOOL" | "DINT" | "REAL" | "TIMER" | "COUNTER";
export type TagExternalAccess = "Read/Write" | "Read Only" | "None";
export type TagStyle = "Decimal" | "Binary" | "Hex";
export type TagMemberValue = number | boolean;
export type TagValue = boolean | number | Record<string, TagMemberValue>;
export interface PracticeTag {
  name: string;
  description: string;
  type: TagType;
  value: TagValue;
  externalAccess: TagExternalAccess;
  constant: boolean;
  style: TagStyle;
}
export const TAG_TYPES: TagType[] = ["BOOL", "DINT", "REAL", "TIMER", "COUNTER"];
export const TAG_EXTERNAL_ACCESS: TagExternalAccess[] = ["Read/Write", "Read Only", "None"];
export const TAG_STYLES: TagStyle[] = ["Decimal", "Binary", "Hex"];

export function defaultTagValue(type: TagType): TagValue {
  if (type === "BOOL") return false;
  if (type === "DINT" || type === "REAL") return 0;
  if (type === "TIMER") return { PRE: 0, ACC: 0, EN: false, TT: false, DN: false };
  return { PRE: 0, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false };
}

function buildTag(name: string, description: string, type: TagType): PracticeTag {
  return { name, description, type, value: defaultTagValue(type), externalAccess: "Read/Write",
    constant: false, style: "Decimal" };
}

function validateTagName(project: PracticeProject, name: string, excludeName?: string): string {
  const normalized = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(normalized)) {
    throw new Error("El tag debe iniciar con letra o _ y usar máximo 40 caracteres alfanuméricos o _.");
  }
  if (project.tags.some((tag) => tag.name.toLowerCase() === normalized.toLowerCase() &&
    tag.name !== excludeName)) {
    throw new Error("Ya existe un tag con ese nombre.");
  }
  return normalized;
}

function tagInUse(project: PracticeProject, name: string): boolean {
  return project.rungs.some((rung) => allInstructions(rung).some((item) => item.tag === name));
}

/** An empty tag means that the symbol exists but has not been assigned an operand yet. */
export interface PracticeInstruction { id: string; kind: EditableKind; tag: string }
export interface ParallelBranch {
  id: string;
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
      buildTag("Start_PB", "Pulsador de arranque", "BOOL"),
      buildTag("Stop_PB", "Pulsador de parada", "BOOL"),
      buildTag("Motor_Run", "Motor habilitado", "BOOL"),
      buildTag("Auto_Mode", "Modo automático", "BOOL"),
      buildTag("Lamp_Run", "Indicador de marcha", "BOOL"),
    ],
    rungs: [{ id: "rung-1", instructions: [], parallelBranches: [] }],
  };
}

function allInstructions(rung: PracticeRung): PracticeInstruction[] {
  return [...rung.instructions, ...(rung.parallelBranches ?? []).flatMap((branch) => branch.instructions)];
}

function ensureTag(project: PracticeProject, tag: string): void {
  const item = project.tags.find((entry) => entry.name === tag);
  if (!item) throw new Error("Selecciona un tag existente.");
  if (item.type !== "BOOL") throw new Error("XIC, XIO y OTE solo admiten tags BOOL.");
}

function ensureNewInstruction(project: PracticeProject, item: PracticeInstruction): void {
  if (!["XIC", "XIO", "OTE"].includes(item.kind)) {
    throw new Error("Esta instrucción aún no está habilitada para edición.");
  }
  // A new XIC/XIO/OTE may be inserted before the user assigns a BOOL operand.
  if (item.tag !== "") ensureTag(project, item.tag);
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

/**
 * Insert a new rung immediately after the selected rung. With no selection,
 * append at the end. IDs are stable; the visible rung numbers are derived
 * from the array order. Never mutate the original project.
 */
export function insertRungBelow(
  project: PracticeProject,
  id: string,
  selectedRungId: string | null = null,
): PracticeProject {
  const created = createRung(project, id);
  if (!selectedRungId) return created;

  const index = project.rungs.findIndex((rung) => rung.id === selectedRungId);
  if (index === -1) throw new Error("No se encontró el rung seleccionado.");
  const newRung = created.rungs[created.rungs.length - 1];
  return {
    ...created,
    rungs: [
      ...project.rungs.slice(0, index + 1),
      newRung,
      ...project.rungs.slice(index + 1),
    ],
  };
}

/**
 * Pick a valid main-line contact for a parallel branch. A selected
 * instruction wins over a gutter-selected rung; when just the rung is
 * selected, choose its first contact that has no branch yet.
 */
export function getParallelBranchTarget(
  project: PracticeProject,
  selectedInstructionId: string | null,
  selectedRungId: string | null,
): { rungId: string; anchorId: string } | null {
  const location = selectedInstructionId
    ? findInstruction(project, selectedInstructionId)
    : null;
  if (selectedInstructionId) {
    if (!location || location.lane !== "main" || location.instruction.kind === "OTE") return null;
    return { rungId: location.rungId, anchorId: location.instruction.id };
  }

  const rung = project.rungs.find((item) => item.id === selectedRungId);
  if (!rung) return null;
  const anchor = rung.instructions.find((item) => item.kind !== "OTE");
  return anchor ? { rungId: rung.id, anchorId: anchor.id } : null;
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

/** Create an independent OR lane even when this contact has other OR lanes. */
export function createParallelBranch(
  project: PracticeProject, rungId: string, anchorId: string,
): PracticeProject {
  const rung = getRung(project, rungId);
  if (!rung.instructions.some((item) => item.id === anchorId && item.kind !== "OTE")) {
    throw new Error("Selecciona un contacto principal válido para crear el OR.");
  }
  const previous = rung.parallelBranches ?? [];
  let serial = 1;
  while (previous.some((branch) => branch.id === "or-" + anchorId + "-" + serial)) serial++;
  const nextBranch: ParallelBranch = {
    id: "or-" + anchorId + "-" + serial, anchorId, instructions: [],
  };
  return { ...project, rungs: project.rungs.map((part) => part.id === rungId ? {
    ...part, parallelBranches: [...previous, nextBranch],
  } : part) };
}

/** If branchId is absent, remove every parallel lane at that anchor (legacy API). */
export function removeParallelBranch(
  project: PracticeProject, rungId: string, anchorId: string, branchId?: string,
): PracticeProject {
  getRung(project, rungId);
  return { ...project, rungs: project.rungs.map((part) => part.id === rungId ? {
    ...part,
    parallelBranches: (part.parallelBranches ?? []).filter((branch) =>
      branchId ? branch.id !== branchId : branch.anchorId !== anchorId),
  } : part) };
}

/** Insert into a specific OR lane. Without branchId, use/create the first lane. */
export function addParallelContact(
  project: PracticeProject, rungId: string, anchorId: string,
  instruction: PracticeInstruction, position = Number.MAX_SAFE_INTEGER,
  branchId?: string,
): PracticeProject {
  ensureNewInstruction(project, instruction);
  if (instruction.kind === "OTE") {
    throw new Error("Las ramas OR solo admiten XIC y XIO en esta etapa.");
  }
  const rung = getRung(project, rungId);
  if (!rung.instructions.some((item) => item.id === anchorId && item.kind !== "OTE")) {
    throw new Error("Selecciona un contacto principal válido para crear el OR.");
  }
  if (contactCount(rung) >= 8) throw new Error("Máximo 8 contactos por rung en esta etapa.");

  let currentProject = project;
  let chosen = (rung.parallelBranches ?? []).find((branch) =>
    branchId ? branch.id === branchId && branch.anchorId === anchorId
      : branch.anchorId === anchorId);
  if (!chosen) {
    if (branchId) throw new Error("No se encontró la rama OR de destino.");
    currentProject = createParallelBranch(project, rungId, anchorId);
    chosen = getRung(currentProject, rungId).parallelBranches?.find((branch) =>
      branch.anchorId === anchorId);
  }
  if (!chosen) throw new Error("No se pudo crear la rama OR.");
  const at = Math.min(Math.max(0, position), chosen.instructions.length);
  return {
    ...currentProject,
    rungs: currentProject.rungs.map((part) => part.id === rungId ? {
      ...part,
      parallelBranches: (part.parallelBranches ?? []).map((branch) =>
        branch.id === chosen.id
          ? { ...branch, instructions: [
              ...branch.instructions.slice(0, at), instruction,
              ...branch.instructions.slice(at),
            ] }
          : branch),
    } : part),
  };
}

export interface InstructionLocation {
  rungId: string;
  position: number;
  lane: "main" | "parallel";
  instruction: PracticeInstruction;
  anchorId?: string;
  branchId?: string;
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
          anchorId: branch.anchorId, branchId: branch.id, instruction: branch.instructions[index] };
      }
    }
  }
  return null;
}

export function changeInstructionTag(
  project: PracticeProject, instructionId: string, tag: string,
): PracticeProject {
  // Empty tag is the intentional "sin asignar" state in the editor.
  if (tag !== "") ensureTag(project, tag);
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
  if (!source.instruction.tag) {
    throw new Error("La instrucción de origen no tiene un tag asignado.");
  }
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
    const paired = (rung.parallelBranches ?? []).filter((branch) => branch.anchorId === id);
    // Preserving all lanes when deleting an anchor would require regrouping
    // their topology. Refuse such a deletion rather than lose instructions.
    if (paired.length > 1) throw new Error(
      "Este contacto tiene varias ramas OR. Elimina o reubica las ramas primero.",
    );
    const promoted = paired[0]?.instructions ?? [];
    return {
      ...rung,
      instructions: rung.instructions.flatMap((item) => item.id === id ? promoted : [item]),
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
    ? origin.parallelBranches?.filter((branch) => branch.anchorId === instructionId) ?? [] : [];
  const movingCount = 1 + attached.reduce((sum, branch) => sum + branch.instructions.length, 0);
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
  for (const branch of attached) {
    next = createParallelBranch(next, targetRungId, instructionId);
    const recreatedId = getRung(next, targetRungId).parallelBranches?.at(-1)?.id;
    for (const item of branch.instructions) {
      next = addParallelContact(next, targetRungId, instructionId, item,
        Number.MAX_SAFE_INTEGER, recreatedId);
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
  targetBranchId?: string,
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

  const previousBranch = target.parallelBranches?.find((branch) =>
    targetBranchId ? branch.id === targetBranchId : branch.anchorId === anchorId);
  const slot = Math.min(Math.max(0, position), previousBranch?.instructions.length ?? 0);
  const at = sameRung && source.lane === "parallel" &&
    source.branchId === previousBranch?.id && source.position < slot ? slot - 1 : slot;

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
  return addParallelContact(stripped, targetRungId, anchorId, source.instruction, at, targetBranchId);
}


/**
 * Clicking an instruction in the palette inserts according to selection.
 * Contact selected => immediately right in the same lane.
 * Rung selected => last contact before its OTE, or OTE at far right.
 */
export interface PaletteInsertionTarget {
  rungId: string;
  position: number;
  anchorId?: string;
  branchId?: string;
}

export function getPaletteInsertionTarget(
  project: PracticeProject,
  selectedInstructionId: string | null,
  selectedRungId: string | null,
  kind: EditableKind,
): PaletteInsertionTarget | null {
  const location = selectedInstructionId
    ? findInstruction(project, selectedInstructionId)
    : null;
  const rungId = location?.rungId ?? selectedRungId;
  const rung = project.rungs.find((item) => item.id === rungId);
  if (!rung) return null;
  const contactLength = rung.instructions.filter((item) => item.kind !== "OTE").length;
  if (kind === "OTE") return { rungId: rung.id, position: contactLength };
  if (location && location.instruction.kind !== "OTE") {
    if (location.lane === "parallel") return {
      rungId: rung.id, anchorId: location.anchorId, branchId: location.branchId,
      position: location.position + 1,
    };
    return { rungId: rung.id, position: location.position + 1 };
  }
  return { rungId: rung.id, position: contactLength };
}

export function createTag(
  project: PracticeProject,
  name: string,
  description: string,
  type: TagType = "BOOL",
): PracticeProject {
  const normalized = validateTagName(project, name);
  if (!TAG_TYPES.includes(type)) throw new Error("Tipo de dato no válido.");
  return { ...project, tags: [...project.tags, buildTag(normalized, description.trim().slice(0, 120), type)] };
}

/** Changing the declaration name atomically updates all contact/coil references. */
export function editTag(
  project: PracticeProject,
  previousName: string,
  patch: Partial<Pick<PracticeTag, "name" | "description" | "type" | "externalAccess" | "constant" | "style">>,
): PracticeProject {
  const original = project.tags.find((tag) => tag.name === previousName);
  if (!original) throw new Error("No se encontró el tag.");
  const nextName = patch.name === undefined ? previousName : validateTagName(project, patch.name, previousName);
  const nextType = patch.type ?? original.type;
  if (!TAG_TYPES.includes(nextType)) throw new Error("Tipo de dato no válido.");
  if (nextType !== "BOOL" && tagInUse(project, previousName)) {
    throw new Error("No se puede cambiar el tipo de un tag BOOL utilizado en Ladder.");
  }
  if (patch.externalAccess && !TAG_EXTERNAL_ACCESS.includes(patch.externalAccess)) {
    throw new Error("Acceso externo no válido.");
  }
  if (patch.style && !TAG_STYLES.includes(patch.style)) throw new Error("Estilo no válido.");
  const next: PracticeTag = {
    ...original, ...patch,
    name: nextName,
    type: nextType,
    description: (patch.description ?? original.description).trim().slice(0, 120),
    value: nextType === original.type ? original.value : defaultTagValue(nextType),
  };
  return {
    ...project,
    tags: project.tags.map((tag) => tag.name === previousName ? next : tag),
    rungs: nextName === previousName ? project.rungs : project.rungs.map((rung) => ({
      ...rung,
      instructions: rung.instructions.map((item) =>
        item.tag === previousName ? { ...item, tag: nextName } : item),
      parallelBranches: rung.parallelBranches?.map((branch) => ({
        ...branch, instructions: branch.instructions.map((item) =>
          item.tag === previousName ? { ...item, tag: nextName } : item),
      })),
    })),
  };
}

function assertValidTagValue(type: TagType, value: TagMemberValue): void {
  if (type === "BOOL") {
    if (typeof value !== "boolean") throw new Error("BOOL solo admite valores booleanos.");
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Introduce un valor numérico válido.");
  }
  if (type === "DINT" && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) {
    throw new Error("DINT requiere un entero de 32 bits.");
  }
}

export function setTagValue(
  project: PracticeProject,
  name: string,
  value: TagMemberValue,
  member?: string,
): PracticeProject {
  const tag = project.tags.find((item) => item.name === name);
  if (!tag) throw new Error("No se encontró el tag.");
  if (tag.constant) throw new Error("El tag es constante y no admite modificar su valor.");
  if (tag.type === "TIMER" || tag.type === "COUNTER") {
    if (!member || typeof tag.value !== "object" || !Object.hasOwn(tag.value, member)) {
      throw new Error("Selecciona un miembro válido del tag estructurado.");
    }
    const oldValue = tag.value[member];
    assertValidTagValue(typeof oldValue === "boolean" ? "BOOL" : "DINT", value);
    const next = { ...tag.value, [member]: value };
    return { ...project, tags: project.tags.map((item) =>
      item.name === name ? { ...item, value: next } : item) };
  }
  assertValidTagValue(tag.type, value);
  return { ...project, tags: project.tags.map((item) =>
    item.name === name ? { ...item, value } : item) };
}

export function deleteTag(project: PracticeProject, name: string): PracticeProject {
  if (tagInUse(project, name)) throw new Error("No se puede eliminar un tag utilizado en Ladder.");
  return { ...project, tags: project.tags.filter((tag) => tag.name !== name) };
}
