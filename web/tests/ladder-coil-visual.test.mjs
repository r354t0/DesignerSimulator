import test from "node:test";
import assert from "node:assert/strict";
import { getCoilVisualState } from "../src/plc/ladderCoilVisual.ts";
import {
  PRACTICE_MAIN_Y, PRACTICE_MAIN_HEIGHT, PRACTICE_OR_HEIGHT,
  PRACTICE_BRANCH_Y, getPracticeRungHeight,
} from "../src/plc/ladderDragDrop.ts";
import { getWrappedRungLayout } from "../src/plc/ladderWrappedLayout.ts";
import { initialPracticeProject, insertInstruction } from "../src/plc/practiceDocument.ts";

const contact = (id, kind = "ONS") => ({ id, kind, tag: "Start_PB" });

test("retentive OTL stays illuminated after conductor power falls", () => {
  assert.deepEqual(getCoilVisualState("OTL", true, false, true),
    { symbolLive: true, conductorLive: false });
  assert.deepEqual(getCoilVisualState("OTU", true, false, true),
    { symbolLive: true, conductorLive: false });
  assert.deepEqual(getCoilVisualState("OTL", true, false, false),
    { symbolLive: false, conductorLive: false });
  assert.deepEqual(getCoilVisualState("OTU", true, false, false),
    { symbolLive: false, conductorLive: false });
});

test("OTE remains nonretentive; wires always represent input power", () => {
  assert.deepEqual(getCoilVisualState("OTE", true, false, true),
    { symbolLive: false, conductorLive: false });
  assert.deepEqual(getCoilVisualState("OTE", true, true, false),
    { symbolLive: true, conductorLive: true });
  assert.deepEqual(getCoilVisualState("OTL", true, true, false),
    { symbolLive: false, conductorLive: true });
  for (const kind of ["OTE", "OTL", "OTU"]) {
    assert.deepEqual(getCoilVisualState(kind, false, true, true),
      { symbolLive: false, conductorLive: false });
  }
});

test("rung clearance includes the ONS lower legend and selection", () => {
  // Contact center is at y=81; ONS text baseline extends to y=101.
  assert.ok(PRACTICE_MAIN_HEIGHT - (PRACTICE_MAIN_Y + 22) >= 8);
  assert.ok(PRACTICE_OR_HEIGHT - (PRACTICE_BRANCH_Y + 22) >= 8);
  assert.equal(getPracticeRungHeight(0), PRACTICE_MAIN_HEIGHT);
  assert.equal(getPracticeRungHeight(1), PRACTICE_OR_HEIGHT);

  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, contact("ons"));
  const layout = getWrappedRungLayout(project.rungs[0], 760);
  assert.equal(layout.height, PRACTICE_MAIN_HEIGHT);
  assert.ok(layout.height - (layout.rows[0].mainY + 22) >= 8);
});
