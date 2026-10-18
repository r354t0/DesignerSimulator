import type { PracticeInstruction, PracticeProject } from "./practiceDocument.ts";

export interface TagReference {
  rungId: string;
  rungIndex: number;
  instructionId: string;
  instructionKind: PracticeInstruction["kind"];
  lane: "main" | "parallel";
  branchId?: string;
  operand: string;
  usage: "Principal" | "PRE" | "Comparación A" | "Comparación B";
}

/** Reference identity: a root structured tag sees all members, a member sees
 * only the exact field; ordinary BOOL and numeric tags use exact matching. */
export function matchesTagReference(requested: string, used: string): boolean {
  return Boolean(requested) &&
    (requested === used || (!requested.includes(".") && used.startsWith(requested + ".")));
}

export function findTagReferences(project: PracticeProject, requested: string): TagReference[] {
  const found: TagReference[] = [];
  project.rungs.forEach((rung, rungIndex) => {
    const read = (instruction: PracticeInstruction,
      lane: "main" | "parallel", branchId?: string) => {
      const add = (operand: string, usage: TagReference["usage"]) => {
        if (!matchesTagReference(requested, operand)) return;
        found.push({
          rungId: rung.id, rungIndex, instructionId: instruction.id,
          instructionKind: instruction.kind, lane, branchId, operand, usage,
        });
      };
      add(instruction.tag, "Principal");
      if (instruction.preset?.mode === "tag") add(instruction.preset.tag, "PRE");
      if (instruction.compareA?.mode === "tag") add(instruction.compareA.tag, "Comparación A");
      if (instruction.compareB?.mode === "tag") add(instruction.compareB.tag, "Comparación B");
    };
    rung.instructions.forEach(item => read(item, "main"));
    (rung.parallelBranches ?? []).forEach(branch =>
      branch.instructions.forEach(item => read(item, "parallel", branch.id)));
  });
  return found;
}
