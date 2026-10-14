import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact,
  createParallelBranch,
  removeParallelBranch,
  createRung,
  findInstruction,
  initialPracticeProject,
  insertInstruction,
  moveInstruction,
  moveToParallel,
  removeInstruction,
  changeInstructionTag,
} from "../src/plc/practiceDocument.ts";
import { findVisualLadderDropTarget, getRungGeometry } from "../src/plc/ladderDragDrop.ts";

const xic = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const xio = (id, tag = "Stop_PB") => ({ id, kind: "XIO", tag });
const ote = (id, tag = "Motor_Run") => ({ id, kind: "OTE", tag });

test("create empty OR branch independently; insert multiple serial contacts later", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("start"));
  p = createParallelBranch(p, "rung-1", "start");
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions, []);
  assert.equal(findVisualLadderDropTarget(p, "rung-1", "XIO", 175, 166, 760)?.position, 0);

  p = addParallelContact(p, "rung-1", "start", xio("stop"));
  p = addParallelContact(p, "rung-1", "start", xic("auto"));
  p = addParallelContact(p, "rung-1", "start", xic("manual"), 1);
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id),
    ["stop", "manual", "auto"]);
  assert.equal(findInstruction(p, "manual")?.lane, "parallel");
  p = changeInstructionTag(p, "manual", "Auto_Mode");
  assert.equal(p.rungs[0].parallelBranches?.[0].instructions[1].tag, "Auto_Mode");
  p = createParallelBranch(p, "rung-1", "start");
  assert.equal(p.rungs[0].parallelBranches?.length, 2);
  assert.deepEqual(p.rungs[0].parallelBranches?.[1].instructions, []);
  // Preserve the legacy delete-all overload when branch ID is omitted.
  p = removeParallelBranch(p, "rung-1", "start", p.rungs[0].parallelBranches[1].id);
  assert.throws(() => addParallelContact(p, "rung-1", "start", ote("wrong")), /solo admiten/);
  p = removeInstruction(p, "manual");
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id), ["stop", "auto"]);
  p = removeInstruction(p, "stop");
  p = removeInstruction(p, "auto");
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions, [], "Empty branch remains editable");
  p = removeParallelBranch(p, "rung-1", "start");
  assert.deepEqual(p.rungs[0].parallelBranches, []);
});

test("moving OR group in one rung preserves all contacts and order", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = insertInstruction(p, "rung-1", 1, xio("b"));
  p = insertInstruction(p, "rung-1", 2, xic("c"));
  p = createParallelBranch(p, "rung-1", "b");
  p = addParallelContact(p, "rung-1", "b", xic("branch1"));
  p = addParallelContact(p, "rung-1", "b", xio("branch2"));
  p = insertInstruction(p, "rung-1", 3, ote("out"));
  const original = p;
  p = moveInstruction(p, "b", "rung-1", 3);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["a", "c", "b", "out"]);
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id), ["branch1", "branch2"]);
  assert.equal(original.rungs[0].instructions[1].id, "b");

  p = moveInstruction(p, "branch1", "rung-1", 0);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id),
    ["branch1", "a", "c", "b", "out"]);
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id), ["branch2"]);
});

test("cross-rung moves keep OR groups and reject duplicate OTE atomically", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = addParallelContact(p, "rung-1", "a", xio("parallel"));
  p = addParallelContact(p, "rung-1", "a", xic("parallel2"));
  p = insertInstruction(p, "rung-1", 1, ote("out-1"));
  p = insertInstruction(p, "rung-2", 0, ote("out-2", "Lamp_Run"));
  assert.throws(() => moveInstruction(p, "out-1", "rung-2", 0), /ya contiene/);
  assert.ok(findInstruction(p, "out-1"));
  const moved = moveInstruction(p, "a", "rung-2", 0);
  assert.equal(findInstruction(moved, "a")?.rungId, "rung-2");
  assert.equal(findInstruction(moved, "parallel")?.rungId, "rung-2");
  assert.equal(findInstruction(moved, "parallel2")?.rungId, "rung-2");
  assert.equal(findInstruction(p, "a")?.rungId, "rung-1");
});

test("dragging an existing contact below another creates an OR or appends to existing", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-2", 0, xio("stop"));
  const target = findVisualLadderDropTarget(p, "rung-1", "XIO", 175, 170, 760, "stop");
  assert.equal(target?.lane, "parallel");
  assert.equal(target?.anchorId, "start");
  p = moveToParallel(p, "stop", "rung-1", "start");
  assert.equal(p.rungs[1].instructions.length, 0);
  assert.equal(p.rungs[0].parallelBranches?.[0].instructions[0].id, "stop");
  assert.equal(findVisualLadderDropTarget(p, "rung-1", "XIC", 175, 170, 760)?.lane, "parallel");
  p = insertInstruction(p, "rung-2", 0, xic("new"));
  p = moveToParallel(p, "new", "rung-1", "start", 0);
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id), ["new", "stop"]);
  p = moveToParallel(p, "stop", "rung-1", "start", 0);
  assert.deepEqual(p.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id), ["stop", "new"]);
});

test("nested branches remain blocked and empty OR survives removal of last contact", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = insertInstruction(p, "rung-1", 1, xic("b"));
  p = createParallelBranch(p, "rung-1", "a");
  p = addParallelContact(p, "rung-1", "a", xio("sub"));
  assert.throws(() => moveToParallel(p, "a", "rung-1", "b"), /rama asociada/);
  assert.deepEqual(p.rungs[0].parallelBranches?.map((b) => b.anchorId), ["a"]);
  p = removeInstruction(p, "a");
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["sub", "b"]);
  assert.deepEqual(p.rungs[0].parallelBranches, []);

  p = createParallelBranch(p, "rung-1", "b");
  p = removeInstruction(p, "b");
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["sub"]);
  assert.deepEqual(p.rungs[0].parallelBranches, []);
});

test("wide OR paths gain dynamic room for text and additional contacts", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("anchor"));
  const initial = getRungGeometry(p.rungs[0], 760);
  p = createParallelBranch(p, "rung-1", "anchor");
  p = addParallelContact(p, "rung-1", "anchor", xic("one"));
  p = addParallelContact(p, "rung-1", "anchor", xio("two"));
  p = addParallelContact(p, "rung-1", "anchor", xic("three"));
  const wide = getRungGeometry(p.rungs[0], 760);
  assert.equal(wide.width, initial.width,
    "three OR contacts must fit in the base editor without forced scrolling");
  assert.equal(wide.groups[0].branchCenters.length, 3);
  assert.equal(wide.groups[0].branchCenters[1] - wide.groups[0].branchCenters[0], 104);
  assert.equal(findVisualLadderDropTarget(p, "rung-1", "XIC", wide.groups[0].branchCenters[1], 166, wide.width)?.lane, "parallel");
});
