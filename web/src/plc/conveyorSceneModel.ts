import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, addParallelContact, insertIntoIndependentOrUpper,
  setTagValue, type PracticeProject, type TagType,
} from "./practiceDocument.ts";

/** Phase 5 / Scene 01 — a simulated conveyor, never a physical controller. */
export const CONVEYOR_SENSOR_TAG = "CV_BoxSensor";
export const CONVEYOR_COUNT_TAG = "CV_Count";
export const CONVEYOR_MOTOR_TAG = "Motor_Run";
export const CONVEYOR_START_TAG = "Start_PB";
export const CONVEYOR_STOP_TAG = "Stop_PB";

/** Single source of truth for the PLC tags wired to the conveyor scene. */
export interface ConveyorTagDefinition {
  name: string;
  type: TagType;
  direction: "Entrada" | "Salida" | "Interna";
  description: string;
  initialDescription?: string;
  /** Generated descriptions from older simulator versions; safe to refresh. */
  legacyDescriptions?: readonly string[];
}

export const CONVEYOR_TAGS: readonly ConveyorTagDefinition[] = [
  {
    name: CONVEYOR_START_TAG, type: "BOOL", direction: "Entrada",
    description: "Faja: pulsador START de marcha",
    initialDescription: "Pulsador de arranque",
    legacyDescriptions: ["Faja: pulsador START de marcha (entrada digital simulada)"],
  },
  {
    name: CONVEYOR_STOP_TAG, type: "BOOL", direction: "Entrada",
    description: "Faja: pulsador STOP de parada",
    initialDescription: "Pulsador de parada",
    legacyDescriptions: ["Faja: pulsador STOP de parada (entrada digital simulada)"],
  },
  {
    name: CONVEYOR_SENSOR_TAG, type: "BOOL", direction: "Entrada",
    description: "Faja: sensor fotoeléctrico de presencia de caja (PE-01)",
  },
  {
    name: CONVEYOR_MOTOR_TAG, type: "BOOL", direction: "Salida",
    description: "Faja: orden de marcha del motor transportador",
    initialDescription: "Motor habilitado",
    legacyDescriptions: ["Faja: orden de marcha del motor transportador (salida digital)"],
  },
  {
    name: CONVEYOR_COUNT_TAG, type: "COUNTER", direction: "Interna",
    description: "Faja: contador CTU de cajas detectadas por PE-01",
    initialDescription: "Piezas que cruzaron el sensor",
  },
];
/** Extra tags installed only when the advanced Ladder solution is loaded. */
export const CONVEYOR_TEMPLATE_TAGS: readonly ConveyorTagDefinition[] = [
  { name: "CV_ResetPB", type: "BOOL", direction: "Entrada",
    description: "Faja: pulsador momentáneo RESET LOTE" },
  { name: "CV_StopRequest", type: "BOOL", direction: "Interna",
    description: "Faja: solicitud de parada por STOP o lote completo" },
];
export const CONVEYOR_SENSOR_POSITION = 0.67;
const BELT_SPEED_UNITS_PER_SECOND = 0.20;
/** Same box size and belt span used by the lateral SVG (44px over 505px). */
export const CONVEYOR_BOX_WIDTH_PX = 44;
export const CONVEYOR_BELT_LENGTH_PX = 505;
const BOX_HALF_WIDTH_UNITS = CONVEYOR_BOX_WIDTH_PX / (2 * CONVEYOR_BELT_LENGTH_PX);
/**
 * Restore close-up box placement (about 6px between 44px boxes).
 * The photoeye samples the scene every 50ms, while the belt moves 0.01
 * normalized units per step: a >0.01 gap provides at least one LOW sample.
 */
export const MIN_BOX_GAP_UNITS = 0.012;
const MIN_BOX_CENTER_SPACING = 2 * BOX_HALF_WIDTH_UNITS + MIN_BOX_GAP_UNITS;
const ENTRY_POSITION = 0.045;
const EXIT_POSITION = 1.02;
const MAX_ITEMS = 8;

export interface ConveyorItem {
  id: number;
  position: number;
}
export interface ConveyorState {
  items: ConveyorItem[];
  nextId: number;
  passed: number;
  sensorActive: boolean;
}

export function initialConveyorState(): ConveyorState {
  return { items: [], nextId: 1, passed: 0, sensorActive: false };
}

export function readConveyorBool(project: PracticeProject, name: string): boolean {
  const tag = project.tags.find((item) => item.name === name);
  return tag?.type === "BOOL" && tag.value === true;
}

