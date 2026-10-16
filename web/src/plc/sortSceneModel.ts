import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  setTagValue, type PracticeProject, type TagType,
} from "./practiceDocument.ts";

/** Scene 02 — optical box identification, diverter and two discharge lines. */
export const SORT_TAGS: readonly {
  name: string; type: TagType; direction: "Entrada" | "Salida" | "Interna"; description: string;
}[] = [
  { name: "Sort_StartPB", type: "BOOL", direction: "Entrada", description: "Clasificador: pulsador START" },
  { name: "Sort_StopPB", type: "BOOL", direction: "Entrada", description: "Clasificador: pulsador STOP" },
  { name: "Sort_TypeB", type: "BOOL", direction: "Entrada", description: "Clasificador: sensor de caja tipo B" },
  { name: "Sort_AExit", type: "BOOL", direction: "Entrada", description: "Clasificador: sensor de salida A" },
  { name: "Sort_BExit", type: "BOOL", direction: "Entrada", description: "Clasificador: sensor de salida B" },
  { name: "Sort_Motor", type: "BOOL", direction: "Salida", description: "Clasificador: motor de transporte principal" },
  { name: "Sort_Divert", type: "BOOL", direction: "Salida", description: "Clasificador: accionamiento del desviador hacia línea B" },
  { name: "Sort_CountA", type: "COUNTER", direction: "Interna", description: "Clasificador: cajas que cruzaron la salida A" },
  { name: "Sort_CountB", type: "COUNTER", direction: "Interna", description: "Clasificador: cajas que cruzaron la salida B" },
];

export const SORT_SCANNER_POSITION = 0.50;
export const SORT_GATE_POSITION = 0.52;
export const SORT_EXIT_SENSOR_POSITION = 0.88;
export const SORT_EXIT_POSITION = 1.03;
export const SORT_BOX_HALF_WIDTH = 0.034;
const SORT_SPEED_PER_SECOND = 0.20;
const SORT_ENTRY_POSITION = 0.045;
const SORT_ENTRY_SPACING = 0.17;
const MAX_SORT_BOXES = 8;

export type SortBoxType = "A" | "B";
export interface SortBox {
  id: number;
  kind: SortBoxType;
  position: number;
  route?: SortBoxType;
}
export interface SortState {
  items: SortBox[];
  nextId: number;
  exitA: number;
  exitB: number;
  errors: number;
  sensorTypeB: boolean;
  sensorExitA: boolean;
  sensorExitB: boolean;
}
export function initialSortState(): SortState {
  return {
    items: [], nextId: 1, exitA: 0, exitB: 0, errors: 0,
    sensorTypeB: false, sensorExitA: false, sensorExitB: false,
  };
}
export function readSortBool(project: PracticeProject, name: string): boolean {
  const tag = project.tags.find((item) => item.name === name);
  return tag?.type === "BOOL" && tag.value === true;
}
export function readSortCount(project: PracticeProject, name: string): number | null {
  const tag = project.tags.find((item) => item.name === name);
  return tag?.type === "COUNTER" && typeof tag.value === "object" &&
    typeof tag.value.ACC === "number" ? tag.value.ACC : null;
}
export function hasSortTags(project: PracticeProject): boolean {
  return SORT_TAGS.every((item) => project.tags.some(
    (tag) => tag.name === item.name && tag.type === item.type));
}

/** Safe registration: never reset user tags, rungs or custom descriptions. */
export function prepareSortTags(project: PracticeProject): PracticeProject {
  for (const spec of SORT_TAGS) {
    const other = project.tags.find((tag) => tag.name.toLowerCase() === spec.name.toLowerCase());
    if (other && (other.name !== spec.name || other.type !== spec.type)) {
      throw new Error("Tag incompatible con el clasificador: " + spec.name +
        " (se requiere " + spec.type + "). Revisa Controller Tags.");
    }
  }
  let result = project;
  for (const spec of SORT_TAGS) {
    const old = result.tags.find((tag) => tag.name === spec.name);
    if (!old) result = createTag(result, spec.name, spec.description, spec.type);
    else if (!old.description.trim()) {
      result = { ...result, tags: result.tags.map((tag) =>
        tag.name === spec.name ? { ...tag, description: spec.description } : tag) };
    }
  }
  return result;
}

