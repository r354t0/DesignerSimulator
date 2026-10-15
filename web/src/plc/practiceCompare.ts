import {
  findInstruction, isCompareKind,
  type NumericOperand, type PracticeProject, type PracticeTag, type CompareKind,
} from "./practiceDocument.ts";

const NUMERIC_MEMBER = new Set(["PRE", "ACC"]);

export interface NumericTagOption {
  name: string;
  value: number;
  description: string;
}

/** Numeric controller-level tags plus nested TIMER/COUNTER PRE and ACC fields. */
export function numericTagOptions(tags: readonly PracticeTag[]): NumericTagOption[] {
  return tags.flatMap((tag) => {
    if ((tag.type === "DINT" || tag.type === "REAL") &&
        typeof tag.value === "number" && Number.isFinite(tag.value)) {
      return [{ name: tag.name, value: tag.value, description: tag.description }];
    }
    if ((tag.type === "TIMER" || tag.type === "COUNTER") && typeof tag.value === "object") {
      return [...NUMERIC_MEMBER].flatMap((member) => {
        const value = tag.value as Record<string, number | boolean>;
        return typeof value[member] === "number" && Number.isFinite(value[member])
          ? [{ name: tag.name + "." + member, value: value[member] as number,
              description: tag.description }] : [];
      });
    }
    return [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** No JavaScript expressions or implicit BOOL conversion are accepted. */
export function validateNumericOperand(tags: readonly PracticeTag[], operand: NumericOperand | undefined): string | null {
  if (!operand) return "Falta asignar un origen numérico.";
  if (operand.mode === "literal") {
    return typeof operand.value === "number" && Number.isFinite(operand.value)
      ? null : "La constante debe ser un número finito.";
  }
  if (operand.mode === "tag") {
    return numericTagOptions(tags).some((tag) => tag.name === operand.tag)
      ? null : "La variable «" + operand.tag + "» debe existir y ser DINT/REAL o un miembro numérico PRE/ACC.";
  }
  return "Modo de operando numérico desconocido.";
}

export type ParsedNumericOperand =
  | { ok: true; operand: NumericOperand }
  | { ok: false; message: string };

/** Convert a user-entered literal or tag into an instruction operand. */
export function parseNumericOperand(raw: string, tags: readonly PracticeTag[]): ParsedNumericOperand {
  const text = raw.trim();
  if (!text) return { ok: false, message: "Introduce un número o selecciona una variable." };
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n)
      ? { ok: true, operand: { mode: "literal", value: n } }
      : { ok: false, message: "El número está fuera de rango." };
  }
  const tag = numericTagOptions(tags).find((entry) =>
    entry.name.toLowerCase() === text.toLowerCase());
  return tag
    ? { ok: true, operand: { mode: "tag", tag: tag.name } }
    : { ok: false, message: "Selecciona un DINT/REAL o miembro PRE/ACC existente." };
}

export const numericOperandLabel = (operand: NumericOperand | undefined): string =>
  operand ? operand.mode === "literal" ? String(operand.value) : operand.tag : "??";

export function readNumericOperand(
  tags: readonly PracticeTag[], operand: NumericOperand | undefined,
): number {
  const error = validateNumericOperand(tags, operand);
  if (error) throw new Error(error);
  if (operand!.mode === "literal") return operand!.value;
  const ref = numericTagOptions(tags).find((tag) => tag.name === (operand as {mode:"tag";tag:string}).tag);
  if (!ref) throw new Error("El operando numérico ya no existe.");
  return ref.value;
}

export function compareNumbers(kind: CompareKind, a: number, b: number): boolean {
  switch (kind) {
    case "EQU": return a === b;
    case "NEQ": return a !== b;
    case "LES": return a < b;
    case "LEQ": return a <= b;
    case "GRT": return a > b;
    case "GEQ": return a >= b;
  }
}

/** Operands remain attached to a stable instruction ID (main or OR lane). */
export function setComparisonOperand(
  project: PracticeProject, instructionId: string, side: "A" | "B", operand: NumericOperand,
): PracticeProject {
  const found = findInstruction(project, instructionId);
  if (!found || !isCompareKind(found.instruction.kind)) {
    throw new Error("La instrucción seleccionada no es una comparación.");
  }
  const reason = validateNumericOperand(project.tags, operand);
  if (reason) throw new Error(reason);
  const key = side === "A" ? "compareA" : "compareB";
  const update = (instruction: typeof found.instruction) =>
    instruction.id === instructionId ? { ...instruction, [key]: operand } : instruction;
  return { ...project, rungs: project.rungs.map((rung) => ({
    ...rung,
    instructions: rung.instructions.map(update),
    parallelBranches: rung.parallelBranches?.map((branch) => ({
      ...branch, instructions: branch.instructions.map(update),
    })),
  })) };
}
