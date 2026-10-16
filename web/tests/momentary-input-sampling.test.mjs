import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createTag, initialPracticeProject, insertInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import {
  applyMomentaryBoolInput, changePracticeScanProject, initialPracticeScanState,
  pausePracticeScans, setScanPeriod, startPracticeScans, stepPracticeScan,
  stopPracticeScans, tickPracticeScan,
} from "../src/plc/practiceScanCycle.ts";
import {
  createConveyorExampleProject, readConveyorBool,
} from "../src/plc/conveyorSceneModel.ts";

const input = (state, tag, pressed) =>
  applyMomentaryBoolInput(state, tag, pressed);
const motor = (state) => readConveyorBool(state.project, "Motor_Run");

test("quick START and STOP taps are never lost between 500ms cyclic scans", () => {
  let state = startPracticeScans(setScanPeriod(
    initialPracticeScanState(createConveyorExampleProject()), 500));
  const scanBefore = state.scanCount;
  // Both the down and up happen before the interval scheduler can tick.
  state = input(state, "Start_PB", true);
  assert.equal(motor(state), true, "start must energize motor at pointer down");
  assert.equal(state.scanCount, scanBefore + 1);
  state = input(state, "Start_PB", false);
  assert.equal(readConveyorBool(state.project, "Start_PB"), false,
    "the physical input must be momentary");
  assert.equal(motor(state), true, "motor keeps its programmed OTL");
  assert.equal(state.scanCount, scanBefore + 1,
    "releasing the input does not insert another artificial scan");

  const scanAfterStart = state.scanCount;
  state = input(state, "Stop_PB", true);
  assert.equal(motor(state), false, "stop must unlatch motor at pointer down");
  state = input(state, "Stop_PB", false);
  assert.equal(readConveyorBool(state.project, "Stop_PB"), false);
  assert.equal(state.scanCount, scanAfterStart + 1);
  assert.equal(motor(state), false);
});

test("zero-time button evaluations do not accelerate timer ACC/PRE", () => {
  let project = initialPracticeProject();
  project = createTag(project, "T_Start", "Tiempo de espera", "TIMER");
  project = setTagValue(project, "T_Start", 1000, "PRE");
  project = insertInstruction(project, "rung-1", 0,
    { id: "sensor", kind: "XIC", tag: "Start_PB" });
  project = insertInstruction(project, "rung-1", 1,
    { id: "delay", kind: "TON", tag: "T_Start" });
  let state = startPracticeScans(initialPracticeScanState(project));
  const acc = (s) => s.project.tags.find(t => t.name === "T_Start").value.ACC;
  state = input(state, "Start_PB", true);
  assert.equal(acc(state), 0, "pressed input does not advance virtual time");
  state = tickPracticeScan(state);
  assert.equal(acc(state), 100);
  state = input(state, "Start_PB", false);
  assert.equal(acc(state), 100, "release updates input only");
  state = input(state, "Start_PB", true);
  assert.equal(acc(state), 100, "another press may evaluate but not add elapsed ms");
  state = tickPracticeScan(state);
  assert.equal(acc(state), 200);
});

test("PAUSE and STOP still freeze Ladder output despite momentary input changes", () => {
  let state = pausePracticeScans(startPracticeScans(
    initialPracticeScanState(createConveyorExampleProject())));
  const scans = state.scanCount;
  state = input(state, "Start_PB", true);
  state = input(state, "Start_PB", false);
  assert.equal(state.scanCount, scans, "PAUSE cannot perform an extra scan");
  assert.equal(motor(state), false);
  state = input(state, "Start_PB", true);
  state = stepPracticeScan(state);
  assert.equal(motor(state), true, "explicit SCAN continues to work in PAUSE");
  state = input(state, "Start_PB", false);
  state = stopPracticeScans(state);
  const stoppedCount = state.scanCount;
  state = input(state, "Stop_PB", true);
  state = input(state, "Stop_PB", false);
  assert.equal(state.scanCount, stoppedCount, "STOP never executes Ladder");
});

test("duplicate pointer events don't add scans; ordinary Controller Tags remain cyclic", () => {
  let state = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  state = input(state, "Start_PB", true);
  assert.strictEqual(input(state, "Start_PB", true), state);
  const count = state.scanCount;
  state = input(state, "Start_PB", false);
  assert.strictEqual(input(state, "Start_PB", false), state);
  assert.equal(state.scanCount, count);

  // Other programmatic tag updates intentionally use normal scan timing.
  const normal = changePracticeScanProject(state,
    setTagValue(state.project, "Stop_PB", true));
  assert.equal(normal.scanCount, count);
  assert.equal(motor(normal), true);
  assert.equal(motor(tickPracticeScan(normal)), false);
});

test("invalid or non-BOOL operator targets are refused rather than silently ignored", () => {
  const state = initialPracticeScanState(initialPracticeProject());
  assert.throws(() => input(state, "NotPresent", true), /tag BOOL existente/);
  assert.throws(() => input(state, "Timer_NotPresent", true), /tag BOOL existente/);
});

test("the SCADA button dispatcher routes to the immediate momentary sample", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const cycle = readFileSync(new URL("../src/plc/practiceScanCycle.ts", import.meta.url), "utf8");
  assert.match(app, /applyMomentaryBoolInput\(state, tag, value\)/);
  assert.match(cycle, /pressed && staged\.mode === "running" \? performScan\(staged, 0\) : staged/);
});
