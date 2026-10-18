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
  applyConveyorMomentaryInput, createConveyorExampleProject, readConveyorBool,
} from "../src/plc/conveyorSceneModel.ts";

const input = (state, tag, pressed) =>
  applyMomentaryBoolInput(state, tag, pressed);
const motor = (state) => readConveyorBool(state.project, "DO_Motor");
const conveyorInput = (state, tag, pressed) =>
  applyConveyorMomentaryInput(state, tag, pressed);

test("quick START and STOP taps are never lost between 500ms cyclic scans", () => {
  let state = startPracticeScans(setScanPeriod(
    initialPracticeScanState(createConveyorExampleProject()), 500));
  const scanBefore = state.scanCount;
  // Both the down and up happen before the interval scheduler can tick.
  state = conveyorInput(state, "PB_Start", true);
  assert.equal(motor(state), true, "start must energize motor at pointer down");
  assert.equal(state.scanCount, scanBefore + 1);
  state = conveyorInput(state, "PB_Start", false);
  assert.equal(readConveyorBool(state.project, "PB_Start"), false,
    "the physical input must be momentary");
  assert.equal(motor(state), true, "motor remains energized via OR seal-in");
  assert.equal(state.scanCount, scanBefore + 1,
    "releasing the input does not insert another artificial scan");

  const scanAfterStart = state.scanCount;
  state = conveyorInput(state, "PB_Stop", true);
  assert.equal(motor(state), false, "stop must propagate across R1 into R0 on pointer down");
  assert.equal(state.scanCount, scanAfterStart + 2,
    "the STOP request needs two consecutive zero-time evaluations");
  state = conveyorInput(state, "PB_Stop", false);
  assert.equal(readConveyorBool(state.project, "PB_Stop"), false);
  assert.equal(state.scanCount, scanAfterStart + 3,
    "STOP release must clear the internal request immediately");
  assert.equal(motor(state), false);
});

test("zero-time button evaluations do not accelerate timer ACC/PRE", () => {
  let project = initialPracticeProject();
  project = createTag(project, "T_Start", "Tiempo de espera", "TIMER");
  project = setTagValue(project, "T_Start", 1000, "PRE");
  project = insertInstruction(project, "rung-1", 0,
    { id: "sensor", kind: "XIC", tag: "PB_Start" });
  project = insertInstruction(project, "rung-1", 1,
    { id: "delay", kind: "TON", tag: "T_Start" });
  let state = startPracticeScans(initialPracticeScanState(project));
  const acc = (s) => s.project.tags.find(t => t.name === "T_Start").value.ACC;
  state = input(state, "PB_Start", true);
  assert.equal(acc(state), 0, "pressed input does not advance virtual time");
  state = tickPracticeScan(state);
  assert.equal(acc(state), 100);
  state = input(state, "PB_Start", false);
  assert.equal(acc(state), 100, "release updates input only");
  state = input(state, "PB_Start", true);
  assert.equal(acc(state), 100, "another press may evaluate but not add elapsed ms");
  state = tickPracticeScan(state);
  assert.equal(acc(state), 200);
});

test("PAUSE and STOP still freeze Ladder output despite momentary input changes", () => {
  let state = pausePracticeScans(startPracticeScans(
    initialPracticeScanState(createConveyorExampleProject())));
  const scans = state.scanCount;
  state = input(state, "PB_Start", true);
  state = input(state, "PB_Start", false);
  assert.equal(state.scanCount, scans, "PAUSE cannot perform an extra scan");
  assert.equal(motor(state), false);
  state = input(state, "PB_Start", true);
  state = stepPracticeScan(state);
  assert.equal(motor(state), true, "explicit SCAN continues to work in PAUSE");
  state = input(state, "PB_Start", false);
  state = stopPracticeScans(state);
  const stoppedCount = state.scanCount;
  state = input(state, "PB_Stop", true);
  state = input(state, "PB_Stop", false);
  assert.equal(state.scanCount, stoppedCount, "STOP never executes Ladder");
});

test("duplicate pointer events don't add scans; ordinary Controller Tags remain cyclic", () => {
  let state = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  state = input(state, "PB_Start", true);
  assert.strictEqual(input(state, "PB_Start", true), state);
  const count = state.scanCount;
  state = input(state, "PB_Start", false);
  assert.strictEqual(input(state, "PB_Start", false), state);
  assert.equal(state.scanCount, count);

  // Other programmatic tag updates intentionally use normal scan timing.
  const normal = changePracticeScanProject(state,
    setTagValue(state.project, "PB_Stop", true));
  assert.equal(normal.scanCount, count);
  assert.equal(motor(normal), true);
  const first = tickPracticeScan(normal);
  assert.equal(motor(first), true, "R0 reads previous ST_StopRequest in first scan");
  assert.equal(motor(tickPracticeScan(first)), false,
    "second cyclic scan sees STOP request from rung 1");
});

test("invalid or non-BOOL operator targets are refused rather than silently ignored", () => {
  const state = initialPracticeScanState(initialPracticeProject());
  assert.throws(() => input(state, "NotPresent", true), /tag BOOL existente/);
  assert.throws(() => input(state, "Timer_NotPresent", true), /tag BOOL existente/);
});

test("the SCADA button dispatcher routes to the immediate momentary sample", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const cycle = readFileSync(new URL("../src/plc/practiceScanCycle.ts", import.meta.url), "utf8");
  assert.match(app, /applyConveyorMomentaryInput\(state, tag, value\)/);
  assert.match(app, /applyConveyorPhotoeyeInput\(current, next\.sensorActive\)/);
  assert.match(cycle, /\(pressed \|\| sampleRelease\) && staged\.mode === "running"/);
  assert.match(cycle, /performScan\(staged, 0\)/);
});
