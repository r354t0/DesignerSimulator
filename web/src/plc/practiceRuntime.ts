import { initialGearSequenceState, evaluateGearSequence, type GearCycleStateCode } from "./gearSpraySequence.ts";
import { OR_JUNCTION_KIND, isMathKind, isCompareKind, isCounterKind, isOutputKind, isTimerKind, isValidTimerPreset, type PracticeProject, type PracticeTag, type PracticeInstruction } from "./practiceDocument.ts";
import { compareValues, readComparisonOperand } from "./practiceCompare.ts";
import { convertMathResult, evaluateMath, readMathSource } from "./practiceMath.ts";

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
  const countInputs = new Map<string, { cu: boolean; cd: boolean }>();
  for (const rung of project.rungs) {
    for (const instruction of rung.instructions) {
      if (instruction.kind !== "CTU" && instruction.kind !== "CTD") continue;
      const status = countInputs.get(instruction.tag) ?? { cu: false, cd: false };
      if (instruction.kind === "CTU") status.cu = true;
      else status.cd = true;
      countInputs.set(instruction.tag, status);
    }
  }
  if (!project.tags.some((tag) =>
    (memory.has(tag.name) && tag.type === "BOOL" && tag.value !== true) ||
    (tag.type === "COUNTER" && typeof tag.value === "object" &&
      ((countInputs.get(tag.name)?.cu && tag.value.CU !== true) ||
        (countInputs.get(tag.name)?.cd && tag.value.CD !== true))))) return project;
  return { ...project, tags: project.tags.map((tag): PracticeTag =>
    memory.has(tag.name) && tag.type === "BOOL" ? { ...tag, value: true } :
    tag.type === "COUNTER" && typeof tag.value === "object" && countInputs.has(tag.name)
      ? { ...tag, value: { ...tag.value,
          CU: countInputs.get(tag.name)!.cu ? true : tag.value.CU,
          CD: countInputs.get(tag.name)!.cd ? true : tag.value.CD } }
      : tag) };
}

/** Kept as an API alias for existing Stage 2B clients; OR is now supported. */
export function getUnsupportedSeriesRungs(_project: PracticeProject): string[] {
  return [];
}

interface CounterState {
  PRE: number; ACC: number; CU: boolean; CD: boolean;
  DN: boolean; OV: boolean; UN: boolean;
}
const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;
const validDint = (n: number) => Number.isInteger(n) && n >= INT32_MIN && n <= INT32_MAX;

