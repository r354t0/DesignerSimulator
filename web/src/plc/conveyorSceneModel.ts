import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, addParallelContact, insertIntoIndependentOrUpper,
  setTagValue, type PracticeProject, type TagType,
} from "./practiceDocument.ts";
import {
  applyMomentaryBoolInput, applySceneSensorBoolInput, rescanPracticeWithoutTime,
  type PracticeScanState,
} from "./practiceScanCycle.ts";

/** Phase 5 / Scene 01 — a simulated conveyor, never a physical controller. */
export const CONVEYOR_SENSOR_TAG = "DI_BoxSensor";
export const CONVEYOR_COUNT_TAG = "CNT_Boxes";
export const CONVEYOR_MOTOR_TAG = "DO_Motor";
export const CONVEYOR_START_TAG = "PB_Start";
export const CONVEYOR_STOP_TAG = "PB_Stop";

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
    description: "Pulsador START",
    initialDescription: "Pulsador de arranque",
    legacyDescriptions: [
      "Faja: pulsador START de marcha", "Faja: pulsador START de marcha (entrada digital simulada)",
    ],
  },
  {
    name: CONVEYOR_STOP_TAG, type: "BOOL", direction: "Entrada",
    description: "Pulsador STOP",
    initialDescription: "Pulsador de parada",
    legacyDescriptions: [
      "Faja: pulsador STOP de parada", "Faja: pulsador STOP de parada (entrada digital simulada)",
    ],
  },
  {
    name: CONVEYOR_SENSOR_TAG, type: "BOOL", direction: "Entrada",
    description: "Sensor PE-01",
    legacyDescriptions: ["Faja: sensor fotoeléctrico de presencia de caja (PE-01)"],
  },
  {
    name: CONVEYOR_MOTOR_TAG, type: "BOOL", direction: "Salida",
    description: "Motor de faja",
    initialDescription: "Motor habilitado",
    legacyDescriptions: [
      "Faja: orden de marcha del motor transportador",
      "Faja: orden de marcha del motor transportador (salida digital)",
    ],
  },
  { name: "PB_Reset", type: "BOOL", direction: "Entrada",
    description: "RESET lote" },
];
/** Extra tags installed only when the advanced Ladder solution is loaded. */
export const CONVEYOR_TEMPLATE_TAGS: readonly ConveyorTagDefinition[] = [
  {
    name: CONVEYOR_COUNT_TAG, type: "COUNTER", direction: "Interna",
    description: "Conteo de cajas",
    legacyDescriptions: ["Faja: contador CTU de cajas detectadas por PE-01"],
    initialDescription: "Piezas que cruzaron el sensor",
  },
  { name: "ST_StopRequest", type: "BOOL", direction: "Interna",
    description: "Parada STOP/lote",
    legacyDescriptions: ["Faja: solicitud de parada por STOP o lote completo"] },
];
const BELT_SPEED_UNITS_PER_SECOND = 0.20;
/** Same box size and belt span used by the lateral SVG (44px over 505px). */
export const CONVEYOR_BOX_WIDTH_PX = 44;
export const CONVEYOR_BELT_LENGTH_PX = 505;
const BOX_HALF_WIDTH_UNITS = CONVEYOR_BOX_WIDTH_PX / (2 * CONVEYOR_BELT_LENGTH_PX);
/**
 * PE-01 is at the discharge mouth, just after the last roller. A box is
 * removed only when its trailing edge has crossed the end of the housing.
 * The photoeye must still be ON in the last frame before that removal:
 * otherwise the batch-stop rung would stop the belt with the final box
 * still physically resting on its end.
 */
export const CONVEYOR_SENSOR_POSITION = 1.015;
export const CONVEYOR_EXIT_POSITION = 1.05;
/**
 * Restore close-up box placement (about 6px between 44px boxes).
 * The photoeye samples the scene every 50ms, while the belt moves 0.01
 * normalized units per step: a >0.01 gap provides at least one LOW sample.
 */
