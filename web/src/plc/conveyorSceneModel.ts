import {
  createRung, createTag, initialPracticeProject, insertInstruction,
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
}

export const CONVEYOR_TAGS: readonly ConveyorTagDefinition[] = [
  {
    name: CONVEYOR_START_TAG, type: "BOOL", direction: "Entrada",
    description: "Faja: pulsador START de marcha (entrada digital simulada)",
    initialDescription: "Pulsador de arranque",
  },
  {
    name: CONVEYOR_STOP_TAG, type: "BOOL", direction: "Entrada",
    description: "Faja: pulsador STOP de parada (entrada digital simulada)",
    initialDescription: "Pulsador de parada",
  },
  {
    name: CONVEYOR_SENSOR_TAG, type: "BOOL", direction: "Entrada",
    description: "Faja: sensor fotoeléctrico de presencia de caja (PE-01)",
  },
  {
    name: CONVEYOR_MOTOR_TAG, type: "BOOL", direction: "Salida",
    description: "Faja: orden de marcha del motor transportador (salida digital)",
    initialDescription: "Motor habilitado",
  },
  {
    name: CONVEYOR_COUNT_TAG, type: "COUNTER", direction: "Interna",
    description: "Faja: contador CTU de cajas detectadas por PE-01",
    initialDescription: "Piezas que cruzaron el sensor",
  },
];
export const CONVEYOR_SENSOR_POSITION = 0.67;
const BELT_SPEED_UNITS_PER_SECOND = 0.20;
const SENSOR_HALF_WIDTH = 0.065;
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
      existing.description === spec.initialDescription) {
      result = {
        ...result,
        tags: result.tags.map((tag) => tag.name === spec.name
          ? { ...tag, description: spec.description } : tag),
      };
    }
  }
  return result;
}

/** Optional self-contained teaching example, applied only after explicit confirmation. */
export function createConveyorExampleProject(): PracticeProject {
  let project = prepareConveyorTags(initialPracticeProject());
  project = setTagValue(project, CONVEYOR_COUNT_TAG, 5, "PRE");

  // Rung 0: start latch.
  project = insertInstruction(project, "rung-1", 0,
    { id: "cv-start", kind: "XIC", tag: CONVEYOR_START_TAG });
  project = insertInstruction(project, "rung-1", 1,
    { id: "cv-motor-latch", kind: "OTL", tag: CONVEYOR_MOTOR_TAG });

  // Rung 1: stop has priority because it scans AFTER the start rung.
  project = createRung(project, "cv-rung-stop");
  project = insertInstruction(project, "cv-rung-stop", 0,
    { id: "cv-stop", kind: "XIC", tag: CONVEYOR_STOP_TAG });
  project = insertInstruction(project, "cv-rung-stop", 1,
    { id: "cv-motor-unlatch", kind: "OTU", tag: CONVEYOR_MOTOR_TAG });

  // Rung 2: the sensor advances the retentive counter once per rising edge.
  project = createRung(project, "cv-rung-count");
  project = insertInstruction(project, "cv-rung-count", 0,
    { id: "cv-sensor", kind: "XIC", tag: CONVEYOR_SENSOR_TAG });
  project = insertInstruction(project, "cv-rung-count", 1,
    { id: "cv-counter", kind: "CTU", tag: CONVEYOR_COUNT_TAG });
  return project;
}

/** Spawn items only when the entrance is free, without hiding an existing one. */
export function addConveyorItem(state: ConveyorState): ConveyorState {
  if (state.items.length >= MAX_ITEMS || state.items.some((item) => item.position < 0.14)) return state;
  return {
    ...state, nextId: state.nextId + 1,
    items: [...state.items, { id: state.nextId, position: 0.045 }],
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
  const sensorActive = nextItems.some((item) =>
    Math.abs(item.position - CONVEYOR_SENSOR_POSITION) <= SENSOR_HALF_WIDTH);
  return { ...state, items: nextItems, passed, sensorActive };
}
