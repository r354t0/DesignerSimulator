import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact, createParallelBranch, createRung, findInstruction,
  getPaletteInsertionTarget, getParallelBranchTarget,
  initialPracticeProject, insertInstruction, moveInstruction,
  moveToParallel, removeInstruction, removeParallelBranch,
} from "../src/plc/practiceDocument.ts";
import {
  getRungGeometry, findVisualLadderDropTarget,
  PRACTICE_BRANCH_Y, PRACTICE_BRANCH_GAP,
} from "../src/plc/ladderDragDrop.ts";

const xic = (id) => ({ id, kind: "XIC", tag: "" });
const xio = (id) => ({ id, kind: "XIO", tag: "" });
const ote = (id) => ({ id, kind: "OTE", tag: "" });

test("repeated OR toolbar clicks create individually identifiable stacked lanes", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("anchor"));
  for (let i = 0; i < 3; i++) {
    const selection = getParallelBranchTarget(p, "anchor", "rung-1");
    assert.deepEqual(selection, { rungId: "rung-1", anchorId: "anchor" });
    p = createParallelBranch(p, selection.rungId, selection.anchorId);
  }
  const branches = p.rungs[0].parallelBranches;
  assert.equal(branches.length, 3);
  assert.equal(new Set(branches.map((branch) => branch.id)).size, 3);
  assert.ok(branches.every((branch) => branch.instructions.length === 0));
  let geometry = getRungGeometry(p.rungs[0]);
  assert.deepEqual(geometry.groups[0].branchLanes.map((lane) => lane.y),
    [PRACTICE_BRANCH_Y, PRACTICE_BRANCH_Y + PRACTICE_BRANCH_GAP, PRACTICE_BRANCH_Y + PRACTICE_BRANCH_GAP * 2]);
  p = removeParallelBranch(p, "rung-1", "anchor", branches[1].id);
  assert.deepEqual(p.rungs[0].parallelBranches.map((branch) => branch.id),
    [branches[0].id, branches[2].id]);
  geometry = getRungGeometry(p.rungs[0]);
  assert.equal(geometry.groups[0].branchLanes.length, 2);
});

test("insert into different branches and move contacts without affecting siblings", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("anchor"));
  p = createParallelBranch(p, "rung-1", "anchor");
  p = createParallelBranch(p, "rung-1", "anchor");
  const [first, second] = p.rungs[0].parallelBranches;
  p = addParallelContact(p, "rung-1", "anchor", xic("first-contact"), 0, first.id);
  p = addParallelContact(p, "rung-1", "anchor", xio("second-contact"), 0, second.id);
  const target = findVisualLadderDropTarget(p, "rung-1", "XIC", 175,
    PRACTICE_BRANCH_Y + PRACTICE_BRANCH_GAP, 760);
  assert.equal(target?.branchId, second.id);
  assert.equal(findInstruction(p, "second-contact")?.branchId, second.id);
  p = moveToParallel(p, "first-contact", "rung-1", "anchor", 1, second.id);
  assert.deepEqual(p.rungs[0].parallelBranches[0].instructions, []);
  assert.deepEqual(p.rungs[0].parallelBranches[1].instructions.map((part) => part.id),
    ["second-contact", "first-contact"]);
  p = removeInstruction(p, "first-contact");
  assert.deepEqual(p.rungs[0].parallelBranches[1].instructions.map((part) => part.id),
    ["second-contact"]);
});

test("insertion target respects rung, selected main contact, branch contact and coil", () => {
  let p = initialPracticeProject();
  assert.deepEqual(getPaletteInsertionTarget(p, null, "rung-1", "XIC"),
    { rungId: "rung-1", position: 0 });
  assert.equal(getPaletteInsertionTarget(p, null, null, "XIC"), null);
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = insertInstruction(p, "rung-1", 1, xio("b"));
  p = insertInstruction(p, "rung-1", 2, ote("out"));
  p = createParallelBranch(p, "rung-1", "a");
  const branchId = p.rungs[0].parallelBranches[0].id;
  p = addParallelContact(p, "rung-1", "a", xic("sub"), 0, branchId);
  assert.deepEqual(getPaletteInsertionTarget(p, null, "rung-1", "XIO"),
    { rungId: "rung-1", position: 2 });
  assert.deepEqual(getPaletteInsertionTarget(p, "a", "rung-1", "XIC"),
    { rungId: "rung-1", position: 1 });
  assert.deepEqual(getPaletteInsertionTarget(p, "b", "rung-1", "OTE"),
    { rungId: "rung-1", position: 2 });
  assert.deepEqual(getPaletteInsertionTarget(p, "sub", "rung-1", "XIO"),
    { rungId: "rung-1", anchorId: "a", branchId, position: 1 });
  assert.deepEqual(getPaletteInsertionTarget(p, "out", "rung-1", "XIC"),
    { rungId: "rung-1", position: 2 });
});

test("moving main anchor preserves every parallel lane, and removing anchor refuses data loss", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("main"));
  p = createParallelBranch(p, "rung-1", "main");
  p = createParallelBranch(p, "rung-1", "main");
  const [first, second] = p.rungs[0].parallelBranches;
  p = addParallelContact(p, "rung-1", "main", xio("or-a"), 0, first.id);
  p = addParallelContact(p, "rung-1", "main", xic("or-b"), 0, second.id);
  assert.throws(() => removeInstruction(p, "main"), /varias ramas/);
  const previous = p;
  p = moveInstruction(p, "main", "rung-2", 0);
  assert.equal(findInstruction(p, "or-a")?.rungId, "rung-2");
  assert.equal(findInstruction(p, "or-b")?.rungId, "rung-2");
  assert.equal(p.rungs[1].parallelBranches.length, 2);
  assert.equal(previous.rungs[0].parallelBranches.length, 2);
});
