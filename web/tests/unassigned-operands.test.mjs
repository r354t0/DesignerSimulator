import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact,
  changeInstructionTag,
  copyInstructionTag,
  createRung,
  findInstruction,
  initialPracticeProject,
  insertInstruction,
  moveInstruction,
  moveToParallel,
  createParallelBranch,
} from "../src/plc/practiceDocument.ts";

const blank = (id, kind = "XIC") => ({ id, kind, tag: "" });

test("new XIC XIO OTE instructions may be inserted with no tag", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, blank("c1"));
  p = insertInstruction(p, "rung-1", 1, blank("c2", "XIO"));
  p = insertInstruction(p, "rung-1", 2, blank("out", "OTE"));
  assert.deepEqual(p.rungs[0].instructions.map((part) => [part.kind, part.tag]), [
    ["XIC", ""], ["XIO", ""], ["OTE", ""],
  ]);
  assert.equal(p.tags.length, 5, "unassigned references must not create tags");
  assert.throws(() => insertInstruction(p, "rung-1", 2, blank("second", "OTE")), /ya contiene/);
});

test("empty contact can anchor an OR branch and blank OR instructions can move between rungs", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, blank("main"));
  p = createParallelBranch(p, "rung-1", "main");
  p = addParallelContact(p, "rung-1", "main", blank("parallel", "XIO"));
  p = moveInstruction(p, "main", "rung-2", 0);
  assert.equal(findInstruction(p, "main")?.instruction.tag, "");
  assert.equal(findInstruction(p, "parallel")?.rungId, "rung-2");
  p = moveToParallel(p, "parallel", "rung-2", "main", 0);
  assert.equal(findInstruction(p, "parallel")?.instruction.tag, "");
});

test("click/selecting BOOL tag assigns a blank operand and permits clearing", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, blank("c1"));
  p = changeInstructionTag(p, "c1", "Start_PB");
  assert.equal(findInstruction(p, "c1")?.instruction.tag, "Start_PB");
  p = changeInstructionTag(p, "c1", "");
  assert.equal(findInstruction(p, "c1")?.instruction.tag, "");
  assert.throws(() => changeInstructionTag(p, "c1", "does_not_exist"), /existente/);
});

test("drag tag from assigned source to blank target copies reference only", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, { id: "source", kind: "XIC", tag: "Start_PB" });
  p = insertInstruction(p, "rung-1", 1, blank("target", "OTE"));
  const before = p;
  p = copyInstructionTag(p, "source", "target");
  assert.equal(findInstruction(p, "target")?.instruction.tag, "Start_PB");
  assert.equal(findInstruction(p, "target")?.instruction.kind, "OTE");
  assert.equal(findInstruction(p, "source")?.instruction.tag, "Start_PB");
  assert.equal(findInstruction(before, "target")?.instruction.tag, "");
  assert.equal(p.tags.length, 5);
});

test("unassigned source cannot be dragged as a copied tag", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, blank("source"));
  p = insertInstruction(p, "rung-1", 1, blank("target"));
  assert.throws(() => copyInstructionTag(p, "source", "target"), /no tiene un tag asignado/);
  assert.equal(findInstruction(p, "target")?.instruction.tag, "");
});
