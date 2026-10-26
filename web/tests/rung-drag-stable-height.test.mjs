import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, createRung, insertInstruction,
  createParallelBranch, addParallelContact,
} from "../src/plc/practiceDocument.ts";
import {
  findWrappedLadderDropTarget, getWrappedRungLayout,
} from "../src/plc/ladderWrappedLayout.ts";
import {
  PRACTICE_MAIN_HEIGHT, PRACTICE_MAIN_Y, PRACTICE_BRANCH_Y,
} from "../src/plc/ladderDragDrop.ts";

const contact = (id) => ({ id, kind: "XIC", tag: "Start_PB" });
const output = (id) => ({ id, kind: "OTE", tag: "Motor_Run" });

test("drag targeting does not create provisional OR lanes in a compact rung", () => {
  let project = insertInstruction(initialPracticeProject(), "rung-1", 0, contact("start"));
  const rung = project.rungs[0];
  const initialHeight = getWrappedRungLayout(rung, 760).height;
  assert.equal(initialHeight, PRACTICE_MAIN_HEIGHT);

  for (const kind of ["XIC", "XIO", "ONS", "EQU", "MOV", "ADD", "OTE", "CTU"]) {
    const target = findWrappedLadderDropTarget(project, "rung-1", kind, 130, PRACTICE_MAIN_Y, 760);
    assert.equal(target?.lane, "main", kind);
    assert.equal(getWrappedRungLayout(rung, 760).height, initialHeight, kind);
    assert.equal(findWrappedLadderDropTarget(
      project, "rung-1", kind, 130, PRACTICE_BRANCH_Y, 760,
    ), null, "No phantom lower OR lane during " + kind + " drag");
  }
});

test("dragging more output instructions never reserves an extra output row", () => {
  let project = insertInstruction(initialPracticeProject(), "rung-1", 0, contact("start"));
  project = insertInstruction(project, "rung-1", 1, output("motor"));
  const height = getWrappedRungLayout(project.rungs[0], 760).height;
  assert.equal(height, PRACTICE_MAIN_HEIGHT);

  for (const kind of ["OTE", "OTL", "MOV", "TON", "CTD"]) {
    const target = findWrappedLadderDropTarget(
      project, "rung-1", kind, 650, PRACTICE_MAIN_Y, 760,
    );
    assert.equal(target?.lane, "main", kind);
    assert.equal(getWrappedRungLayout(project.rungs[0], 760).height, height);
    assert.equal(findWrappedLadderDropTarget(
      project, "rung-1", kind, 650, height + 40, 760,
    ), null, "No provisional output branch outside its actual bounds");
  }
});

test("adding actual OR lanes reserves room, and drag targeting keeps them accessible", () => {
  let project = insertInstruction(initialPracticeProject(), "rung-1", 0, contact("anchor"));
  assert.equal(getWrappedRungLayout(project.rungs[0], 760).height, PRACTICE_MAIN_HEIGHT);

  project = createParallelBranch(project, "rung-1", "anchor");
  const branch = project.rungs[0].parallelBranches[0];
  project = addParallelContact(project, "rung-1", "anchor", contact("or-contact"), 0, branch.id);
  const originalHeight = getWrappedRungLayout(project.rungs[0], 760).height;
  assert.ok(originalHeight > PRACTICE_MAIN_HEIGHT);
  const target = findWrappedLadderDropTarget(project, "rung-1", "XIO",
    136, PRACTICE_BRANCH_Y, 760);
  assert.equal(target?.lane, "parallel");
  assert.equal(target?.branchId, branch.id);
  assert.equal(getWrappedRungLayout(project.rungs[0], 760).height, originalHeight);
});

test("many stacked rungs keep identical height and order when locating a drag target", () => {
  let project = initialPracticeProject();
  for (let i = 2; i <= 45; i++) project = createRung(project, "rung-" + i);
  for (let i = 1; i <= 45; i++) {
    project = insertInstruction(project, "rung-" + i, 0, contact("contact-" + i));
  }
  const before = project.rungs.map((r) => getWrappedRungLayout(r, 760).height);
  assert.equal(before.reduce((a,b) => a + b, 0), 45 * PRACTICE_MAIN_HEIGHT);
  for (const rung of project.rungs) {
    const target = findWrappedLadderDropTarget(
      project, rung.id, "XIO", 110, PRACTICE_MAIN_Y, 760,
    );
    assert.equal(target?.lane, "main");
  }
  const after = project.rungs.map((r) => getWrappedRungLayout(r, 760).height);
  assert.deepEqual(after, before);
  assert.deepEqual(project.rungs.map(r => r.id), before.map((_,i)=>"rung-" + (i+1)));
});
