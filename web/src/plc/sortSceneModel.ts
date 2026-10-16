import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, addParallelContact, insertIntoIndependentOrUpper,
  setTagValue, type PracticeProject, type TagType,
} from "./practiceDocument.ts";
import {
  applyMomentaryBoolInput, applySceneSensorBoolInput, rescanPracticeWithoutTime,
  type PracticeScanState,
} from "./practiceScanCycle.ts";

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

/** Installed only when the user accepts the advanced Ladder solution. */
export const SORT_TEMPLATE_TAGS: readonly (typeof SORT_TAGS)[number][] = [
  { name: "Sort_ResetPB", type: "BOOL", direction: "Entrada",
    description: "RESET lote" },
  { name: "Sort_LineClear", type: "BOOL", direction: "Entrada",
    description: "Líneas vacías" },
  { name: "Sort_StopRequest", type: "BOOL", direction: "Interna",
    description: "Parada STOP/lote" },
  { name: "Sort_CountTotal", type: "COUNTER", direction: "Interna",
    description: "Cajas del lote" },
  { name: "Sort_Batches", type: "COUNTER", direction: "Interna",
    description: "Lotes terminados" },
];

export const SORT_BATCH_SIZE = 6;

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
  lineClear: boolean;
}
export function initialSortState(): SortState {
  return {
    items: [], nextId: 1, exitA: 0, exitB: 0, errors: 0,
    sensorTypeB: false, sensorExitA: false, sensorExitB: false,
    lineClear: true,
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
  const specs = [
    ...SORT_TAGS,
    ...SORT_TEMPLATE_TAGS.filter(spec =>
      project.tags.some(t => t.name.toLowerCase() === spec.name.toLowerCase())),
  ];
  for (const spec of specs) {
    const other = project.tags.find((tag) => tag.name.toLowerCase() === spec.name.toLowerCase());
    if (other && (other.name !== spec.name || other.type !== spec.type)) {
      throw new Error("Tag incompatible con el clasificador: " + spec.name +
        " (se requiere " + spec.type + "). Revisa Controller Tags.");
    }
  }
  let result = project;
  for (const spec of specs) {
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

/**
 * Advanced ten-rung solution with three genuine independent OR groups:
 *
 * R0 (START OR MOTOR) AND NOT StopRequest -> Motor OTE (seal-in).
 * R1 STOP OR (CountTotal.DN AND LineClear) -> StopRequest OTE.
 * R2 Motor AND TypeB -> Divert OTE.
 * R3 AExit -> CTU CountA; R4 BExit -> CTU CountB.
 * R5 (AExit OR BExit) -> CTU CountTotal, PRE=6.
 * R6 CountTotal.DN AND LineClear -> CTU Batches.
 * R7-R9 LineClear AND ResetPB -> RES CountA, CountB, CountTotal.
 *
 * Stop waits for all boxes to leave both routes; reset never erases lifetime
 * batch count. The current scene's nine standard tags remain unchanged until
 * the learner explicitly loads this template.
 */
export function createSortExampleProject(): PracticeProject {
  let p = initialSortProject();
  for (const tag of SORT_TEMPLATE_TAGS) {
    p = createTag(p, tag.name, tag.description, tag.type);
  }
  p = setTagValue(p, "Sort_LineClear", true);
  p = setTagValue(p, "Sort_CountA", SORT_BATCH_SIZE, "PRE");
  p = setTagValue(p, "Sort_CountB", SORT_BATCH_SIZE, "PRE");
  p = setTagValue(p, "Sort_CountTotal", SORT_BATCH_SIZE, "PRE");
  p = setTagValue(p, "Sort_Batches", 10, "PRE");

  const append = (rung: string, specs: {
    id: string; kind: "XIC" | "XIO" | "OTE" | "CTU" | "RES"; tag: string;
  }[]) => {
    specs.forEach((instruction, i) => {
      p = insertInstruction(p, rung, i, instruction);
    });
  };
  const addRung = (id: string) => { p = createRung(p, id); };

  // R0. OR joins BEFORE normally-closed stop request (electrical seal-in).
  append("rung-1", [{ id:"sort-motor-out",kind:"OTE",tag:"Sort_Motor" }]);
  p = createIndependentParallelBranch(p, "rung-1");
  const motorOr = p.rungs[0].instructions.find(i => i.kind === "OR_JUNCTION")!.id;
  p = insertIntoIndependentOrUpper(p,"rung-1",motorOr,
    { id:"sort-start",kind:"XIC",tag:"Sort_StartPB" });
  p = addParallelContact(p,"rung-1",motorOr,
    { id:"sort-seal",kind:"XIC",tag:"Sort_Motor" });
  p = insertInstruction(p,"rung-1",2,
    { id:"sort-stop-interlock",kind:"XIO",tag:"Sort_StopRequest" });

  // R1. STOP or full batch with BOTH lines empty.
  addRung("sort-stop-request");
  append("sort-stop-request",[{ id:"sort-stop-coil",kind:"OTE",tag:"Sort_StopRequest" }]);
  p = createIndependentParallelBranch(p,"sort-stop-request");
  const stopOr = p.rungs.find(r=>r.id==="sort-stop-request")!.instructions
    .find(i=>i.kind==="OR_JUNCTION")!.id;
  p = insertIntoIndependentOrUpper(p,"sort-stop-request",stopOr,
    { id:"sort-stop",kind:"XIC",tag:"Sort_StopPB" });
  p = addParallelContact(p,"sort-stop-request",stopOr,
    { id:"sort-full",kind:"XIC",tag:"Sort_CountTotal.DN" });
  p = addParallelContact(p,"sort-stop-request",stopOr,
    { id:"sort-lines-empty",kind:"XIC",tag:"Sort_LineClear" });

  // R2. Divert only when the motor is running and the B sensor is active.
  addRung("sort-diverter");
  append("sort-diverter",[
    { id:"sort-motor-ok",kind:"XIC",tag:"Sort_Motor" },
    { id:"sort-type-b",kind:"XIC",tag:"Sort_TypeB" },
    { id:"sort-divert",kind:"OTE",tag:"Sort_Divert" },
  ]);

  // R3 + R4. Independent counters on physical discharge lines.
  addRung("sort-count-a");
  append("sort-count-a",[
    { id:"sort-a-sensor",kind:"XIC",tag:"Sort_AExit" },
    { id:"sort-ctu-a",kind:"CTU",tag:"Sort_CountA" },
  ]);
  addRung("sort-count-b");
  append("sort-count-b",[
    { id:"sort-b-sensor",kind:"XIC",tag:"Sort_BExit" },
    { id:"sort-ctu-b",kind:"CTU",tag:"Sort_CountB" },
  ]);

  // R5. Third OR: any one of the non-overlapping exit sensors increments
  // the total batch counter. Scene entry spacing keeps their pulses distinct.
  addRung("sort-count-total");
  append("sort-count-total",[
    { id:"sort-total",kind:"CTU",tag:"Sort_CountTotal" },
  ]);
  p = createIndependentParallelBranch(p,"sort-count-total");
  const countOr = p.rungs.find(r=>r.id==="sort-count-total")!.instructions
    .find(i=>i.kind==="OR_JUNCTION")!.id;
  p = insertIntoIndependentOrUpper(p,"sort-count-total",countOr,
    { id:"sort-total-a",kind:"XIC",tag:"Sort_AExit" });
  p = addParallelContact(p,"sort-count-total",countOr,
    { id:"sort-total-b",kind:"XIC",tag:"Sort_BExit" });

  // R6. Count the batch once, but only AFTER its last physical discharge.
  addRung("sort-batches");
  append("sort-batches",[
    { id:"sort-batch-full",kind:"XIC",tag:"Sort_CountTotal.DN" },
    { id:"sort-batch-clear",kind:"XIC",tag:"Sort_LineClear" },
    { id:"sort-batch-ctu",kind:"CTU",tag:"Sort_Batches" },
  ]);

  // R7–R9: no reset mid-transport; total and A/B are reset together.
  for (const [rung, counter] of [
    ["sort-reset-a","Sort_CountA"],["sort-reset-b","Sort_CountB"],
    ["sort-reset-total","Sort_CountTotal"],
  ]) {
    addRung(rung);
    append(rung,[
      { id:rung+"-clear",kind:"XIC",tag:"Sort_LineClear" },
      { id:rung+"-button",kind:"XIC",tag:"Sort_ResetPB" },
      { id:rung+"-out",kind:"RES",tag:counter },
    ]);
  }
  return p;
}

/** Operator momentary keys: immediate STOP and RESET sampling, including
 * a zero-time second pass to propagate a later STOP rung into Motor OTE. */
export function applySortMomentaryInput(
  state: PracticeScanState, tag: "Sort_StartPB" | "Sort_StopPB" | "Sort_ResetPB",
  pressed: boolean,
): PracticeScanState {
  let next = applyMomentaryBoolInput(
    state, tag, pressed, tag === "Sort_StopPB" || tag === "Sort_ResetPB",
  );
  if (pressed && (tag === "Sort_StopPB" || tag === "Sort_ResetPB")) {
    next = rescanPracticeWithoutTime(next);
  }
  return next;
}

/** Edge-driven physical scene inputs. Full discharge can trigger the stop
 * request in R1, requiring one more zero-time evaluation to stop R0. */
export function applySortSensorInput(
  state: PracticeScanState, name: string, value: boolean,
): PracticeScanState {
  const tag = state.project.tags.find(t=>t.name===name);
  if (!tag || tag.type !== "BOOL" || tag.value===value) return state;
  let next = applySceneSensorBoolInput(state,name,value);
  if (name==="Sort_LineClear" && value && next.mode==="running" &&
    readSortBool(next.project,"Sort_StopRequest") &&
    readSortBool(next.project,"Sort_Motor")) {
    next = rescanPracticeWithoutTime(next);
  }
  return next;
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
    lineClear: false,
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
    lineClear: items.length === 0,
  };
}
