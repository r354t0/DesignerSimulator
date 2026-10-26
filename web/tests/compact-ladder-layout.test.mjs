import test from "node:test";
import assert from "node:assert/strict";
import { initialPracticeProject, insertInstruction, createParallelBranch, addParallelContact } from "../src/plc/practiceDocument.ts";
import {
  CONTACT_STEP, COIL_RIGHT_INSET, FIRST_CONTACT_X, GROUP_HALF_WIDTH,
  MIN_RUNG_WIDTH, getRungGeometry, findVisualLadderDropTarget,
  PRACTICE_BRANCH_Y,
} from "../src/plc/ladderDragDrop.ts";

const contact = (id) => ({ id, kind: "XIC", tag: "" });
const coil = { id: "coil", kind: "OTE", tag: "" };

function serial(count) {
  let project = initialPracticeProject();
  for (let index = 0; index < count; index++) {
    project = insertInstruction(project, "rung-1", index, contact("c" + index));
  }
  project = insertInstruction(project, "rung-1", count, coil);
  return project.rungs[0];
}

test("four or five contacts plus the output coil fit in a standard 760px rung", () => {
  for (const count of [4, 5]) {
    const geometry = getRungGeometry(serial(count), 760);
    assert.equal(geometry.width, 760, "unnecessary horizontal scrolling for " + count + " contacts");
    assert.equal(geometry.groups.length, count);
    assert.equal(geometry.coilX, 760 - COIL_RIGHT_INSET);
    assert.equal(geometry.groups[0].x, FIRST_CONTACT_X);
    assert.equal(geometry.groups.at(-1).x, FIRST_CONTACT_X + (count - 1) * CONTACT_STEP);
    assert.ok(geometry.coilX - geometry.groups.at(-1).x >= 115,
      "reserve space for OTE tags and comments");
    for (let i = 1; i < geometry.groups.length; i++) {
      assert.ok(geometry.groups[i].left - geometry.groups[i - 1].right >= 14,
        "branch connectors must remain separated");
    }
  }
});

test("six through eight contacts expand smoothly rather than compressing symbols", () => {
  const five = getRungGeometry(serial(5), 760);
  const six = getRungGeometry(serial(6), 760);
  const eight = getRungGeometry(serial(8), 760);
  assert.equal(five.width, 760);
  assert.ok(six.width > 760);
  assert.ok(eight.width > six.width);
  assert.equal(six.groups[1].x - six.groups[0].x, CONTACT_STEP);
  assert.equal(six.coilX - six.groups.at(-1).x, 117);
});

test("minimum width shrinks to narrower docks and preserves right output margin", () => {
  const geometry = getRungGeometry(serial(1), 420);
  assert.equal(geometry.width, MIN_RUNG_WIDTH);
  assert.equal(geometry.coilX, geometry.width - COIL_RIGHT_INSET);
  const enlarged = getRungGeometry(serial(1), 1300);
  assert.equal(enlarged.width, 1300);
  assert.equal(enlarged.groups[0].x, FIRST_CONTACT_X,
    "maximizing the editor should extend wire length, not instruction spacing");
});

test("three OR contacts share the same compact cells, retain branch insert targeting", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, contact("anchor"));
  project = createParallelBranch(project, "rung-1", "anchor");
  for (let i = 0; i < 3; i++) {
    project = addParallelContact(project, "rung-1", "anchor", contact("or" + i));
  }
  const geometry = getRungGeometry(project.rungs[0], 760);
  assert.equal(geometry.width, 760);
  assert.equal(geometry.groups[0].branchCenters.length, 3);
  assert.equal(geometry.groups[0].branchCenters[2] - geometry.groups[0].branchCenters[0],
    CONTACT_STEP * 2);
  assert.equal(geometry.groups[0].left, FIRST_CONTACT_X - GROUP_HALF_WIDTH);
  const target = findVisualLadderDropTarget(project, "rung-1", "XIO",
    geometry.groups[0].branchCenters[1], PRACTICE_BRANCH_Y, geometry.width);
  assert.equal(target?.lane, "parallel");
  assert.equal(target?.branchId, project.rungs[0].parallelBranches[0].id);
});
