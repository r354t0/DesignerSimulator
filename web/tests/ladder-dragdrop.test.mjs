import test from "node:test";
import assert from "node:assert/strict";
import { initialPracticeProject, insertInstruction, createRung } from "../src/plc/practiceDocument.ts";
import { findLadderDropTarget, isEditableKind } from "../src/plc/ladderDragDrop.ts";

test("accept only implemented Ladder instruction tools", () => {
  assert.equal(isEditableKind("XIC"), true);
  assert.equal(isEditableKind("XIO"), true);
  assert.equal(isEditableKind("OTE"), true);
  assert.equal(isEditableKind("TON"), true);
  assert.equal(isEditableKind("<script>"), false);
});

test("a contact snaps to the nearest insertion gap in an empty rung", () => {
  const project = initialPracticeProject();
  assert.deepEqual(findLadderDropTarget(project, "rung-1", "XIC", 105, 760),
    { kind: "XIC", position: 0, x: 98 });
  assert.equal(findLadderDropTarget(project, "rung-1", "XIC", 740, 760), null);
  assert.equal(findLadderDropTarget(project, "missing", "XIC", 105, 760), null);
});

test("contact insert slots are calculated before and after the existing contacts", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, { id: "c1", kind: "XIC", tag: "Start_PB" });
  project = insertInstruction(project, "rung-1", 1, { id: "c2", kind: "XIO", tag: "Stop_PB" });
  assert.equal(findLadderDropTarget(project, "rung-1", "XIC", 105, 760)?.position, 0);
  assert.equal(findLadderDropTarget(project, "rung-1", "XIO", 188, 760)?.position, 1);
  assert.equal(findLadderDropTarget(project, "rung-1", "XIO", 392, 760)?.position, 2);
});

test("OTE snaps to the right-hand coil terminal and permits parallel output coils", () => {
  let project = initialPracticeProject();
  assert.deepEqual(findLadderDropTarget(project, "rung-1", "OTE", 250, 760),
    { kind: "OTE", position: 0, x: 671 });
  project = insertInstruction(project, "rung-1", 0, { id: "output", kind: "OTE", tag: "Motor_Run" });
  assert.deepEqual(findLadderDropTarget(project, "rung-1", "OTE", 630, 760),
    { kind: "OTE", position: 0, x: 671 });
  assert.equal(findLadderDropTarget(project, "rung-1", "XIC", 110, 760)?.position, 0);
});

test("unrelated rungs and full contact capacity are handled correctly", () => {
  let project = createRung(initialPracticeProject(), "rung-2");
  for (let i = 0; i < 32; i++) {
    project = insertInstruction(project, "rung-1", i, {
      id: "contact-" + i, kind: "XIC", tag: "Start_PB",
    });
  }
  assert.equal(findLadderDropTarget(project, "rung-1", "XIC", 200, 1610), null);
  assert.equal(findLadderDropTarget(project, "rung-2", "XIO", 105, 760)?.position, 0);
  assert.equal(findLadderDropTarget(project, "rung-2", "XIO", NaN, 760), null);
});
