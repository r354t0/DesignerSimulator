import { MAX_PRACTICE_CONTACTS, MAX_PARALLEL_OUTPUTS, isOutputKind, isTimerKind, type EditableKind, type PracticeInstruction,
  type PracticeProject, type PracticeRung } from "./practiceDocument.ts";

export type DiagnosticSeverity = "error" | "warning";

export interface BuildDiagnostic {
  id: string;
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  rungId?: string;
  rungIndex?: number;
  instructionId?: string;
  branchId?: string;
}

export interface LadderBuildResult {
  success: boolean;
  errors: number;
  warnings: number;
  diagnostics: BuildDiagnostic[];
  checkedRungs: number;
}

/**
 * Tracks changes that affect compilable logic. Runtime BOOL/numeric values
 * and display-only descriptions are intentionally excluded: editing a value
 * in Monitor Tags should not invalidate a successful static Build.
 */
export function getPracticeBuildSignature(project: PracticeProject): string {
  return JSON.stringify({
    tags: project.tags.map(({ name, type, constant }) => ({ name, type, constant })),
    rungs: project.rungs.map((rung) => ({
      id: rung.id,
      instructions: rung.instructions.map(({ id, kind, tag }) => ({ id, kind, tag })),
      emptyOutputBranches: rung.emptyOutputBranches ?? [],
      branches: (rung.parallelBranches ?? []).map(({ id, anchorId, endId, instructions }) => ({
        id, anchorId, endId, instructions: instructions.map(({ id: instructionId, kind, tag }) =>
          ({ id: instructionId, kind, tag })),
      })),
    })),
  });
}

/**
 * Static verification only. It checks structure, supported opcodes and
 * operand compatibility; it does NOT evaluate a PLC scan or verify that a
 * machine's intended control philosophy is logically correct.
 *
 * Diagnostics are deterministic and identify stable editor IDs so the UI
 * can navigate directly to the affected rung, instruction or OR lane.
 */
