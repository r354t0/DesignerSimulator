import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, insertInstruction, createIndependentParallelBranch,
  addParallelContact, insertIntoIndependentOrUpper, setTagValue,
} from "../src/plc/practiceDocument.ts";
import {
  CONTACT_STEP, FIRST_CONTACT_X, GROUP_HALF_WIDTH, getRungGeometry,
} from "../src/plc/ladderDragDrop.ts";
import {
  findWrappedLadderDropTarget, getWrappedRungLayout,
} from "../src/plc/ladderWrappedLayout.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";

const contact = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
function orProject() {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, contact("start"));
  project = insertInstruction(project, "rung-1", 1,
    { id: "motor", kind: "OTE", tag: "Motor_Run" });
  project = createIndependentParallelBranch(project, "rung-1", "start");
  const anchor = project.rungs[0].instructions.find((item) =>
    item.kind === "OR_JUNCTION").id;
  const lane = project.rungs[0].parallelBranches[0].id;
  return { project, anchor, lane };
}
function orGroup(project, anchor) {
  const geometry = getRungGeometry(project.rungs[0], 760);
  const group = geometry.groups.find((item) => item.anchorId === anchor);
  assert.ok(group, "The OR group must be in the geometry");
  return group;
}

test("an invisible OR anchor has no extra visual column before the upper contact", () => {
  let { project, anchor, lane } = orProject();
  project = insertIntoIndependentOrUpper(project, "rung-1", anchor,
    contact("upper", "Auto_Mode"));
  project = addParallelContact(project, "rung-1", anchor,
    contact("lower", "Lamp_Run"), 0, lane);

  const group = orGroup(project, anchor);
  assert.equal(group.right - group.left, GROUP_HALF_WIDTH * 2,
    "one real contact on each side needs exactly one column");
  assert.equal(group.mainCenters.length, 2, "junction remains in the logical main list");
  assert.equal(group.mainCenters[0], group.left,
    "invisible junction is located on the left branch rail");
  assert.equal(group.mainCenters[1], group.branchLanes[0].centers[0],
    "first upper and lower contacts must align horizontally");
  assert.equal(group.mainCenters[1], group.left + GROUP_HALF_WIDTH);
  assert.equal(group.mainCenters[1] - group.mainCenters[0], GROUP_HALF_WIDTH,
    "no phantom CONTACT_STEP between junction and visible XIC");

  const wrapped = getWrappedRungLayout(project.rungs[0], 760);
  const rowGroup = wrapped.groups.find((item) => item.anchorId === anchor);
  assert.equal(rowGroup.mainCenters[1], rowGroup.branchLanes[0].centers[0],
    "wrapped coordinates must preserve alignment");
  assert.equal(rowGroup.mainCenters[0], rowGroup.left);
});

test("the OR with no upper instruction still uses only one real branch column", () => {
  let { project, anchor, lane } = orProject();
  project = addParallelContact(project, "rung-1", anchor,
    contact("lower", "Auto_Mode"), 0, lane);
  const group = orGroup(project, anchor);
  assert.equal(group.right - group.left, GROUP_HALF_WIDTH * 2);
  assert.equal(group.mainCenters.length, 1);
  assert.equal(group.mainCenters[0], group.left);
  assert.equal(group.branchLanes[0].centers[0], group.left + GROUP_HALF_WIDTH);
  assert.equal(buildPracticeProject(project).success, true);
  const target = findWrappedLadderDropTarget(project, "rung-1", "XIC",
    group.left + GROUP_HALF_WIDTH, 73, 760);
  assert.equal(target?.lane, "upper");
  assert.equal(target?.anchorId, anchor);
});

test("OR size follows the longer visible path, never the structural anchor", () => {
  let { project, anchor, lane } = orProject();
  project = insertIntoIndependentOrUpper(project, "rung-1", anchor,
    contact("upper1", "Auto_Mode"));
  project = insertIntoIndependentOrUpper(project, "rung-1", anchor,
    contact("upper2", "Lamp_Run"));
  project = addParallelContact(project, "rung-1", anchor,
    contact("lower", "Stop_PB"), 0, lane);

  const group = orGroup(project, anchor);
  assert.equal(group.right - group.left, CONTACT_STEP + GROUP_HALF_WIDTH * 2,
    "two real upper contacts occupy two slots, not three");
  assert.equal(group.mainCenters[1], group.branchLanes[0].centers[0]);
  assert.equal(group.mainCenters[2] - group.mainCenters[1], CONTACT_STEP);
  assert.equal(group.mainCenters[0], group.left);

  const after = findWrappedLadderDropTarget(project, "rung-1", "XIC",
    group.right + 17, 73, 760);
  assert.equal(after?.lane, "main", "an instruction can still be inserted after the OR reunion");
});

test("removing a phantom column doesn't change flow or rung height", () => {
  let { project, anchor, lane } = orProject();
  project = insertIntoIndependentOrUpper(project, "rung-1", anchor,
    contact("upper", "Auto_Mode"));
  project = addParallelContact(project, "rung-1", anchor,
    contact("lower", "Lamp_Run"), 0, lane);
  project = setTagValue(project, "Start_PB", true);
  project = setTagValue(project, "Auto_Mode", false);
  project = setTagValue(project, "Lamp_Run", true);
  assert.equal(evaluateSeriesScan(project).project.tags.find((item) =>
    item.name === "Motor_Run").value, true);
  const height = getWrappedRungLayout(project.rungs[0], 760).height;
  assert.ok(height >= 182, "the real lower OR path still retains its vertical room");
  assert.equal(orGroup(project, anchor).mainCenters[1], FIRST_CONTACT_X + CONTACT_STEP);
});
