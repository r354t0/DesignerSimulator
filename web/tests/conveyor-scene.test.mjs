import test from "node:test";
import assert from "node:assert/strict";
import {
  addConveyorItem, createConveyorExampleProject, hasConveyorTags,
  initialConveyorState, prepareConveyorTags, readConveyorBool,
  readConveyorCount, stepConveyor, CONVEYOR_SENSOR_TAG,
} from "../src/plc/conveyorSceneModel.ts";
import {
  initialPracticeProject, insertInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  initialPracticeScanState, startPracticeScans,
  changePracticeScanProject, tickPracticeScan, pausePracticeScans,
  stepPracticeScan, stopPracticeScans,
} from "../src/plc/practiceScanCycle.ts";

test("prepare tags preserves the full current Ladder and does not duplicate tags", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0,
    { id: "existing", kind: "XIC", tag: "Auto_Mode" });
  const original = project.rungs;
  const next = prepareConveyorTags(project);
  assert.deepEqual(next.rungs, original);
  assert.equal(hasConveyorTags(project), false);
  assert.equal(hasConveyorTags(next), true);
  assert.equal(next.tags.find(t => t.name === CONVEYOR_SENSOR_TAG).type, "BOOL");
  assert.equal(next.tags.find(t => t.name === "CV_Count").type, "COUNTER");
  assert.equal(prepareConveyorTags(next), next);
});

test("Ladder example builds and exposes three stable control rungs", () => {
  const project = createConveyorExampleProject();
  assert.equal(buildPracticeProject(project).success, true);
  assert.deepEqual(project.rungs.map(r => r.instructions.map(i => i.kind)), [
    ["XIC", "OTL"], ["XIC", "OTU"], ["XIC", "CTU"],
  ]);
  assert.equal(project.tags.find(t => t.name === "CV_Count").value.PRE, 5);
  assert.equal(hasConveyorTags(project), true);
});

test("start/stop inputs actuate conveyor through actual PracticeRoutine scans", () => {
  let state = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  assert.equal(readConveyorBool(state.project, "Motor_Run"), false);
  state = changePracticeScanProject(state, setTagValue(state.project, "Start_PB", true));
  state = tickPracticeScan(state);
  assert.equal(readConveyorBool(state.project, "Motor_Run"), true);
  state = changePracticeScanProject(state, setTagValue(state.project, "Start_PB", false));
  state = tickPracticeScan(state);
  assert.equal(readConveyorBool(state.project, "Motor_Run"), true, "OTL retains motor");
  state = changePracticeScanProject(state, setTagValue(state.project, "Stop_PB", true));
  state = tickPracticeScan(state);
  assert.equal(readConveyorBool(state.project, "Motor_Run"), false, "OTU wins");
  state = stopPracticeScans(state);
  assert.equal(state.mode, "stopped");
});

test("photoelectric BOOL sensor counts only rising edges (CTU), including PAUSE and SCAN", () => {
  let state = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  state = changePracticeScanProject(state, setTagValue(state.project, CONVEYOR_SENSOR_TAG, true));
  state = tickPracticeScan(state);
  assert.equal(readConveyorCount(state.project), 1);
  state = tickPracticeScan(state);
  assert.equal(readConveyorCount(state.project), 1, "held sensor must not count twice");
  state = pausePracticeScans(state);
  state = changePracticeScanProject(state, setTagValue(state.project, CONVEYOR_SENSOR_TAG, false));
  state = tickPracticeScan(state);
  assert.equal(readConveyorCount(state.project), 1, "PAUSE must freeze Ladder");
  state = stepPracticeScan(state);
  state = changePracticeScanProject(state, setTagValue(state.project, CONVEYOR_SENSOR_TAG, true));
  state = stepPracticeScan(state);
  assert.equal(readConveyorCount(state.project), 2, "manual SCAN counts next rising edge");
});

test("boxes do not move without PLC motor output or when scene is paused", () => {
  const state = addConveyorItem(initialConveyorState());
  assert.equal(state.items.length, 1);
  assert.equal(stepConveyor(state, false, 200), state);
  const running = stepConveyor(state, true, 50);
  assert.ok(running.items[0].position > state.items[0].position);
  assert.deepEqual(stepConveyor(running, false, 50), running);
  assert.ok(!running.sensorActive);
});

test("belt physics activates photoeye for multiple frames before box exits", () => {
  let state = addConveyorItem(initialConveyorState());
  let sensorFrames = 0;
  let enteredSensor = false;
  for (let i = 0; i < 130; i++) {
    state = stepConveyor(state, true, 50);
    if (state.sensorActive) {
      enteredSensor = true;
      sensorFrames++;
    }
  }
  assert.equal(enteredSensor, true);
  assert.ok(sensorFrames >= 5, "sensor pulse must outlast a 100ms PLC scan");
  assert.equal(state.items.length, 0);
  assert.equal(state.passed, 1);
  assert.equal(state.sensorActive, false);
});

test("spawn respects entrance clearance and does not erase existing items", () => {
  let state = addConveyorItem(initialConveyorState());
  assert.equal(addConveyorItem(state), state, "entrance blocked");
  for (let i = 0; i < 13; i++) state = stepConveyor(state, true, 50);
  const withSecond = addConveyorItem(state);
  assert.equal(withSecond.items.length, 2);
  assert.deepEqual(withSecond.items.map(i => i.id), [1, 2]);
});

test("scene tags can be updated while running without stopping PLC scans", () => {
  let state = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  const count = state.scanCount;
  const next = changePracticeScanProject(
    state, setTagValue(state.project, CONVEYOR_SENSOR_TAG, true));
  assert.equal(next.mode, "running");
  assert.equal(next.scanCount, count);
  assert.equal(readConveyorBool(next.project, CONVEYOR_SENSOR_TAG), true);
});