export const MIN_BOX_GAP_UNITS = 0.012;
const MIN_BOX_CENTER_SPACING = 2 * BOX_HALF_WIDTH_UNITS + MIN_BOX_GAP_UNITS;
const ENTRY_POSITION = 0.045;
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
  const sceneSpecs = [
    ...CONVEYOR_TAGS,
    ...CONVEYOR_TEMPLATE_TAGS.filter(spec =>
      project.tags.some(tag => tag.name.toLowerCase() === spec.name.toLowerCase())),
  ];
  for (const spec of sceneSpecs) {
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
  for (const spec of sceneSpecs) {
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
 * Optional advanced solution — exactly the rung order and OR topology shown
 * in the Studio 5000 reference image:
 *
 * R0: (PB_Start OR DO_Motor) AND NOT ST_StopRequest -> OTE DO_Motor.
 * R1: PB_Stop OR (CNT_Boxes.DN AND NOT DI_BoxSensor) -> OTE ST_StopRequest.
 * R2: DI_BoxSensor -> CTU CNT_Boxes (PRE=5).
 * R3: NOT DI_BoxSensor AND PB_Reset -> RES CNT_Boxes.
 *
 * R0 precedes R1 in the source reference. Operator/sensor edge handlers
 * perform a second zero-time scan for STOP and completed batches so the
 * command takes effect immediately despite that cyclic evaluation order.
 */
export function createConveyorExampleProject(): PracticeProject {
  let project = initialConveyorProject();
  for (const spec of CONVEYOR_TEMPLATE_TAGS) {
    project = createTag(project, spec.name, spec.description, spec.type);
  }
  project = setTagValue(project, CONVEYOR_COUNT_TAG, 5, "PRE");

  // R0. The OR joins BEFORE the normally-closed stop permissive.
  project = insertInstruction(project, "rung-1", 0,
    { id: "cv-motor", kind: "OTE", tag: CONVEYOR_MOTOR_TAG });
  project = createIndependentParallelBranch(project, "rung-1");
  const motorOr = project.rungs[0].instructions.find(
    item => item.kind === "OR_JUNCTION")!.id;
  project = insertIntoIndependentOrUpper(project, "rung-1", motorOr,
    { id: "cv-start", kind: "XIC", tag: CONVEYOR_START_TAG });
  project = addParallelContact(project, "rung-1", motorOr,
    { id: "cv-seal-in", kind: "XIC", tag: CONVEYOR_MOTOR_TAG });
  project = insertInstruction(project, "rung-1", 2,
    { id: "cv-not-stop", kind: "XIO", tag: "ST_StopRequest" });

  // R1. Either STOP or a finished batch with a clear PE-01 requests stop.
  project = createRung(project, "cv-rung-stop-request");
  project = insertInstruction(project, "cv-rung-stop-request", 0,
    { id: "cv-stop-request-coil", kind: "OTE", tag: "ST_StopRequest" });
  project = createIndependentParallelBranch(project, "cv-rung-stop-request");
  const stopOr = project.rungs.find(r => r.id === "cv-rung-stop-request")!
    .instructions.find(item => item.kind === "OR_JUNCTION")!.id;
  project = insertIntoIndependentOrUpper(project, "cv-rung-stop-request", stopOr,
    { id: "cv-stop", kind: "XIC", tag: CONVEYOR_STOP_TAG });
  project = addParallelContact(project, "cv-rung-stop-request", stopOr,
    { id: "cv-full", kind: "XIC", tag: "CNT_Boxes.DN" });
  project = addParallelContact(project, "cv-rung-stop-request", stopOr,
    { id: "cv-no-box", kind: "XIO", tag: CONVEYOR_SENSOR_TAG });

  // R2. The counter is driven only by the photoeye rising edge.
  project = createRung(project, "cv-rung-count");
  project = insertInstruction(project, "cv-rung-count", 0,
    { id: "cv-sensor", kind: "XIC", tag: CONVEYOR_SENSOR_TAG });
  project = insertInstruction(project, "cv-rung-count", 1,
    { id: "cv-counter", kind: "CTU", tag: CONVEYOR_COUNT_TAG });

  // R3. RESET is blocked while a box still covers the photoeye.
  project = createRung(project, "cv-rung-reset");
  project = insertInstruction(project, "cv-rung-reset", 0,
    { id: "cv-reset-when-clear", kind: "XIO", tag: CONVEYOR_SENSOR_TAG });
  project = insertInstruction(project, "cv-rung-reset", 1,
    { id: "cv-reset", kind: "XIC", tag: "PB_Reset" });
  project = insertInstruction(project, "cv-rung-reset", 2,
    { id: "cv-reset-counter", kind: "RES", tag: CONVEYOR_COUNT_TAG });
  return project;
}

/** Apply momentary conveyor commands without losing short STOP pulses.
 * R0 reads the prior R1 result, so a second zero-ms evaluation is needed
 * for STOP assertion and RESET of a completed batch. */
export function applyConveyorMomentaryInput(
  state: PracticeScanState, tag: "PB_Start" | "PB_Stop" | "PB_Reset",
  pressed: boolean,
): PracticeScanState {
  let next = applyMomentaryBoolInput(
    state, tag, pressed, tag === "PB_Stop" || tag === "PB_Reset",
  );
  if (pressed && (tag === "PB_Stop" || tag === "PB_Reset")) {
    next = rescanPracticeWithoutTime(next);
  }
  return next;
}

/** Optical edge input with immediate stop propagation across the two
 * consecutive Ladder rungs, only once a completed batch clears PE-01. */
export function applyConveyorPhotoeyeInput(
  state: PracticeScanState, detected: boolean,
): PracticeScanState {
  const previous = state.project.tags.find(tag => tag.name === CONVEYOR_SENSOR_TAG);
  if (previous?.type === "BOOL" && previous.value === detected) return state;
  let next = applySceneSensorBoolInput(state, CONVEYOR_SENSOR_TAG, detected);
  if (!detected && next.mode === "running" &&
    readConveyorBool(next.project, "ST_StopRequest") &&
    readConveyorBool(next.project, CONVEYOR_MOTOR_TAG)) {
    next = rescanPracticeWithoutTime(next);
  }
  return next;
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
    if (next >= CONVEYOR_EXIT_POSITION) passed++;
    else nextItems.push({ ...item, position: next });
  }
  // Beam matches the rendered 44px box footprint, distinguishing even
  // minimal gaps. On final discharge the item disappears and beam goes LOW;
  // the PLC's batch stop is therefore issued only after its trailing edge
  // has left the physical belt.
  const sensorActive = nextItems.some((item) =>
    Math.abs(item.position - CONVEYOR_SENSOR_POSITION) <= BOX_HALF_WIDTH_UNITS);
  return { ...state, items: nextItems, passed, sensorActive };
}
