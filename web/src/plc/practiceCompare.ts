import {
  findInstruction, isCompareKind,
  type ComparisonOperand, type NumericOperand, type PracticeProject,
  type PracticeTag, type CompareKind,
} from "./practiceDocument.ts";

const NUMERIC_MEMBER = new Set(["PRE", "ACC"]);
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export interface NumericTagOption {
  name: string;
  value: number;
  description: string;
}

export interface ComparisonTagOption {
  name: string;
  value: string | number;
  description: string;
  type: "INT" | "DINT" | "REAL" | "STRING";
}

/** Scalar INT/DINT/REAL plus TIMER/COUNTER PRE/ACC. No BOOL coercion. */
export function numericTagOptions(tags: readonly PracticeTag[]): NumericTagOption[] {
  return tags.flatMap((tag) => {
    if ((tag.type === "INT" || tag.type === "DINT" || tag.type === "REAL") &&
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

export function comparisonTagOptions(
  tags: readonly PracticeTag[], kind: CompareKind,
): ComparisonTagOption[] {
  const numeric = numericTagOptions(tags).map((entry) => {
    const root = tags.find((tag) => tag.name === entry.name.split(".")[0]);
    const type = root?.type === "INT" || root?.type === "REAL" ? root.type : "DINT";
    return { ...entry, type };
  });
  if (kind !== "EQU" && kind !== "NEQ") return numeric;
  const strings: ComparisonTagOption[] = tags.flatMap((tag) =>
    tag.type === "STRING" && typeof tag.value === "string"
      ? [{ name: tag.name, value: tag.value, description: tag.description, type: "STRING" }]
      : []);
  return [...numeric, ...strings].sort((a, b) => a.name.localeCompare(b.name));
}

function isNumericKind(kind: CompareKind) {
  return kind !== "EQU" && kind !== "NEQ";
}

/** String literals are always quoted, avoiding ambiguity with tag names. */
export function parseComparisonOperand(
  raw: string, tags: readonly PracticeTag[], kind: CompareKind,
): { ok: true; operand: ComparisonOperand } | { ok: false; message: string } {
  const input = raw.trim();
  if (!input) return { ok: false, message: "Introduce un número, texto entre comillas o una variable." };
  if (NUMBER_RE.test(input)) {
    const value = Number(input);
    return Number.isFinite(value)
      ? { ok: true, operand: { mode: "literal", value } }
      : { ok: false, message: "El número está fuera de rango." };
  }
  if (input.startsWith('"')) {
    if (isNumericKind(kind)) return { ok: false, message: kind + " solo acepta números." };
    try {
      const value: unknown = JSON.parse(input);
      return typeof value === "string"
        ? { ok: true, operand: { mode: "literal", value } }
        : { ok: false, message: "El literal debe ser texto entre comillas dobles." };
    } catch {
      return { ok: false, message: "Texto inválido: utiliza comillas dobles, por ejemplo \"LISTO\"." };
    }
  }
  const option = comparisonTagOptions(tags, kind).find((tag) =>
    tag.name.toLowerCase() === input.toLowerCase());
  return option
    ? { ok: true, operand: { mode: "tag", tag: option.name } }
    : { ok: false, message: kind === "EQU" || kind === "NEQ"
      ? "Selecciona un DINT/REAL/INT o STRING existente, o escribe un literal entre comillas."
      : "Selecciona un DINT/REAL/INT o miembro PRE/ACC existente." };
}

/** Preserve existing numeric-only APIs for timers and previous FAT suites. */
export function parseNumericOperand(raw: string, tags: readonly PracticeTag[]) {
  return parseComparisonOperand(raw, tags, "GRT") as
    | { ok: true; operand: NumericOperand }
    | { ok: false; message: string };
}

export function validateComparisonOperand(
  tags: readonly PracticeTag[], kind: CompareKind,
  operand: ComparisonOperand | undefined,
): string | null {
  if (!operand) return "Falta asignar un operando.";
  if (operand.mode === "literal") {
    if (typeof operand.value === "number" && Number.isFinite(operand.value)) return null;
    if (typeof operand.value === "string" && !isNumericKind(kind)) return null;
    return kind + " requiere un operando numérico válido.";
  }
  if (operand.mode === "tag") {
    return comparisonTagOptions(tags, kind).some((tag) => tag.name === operand.tag)
      ? null : "La variable «" + operand.tag + "» debe existir y ser DINT/REAL/INT" +
        (isNumericKind(kind) ? " o miembro numérico PRE/ACC." : " o STRING.");
  }
  return "Modo de operando desconocido.";
}

export const validateNumericOperand = (
  tags: readonly PracticeTag[], operand: NumericOperand | undefined,
): string | null => validateComparisonOperand(tags, "GRT", operand);

function operandDataType(tags: readonly PracticeTag[], operand: ComparisonOperand) {
  if (operand.mode === "literal") return typeof operand.value;
  const tag = tags.find((t) => t.name === operand.tag.split(".")[0]);
  return tag?.type === "STRING" ? "string" : "number";
}

/** EQU/NEQ support STRING with STRING; all other comparisons require numbers. */
export function validateComparisonPair(
  tags: readonly PracticeTag[], kind: CompareKind,
  a: ComparisonOperand | undefined, b: ComparisonOperand | undefined,
): string | null {
  if (!a || !b || validateComparisonOperand(tags, kind, a) ||
      validateComparisonOperand(tags, kind, b)) return null;
  const typeA = operandDataType(tags, a);
  const typeB = operandDataType(tags, b);
  return typeA === typeB ? null :
    "Source A y Source B deben ser del mismo tipo (STRING con STRING o número con número).";
}

export const numericOperandLabel = (operand: ComparisonOperand | undefined): string =>
  !operand ? "??" : operand.mode === "tag" ? operand.tag :
    typeof operand.value === "string" ? JSON.stringify(operand.value) : String(operand.value);

export function readComparisonOperand(
  tags: readonly PracticeTag[], kind: CompareKind,
  operand: ComparisonOperand | undefined,
): number | string {
  const error = validateComparisonOperand(tags, kind, operand);
  if (error) throw new Error(error);
  if (operand!.mode === "literal") return operand!.value;
  const ref = comparisonTagOptions(tags, kind).find((tag) =>
    tag.name === (operand as { mode: "tag"; tag: string }).tag);
  if (!ref) throw new Error("El operando ya no existe.");
  return ref.value;
}

export function readNumericOperand(
  tags: readonly PracticeTag[], operand: NumericOperand | undefined,
): number {
  return readComparisonOperand(tags, "GRT", operand) as number;
}

export function compareValues(kind: CompareKind, a: string | number, b: string | number): boolean {
  if (typeof a !== typeof b) {
    throw new Error("No se puede comparar STRING con un valor numérico.");
  }
  if (typeof a === "string" || typeof b === "string") {
    if (kind === "EQU") return a === b;
    if (kind === "NEQ") return a !== b;
    throw new Error(kind + " no admite variables STRING.");
  }
  switch (kind) {
    case "EQU": return a === b;
    case "NEQ": return a !== b;
    case "LES": return a < b;
    case "LEQ": return a <= b;
    case "GRT": return a > b;
    case "GEQ": return a >= b;
  }
}

/** Retain numeric API compatibility with the previous comparator. */
export const compareNumbers = (kind: CompareKind, a: number, b: number): boolean =>
  compareValues(kind, a, b);

/** Stable compare operands work both in the main line and in OR branches. */
export function setComparisonOperand(
  project: PracticeProject, instructionId: string, side: "A" | "B", operand: ComparisonOperand,
): PracticeProject {
  const found = findInstruction(project, instructionId);
  if (!found || !isCompareKind(found.instruction.kind)) {
    throw new Error("La instrucción seleccionada no es una comparación.");
  }
  const reason = validateComparisonOperand(project.tags, found.instruction.kind, operand);
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