/** A scene-specific MainRoutine; prior scene projects are preserved by App. */
export function initialSortProject(): PracticeProject {
  const prepared = prepareSortTags({ ...initialPracticeProject(), tags: [] });
  return { ...prepared, tags: SORT_TAGS.map((spec) =>
    prepared.tags.find((tag) => tag.name === spec.name)!) };
}

/** Optional example only: does not get installed automatically. */
export function createSortExampleProject(): PracticeProject {
  let p = initialSortProject();
  p = setTagValue(p, "Sort_CountA", 10, "PRE");
  p = setTagValue(p, "Sort_CountB", 10, "PRE");
  const add = (rung: string, contactId: string, input: string,
    outputId: string, outputKind: "OTE" | "OTL" | "OTU" | "CTU", output: string) => {
    p = insertInstruction(p, rung, 0, { id: contactId, kind: "XIC", tag: input });
    p = insertInstruction(p, rung, 1, { id: outputId, kind: outputKind, tag: output });
  };
  add("rung-1", "sort-start", "Sort_StartPB", "sort-motor-on", "OTL", "Sort_Motor");
  p = createRung(p, "sort-rung-stop");
  add("sort-rung-stop", "sort-stop", "Sort_StopPB", "sort-motor-off", "OTU", "Sort_Motor");
  p = createRung(p, "sort-rung-divert");
  add("sort-rung-divert", "sort-detect", "Sort_TypeB", "sort-divert", "OTE", "Sort_Divert");
  p = createRung(p, "sort-rung-counta");
  add("sort-rung-counta", "sort-exit-a", "Sort_AExit", "sort-ctu-a", "CTU", "Sort_CountA");
  p = createRung(p, "sort-rung-countb");
  add("sort-rung-countb", "sort-exit-b", "Sort_BExit", "sort-ctu-b", "CTU", "Sort_CountB");
  return p;
}

export function canAddSortBox(state: SortState): boolean {
  return state.items.length < MAX_SORT_BOXES &&
    !state.items.some((item) => Math.abs(item.position - SORT_ENTRY_POSITION) < SORT_ENTRY_SPACING);
}
export function addSortBox(state: SortState, kind: SortBoxType): SortState {
  if (!canAddSortBox(state)) return state;
  return {
    ...state, nextId: state.nextId + 1,
    items: [...state.items, { id: state.nextId, kind, position: SORT_ENTRY_POSITION }],
  };
}

/** Pure, deterministic browser physics: PLC output decides each box route at the station. */
export function stepSortState(
  state: SortState, motorOn: boolean, divertOn: boolean, elapsedMs: number,
): SortState {
  if (!motorOn || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || !state.items.length) return state;
  const delta = Math.min(elapsedMs, 150) / 1000 * SORT_SPEED_PER_SECOND;
  let exitA = state.exitA, exitB = state.exitB, errors = state.errors;
  const items: SortBox[] = [];
  for (const item of state.items) {
    const position = item.position + delta;
    const route = item.route ??
      (position >= SORT_GATE_POSITION ? (divertOn ? "B" : "A") : undefined);
    if (position >= SORT_EXIT_POSITION) {
      if (route === "B") exitB++;
      else exitA++;
      if (route !== item.kind) errors++;
    } else items.push({ ...item, position, route });
  }
  const nearExit = (item: SortBox) =>
    Math.abs(item.position - SORT_EXIT_SENSOR_POSITION) <= SORT_BOX_HALF_WIDTH;
  return {
    ...state, items, exitA, exitB, errors,
    sensorTypeB: items.some((item) => item.kind === "B" && item.route === undefined &&
      Math.abs(item.position - SORT_SCANNER_POSITION) <= SORT_BOX_HALF_WIDTH),
    sensorExitA: items.some((item) => item.route === "A" && nearExit(item)),
    sensorExitB: items.some((item) => item.route === "B" && nearExit(item)),
  };
}