export function evaluateSeriesScan(project: PracticeProject, elapsedMs = 0): SeriesScan {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Tiempo de scan inválido.");
  const delta = Math.max(0, Math.round(elapsedMs));
  const timers = new Map<string, { PRE: number; ACC: number; EN: boolean; TT: boolean; DN: boolean }>();
  for (const tag of project.tags) {
    if (tag.type === "TIMER" && typeof tag.value === "object") {
      timers.set(tag.name, tag.value as { PRE: number; ACC: number; EN: boolean; TT: boolean; DN: boolean });
    }
  }
  const timerUpdates = new Map<string, { PRE: number; ACC: number; EN: boolean; TT: boolean; DN: boolean }>();
  const counters = new Map<string, CounterState>();
  for (const tag of project.tags) {
    if (tag.type === "COUNTER" && typeof tag.value === "object") {
      counters.set(tag.name, tag.value as unknown as CounterState);
    }
  }
  const counterUpdates = new Map<string, CounterState>();
  function counter(name: string): CounterState {
    const stored = counters.get(name);
    if (!stored) throw new Error("Tag COUNTER inexistente o incompatible: " + name);
    if (!validDint(stored.PRE) || !validDint(stored.ACC)) {
      throw new Error("COUNTER requiere PRE/ACC DINT válidos: " + name);
    }
    return stored;
  }
  function updateCounter(instruction: PracticeInstruction, enabled: boolean): CounterState {
    const previous = counter(instruction.tag);
    let pre = previous.PRE;
    if (instruction.kind !== "RES" && instruction.preset) {
      const source = instruction.preset;
      if (source.mode === "literal") pre = source.value;
      else if (source.mode === "tag") {
        const tag = project.tags.find((item) => item.name === source.tag);
        if (!tag || (tag.type !== "INT" && tag.type !== "DINT") ||
            typeof tag.value !== "number") {
          throw new Error("PRE del contador requiere una variable INT o DINT: " + source.tag);
        }
        pre = tag.value;
      }
    }
    if (!validDint(pre)) throw new Error("PRE del contador requiere un DINT válido.");
    let next = { ...previous, PRE: pre };
    // CCW CTU RESET terminal is sampled before the count edge, within rung 4.
    if(instruction.resetTag && tagValues.get(instruction.resetTag)===true){
      next={...next,ACC:0,CU:false,CD:false,DN:false,OV:false,UN:false};
      counters.set(instruction.tag,next);
      counterUpdates.set(instruction.tag,next);
      return next;
    }
    if (instruction.kind === "RES") {
      if (enabled) next = { ...next, ACC: 0, CU: false, CD: false,
        DN: false, OV: false, UN: false };
    } else if (instruction.kind === "CTU") {
      if (enabled && !previous.CU) {
        const overflow = previous.ACC === INT32_MAX;
        next.ACC = overflow ? INT32_MIN : previous.ACC + 1;
        next.OV = previous.OV || overflow;
      }
      next.CU = enabled;
      next.DN = next.ACC >= pre;
    } else if (instruction.kind === "CTD") {
      if (enabled && !previous.CD) {
        const underflow = previous.ACC === INT32_MIN;
        next.ACC = underflow ? INT32_MAX : previous.ACC - 1;
        next.UN = previous.UN || underflow;
      }
      next.CD = enabled;
      next.DN = next.ACC >= pre;
    }
    counters.set(instruction.tag, next);
    counterUpdates.set(instruction.tag, next);
    return next;
  }
  function timer(tagName: string) {
    const previous = timers.get(tagName);
    if (!previous) throw new Error("Tag TIMER inexistente o incompatible: " + tagName);
    if (![previous.PRE, previous.ACC].every(Number.isFinite) ||
      previous.PRE < 0 || previous.ACC < 0) throw new Error("TIMER requiere PRE/ACC válidos.");
    return previous;
  }
  function updateTimer(instruction: PracticeInstruction, enabled: boolean) {
    const name = instruction.tag;
    const kind = instruction.kind;
    const stored = timer(name);
    const source = instruction.preset;
    let pre = stored.PRE;
    if (kind !== "RES" && source?.mode === "literal") pre = source.value;
    if (kind !== "RES" && source?.mode === "tag") {
      const external = project.tags.find((item) => item.name === source.tag);
      if (!external || (external.type !== "INT" && external.type !== "DINT") ||
          typeof external.value !== "number") {
        throw new Error("PRE debe referenciar un INT o DINT válido: " + source.tag);
      }
      pre = external.value;
    }
    if (!isValidTimerPreset(pre)) {
      throw new Error("PRE requiere un entero no negativo válido (ms) para " + name);
    }
    const t = { ...stored, PRE: pre };
    const acc = Math.min(2147483647, Math.max(0, Math.round(t.ACC)));
    let value = { ...t };
    if (kind === "RES") {
      if (enabled) value = { ...t, ACC: 0, EN: false, TT: false, DN: false };
    } else if (kind === "TON") {
      value = !enabled ? { ...t, ACC: 0, EN: false, TT: false, DN: false }
        : { ...t, ACC: Math.min(pre, acc + delta), EN: true,
          TT: acc + delta < pre, DN: acc + delta >= pre };
    } else if (kind === "TOF") {
      value = enabled ? { ...t, ACC: 0, EN: true, TT: false, DN: true }
        : { ...t, ACC: Math.min(pre, acc + (t.DN ? delta : 0)), EN: false,
          TT: t.DN && acc + delta < pre, DN: t.DN && acc + delta < pre };
    } else {
      value = enabled ? { ...t, ACC: Math.min(pre, acc + delta), EN: true,
        TT: acc + delta < pre, DN: acc + delta >= pre }
        : { ...t, ACC: acc, EN: false, TT: false, DN: t.DN };
    }
    timers.set(name, value);
    timerUpdates.set(name, value);
    return value;
  }
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
  const numericWrites = new Map<string, number>();
  const currentNumericTags = (): PracticeTag[] => project.tags.map((tag) =>
    numericWrites.has(tag.name) ? { ...tag, value: numericWrites.get(tag.name)! } :
    timerUpdates.has(tag.name) ? { ...tag, value: timerUpdates.get(tag.name)! } :
    counterUpdates.has(tag.name) ? { ...tag, value: { ...counterUpdates.get(tag.name)! } } : tag);

  const evalContact = (instruction: PracticeInstruction, powerIn: boolean): boolean => {
    if (instruction.kind === OR_JUNCTION_KIND) {
      // Pure structural node: no BOOL operand and no dependence on adjacent tags.
      instructionFlow[instruction.id] = {
        powerIn, condition: true, powerOut: powerIn, value: true,
      };
      return powerIn;
    }
    if (isCompareKind(instruction.kind)) {
      // Compare against the current scan's numeric states (including updated
      // timer and counter values from earlier rungs).
      const currentTags = currentNumericTags();
      const a = readComparisonOperand(currentTags, instruction.kind, instruction.compareA);
      const b = readComparisonOperand(currentTags, instruction.kind, instruction.compareB);
      const condition = compareValues(instruction.kind, a, b);
      const powerOut = powerIn && condition;
      instructionFlow[instruction.id] = { powerIn, condition, powerOut, value: condition };
      return powerOut;
    }
    const [root, member] = instruction.tag.split(".");
    const value = member
      ? counters.has(root)
        ? counter(root)[member as "CU" | "CD" | "DN" | "OV" | "UN"]
        : timer(root)[member as "EN" | "TT" | "DN"]
      : tagValues.get(instruction.tag);
    if (typeof value !== "boolean") {
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
      // An independent OR with no upper contacts does not short-circuit its
      // lower branch via a permanent TRUE wire. Until the upper path receives
      // an instruction, only the lower path may energize the continuation.
      if (anchor.kind === OR_JUNCTION_KIND && end === mainIndex && branches.length) {
        mainPower = false;
        instructionFlow[anchor.id] = {
          powerIn: input, condition: false, powerOut: false, value: false,
        };
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
      if (instruction.kind==="GEAR_SEQ"){
        const read=(name:string)=>tagValues.get(name)===true;
        const stateTag=project.tags.find(tag=>tag.name==="SM_Cycle_State");
        const stored=typeof stateTag?.value==="number"?stateTag.value:0;
        const prior=([0,10,20,30,90] as number[]).includes(stored)?
          stored as GearCycleStateCode:initialGearSequenceState().state;
        const result=evaluateGearSequence({
          state:prior,
          blockLatched:read("SM_Cycle_BlockLatched"),
          recoveryHold:read("SM_Cycle_RearmHold"),
        },{
          run:power&&read("ST_Run_Rly"),
          healthy:read("DO_LS_Healthy"),
          manual:read("ST_Man_Mode"),
          freqDone:timer("TMR_Freq").DN,
          startupDone:timer("TMR_Startup_Cycle").DN,
          extraPulse:read("PB_Extra"),
          flowDone:counter("CTN_Lubeflo").DN,
          purgeActive:timer("TMR_Purge").DN,
          resetPulse:read("PB_Reset"),
          tripActive:read("ST_General_Trip_Rly"),
        });
        for(const [name,value] of [
          ["ST_Cycle_Rly",result.output.cycleRun],
          ["SM_Cycle_Blocked",result.output.blocked],
          ["SM_Cycle_RearmHold",result.output.rearmHold],
          ["SM_Cycle_BlockLatched",result.memory.blockLatched],
        ] as const){
          tagValues.set(name,value);
          writes[name]=value;
        }
        numericWrites.set("SM_Cycle_State",result.output.state);
        instructionFlow[instruction.id]={
          powerIn:power,condition:result.output.cycleRun,
          powerOut:result.output.cycleRun,value:result.output.cycleRun,
        };
        continue;
      }
      if (isMathKind(instruction.kind)) {
        let success = false;
        if (power) {
          const latest = currentNumericTags();
          const a = readMathSource(latest, instruction.compareA);
          const b = instruction.kind === "MOV" ? 0 : readMathSource(latest, instruction.compareB);
          const result = evaluateMath(instruction.kind, a, b);
          const destination = latest.find((tag) => tag.name === instruction.tag);
          if (!destination || destination.constant) {
            throw new Error(instruction.kind + ": Dest debe ser una variable numérica modificable.");
          }
          const converted = result === null ? null : convertMathResult(destination, result);
          if (converted !== null && Number.isFinite(converted)) {
            numericWrites.set(instruction.tag, converted);
            success = true;
          }
        }
        // Divide by zero, non-finite results and overflow preserve Dest.
        instructionFlow[instruction.id] = {
          powerIn: power, condition: success, powerOut: power && success, value: success,
        };
        continue;
      }
      if (isCounterKind(instruction.kind) ||
          (instruction.kind === "RES" && counters.has(instruction.tag))) {
        const output = updateCounter(instruction, power);
        if(instruction.doneTag){
          tagValues.set(instruction.doneTag,output.DN);
          writes[instruction.doneTag]=output.DN;
        }
        instructionFlow[instruction.id] = { powerIn: power, condition: power,
          powerOut: power, value: output.DN };
        continue;
      }
      if (isTimerKind(instruction.kind)) {
        const output = updateTimer(instruction, power);
        if(instruction.doneTag){
          tagValues.set(instruction.doneTag,output.DN);
          writes[instruction.doneTag]=output.DN;
        }
        instructionFlow[instruction.id] = { powerIn: power, condition: power,
          powerOut: power, value: output.DN };
        continue;
      }
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
    (numericWrites.has(tag.name) && tag.value !== numericWrites.get(tag.name)) ||
    (Object.hasOwn(writes, tag.name) && tag.value !== writes[tag.name]) ||
    (timerUpdates.has(tag.name) && Object.entries(timerUpdates.get(tag.name)!).some(
      ([member, value]) => (tag.value as Record<string, number | boolean>)[member] !== value)) ||
    (counterUpdates.has(tag.name) && Object.entries(counterUpdates.get(tag.name)!).some(
      ([member, value]) => (tag.value as Record<string, number | boolean>)[member] !== value)));
  const nextProject = changed
    ? {
        ...project,
        tags: project.tags.map((tag): PracticeTag =>
          numericWrites.has(tag.name) ? { ...tag, value: numericWrites.get(tag.name)! } :
          Object.hasOwn(writes, tag.name) ? { ...tag, value: writes[tag.name] } :
          timerUpdates.has(tag.name) ? { ...tag, value: timerUpdates.get(tag.name)! } :
          counterUpdates.has(tag.name)
            ? { ...tag, value: { ...counterUpdates.get(tag.name)! } } : tag),
      }
    : project;
  return { project: nextProject, instructionFlow, rungPower,
    branchInput, branchPower, joinedPower, writes };
}

/** Nonretentive timer structures reset on STOP; RTO and its ACC/DN persist. */
export function resetNonretentiveTimers(project: PracticeProject): PracticeProject {
  const names = new Set(project.rungs.flatMap((rung) =>
    rung.instructions.filter((item) => item.kind === "TON" || item.kind === "TOF")
      .map((item) => item.tag)));
  if (!project.tags.some((tag) => names.has(tag.name) && tag.type === "TIMER" &&
      typeof tag.value === "object" &&
      (tag.value.ACC !== 0 || tag.value.EN !== false ||
       tag.value.TT !== false || tag.value.DN !== false))) return project;
  return {
    ...project,
    tags: project.tags.map((tag): PracticeTag => names.has(tag.name) &&
      tag.type === "TIMER" && typeof tag.value === "object"
      ? { ...tag, value: { ...tag.value, ACC: 0, EN: false, TT: false, DN: false } }
      : tag),
  };
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
      rung.instructions.flatMap((item) =>
        item.kind==="OTE"||item.kind==="GEAR_SEQ"?
          [item.tag]:
          (item.kind==="TON"||item.kind==="TOF")&&item.doneTag?
            [item.doneTag]:[])),
  );
  const stopped = resetNonretentiveTimers(next);
  if (!stopped.tags.some((tag) =>
    tag.type === "BOOL" && !tag.constant && outputs.has(tag.name) && tag.value !== false)) return stopped;
  return {
    ...stopped,
    tags: stopped.tags.map((tag): PracticeTag =>
      tag.type === "BOOL" && !tag.constant && outputs.has(tag.name)
        ? { ...tag, value: false } : tag),
  };
}

/** Stop drives the simulated OTE-written outputs low, without touching inputs. */
export function stopSeriesScan(project: PracticeProject): PracticeProject {
  const targets = new Set(project.rungs.flatMap((rung) =>
    rung.instructions.flatMap((item)=>
      item.kind==="OTE"||item.kind==="GEAR_SEQ"?
        [item.tag]:
        (item.kind==="TON"||item.kind==="TOF")&&item.doneTag?
          [item.doneTag]:[])));
  const stopped = resetNonretentiveTimers(project);
  if (!stopped.tags.some((tag) => targets.has(tag.name) && tag.value !== false)) return stopped;
  return { ...stopped, tags: stopped.tags.map((tag): PracticeTag =>
    tag.type === "BOOL" && targets.has(tag.name) && !tag.constant
      ? { ...tag, value: false } : tag) };
}
