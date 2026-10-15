import type { PracticeProject, PracticeTag } from "./practiceDocument.ts";

/** One deterministic, non-timed, event-driven Ladder evaluation (Stage 2B).
 * PLC-like scan order is top to bottom, left to right. Each OTE writes its BOOL
 * immediately, making the new value available to subsequent rungs.
 * Multi-path OR evaluation and scan-cycle scheduling are separate stages.
 */
export interface SeriesInstructionFlow {
  powerIn: boolean;
  condition: boolean;
  powerOut: boolean;
  value: boolean;
}
export interface SeriesScan {
  project: PracticeProject;
  instructionFlow: Record<string, SeriesInstructionFlow>;
  rungPower: Record<string, boolean>;
  writes: Record<string, boolean>;
}

export function getUnsupportedSeriesRungs(project: PracticeProject): string[] {
  return project.rungs
    .filter((rung) => (rung.parallelBranches?.length ?? 0) > 0)
    .map((rung) => rung.id);
}

export function evaluateSeriesScan(project: PracticeProject): SeriesScan {
  if (getUnsupportedSeriesRungs(project).length) {
    throw new Error("La ejecución de ramas OR corresponde a la Etapa C.");
  }

  const tagValues = new Map<string, boolean>();
  for (const tag of project.tags) {
    if (tag.type === "BOOL" && typeof tag.value === "boolean") {
      tagValues.set(tag.name, tag.value);
    }
  }
  const instructionFlow: Record<string, SeriesInstructionFlow> = {};
  const rungPower: Record<string, boolean> = {};
  const writes: Record<string, boolean> = {};

  for (const rung of project.rungs) {
    let power = true;
    for (const instruction of rung.instructions) {
      const value = tagValues.get(instruction.tag);
      if (value === undefined) {
        throw new Error("Tag BOOL inexistente o incompatible: " + instruction.tag);
      }
      if (instruction.kind === "XIC" || instruction.kind === "XIO") {
        const condition = instruction.kind === "XIC" ? value : !value;
        const powerIn = power;
        power = power && condition;
        instructionFlow[instruction.id] = {
          powerIn, condition, powerOut: power, value,
        };
      } else if (instruction.kind === "OTE") {
        if (project.tags.find((tag) => tag.name === instruction.tag)?.constant) {
          throw new Error("OTE intenta escribir un tag constante: " + instruction.tag);
        }
        tagValues.set(instruction.tag, power);
        writes[instruction.tag] = power;
        instructionFlow[instruction.id] = {
          powerIn: power, condition: power, powerOut: power, value: power,
        };
      } else {
        throw new Error("Instrucción todavía no ejecutable: " + instruction.kind);
      }
    }
    rungPower[rung.id] = power;
  }

  const changed = project.tags.some((tag) =>
    Object.hasOwn(writes, tag.name) && tag.value !== writes[tag.name]);
  const nextProject = changed
    ? {
        ...project,
        tags: project.tags.map((tag): PracticeTag =>
          Object.hasOwn(writes, tag.name) ? { ...tag, value: writes[tag.name] } : tag),
      }
    : project;
  return { project: nextProject, instructionFlow, rungPower, writes };
}

/** Stop drives the simulated OTE-written outputs low, without touching inputs. */
export function stopSeriesScan(project: PracticeProject): PracticeProject {
  const targets = new Set(project.rungs.flatMap((rung) =>
    rung.instructions.filter((instruction) => instruction.kind === "OTE").map((item) => item.tag)));
  if (!project.tags.some((tag) => targets.has(tag.name) && tag.value !== false)) return project;
  return { ...project, tags: project.tags.map((tag): PracticeTag =>
    tag.type === "BOOL" && targets.has(tag.name) && !tag.constant
      ? { ...tag, value: false } : tag) };
}
