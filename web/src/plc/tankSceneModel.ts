import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, insertIntoIndependentOrUpper, addParallelContact,
  setTagValue, type PracticeProject, type TagType, type EditableKind,
} from "./practiceDocument.ts";

/** Scene 03 — three-batch fill / mix / drain training cell. */
export const TANK_TAGS: readonly {
  name: string; type: TagType; direction: "Entrada" | "Salida" | "Interna"; description: string;
}[] = [
  { name: "Tank_StartPB", type: "BOOL", direction: "Entrada", description: "Pulsador START" },
  { name: "Tank_StopPB", type: "BOOL", direction: "Entrada", description: "Pulsador STOP" },
  { name: "Tank_DrainPB", type: "BOOL", direction: "Entrada", description: "Drenaje manual" },
  { name: "Tank_ResetPB", type: "BOOL", direction: "Entrada", description: "RESET lote/alarma" },
  { name: "Tank_LowLS", type: "BOOL", direction: "Entrada", description: "LSL · 15 %" },
  { name: "Tank_HighLS", type: "BOOL", direction: "Entrada", description: "LSH · 90 %" },
  { name: "Tank_LevelPct", type: "REAL", direction: "Entrada", description: "Nivel (%)" },
  { name: "Tank_Pump", type: "BOOL", direction: "Salida", description: "Bomba P-01" },
  { name: "Tank_InletValve", type: "BOOL", direction: "Salida", description: "Válvula XV-01" },
  { name: "Tank_DrainValve", type: "BOOL", direction: "Salida", description: "Válvula XV-02" },
  { name: "Tank_Mixer", type: "BOOL", direction: "Salida", description: "Agitador M-02" },
  { name: "Tank_RunCmd", type: "BOOL", direction: "Interna", description: "Ciclo automático" },
  { name: "Tank_FillStage", type: "BOOL", direction: "Interna", description: "Etapa llenado" },
  { name: "Tank_MixStage", type: "BOOL", direction: "Interna", description: "Etapa mezclado" },
  { name: "Tank_DrainStage", type: "BOOL", direction: "Interna", description: "Etapa vaciado" },
  { name: "Tank_Alarm", type: "BOOL", direction: "Interna", description: "Fallo de proceso" },
  { name: "Tank_TStart", type: "TIMER", direction: "Interna", description: "Retardo bomba" },
  { name: "Tank_TMix", type: "TIMER", direction: "Interna", description: "Tiempo mezclado" },
  { name: "Tank_TFillMax", type: "TIMER", direction: "Interna", description: "Máximo llenado" },
  { name: "Tank_TDrainMax", type: "TIMER", direction: "Interna", description: "Máximo vaciado" },
  { name: "Tank_Batches", type: "COUNTER", direction: "Interna", description: "Lotes terminados" },
];

export const TANK_BATCH_TARGET = 3;
export const TANK_TIMER_PRESETS = {
  Tank_TStart: 1500,
  Tank_TMix: 4000,
  Tank_TFillMax: 12000,
  Tank_TDrainMax: 8000,
} as const;

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

/**
 * Optional reference program. ALL physical actuators come from Ladder OTEs;
 * no hidden stage transitions execute in the browser process model.
 * Three actual independent OR junctions: cycle seal-in, watchdog alarm,
 * and automatic/manual draining (plus stage termination ORs).
 */
