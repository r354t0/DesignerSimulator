import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, insertIntoIndependentOrUpper, addParallelContact,
  setTagValue, type PracticeProject, type TagType, type EditableKind,
} from "./practiceDocument.ts";

/** Scene 03 — three-batch fill / mix / drain training cell. */
export const TANK_TAGS: readonly {
  name: string; type: TagType; direction: "Entrada" | "Salida" | "Interna"; description: string;
}[] = [
  { name: "PB_Start", type: "BOOL", direction: "Entrada", description: "Pulsador START" },
  { name: "PB_Stop", type: "BOOL", direction: "Entrada", description: "Pulsador STOP" },
  { name: "PB_Drain", type: "BOOL", direction: "Entrada", description: "Drenaje manual" },
  { name: "PB_Reset", type: "BOOL", direction: "Entrada", description: "RESET lote/alarma" },
  { name: "DI_LowLevel", type: "BOOL", direction: "Entrada", description: "LSL · 15 %" },
  { name: "DI_HighLevel", type: "BOOL", direction: "Entrada", description: "LSH · 90 %" },
  { name: "AI_LevelPct", type: "REAL", direction: "Entrada", description: "Nivel (%)" },
  { name: "DO_Pump", type: "BOOL", direction: "Salida", description: "Bomba P-01" },
  { name: "DO_InletValve", type: "BOOL", direction: "Salida", description: "Válvula XV-01" },
  { name: "DO_DrainValve", type: "BOOL", direction: "Salida", description: "Válvula XV-02" },
  { name: "DO_Mixer", type: "BOOL", direction: "Salida", description: "Agitador M-02" },
  { name: "ST_RunEnable", type: "BOOL", direction: "Interna", description: "Ciclo automático" },
  { name: "ST_Filling", type: "BOOL", direction: "Interna", description: "Etapa llenado" },
  { name: "ST_Mixing", type: "BOOL", direction: "Interna", description: "Etapa mezclado" },
  { name: "ST_Draining", type: "BOOL", direction: "Interna", description: "Etapa vaciado" },
  { name: "ST_ToMix", type: "BOOL", direction: "Interna", description: "Paso a mezclado" },
  { name: "ST_ToDrain", type: "BOOL", direction: "Interna", description: "Paso a vaciado" },
  { name: "ST_ToFill", type: "BOOL", direction: "Interna", description: "Paso a llenado" },
  { name: "ALM_ProcessTimeout", type: "BOOL", direction: "Interna", description: "Fallo de proceso" },
  { name: "TMR_StartDelay", type: "TIMER", direction: "Interna", description: "Retardo bomba" },
  { name: "TMR_Mixing", type: "TIMER", direction: "Interna", description: "Tiempo mezclado" },
  { name: "TMR_FillTimeout", type: "TIMER", direction: "Interna", description: "Máximo llenado" },
  { name: "TMR_DrainTimeout", type: "TIMER", direction: "Interna", description: "Máximo vaciado" },
  { name: "CNT_Lotes", type: "COUNTER", direction: "Interna", description: "Lotes terminados" },
];

