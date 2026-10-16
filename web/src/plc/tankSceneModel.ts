import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  type PracticeProject, type TagType,
} from "./practiceDocument.ts";

/** Scene 03 — tank filling, high-level automatic stop, manual draining. */
export const TANK_TAGS: readonly {
  name: string; type: TagType; direction: "Entrada" | "Salida" | "Interna"; description: string;
}[] = [
  { name: "Tank_StartPB", type: "BOOL", direction: "Entrada", description: "Tanque: pulsador START de llenado" },
  { name: "Tank_StopPB", type: "BOOL", direction: "Entrada", description: "Tanque: pulsador STOP de llenado" },
  { name: "Tank_DrainPB", type: "BOOL", direction: "Entrada", description: "Tanque: pulsador momentáneo para vaciado" },
  { name: "Tank_LowLS", type: "BOOL", direction: "Entrada", description: "Tanque: detector de nivel bajo (15 %)" },
  { name: "Tank_HighLS", type: "BOOL", direction: "Entrada", description: "Tanque: detector de nivel alto (90 %)" },
  { name: "Tank_LevelPct", type: "REAL", direction: "Entrada", description: "Tanque: nivel continuo de líquido en porcentaje" },
  { name: "Tank_Pump", type: "BOOL", direction: "Salida", description: "Tanque: orden de marcha de bomba de llenado" },
  { name: "Tank_InletValve", type: "BOOL", direction: "Salida", description: "Tanque: apertura de válvula de entrada" },
  { name: "Tank_DrainValve", type: "BOOL", direction: "Salida", description: "Tanque: apertura de válvula de drenaje" },
  { name: "Tank_RunCmd", type: "BOOL", direction: "Interna", description: "Tanque: memoria de solicitud de llenado" },
];

export const TANK_LOW_PERCENT = 15;
export const TANK_HIGH_PERCENT = 90;
export const TANK_INITIAL_PERCENT = 10;
export const TANK_FILL_PERCENT_PER_SEC = 12;
export const TANK_DRAIN_PERCENT_PER_SEC = 18;

export interface TankState {
  levelPercent: number;
  filledLiters: number;
  drainedLiters: number;
  inletFlowing: boolean;
  outletFlowing: boolean;
}

export function initialTankState(): TankState {
  return {
    levelPercent: TANK_INITIAL_PERCENT,
    filledLiters: 0, drainedLiters: 0,
    inletFlowing: false, outletFlowing: false,
  };
}
export function readTankBool(project: PracticeProject, name: string): boolean {
  const t = project.tags.find(item => item.name === name);
  return t?.type === "BOOL" && t.value === true;
}
export function readTankLevel(project: PracticeProject): number | null {
  const t = project.tags.find(item => item.name === "Tank_LevelPct");
  return t?.type === "REAL" && typeof t.value === "number" ? t.value : null;
}
export function hasTankTags(project: PracticeProject): boolean {
  return TANK_TAGS.every(spec => project.tags.some(tag =>
    tag.name === spec.name && tag.type === spec.type));
}
export function prepareTankTags(project: PracticeProject): PracticeProject {
  for (const spec of TANK_TAGS) {
    const old = project.tags.find(tag => tag.name.toLowerCase() === spec.name.toLowerCase());
    if (old && (old.name !== spec.name || old.type !== spec.type)) {
      throw new Error("Tag incompatible con el tanque: " + spec.name +
        " (se requiere " + spec.type + "). Revisa Controller Tags.");
    }
  }
  let result = project;
  for (const spec of TANK_TAGS) {
    const old = result.tags.find(tag => tag.name === spec.name);
    if (!old) result = createTag(result, spec.name, spec.description, spec.type);
    else if (!old.description.trim()) {
      result = { ...result, tags: result.tags.map(tag => tag.name === spec.name
        ? { ...tag, description: spec.description } : tag) };
    }
  }
  // A newly created scene has an initially low level. When revisiting,
  // this does not overwrite existing scene values or authored Ladder.
  return result;
}
export function initialTankProject(): PracticeProject {
  const result = prepareTankTags({ ...initialPracticeProject(), tags: [] });
  const values: Record<string, number | boolean> = {
    Tank_LowLS: true,
    Tank_HighLS: false,
    Tank_LevelPct: TANK_INITIAL_PERCENT,
  };
  return {
    ...result,
    tags: TANK_TAGS.map(spec => {
      const t = result.tags.find(tag => tag.name === spec.name)!;
      return Object.hasOwn(values, spec.name) ? { ...t, value: values[spec.name] } : t;
    }),
  };
}