export function createTankExampleProject(): PracticeProject {
  let p = initialTankProject();
  for (const [name, pre] of Object.entries(TANK_TIMER_PRESETS)) {
    p = setTagValue(p, name, pre, "PRE");
  }
  p = setTagValue(p, "Tank_Batches", TANK_BATCH_TARGET, "PRE");
  type Spec = { kind: EditableKind; tag: string };
  const contact = (kind: "XIC" | "XIO", tag: string): Spec => ({ kind, tag });
  const x = (tag: string) => contact("XIC", tag);
  const nx = (tag: string) => contact("XIO", tag);
  const output = (kind: "OTE" | "OTL" | "OTU" | "TON" | "CTU" | "RES", tag: string): Spec =>
    ({ kind, tag });
  let seq = 0;
  const make = (id: string, specs: Spec[]) => {
    if (id !== "rung-1") p = createRung(p, id);
    specs.forEach((spec, index) => {
      p = insertInstruction(p, id, index, { id: "tank-i-" + (++seq), ...spec });
    });
  };
  const or = (id: string, top: Spec[], bottom: Spec[], suffix: Spec[], out: Spec) => {
    make(id, [out]);
    p = createIndependentParallelBranch(p, id);
    const anchor = p.rungs.find(r => r.id === id)!.instructions
      .find(i => i.kind === "OR_JUNCTION")!.id;
    for (const spec of top) {
      p = insertIntoIndependentOrUpper(p, id, anchor, {
        id: "tank-i-" + (++seq), ...spec,
      });
    }
    for (const spec of bottom) {
      p = addParallelContact(p, id, anchor, {
        id: "tank-i-" + (++seq), ...spec,
      });
    }
    for (const spec of suffix) {
      const lastContact = p.rungs.find(r => r.id === id)!.instructions
        .filter(i => i.kind !== "OTE" && i.kind !== "OTL" &&
          i.kind !== "OTU" && i.kind !== "TON" && i.kind !== "CTU" &&
          i.kind !== "RES").length;
      p = insertInstruction(p, id, lastContact, {
        id: "tank-i-" + (++seq), ...spec,
      });
    }
  };

  // R0. START or self-hold; STOP, watchdog alarm and batch DN break the latch.
  or("rung-1", [x("Tank_StartPB")], [x("Tank_RunCmd")],
    [nx("Tank_StopPB"), nx("Tank_Alarm"), nx("Tank_Batches.DN")],
    output("OTE", "Tank_RunCmd"));
  // R1. No active stage -> start another fill when the cycle is enabled.
  make("tank-begin", [x("Tank_RunCmd"), nx("Tank_FillStage"),
    nx("Tank_MixStage"), nx("Tank_DrainStage"),
    output("OTL", "Tank_FillStage")]);
  make("tank-preopen", [x("Tank_FillStage"), x("Tank_RunCmd"),
    output("TON", "Tank_TStart")]);
  make("tank-fill-watchdog", [x("Tank_FillStage"), x("Tank_TStart.DN"),
    nx("Tank_HighLS"), output("TON", "Tank_TFillMax")]);
  make("tank-drain-watchdog", [x("Tank_DrainStage"), x("Tank_RunCmd"),
    nx("Tank_LowLS"), output("TON", "Tank_TDrainMax")]);
  // Alarm latches from either independent timeout.
  or("tank-watchdog-or", [x("Tank_TFillMax.DN")], [x("Tank_TDrainMax.DN")],
    [], output("OTL", "Tank_Alarm"));
  make("tank-reset-alarm", [x("Tank_ResetPB"), nx("Tank_RunCmd"),
    output("OTU", "Tank_Alarm")]);
  make("tank-reset-count", [x("Tank_ResetPB"), nx("Tank_RunCmd"),
    output("RES", "Tank_Batches")]);
  // XV-01 opens before the pump; both deenergize on high level or alarm.
  make("tank-inlet", [x("Tank_FillStage"), x("Tank_RunCmd"),
    nx("Tank_HighLS"), nx("Tank_Alarm"), nx("Tank_DrainStage"),
    output("OTE", "Tank_InletValve")]);
  make("tank-pump", [x("Tank_FillStage"), x("Tank_RunCmd"),
    x("Tank_TStart.DN"), nx("Tank_HighLS"), nx("Tank_Alarm"),
    nx("Tank_DrainStage"), output("OTE", "Tank_Pump")]);
  // High level completes fill; enter mix phase.
  make("tank-mix-begin", [x("Tank_FillStage"), x("Tank_HighLS"),
    x("Tank_RunCmd"), nx("Tank_Alarm"), output("OTL", "Tank_MixStage")]);
  or("tank-fill-end", [x("Tank_HighLS")], [nx("Tank_RunCmd")],
    [], output("OTU", "Tank_FillStage"));
  make("tank-mix-timer", [x("Tank_MixStage"), x("Tank_RunCmd"),
    output("TON", "Tank_TMix")]);
  make("tank-mixer", [x("Tank_MixStage"), x("Tank_RunCmd"),
    nx("Tank_TMix.DN"), nx("Tank_Alarm"), output("OTE", "Tank_Mixer")]);
  make("tank-drain-begin", [x("Tank_MixStage"), x("Tank_TMix.DN"),
    x("Tank_RunCmd"), nx("Tank_Alarm"),
    output("OTL", "Tank_DrainStage")]);
  or("tank-mix-end", [x("Tank_TMix.DN")], [nx("Tank_RunCmd")],
    [], output("OTU", "Tank_MixStage"));
  // Manual drain is only possible with automation off; no simultaneous filling.
  or("tank-drain-valve", [x("Tank_DrainStage"), x("Tank_RunCmd")],
    [x("Tank_DrainPB"), nx("Tank_RunCmd")],
    [nx("Tank_LowLS"), nx("Tank_Alarm"), nx("Tank_Pump"),
      nx("Tank_InletValve")], output("OTE", "Tank_DrainValve"));
  // Counter increments just once on the low-level edge, before stage unlatch.
  make("tank-batch-counter", [x("Tank_DrainStage"), x("Tank_LowLS"),
    x("Tank_RunCmd"), output("CTU", "Tank_Batches")]);
  or("tank-drain-end", [x("Tank_LowLS")], [nx("Tank_RunCmd")],
    [], output("OTU", "Tank_DrainStage"));
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