export function readConveyorCount(project: PracticeProject): number | null {
  const tag = project.tags.find((item) => item.name === CONVEYOR_COUNT_TAG);
  return tag?.type === "COUNTER" && typeof tag.value === "object" &&
    typeof tag.value.ACC === "number" ? tag.value.ACC : null;
}

export function hasConveyorTags(project: PracticeProject): boolean {
  return CONVEYOR_TAGS.every((spec) => project.tags.some((tag) =>
    tag.name === spec.name && tag.type === spec.type));
}

/**
 * Idempotent scene registration, safe on first visit and when revisiting.
 * No rungs, existing tag values, custom descriptions, or user-owned tags are
 * overwritten. Validate the full catalog before creating any declaration.
 */
export function prepareConveyorTags(project: PracticeProject): PracticeProject {
  for (const spec of CONVEYOR_TAGS) {
    const existing = project.tags.find((tag) =>
      tag.name.toLowerCase() === spec.name.toLowerCase());
    if (existing && existing.name !== spec.name) {
      throw new Error("La escena requiere el nombre exacto «" + spec.name +
        "». Ya existe «" + existing.name + "». Renómbralo desde Controller Tags.");
    }
    if (existing && existing.type !== spec.type) {
      throw new Error("El tag «" + spec.name + "» debe ser " + spec.type +
        " para la faja; actualmente es " + existing.type +
        ". Corrígelo desde Controller Tags.");
    }
  }

  let result = project;
  for (const spec of CONVEYOR_TAGS) {
    const existing = result.tags.find((tag) => tag.name === spec.name);
    if (!existing) {
      result = createTag(result, spec.name, spec.description, spec.type);
    } else if (!existing.description.trim() ||
      existing.description === spec.initialDescription ||
      spec.legacyDescriptions?.includes(existing.description)) {
      result = {
        ...result,
        tags: result.tags.map((tag) => tag.name === spec.name
          ? { ...tag, description: spec.description } : tag),
      };
    }
  }
  return result;
}

/**
 * Scene-based startup: MainRoutine starts with only the five wired conveyor
 * declarations. Generic legacy demo tags remain available exclusively from
 * the separate Motor · DEMO scene.
 */
export function initialConveyorProject(): PracticeProject {
  const base = initialPracticeProject();
  const allowed = new Set(CONVEYOR_TAGS.map((tag) => tag.name));
  const prepared = prepareConveyorTags({
    ...base, tags: base.tags.filter((tag) => allowed.has(tag.name)),
  });
  // Display in scene wiring order: simulated inputs, actuator, then counter.
  return { ...prepared, tags: CONVEYOR_TAGS.map((spec) =>
    prepared.tags.find((tag) => tag.name === spec.name)!) };
}

/**
 * Advanced optional 4-rung Ladder: two real independent OR networks,
 * seal-in by OTE, automatic batch stop, CTU and manual RES.
 *
 * R0: photoeye -> CTU CV_Count (PRE=5)
 * R1: (Stop_PB OR (CV_Count.DN AND NOT CV_BoxSensor)) -> CV_StopRequest
 * R2: NOT CV_StopRequest AND (Start_PB OR Motor_Run) -> OTE Motor_Run
 * R3: NOT CV_BoxSensor AND CV_ResetPB -> RES CV_Count
 *
 * The motor stops when the fifth box CLEARS the photoeye (not while
 * trapped on it), preventing a stale high photoeye on RESET.
 * Existing five basic tags remain unchanged
 * until the user explicitly loads the advanced template.
 */