export function buildPracticeProject(project: PracticeProject): LadderBuildResult {
  const diagnostics: BuildDiagnostic[] = [];
  const tags = new Map(project.tags.map((tag) => [tag.name, tag]));
  let sequence = 0;
  const push = (
    severity: DiagnosticSeverity,
    code: string,
    message: string,
    rungId?: string,
    rungIndex?: number,
    instructionId?: string,
    branchId?: string,
  ) => {
    diagnostics.push({
      id: "diag-" + sequence++,
      severity, code, message, rungId, rungIndex, instructionId, branchId,
    });
  };

  if (project.rungs.length === 0) {
    push("error", "EMPTY_PROGRAM", "La rutina no contiene ningún rung.");
  }

  const duplicateTags = new Set<string>();
  const seenTags = new Set<string>();
  for (const tag of project.tags) {
    const key = tag.name.toLowerCase();
    if (seenTags.has(key) && !duplicateTags.has(key)) {
      duplicateTags.add(key);
      push("error", "DUPLICATE_TAG", "Existe más de una definición del tag " + tag.name + ".");
    }
    seenTags.add(key);
  }

  const seenInstructions = new Set<string>();
  const outputs = new Map<string, { rung: number; kind: string }[]>();
  const onsStorage = new Map<string, { rungId: string; rungIndex: number; id: string }[]>();
  let executableRungs = 0;

  function checkInstruction(
    instruction: PracticeInstruction,
    rung: PracticeRung,
    rungIndex: number,
    lane: "main" | "parallel",
    branchId?: string,
  ) {
    const id = instruction.id;
    const at = "Rung " + rungIndex;
    if (seenInstructions.has(id)) {
      push("error", "DUPLICATE_INSTRUCTION",
        at + ": identificador de instrucción duplicado.", rung.id, rungIndex, id, branchId);
    }
    seenInstructions.add(id);

    if (!["XIC", "XIO", "OTE", "OTL", "OTU", "ONS", "TON", "TOF", "RTO", "RES"].includes(instruction.kind as EditableKind)) {
      push("error", "UNSUPPORTED_INSTRUCTION",
        at + ": instrucción " + instruction.kind + " no admitida por el motor actual.",
        rung.id, rungIndex, id, branchId);
    }
    if (lane === "parallel" && isOutputKind(instruction.kind)) {
      push("error", "COIL_IN_BRANCH",
        at + ": una rama OR de contactos no admite OTE, OTL ni OTU.", rung.id, rungIndex, id, branchId);
    }
    if (!instruction.tag) {
      push("error", "MISSING_TAG",
        at + ": " + instruction.kind + " sin variable asignada (??).",
        rung.id, rungIndex, id, branchId);
      return;
    }
    const [root, member] = instruction.tag.split(".");
    const tag = tags.get(root);
    if (!tag) {
      push("error", "UNKNOWN_TAG",
        at + ": no existe el tag «" + instruction.tag + "» en Controller Tags.",
        rung.id, rungIndex, id, branchId);
      return;
    }
    const expectedType = isTimerKind(instruction.kind) ? "TIMER"
      : member ? "TIMER" : "BOOL";
    if (tag.type !== expectedType || (member &&
      (isTimerKind(instruction.kind) || instruction.kind === "ONS" ||
        !["EN", "TT", "DN"].includes(member)))) {
      push("error", "INCOMPATIBLE_TAG",
        at + ": " + instruction.kind + " requiere " +
        (isTimerKind(instruction.kind) ? "TIMER" : "BOOL") +
        " compatible.", rung.id, rungIndex, id, branchId);
    }
    if (isTimerKind(instruction.kind) && tag.type === "TIMER" &&
        typeof tag.value === "object") {
      const preset = tag.value.PRE;
      const acc = tag.value.ACC;
      if (!Number.isInteger(preset) || (preset as number) < 0 ||
          !Number.isInteger(acc) || (acc as number) < 0) {
        push("error", "INVALID_TIMER_PRESET",
          at + ": TIMER requiere PRE/ACC en milisegundos, enteros no negativos.",
          rung.id, rungIndex, id, branchId);
      }
    }
    if (instruction.kind === "ONS") {
      if (tag.constant) {
        push("error", "CONSTANT_ONS_STORAGE",
          at + ": ONS no puede escribir una memoria BOOL constante.",
          rung.id, rungIndex, id, branchId);
      }
      const uses = onsStorage.get(tag.name) ?? [];
      uses.push({ rungId: rung.id, rungIndex, id });
      onsStorage.set(tag.name, uses);
    }
    if (isOutputKind(instruction.kind)) {
      if (tag.constant) {
        push("error", "CONSTANT_OUTPUT",
          at + ": " + instruction.kind + " no puede escribir el tag constante «" + tag.name + "».",
          rung.id, rungIndex, id, branchId);
      }
      const places = outputs.get(tag.name) ?? [];
      places.push({ rung: rungIndex, kind: instruction.kind });
      outputs.set(tag.name, places);
    }
  }

  project.rungs.forEach((rung, rungIndex) => {
    const at = "Rung " + rungIndex;
    const instructions = rung.instructions;
    const branches = rung.parallelBranches ?? [];
    const contacts = instructions.filter((instruction) => !isOutputKind(instruction.kind));
    const coils = instructions.filter((instruction) => isOutputKind(instruction.kind));
    const count = contacts.length + branches.reduce((sum, branch) => sum + branch.instructions.length, 0);

    if (instructions.length === 0 && branches.length === 0) {
      push("warning", "EMPTY_RUNG", at + ": rung vacío.", rung.id, rungIndex);
    } else {
      if (count > MAX_PRACTICE_CONTACTS) {
        push("error", "CONTACT_LIMIT",
          at + ": supera el máximo de " + MAX_PRACTICE_CONTACTS + " contactos que admite esta versión.",
          rung.id, rungIndex);
      }
      if (coils.length === 0) {
        push("warning", "NO_OUTPUT", at + ": no contiene una salida OTE/OTL/OTU.", rung.id, rungIndex);
      } else {
        executableRungs++;
      }
      if (coils.length + (rung.emptyOutputBranches?.length ?? 0) > MAX_PARALLEL_OUTPUTS) {
        push("error", "OUTPUT_LIMIT",
          at + ": supera el máximo de " + MAX_PARALLEL_OUTPUTS + " salidas por rung.",
          rung.id, rungIndex);
      }
      if (contacts.length === 0 && coils.length > 0) {
        push("warning", "UNCONDITIONAL_OUTPUT",
          at + ": salida sin contactos de condición (incondicional).",
          rung.id, rungIndex, coils[0].id);
      }
      const firstCoilIndex = instructions.findIndex((item) => isOutputKind(item.kind));
      if (firstCoilIndex !== -1 &&
        instructions.slice(firstCoilIndex).some((item) => !isOutputKind(item.kind))) {
        push("error", "COIL_NOT_LAST",
          at + ": las salidas OTE/OTL/OTU deben situarse juntas al extremo derecho.",
          rung.id, rungIndex, coils[0].id);
      }
    }

    for (const instruction of instructions) {
      checkInstruction(instruction, rung, rungIndex, "main");
    }
    const emptyOutputs = rung.emptyOutputBranches ?? [];
    for (const branchId of emptyOutputs) {
      push("error", "EMPTY_OUTPUT_BRANCH",
        at + ": rama OR de salida vacía; añade una instrucción o elimina la rama.",
        rung.id, rungIndex, undefined, branchId);
    }
    if (new Set(emptyOutputs).size !== emptyOutputs.length) {
      push("error", "DUPLICATE_OUTPUT_BRANCH",
        at + ": existen ramas de salida duplicadas.", rung.id, rungIndex);
    }
    const usedBranchIds = new Set<string>();
    const mainContactIds = instructions.filter((item) => !isOutputKind(item.kind)).map((item) => item.id);
    const coveredBy: string[] = [];
    for (const branch of branches) {
      if (usedBranchIds.has(branch.id)) {
        push("error", "DUPLICATE_BRANCH",
          at + ": identificador de rama OR duplicado.", rung.id, rungIndex, undefined, branch.id);
      }
      usedBranchIds.add(branch.id);

      const anchor = instructions.find((item) => item.id === branch.anchorId);
      if (!anchor || anchor.kind === "OTE") {
        push("error", "INVALID_BRANCH_ANCHOR",
          at + ": la rama OR no está asociada a un contacto principal válido.",
          rung.id, rungIndex, undefined, branch.id);
      }
      const first = mainContactIds.indexOf(branch.anchorId);
      const last = mainContactIds.indexOf(branch.endId ?? branch.anchorId);
      if (first < 0 || last < first) {
        push("error", "INVALID_OR_JOIN",
          at + ": la unión de la rama OR no está después del contacto inicial.",
          rung.id, rungIndex, undefined, branch.id);
      } else {
        for (const contactId of mainContactIds.slice(first, last + 1)) {
          if (coveredBy.includes(contactId) &&
            !(branches.some((other) => other !== branch &&
              other.anchorId === branch.anchorId &&
              (other.endId ?? other.anchorId) === (branch.endId ?? branch.anchorId)))) {
            push("error", "OVERLAPPING_OR",
              at + ": existen grupos OR superpuestos; ajusta sus uniones.",
              rung.id, rungIndex, undefined, branch.id);
            break;
          }
          coveredBy.push(contactId);
        }
      }
      if (branch.instructions.length === 0) {
        push("error", "EMPTY_OR_BRANCH",
          at + ": rama OR vacía; produce un puente sin condición.",
          rung.id, rungIndex, undefined, branch.id);
      }
      for (const item of branch.instructions) {
        checkInstruction(item, rung, rungIndex, "parallel", branch.id);
      }
    }
  });

  if (project.rungs.length && executableRungs === 0) {
    push("error", "NO_EXECUTABLE_RUNG",
      "La rutina no tiene ningún rung con bobina OTE para ejecutar.");
  }

  for (const [tag, places] of outputs) {
    const onlySetResetPair = places.every((entry) =>
      entry.kind === "OTL" || entry.kind === "OTU");
    const timerPair = places.every((entry) => ["RTO", "RES"].includes(entry.kind))
      && places.filter((entry) => entry.kind === "RTO").length === 1;
    if (places.length > 1 && !onlySetResetPair && !timerPair) {
      push("warning", "DUPLICATE_OUTPUT",
        "La variable «" + tag + "» es escrita por varias bobinas (rungs " +
        places.map((entry) => entry.rung).join(", ") + "). Revisa sobrescrituras.");
    }
  }

  for (const [tag, users] of onsStorage) {
    if (users.length > 1) {
      for (const user of users) push("error", "SHARED_ONS_STORAGE",
        "La memoria ONS «" + tag + "» debe ser exclusiva para una sola instrucción.",
        user.rungId, user.rungIndex, user.id);
    }
    if (outputs.has(tag)) {
      for (const user of users) push("error", "ONS_STORAGE_CONFLICT",
        "La memoria ONS «" + tag + "» no puede ser escrita por OTE, OTL ni OTU.",
        user.rungId, user.rungIndex, user.id);
    }
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  return { success: errors === 0, errors, warnings, diagnostics, checkedRungs: project.rungs.length };
}
