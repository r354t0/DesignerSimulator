import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialSortState, addSortBox, stepSortState, createSortExampleProject,
  readSortCount, readSortBool,
} from "../src/plc/sortSceneModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const view = read("../src/components/ide/SortScene.tsx");
const drawing = read("../src/components/ide/SortProcessGraphic.tsx");
const styles = read("../src/workspace.css");
const app = read("../src/App.tsx");

test("scene 2 introduces a compact industrial header with truthful PLC and process states", () => {
  assert.match(view, /SCADA · ESTACIÓN CL-02/);
  assert.match(view, /plcLabel = mode === "running" \? "PLC · RUN"/);
  assert.match(view, /mode === "paused" \? "PLC · PAUSE" : "PLC · STOP"/);
  assert.match(view, /motor && state\.items\.length \? "CLASIFICANDO"/);
  assert.match(view, /Objetivo y mapa E\/S/);
  assert.match(view, /onClick=\{\(\) => setInfoOpen\(true\)\}/);
  assert.match(view, /<SortSceneInfoDialog open=\{infoOpen\}/);
});

test("new process is its own large responsive SVG, without simulated UI-only motor state", () => {
  assert.match(view, /<SortProcessGraphic state=\{state\} motor=\{motor\}/);
  assert.match(drawing, /<svg viewBox="0 0 760 320"/);
  assert.match(drawing, /state\.items\.map\(item =>/);
  assert.match(drawing, /SortProcessGraphic\(\{ state, motor, divert, detection \}/);
  assert.match(drawing, /animationPlayState: motor \? "running" : "paused"/);
  assert.match(drawing, /item\.route === "B"/);
  assert.match(drawing, /item\.kind === "A"/);
  assert.match(drawing, /<Photoeye x=\{exitSensorX\} y=\{OUTPUT_A_Y\}/);
  assert.match(drawing, /<Photoeye x=\{exitSensorX\} y=\{OUTPUT_B_Y\}/);
  assert.match(drawing, /SORT_SCANNER_POSITION/);
  assert.match(drawing, /SORT_GATE_POSITION/);
  assert.match(drawing, /SORT_EXIT_POSITION - BRANCH_END_POSITION/);
  assert.match(drawing, /<BoxOnBelt key=\{item\.id\}/);
  assert.doesNotMatch(view, /setInterval|setTimeout|Math\.random/,
    "visual layer must not invent independent process physics");
});

test("professional KPI strips show real PLC counters, error tally and configured PRE", () => {
  assert.match(view, /readSortCount\(project, "Sort_CountA"\)/);
  assert.match(view, /readSortCount\(project, "Sort_CountB"\)/);
  assert.match(view, /readSortCount\(project, "Sort_CountTotal"\)/);
  assert.match(view, /readSortCount\(project, "Sort_Batches"\)/);
  assert.match(view, /typeof configuredPreset\.value\.PRE === "number"/);
  assert.match(view, /<Metric label="Desvíos erróneos" value=\{state\.errors\}/);
  assert.match(view, /role="progressbar" aria-label="Cajas del lote"/);
  assert.match(view, /aria-valuemax=\{batchTarget\}/);
  assert.match(view, /style=\{\{ width: progress \+ "%" \}\}/);
  assert.match(styles, /\.sort-kpi/);
  assert.match(styles, /\.sort-progress-fill/);
});

test("momentary START, STOP, RESET and both add-box inputs are preserved", () => {
  assert.match(view, /<MomentaryPushButton name="START" tone="start" pressed=\{start\}/);
  assert.match(view, /<MomentaryPushButton name="STOP" tone="stop" pressed=\{stop\}/);
  assert.match(view, /<MomentaryPushButton name="RESET LOTE" tone="drain" pressed=\{reset\}/);
  assert.match(view, /onChange=\{\(v\) => onInputChange\("Sort_StartPB", v\)\}/);
  assert.match(view, /onChange=\{\(v\) => onInputChange\("Sort_StopPB", v\)\}/);
  assert.match(view, /onChange=\{\(v\) => onInputChange\("Sort_ResetPB", v\)\}/);
  assert.match(view, /onClick=\{\(\) => onAddBox\("A"\)\} disabled=\{!canFeed\}/);
  assert.match(view, /onClick=\{\(\) => onAddBox\("B"\)\} disabled=\{!canFeed\}/);
  assert.match(view, /const canFeed = canAddSortBox\(state\)/);
  assert.match(view, /onClick=\{onReset\}/);
  assert.match(app, /<SortScene project=\{practice\} mode=\{practiceMode\} state=\{sortState\}/);
});

test("pilot LEDs remain tied to the existing output and sensor tags", () => {
  assert.match(view, /<Pilot label="MOTOR" active=\{motor\} color="green"\/>/);
  assert.match(view, /<Pilot label="DESVIADOR B" active=\{divert\} color="amber"\/>/);
  assert.match(view, /<Pilot label="TIPO B" active=\{detection\} color="blue"\/>/);
  assert.match(view, /<Pilot label="SALIDA A" active=\{state\.sensorExitA\} color="green"\/>/);
  assert.match(view, /<Pilot label="SALIDA B" active=\{state\.sensorExitB\} color="amber"\/>/);
  assert.match(view, /<Pilot label="LOTE COMPLETO" active=\{lotComplete\} color="amber"\/>/);
  assert.match(view, /<Pilot label="LÍNEAS LIBRES" active=\{state\.lineClear\} color="green"\/>/);
  assert.match(view, /resetAvailable && \(/);
  assert.match(view, /Pilotos LED y producción/);
  assert.match(view, /No están listos los tags del clasificador/);
});

test("render-only redesign keeps advanced PLC sort logic intact", () => {
  const p = createSortExampleProject();
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(p.rungs.length, 10);
  assert.equal(readSortCount(p, "Sort_CountTotal"), 0);
  assert.equal(readSortBool(p, "Sort_Motor"), false);
  let belt = addSortBox(initialSortState(), "A");
  belt = stepSortState(belt, false, true, 50);
  assert.equal(belt.items[0].position, 0.045,
    "motor off must still freeze physical conveyor");
  belt = stepSortState(belt, true, false, 50);
  assert.ok(belt.items[0].position > 0.045);
});
