import type {
  EditableKind, PracticeInstruction, PracticeProject, PracticeRung,
  MAX_PRACTICE_CONTACTS,
} from "./practiceDocument.ts";

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
      branches: (rung.parallelBranches ?? []).map(({ id, anchorId, instructions }) => ({
        id, anchorId, instructions: instructions.map(({ id: instructionId, kind, tag }) =>
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
  const outputs = new Map<string, number[]>();
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

    if (!["XIC", "XIO", "OTE"].includes(instruction.kind as EditableKind)) {
      push("error", "UNSUPPORTED_INSTRUCTION",
        at + ": instrucción " + instruction.kind + " no admitida por el motor actual.",
        rung.id, rungIndex, id, branchId);
    }
    if (lane === "parallel" && instruction.kind === "OTE") {
      push("error", "COIL_IN_BRANCH",
        at + ": una rama OR no puede contener una bobina OTE.", rung.id, rungIndex, id, branchId);
    }
    if (!instruction.tag) {
      push("error", "MISSING_TAG",
        at + ": " + instruction.kind + " sin variable asignada (??).",
        rung.id, rungIndex, id, branchId);
      return;
    }
    const tag = tags.get(instruction.tag);
    if (!tag) {
      push("error", "UNKNOWN_TAG",
        at + ": no existe el tag «" + instruction.tag + "» en Controller Tags.",
        rung.id, rungIndex, id, branchId);
      return;
    }
    if (tag.type !== "BOOL") {
      push("error", "INCOMPATIBLE_TAG",
        at + ": " + instruction.kind + " requiere BOOL; «" + tag.name +
        "» es " + tag.type + ".", rung.id, rungIndex, id, branchId);
    }
    if (instruction.kind === "OTE") {
      if (tag.constant) {
        push("error", "CONSTANT_OUTPUT",
          at + ": la bobina OTE no puede escribir el tag constante «" + tag.name + "».",
          rung.id, rungIndex, id, branchId);
      }
      const places = outputs.get(tag.name) ?? [];
      places.push(rungIndex);
      outputs.set(tag.name, places);
    }
  }

  project.rungs.forEach((rung, rungIndex) => {
    const at = "Rung " + rungIndex;
    const instructions = rung.instructions;
    const branches = rung.parallelBranches ?? [];
    const contacts = instructions.filter((instruction) => instruction.kind !== "OTE");
    const coils = instructions.filter((instruction) => instruction.kind === "OTE");
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
        push("warning", "NO_OUTPUT", at + ": no contiene una salida OTE.", rung.id, rungIndex);
      } else {
        executableRungs++;
      }
      if (coils.length > 1) {
        push("error", "MULTIPLE_COILS",
          at + ": hay varias bobinas OTE. Esta versión admite una por rung.",
          rung.id, rungIndex);
      }
      if (contacts.length === 0 && coils.length > 0) {
        push("warning", "UNCONDITIONAL_OUTPUT",
          at + ": OTE sin contactos de condición (salida incondicional).",
          rung.id, rungIndex, coils[0].id);
      }
      if (coils.length && instructions.at(-1)?.kind !== "OTE") {
        push("error", "COIL_NOT_LAST",
          at + ": la bobina OTE debe situarse al extremo derecho.",
          rung.id, rungIndex, coils[0].id);
      }
    }

    for (const instruction of instructions) {
      checkInstruction(instruction, rung, rungIndex, "main");
    }
    const usedBranchIds = new Set<string>();
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
    if (places.length > 1) {
      push("warning", "DUPLICATE_OUTPUT",
        "La variable «" + tag + "» es escrita por varias OTE (rungs " +
        places.join(", ") + "). Revisa posibles sobrescrituras.");
    }
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  return { success: errors === 0, errors, warnings, diagnostics, checkedRungs: project.rungs.length };
}