export const TANK_BATCH_TARGET = 3;
export const TANK_TIMER_PRESETS = {
  TMR_StartDelay: 1500,
  TMR_Mixing: 4000,
  TMR_FillTimeout: 12000,
  TMR_DrainTimeout: 8000,
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
  const t = project.tags.find(item => item.name === "AI_LevelPct");
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
    DI_LowLevel: true,
    DI_HighLevel: false,
    AI_LevelPct: TANK_INITIAL_PERCENT,
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
 * Independent OR junctions handle seal-in, watchdogs, manual/automatic
 * draining and stage cancellation. The transition conditions are captured
 * by OTE bits BEFORE any OTU; each OTU precedes the next stage's OTL.
 * This keeps stage changes deterministic in a top-to-bottom PLC scan.
 */
export function createTankExampleProject(): PracticeProject {
  let p = initialTankProject();
  for (const [name, pre] of Object.entries(TANK_TIMER_PRESETS)) {
    p = setTagValue(p, name, pre, "PRE");
  }
  p = setTagValue(p, "CNT_Lotes", TANK_BATCH_TARGET, "PRE");
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
  or("rung-1", [x("PB_Start")], [x("ST_RunEnable")],
    [nx("PB_Stop"), nx("ALM_ProcessTimeout"), nx("CNT_Lotes.DN")],
    output("OTE", "ST_RunEnable"));
  // R1. Either start when the cycle has no active stages, OR accept the
  // completed drain-to-fill transition from the previous PLC scan.
  // The ST_ToFill branch bypasses ALL four series contacts.
  or("tank-begin",
    [x("ST_RunEnable"), nx("ST_Filling"),
      nx("ST_Mixing"), nx("ST_Draining")],
    [x("ST_ToFill")], [], output("OTL", "ST_Filling"));
  make("tank-preopen", [x("ST_Filling"), x("ST_RunEnable"),
    output("TON", "TMR_StartDelay")]);
  make("tank-fill-watchdog", [x("ST_Filling"), x("TMR_StartDelay.DN"),
    nx("DI_HighLevel"), output("TON", "TMR_FillTimeout")]);
  make("tank-drain-watchdog", [x("ST_Draining"), x("ST_RunEnable"),
    nx("DI_LowLevel"), output("TON", "TMR_DrainTimeout")]);
  // Alarm latches from either independent timeout.
  or("tank-watchdog-or", [x("TMR_FillTimeout.DN")], [x("TMR_DrainTimeout.DN")],
    [], output("OTL", "ALM_ProcessTimeout"));
  make("tank-reset-alarm", [x("PB_Reset"), nx("ST_RunEnable"),
    output("OTU", "ALM_ProcessTimeout")]);
  make("tank-reset-count", [x("PB_Reset"), nx("ST_RunEnable"),
    output("RES", "CNT_Lotes")]);
  // XV-01 opens before the pump; both deenergize on high level or alarm.
  make("tank-inlet", [x("ST_Filling"), x("ST_RunEnable"),
    nx("DI_HighLevel"), nx("ALM_ProcessTimeout"), nx("ST_Draining"),
    output("OTE", "DO_InletValve")]);
  make("tank-pump", [x("ST_Filling"), x("ST_RunEnable"),
    x("TMR_StartDelay.DN"), nx("DI_HighLevel"), nx("ALM_ProcessTimeout"),
    nx("ST_Draining"), output("OTE", "DO_Pump")]);
  // Capture the transition BEFORE clearing the source stage (same scan).
  // Fill → Mix: transition condition → OTU Fill → OTL Mix.
  make("tank-to-mix", [x("ST_Filling"), x("DI_HighLevel"),
    x("ST_RunEnable"), nx("ALM_ProcessTimeout"), output("OTE", "ST_ToMix")]);
  or("tank-fill-end", [x("ST_ToMix")], [nx("ST_RunEnable")],
    [], output("OTU", "ST_Filling"));
  make("tank-mix-begin", [x("ST_ToMix"),
    output("OTL", "ST_Mixing")]);
  make("tank-mix-timer", [x("ST_Mixing"), x("ST_RunEnable"),
    output("TON", "TMR_Mixing")]);
  make("tank-mixer", [x("ST_Mixing"), x("ST_RunEnable"),
    nx("TMR_Mixing.DN"), nx("ALM_ProcessTimeout"), output("OTE", "DO_Mixer")]);
  // Mix → Drain: transition condition → OTU Mix → OTL Drain.
  make("tank-to-drain", [x("ST_Mixing"), x("TMR_Mixing.DN"),
    x("ST_RunEnable"), nx("ALM_ProcessTimeout"), output("OTE", "ST_ToDrain")]);
  or("tank-mix-end", [x("ST_ToDrain")], [nx("ST_RunEnable")],
    [], output("OTU", "ST_Mixing"));
  make("tank-drain-begin", [x("ST_ToDrain"),
    output("OTL", "ST_Draining")]);
  // Manual drain is only possible with automation off; no simultaneous filling.
  or("tank-drain-valve", [x("ST_Draining"), x("ST_RunEnable")],
    [x("PB_Drain"), nx("ST_RunEnable")],
    [nx("DI_LowLevel"), nx("ALM_ProcessTimeout"), nx("DO_Pump"),
      nx("DO_InletValve")], output("OTE", "DO_DrainValve"));
  // Count the just-completed lot BEFORE deciding whether another is needed.
  make("tank-batch-counter", [x("ST_Draining"), x("DI_LowLevel"),
    x("ST_RunEnable"), output("CTU", "CNT_Lotes")]);
  // Drain → Fill: for lots 1 and 2. Capture ToFill here, then OTU Drain.
  // R1 reads ToFill and latches FillStage on the NEXT scan; at batch 3
  // Batches.DN prevents the transition and RunCmd drops out.
  make("tank-to-fill", [x("ST_Draining"), x("DI_LowLevel"),
    x("ST_RunEnable"), nx("CNT_Lotes.DN"), nx("ALM_ProcessTimeout"),
    output("OTE", "ST_ToFill")]);
  or("tank-drain-end", [x("DI_LowLevel")], [nx("ST_RunEnable")],
    [], output("OTU", "ST_Draining"));
  return p;
}

export function tankSensorInputs(levelPercent: number): {
  DI_LowLevel: boolean; DI_HighLevel: boolean; AI_LevelPct: number;
} {
  const level = Math.max(0, Math.min(100, levelPercent));
  return {
    DI_LowLevel: level <= TANK_LOW_PERCENT,
    DI_HighLevel: level >= TANK_HIGH_PERCENT,
    AI_LevelPct: Math.round(level * 100) / 100,
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