export function createConveyorExampleProject(): PracticeProject {
  let project = initialConveyorProject();
  for (const spec of CONVEYOR_TEMPLATE_TAGS) {
    project = createTag(project, spec.name, spec.description, spec.type);
  }
  project = setTagValue(project, CONVEYOR_COUNT_TAG, 5, "PRE");

  // Counter evaluates first so DN propagates to the stop request immediately.
  project = insertInstruction(project, "rung-1", 0,
    { id: "cv-sensor", kind: "XIC", tag: CONVEYOR_SENSOR_TAG });
  project = insertInstruction(project, "rung-1", 1,
    { id: "cv-counter", kind: "CTU", tag: CONVEYOR_COUNT_TAG });

  // First OR: automatic batch completion OR physical STOP.
  project = createRung(project, "cv-rung-stop-request");
  project = insertInstruction(project, "cv-rung-stop-request", 0,
    { id: "cv-stop-request-coil", kind: "OTE", tag: "CV_StopRequest" });
  project = createIndependentParallelBranch(project, "cv-rung-stop-request");
  const stopOr = project.rungs.find(r => r.id === "cv-rung-stop-request")!
    .instructions.find(item => item.kind === "OR_JUNCTION")!.id;
  project = insertIntoIndependentOrUpper(project, "cv-rung-stop-request", stopOr,
    { id: "cv-stop", kind: "XIC", tag: CONVEYOR_STOP_TAG });
  project = addParallelContact(project, "cv-rung-stop-request", stopOr,
    { id: "cv-full", kind: "XIC", tag: "CV_Count.DN" });
  project = addParallelContact(project, "cv-rung-stop-request", stopOr,
    { id: "cv-no-box", kind: "XIO", tag: CONVEYOR_SENSOR_TAG });

  // Second OR: an actual seal-in circuit, de-energized by the stop interlock.
  project = createRung(project, "cv-rung-motor");
  project = insertInstruction(project, "cv-rung-motor", 0,
    { id: "cv-not-stop", kind: "XIO", tag: "CV_StopRequest" });
  project = insertInstruction(project, "cv-rung-motor", 1,
    { id: "cv-motor", kind: "OTE", tag: CONVEYOR_MOTOR_TAG });
  project = createIndependentParallelBranch(project, "cv-rung-motor", "cv-not-stop");
  const motorOr = project.rungs.find(r => r.id === "cv-rung-motor")!
    .instructions.find(item => item.kind === "OR_JUNCTION")!.id;
  project = insertIntoIndependentOrUpper(project, "cv-rung-motor", motorOr,
    { id: "cv-start", kind: "XIC", tag: CONVEYOR_START_TAG });
  project = addParallelContact(project, "cv-rung-motor", motorOr,
    { id: "cv-seal-in", kind: "XIC", tag: CONVEYOR_MOTOR_TAG });

  // Reset is explicit: pressing STOP must not silently erase the counter.
  project = createRung(project, "cv-rung-reset");
  project = insertInstruction(project, "cv-rung-reset", 0,
    { id: "cv-reset-when-clear", kind: "XIO", tag: CONVEYOR_SENSOR_TAG });
  project = insertInstruction(project, "cv-rung-reset", 1,
    { id: "cv-reset", kind: "XIC", tag: "CV_ResetPB" });
  project = insertInstruction(project, "cv-rung-reset", 2,
    { id: "cv-reset-counter", kind: "RES", tag: CONVEYOR_COUNT_TAG });
  return project;
}

/** Same rule for the SCADA button disabled state and conveyor physics. */
export function canAddConveyorItem(state: ConveyorState): boolean {
  return state.items.length < MAX_ITEMS && !state.items.some((item) =>
    Math.abs(item.position - ENTRY_POSITION) < MIN_BOX_CENTER_SPACING);
}

/** Spawn closely spaced boxes once the preceding box clears the entrance. */
export function addConveyorItem(state: ConveyorState): ConveyorState {
  if (!canAddConveyorItem(state)) return state;
  return {
    ...state, nextId: state.nextId + 1,
    items: [...state.items, { id: state.nextId, position: ENTRY_POSITION }],
  };
}

/** Pure browser-time physics; only motor power advances physical items. */
export function stepConveyor(
  state: ConveyorState, motorOn: boolean, elapsedMs: number,
): ConveyorState {
  if (!motorOn || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || !state.items.length) return state;
  // Cap oversized ticks so background tabs never teleport a box past the sensor.
  const delta = Math.min(elapsedMs, 150) / 1000 * BELT_SPEED_UNITS_PER_SECOND;
  let passed = state.passed;
  const nextItems: ConveyorItem[] = [];
  for (const item of state.items) {
    const next = item.position + delta;
    if (next >= EXIT_POSITION) passed++;
    else nextItems.push({ ...item, position: next });
  }
  // A narrow photoeye sees a box only while its drawn horizontal footprint
  // actually intersects the beam. Between two separated boxes it goes LOW.
  // The same 44px-wide rectangles are drawn in ConveyorScene.tsx.
  const sensorActive = nextItems.some((item) =>
    Math.abs(item.position - CONVEYOR_SENSOR_POSITION) <= BOX_HALF_WIDTH_UNITS);
  return { ...state, items: nextItems, passed, sensorActive };
}