/** Example only: the user must explicitly confirm loading it. */
export function createTankExampleProject(): PracticeProject {
  let p = initialTankProject();
  const add = (rung: string, instructions: {
    id: string; kind: "XIC" | "XIO" | "OTE" | "OTL" | "OTU"; tag: string;
  }[]) => {
    for (let i = 0; i < instructions.length; i++) {
      p = insertInstruction(p, rung, i, instructions[i]);
    }
  };
  // On start, latch a fill request only while the tank is below high-level.
  add("rung-1", [
    { id: "tank-start", kind: "XIC", tag: "Tank_StartPB" },
    { id: "tank-not-high", kind: "XIO", tag: "Tank_HighLS" },
    { id: "tank-latch", kind: "OTL", tag: "Tank_RunCmd" },
  ]);
  p = createRung(p, "tank-rung-stop");
  add("tank-rung-stop", [
    { id: "tank-stop", kind: "XIC", tag: "Tank_StopPB" },
    { id: "tank-unlatch-stop", kind: "OTU", tag: "Tank_RunCmd" },
  ]);
  p = createRung(p, "tank-rung-high");
  add("tank-rung-high", [
    { id: "tank-high", kind: "XIC", tag: "Tank_HighLS" },
    { id: "tank-unlatch-high", kind: "OTU", tag: "Tank_RunCmd" },
  ]);
  p = createRung(p, "tank-rung-pump");
  add("tank-rung-pump", [
    { id: "tank-run-pump", kind: "XIC", tag: "Tank_RunCmd" },
    { id: "tank-pump", kind: "OTE", tag: "Tank_Pump" },
  ]);
  p = createRung(p, "tank-rung-inlet");
  add("tank-rung-inlet", [
    { id: "tank-run-inlet", kind: "XIC", tag: "Tank_RunCmd" },
    { id: "tank-inlet", kind: "OTE", tag: "Tank_InletValve" },
  ]);
  p = createRung(p, "tank-rung-drain");
  add("tank-rung-drain", [
    { id: "tank-drain-pb", kind: "XIC", tag: "Tank_DrainPB" },
    { id: "tank-drain-valve", kind: "OTE", tag: "Tank_DrainValve" },
  ]);
  return p;
}

export function tankSensorInputs(levelPercent: number): {
  Tank_LowLS: boolean; Tank_HighLS: boolean; Tank_LevelPct: number;
} {
  const level = Math.max(0, Math.min(100, levelPercent));
  return {
    Tank_LowLS: level <= TANK_LOW_PERCENT,
    Tank_HighLS: level >= TANK_HIGH_PERCENT,
    Tank_LevelPct: Math.round(level * 100) / 100,
  };
}

/** Physics depends only on the actual PLC outputs; no hidden control logic. */
export function stepTankState(
  state: TankState, pumpOn: boolean, inletOpen: boolean,
  drainOpen: boolean, elapsedMs: number,
): TankState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  const dt = Math.min(elapsedMs, 150) / 1000;
  const fillRequest = pumpOn && inletOpen;
  const drainRequest = drainOpen;
  if (!fillRequest && !drainRequest) {
    return state.inletFlowing || state.outletFlowing
      ? { ...state, inletFlowing: false, outletFlowing: false } : state;
  }
  const fillDelta = fillRequest ? Math.min(
    TANK_FILL_PERCENT_PER_SEC * dt, 100 - state.levelPercent) : 0;
  const drainDelta = drainRequest ? Math.min(
    TANK_DRAIN_PERCENT_PER_SEC * dt, state.levelPercent + fillDelta) : 0;
  const level = Math.max(0, Math.min(100, state.levelPercent + fillDelta - drainDelta));
  return {
    ...state,
    levelPercent: Math.round(level * 10000) / 10000,
    // 1000 L equivalent vessel. These counters measure delivered fluid,
    // not the current tank inventory.
    filledLiters: Math.round((state.filledLiters + fillDelta * 10) * 100) / 100,
    drainedLiters: Math.round((state.drainedLiters + drainDelta * 10) * 100) / 100,
    inletFlowing: fillDelta > 0,
    outletFlowing: drainDelta > 0,
  };
}
