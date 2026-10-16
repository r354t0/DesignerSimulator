import {
  changeInstructionTag, findInstruction, isMathKind,
  type MathKind, type NumericOperand, type PracticeProject, type PracticeTag,
} from "./practiceDocument.ts";
import {
  numericTagOptions, parseNumericOperand, readNumericOperand, validateNumericOperand,
} from "./practiceCompare.ts";

export const MATH_DEST_TYPES = ["INT", "DINT", "REAL"] as const;

export function mathDestinationOptions(tags: readonly PracticeTag[]): PracticeTag[] {
  return tags.filter((tag) =>
    MATH_DEST_TYPES.some((type) => tag.type === type) && !tag.constant);
}

export function validateMathSource(
  tags: readonly PracticeTag[], operand: NumericOperand | undefined,
): string | null {
  return validateNumericOperand(tags, operand);
}

export function validateMathDestination(tags: readonly PracticeTag[], name: string): string | null {
  if (!name) return "Falta asignar un tag Dest.";
  const tag = tags.find((item) => item.name === name);
  if (!tag || !MATH_DEST_TYPES.some((type) => tag.type === type)) {
    return "Dest debe ser una variable INT, DINT o REAL existente.";
  }
  if (tag.constant) return "No se puede escribir sobre una variable constante.";
  return null;
}

export function setMathSource(
  project: PracticeProject, id: string, side: "A" | "B", source: NumericOperand,
): PracticeProject {
  const found = findInstruction(project, id);
  if (!found || !isMathKind(found.instruction.kind)) {
    throw new Error("Selecciona MOV, ADD, SUB, MUL o DIV.");
  }
  if (found.instruction.kind === "MOV" && side === "B") {
    throw new Error("MOV utiliza una sola fuente.");
  }
  const reason = validateMathSource(project.tags, source);
  if (reason) throw new Error(reason);
  const field = side === "A" ? "compareA" : "compareB";
  return { ...project, rungs: project.rungs.map((rung) => ({
    ...rung,
    instructions: rung.instructions.map((item) =>
      item.id === id ? { ...item, [field]: source } : item),
  })) };
}

export function setMathDestination(
  project: PracticeProject, id: string, name: string,
): PracticeProject {
  const found = findInstruction(project, id);
  if (!found || !isMathKind(found.instruction.kind)) {
    throw new Error("Selecciona un bloque matemático.");
  }
  const reason = validateMathDestination(project.tags, name);
  if (reason) throw new Error(reason);
  return changeInstructionTag(project, id, name);
}

export { numericTagOptions, parseNumericOperand, readNumericOperand };

/** Simulated numeric instruction; leave destination unchanged if invalid. */
export function evaluateMath(kind: MathKind, a: number, b = 0): number | null {
  let result: number;
  switch (kind) {
    case "MOV": result = a; break;
    case "ADD": result = a + b; break;
    case "SUB": result = a - b; break;
    case "MUL": result = a * b; break;
    case "DIV":
      if (b === 0) return null;
      result = a / b;
      break;
  }
  return Number.isFinite(result) ? result : null;
}

/** Integer destinations truncate toward zero; reject overflow, don't wrap. */
export function convertMathResult(tag: PracticeTag, value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (tag.type === "REAL") return Math.fround(value);
  if (tag.type === "INT" || tag.type === "DINT") {
    const n = Math.trunc(value);
    const min = tag.type === "INT" ? -32768 : -2147483648;
    const max = tag.type === "INT" ? 32767 : 2147483647;
    return n >= min && n <= max ? n : null;
  }
  return null;
}
