import { isOutputKind, type PracticeProject, type PracticeTag, type PracticeInstruction } from "./practiceDocument.ts";

/**
 * Event-driven Ladder evaluation (Phase 2C): top-to-bottom rung order, left-to-
 * right main contacts, plus independent parallel OR branches grouped by their
 * shared anchor. This is one scan *pass*, not a timer-driven PLC scan.
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
  /** Power entering a parallel group, before its main contact and OR lanes. */
  branchInput: Record<string, boolean>;
  /** Power leaving each independent series OR lane, before the reunion. */
  branchPower: Record<string, boolean>;
  /** Power after OR reunion, keyed by main-line anchor contact ID. */
  joinedPower: Record<string, boolean>;
  writes: Record<string, boolean>;
}

/**
 * Logix-like ONS prescan: arm each storage BOOL to TRUE so an input already
 * energized at the instant of RUN does not generate a spurious startup pulse.
 * OTL/OTU outputs remain retentive across STOP/RUN.
 */
export function prescanBitInstructions(project: PracticeProject): PracticeProject {
  const memory = new Set(project.rungs.flatMap((rung) => [
    ...rung.instructions, ...(rung.parallelBranches ?? []).flatMap((b) => b.instructions),
  ]).filter((item) => item.kind === "ONS").map((item) => item.tag));
  if (!project.tags.some((tag) => memory.has(tag.name) && tag.type === "BOOL" &&
      tag.value !== true)) return project;
  return { ...project, tags: project.tags.map((tag): PracticeTag =>
    memory.has(tag.name) && tag.type === "BOOL" ? { ...tag, value: true } : tag) };
}

/** Kept as an API alias for existing Stage 2B clients; OR is now supported. */
export function getUnsupportedSeriesRungs(_project: PracticeProject): string[] {
  return [];
}

export function evaluateSeriesScan(project: PracticeProject): SeriesScan {
  const tagValues = new Map<string, boolean>();
  const constantTags = new Set<string>();
  for (const tag of project.tags) {
    if (tag.type === "BOOL" && typeof tag.value === "boolean") {
      tagValues.set(tag.name, tag.value);
      if (tag.constant) constantTags.add(tag.name);
    }
  }

  const instructionFlow: Record<string, SeriesInstructionFlow> = {};
  const rungPower: Record<string, boolean> = {};
  const branchInput: Record<string, boolean> = {};
  const branchPower: Record<string, boolean> = {};
  const joinedPower: Record<string, boolean> = {};
  const writes: Record<string, boolean> = {};

  const evalContact = (instruction: PracticeInstruction, powerIn: boolean): boolean => {
    const value = tagValues.get(instruction.tag);
    if (value === undefined) {
      throw new Error("Tag BOOL inexistente o incompatible: " + instruction.tag);
    }
    let condition: boolean;
    if (instruction.kind === "XIC") condition = value;
    else if (instruction.kind === "XIO") condition = !value;
    else if (instruction.kind === "ONS") {
      // Storage BOOL records the input power before this one-shot.
      // TRUE for consecutive energized scans, FALSE once the upstream path
      // goes false. The one-shot passes exactly one scan on a rising edge.
      condition = powerIn && !value;
      if (constantTags.has(instruction.tag)) {
        throw new Error("ONS no admite tag de memoria constante: " + instruction.tag);
      }
      tagValues.set(instruction.tag, powerIn);
      writes[instruction.tag] = powerIn;
    } else {
      throw new Error("Instrucción todavía no ejecutable: " + instruction.kind);
    }
    const powerOut = powerIn && condition;
    instructionFlow[instruction.id] = { powerIn, condition, powerOut, value };
    return powerOut;
  };

  for (const rung of project.rungs) {
    let power = true;
    const branchesByAnchor = new Map<string, NonNullable<typeof rung.parallelBranches>>();
    for (const branch of rung.parallelBranches ?? []) {
      const anchor = rung.instructions.find((item) => item.id === branch.anchorId);
      if (!anchor || isOutputKind(anchor.kind)) {
        throw new Error("La rama OR no tiene contacto principal válido: " + branch.id);
      }
      if (branch.instructions.length === 0) {
        throw new Error("La rama OR está vacía: " + branch.id);
      }
      const group = branchesByAnchor.get(branch.anchorId) ?? [];
      group.push(branch);
      branchesByAnchor.set(branch.anchorId, group);
    }

    const main = rung.instructions.filter((item) => !isOutputKind(item.kind));
    let mainIndex = 0;
    while (mainIndex < main.length) {
      const anchor = main[mainIndex];
      const branches = branchesByAnchor.get(anchor.id) ?? [];
      const ends = branches.map((branch) =>
        branch.endId ? main.findIndex((item) => item.id === branch.endId) : mainIndex);
      if (ends.some((index) => index < mainIndex) || new Set(ends).size > 1) {
        throw new Error("Las ramas OR deben compartir una unión válida en la línea principal.");
      }
      const end = ends.length ? ends[0] : mainIndex;
      const input: boolean = power;
      let mainPower: boolean = input;
      for (let index = mainIndex; index <= end; index++) {
        if (index > mainIndex && branchesByAnchor.has(main[index].id)) {
          throw new Error("No se admiten grupos OR superpuestos en esta versión.");
        }
        mainPower = evalContact(main[index], mainPower);
      }
      let mergedPower: boolean = mainPower;
      for (const branch of branches) {
        branchInput[branch.id] = input;
        let lanePower = input;
        for (const contact of branch.instructions) {
          lanePower = evalContact(contact, lanePower);
        }
        branchPower[branch.id] = lanePower;
        mergedPower ||= lanePower;
      }
      joinedPower[anchor.id] = mergedPower;
      power = mergedPower;
      mainIndex = end + 1;
    }

    for (const instruction of rung.instructions.filter((item) => isOutputKind(item.kind))) {
      if (!tagValues.has(instruction.tag)) {
        throw new Error("Tag BOOL inexistente o incompatible: " + instruction.tag);
      }
      if (constantTags.has(instruction.tag)) {
        throw new Error(instruction.kind + " no admite tag constante: " + instruction.tag);
      }
      // OTE is non-retentive; OTL/OTU write only when their rung has power.
      if (instruction.kind === "OTE" || power) {
        const nextValue = instruction.kind === "OTU" ? false : power;
        tagValues.set(instruction.tag, nextValue);
        writes[instruction.tag] = nextValue;
      }
      const value = tagValues.get(instruction.tag)!;
      instructionFlow[instruction.id] = {
        powerIn: power, condition: power, powerOut: power, value,
      };
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
  return { project: nextProject, instructionFlow, rungPower,
    branchInput, branchPower, joinedPower, writes };
}

/** On structural edits, de-energize outputs from both the old and new programs.
 * This also handles removing or reassigning an OTE while it was energized.
 */
export function stopAfterSeriesLogicEdit(
  previous: PracticeProject,
  next: PracticeProject,
): PracticeProject {
  const outputs = new Set(
    [...previous.rungs, ...next.rungs].flatMap((rung) =>
      rung.instructions.filter((item) => item.kind === "OTE").map((item) => item.tag)),
  );
  if (!next.tags.some((tag) =>
    tag.type === "BOOL" && !tag.constant && outputs.has(tag.name) && tag.value !== false)) return next;
  return {
    ...next,
    tags: next.tags.map((tag): PracticeTag =>
      tag.type === "BOOL" && !tag.constant && outputs.has(tag.name)
        ? { ...tag, value: false } : tag),
  };
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
