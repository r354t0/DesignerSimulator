import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTag, insertInstruction, setTagValue } from "../src/plc/practiceDocument.ts";
import {
  applyMomentaryBoolInput, applySceneSensorBoolInput,
  initialPracticeScanState, startPracticeScans, setScanPeriod,
  tickPracticeScan, pausePracticeScans, stopPracticeScans,
} from "../src/plc/practiceScanCycle.ts";
import {
  addConveyorItem, createConveyorExampleProject,
  initialConveyorState, readConveyorBool, readConveyorCount, stepConveyor,
  CONVEYOR_SENSOR_TAG, CONVEYOR_SENSOR_POSITION,
  CONVEYOR_BELT_LENGTH_PX, CONVEYOR_BOX_WIDTH_PX,
} from "../src/plc/conveyorSceneModel.ts";

test("PE-01 goes LOW for a visually open gap, not a generous detection halo", () => {
  const state = {
    ...initialConveyorState(),
    items: [{ id: 1, position: 0.713 }, { id: 2, position: 0.603 }],
    nextId: 3,
    sensorActive: true,
  };
  // Both boxes have passed neither sensor nor exit; center separation 0.11
  // leaves 0.11 - 44/505 > 0 gap units.
  assert.ok(0.713 - 0.603 > CONVEYOR_BOX_WIDTH_PX / CONVEYOR_BELT_LENGTH_PX);
  const next = stepConveyor(state, true, 50);
  assert.equal(next.items.length, 2);
  assert.equal(next.sensorActive, false,
    "a visible gap between edges must de-energize the photoeye");
  assert.ok(next.items.every(item =>
    Math.abs(item.position - CONVEYOR_SENSOR_POSITION) >
      CONVEYOR_BOX_WIDTH_PX / (2 * CONVEYOR_BELT_LENGTH_PX)));
});

test("two consecutive boxes count twice at 500ms PLC scan without missing short sensor LOW", () => {
  let plc = startPracticeScans(setScanPeriod(
    initialPracticeScanState(createConveyorExampleProject()), 500));
  plc = applyMomentaryBoolInput(plc, "Start_PB", true);
  plc = applyMomentaryBoolInput(plc, "Start_PB", false);
  assert.equal(readConveyorBool(plc.project, "Motor_Run"), true);
  let belt = addConveyorItem(initialConveyorState());
  const edges = [];
  let clearedWithTwoBoxes = false;

  for (let i = 0; i < 160; i++) {
    // Create the second box while the first one is further down the belt.
    if (i === 15) {
      belt = addConveyorItem(belt);
      assert.equal(belt.items.length, 2);
    }
    const next = stepConveyor(belt, readConveyorBool(plc.project, "Motor_Run"), 50);
    if (next.sensorActive !== belt.sensorActive) {
      edges.push(next.sensorActive);
      if (!next.sensorActive && next.items.length === 2) clearedWithTwoBoxes = true;
      plc = applySceneSensorBoolInput(plc, CONVEYOR_SENSOR_TAG, next.sensorActive);
    }
    belt = next;
    // A slow, independent cyclic scan cannot be relied on for the gap.
    if ((i + 1) % 10 === 0) plc = tickPracticeScan(plc);
  }
  assert.deepEqual(edges, [true, false, true, false],
    "both rising edges must be separated by a real false reading");
  assert.ok(clearedWithTwoBoxes, "sensor clears while both boxes remain on the belt");
  assert.equal(readConveyorCount(plc.project), 2);
  assert.equal(belt.passed, 2);
  assert.equal(readConveyorBool(plc.project, CONVEYOR_SENSOR_TAG), false);
});

test("box entry enforces enough clearance for a physical sensor to read separation", () => {
  let belt = addConveyorItem(initialConveyorState());
  for (let i = 0; i < 9; i++) belt = stepConveyor(belt, true, 50);
  assert.strictEqual(addConveyorItem(belt), belt, "entrance still blocked");
  for (let i = 0; i < 6; i++) belt = stepConveyor(belt, true, 50);
  belt = addConveyorItem(belt);
  assert.equal(belt.items.length, 2);
  const clearance = belt.items[0].position - belt.items[1].position -
    CONVEYOR_BOX_WIDTH_PX / CONVEYOR_BELT_LENGTH_PX;
  assert.ok(clearance >= 0.05, "visible minimum gap exists between physical boxes");
});

test("photocell changes cannot artificially tick TON or scan while PAUSE/STOP", () => {
  let p = createConveyorExampleProject();
  p = createTag(p, "T_Wait", "Temporizador auxiliar", "TIMER");
  p = setTagValue(p, "T_Wait", 1000, "PRE");
  p = insertInstruction(p, "rung-1", 1,
    { id: "rising-delay", kind: "TON", tag: "T_Wait" });
  let plc = startPracticeScans(initialPracticeScanState(p));
  const acc = s => s.project.tags.find(t => t.name === "T_Wait").value.ACC;
  const initial = acc(plc);
  plc = applySceneSensorBoolInput(plc, CONVEYOR_SENSOR_TAG, true);
  plc = applySceneSensorBoolInput(plc, CONVEYOR_SENSOR_TAG, false);
  assert.equal(acc(plc), initial, "two photoeye edges must add zero timer ms");
  const held = plc.scanCount;
  plc = pausePracticeScans(plc);
  plc = applySceneSensorBoolInput(plc, CONVEYOR_SENSOR_TAG, true);
  assert.equal(plc.scanCount, held);
  plc = stopPracticeScans(plc);
  const stopped = plc.scanCount;
  plc = applySceneSensorBoolInput(plc, CONVEYOR_SENSOR_TAG, false);
  assert.equal(plc.scanCount, stopped);
});

test("duplicate photoeye observations produce no extra scans", () => {
  let state = startPracticeScans(
    initialPracticeScanState(createConveyorExampleProject()));
  const initial = state.scanCount;
  state = applySceneSensorBoolInput(state, CONVEYOR_SENSOR_TAG, true);
  assert.equal(state.scanCount, initial + 1);
  assert.strictEqual(applySceneSensorBoolInput(
    state, CONVEYOR_SENSOR_TAG, true), state);
  state = applySceneSensorBoolInput(state, CONVEYOR_SENSOR_TAG, false);
  assert.equal(state.scanCount, initial + 2);
  assert.strictEqual(applySceneSensorBoolInput(
    state, CONVEYOR_SENSOR_TAG, false), state);
});

test("photoeye input wiring uses edge-driven scans and same physical SVG width", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const svg = readFileSync(new URL("../src/components/ide/ConveyorScene.tsx", import.meta.url), "utf8");
  assert.match(app,/applySceneSensorBoolInput\(current, CONVEYOR_SENSOR_TAG, next\.sensorActive\)/);
  assert.match(svg,/width=\{CONVEYOR_BOX_WIDTH_PX\}/);
  assert.match(svg,/item\.position \* CONVEYOR_BELT_LENGTH_PX/);
  assert.match(svg,/CONVEYOR_SENSOR_POSITION \* CONVEYOR_BELT_LENGTH_PX/);
});
