import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact,
  createRung,
  findInstruction,
  initialPracticeProject,
  insertInstruction,
  moveInstruction,
  moveToParallel,
  removeInstruction,
  changeInstructionTag,
} from "../src/plc/practiceDocument.ts";
import { findVisualLadderDropTarget } from "../src/plc/ladderDragDrop.ts";

const xic = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const xio = (id, tag = "Stop_PB") => ({ id, kind: "XIO", tag });
const ote = (id, tag = "Motor_Run") => ({ id, kind: "OTE", tag });

test("OR branch belongs to one anchor and can be edited independently", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("start"));
  p = addParallelContact(p, "rung-1", "start", xio("bypass"));
  assert.equal(p.rungs[0].parallelBranches?.[0].anchorId, "start");
  assert.equal(findInstruction(p, "bypass")?.lane, "parallel");
  p = changeInstructionTag(p, "bypass", "Auto_Mode");
  assert.equal(p.rungs[0].parallelBranches?.[0].contact.tag, "Auto_Mode");
  assert.throws(() => addParallelContact(p, "rung-1", "start", xio("again")), /ya tiene una rama/);
  assert.throws(() => addParallelContact(p, "rung-1", "start", ote("wrong")), /solo admiten/);
  p = removeInstruction(p, "start");
  assert.equal(p.rungs[0].instructions[0]?.id, "bypass");
  assert.deepEqual(p.rungs[0].parallelBranches, []);
});

test("reordering same rung preserves contact order and moves the OR group together", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = insertInstruction(p, "rung-1", 1, xio("b"));
  p = insertInstruction(p, "rung-1", 2, xic("c"));
  p = addParallelContact(p, "rung-1", "b", xic("branch"));
  p = insertInstruction(p, "rung-1", 3, ote("out"));
  const original = p;
  p = moveInstruction(p, "b", "rung-1", 3);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["a", "c", "b", "out"]);
  assert.equal(p.rungs[0].parallelBranches?.[0].contact.id, "branch");
  assert.equal(original.rungs[0].instructions[1].id, "b");
  p = moveInstruction(p, "branch", "rung-1", 0);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["branch", "a", "c", "b", "out"]);
  assert.deepEqual(p.rungs[0].parallelBranches, []);
});

test("cross-rung moves are atomic and reject duplicate OTE without deleting source", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = addParallelContact(p, "rung-1", "a", xio("parallel"));
  p = insertInstruction(p, "rung-1", 1, ote("out-1"));
  p = insertInstruction(p, "rung-2", 0, ote("out-2", "Lamp_Run"));
  assert.throws(() => moveInstruction(p, "out-1", "rung-2", 0), /ya contiene/);
  assert.ok(findInstruction(p, "out-1"));
  const moved = moveInstruction(p, "a", "rung-2", 0);
  assert.equal(findInstruction(moved, "a")?.rungId, "rung-2");
  assert.equal(findInstruction(moved, "parallel")?.rungId, "rung-2");
  assert.equal(findInstruction(p, "a")?.rungId, "rung-1");
});

test("dragging an existing contact below another contact creates an OR", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-2", 0, xio("stop"));
  const lowerTarget = findVisualLadderDropTarget(p, "rung-1", "XIO", 175, 170, 760, "stop");
  assert.equal(lowerTarget?.lane, "parallel");
  assert.equal(lowerTarget?.anchorId, "start");
  p = moveToParallel(p, "stop", "rung-1", "start");
  assert.equal(p.rungs[1].instructions.length, 0);
  assert.equal(p.rungs[0].parallelBranches?.[0].contact.id, "stop");
  assert.equal(findVisualLadderDropTarget(p, "rung-1", "XIC", 175, 170, 760)?.lane, undefined);
});

test("a contact with an OR cannot become a parallel branch itself", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("a"));
  p = insertInstruction(p, "rung-1", 1, xic("b"));
  p = addParallelContact(p, "rung-1", "a", xio("sub"));
  assert.throws(() => moveToParallel(p, "a", "rung-1", "b"), /rama asociada/);
  assert.deepEqual(p.rungs[0].parallelBranches?.map((b) => b.anchorId), ["a"]);
});
