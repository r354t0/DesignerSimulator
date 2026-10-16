import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact,
  changeInstructionTag,
  copyInstructionTag,
  createRung,
  initialPracticeProject,
  insertInstruction,
} from "../src/plc/practiceDocument.ts";

const item = (id, kind, tag) => ({ id, kind, tag });

test("copy tag from XIC to XIO changes only target reference, not either instruction", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, item("src", "XIC", "Start_PB"));
  project = insertInstruction(project, "rung-1", 1, item("dst", "XIO", "Stop_PB"));
  const previous = project;
  project = copyInstructionTag(project, "src", "dst");

  assert.equal(project.rungs[0].instructions[0].tag, "Start_PB");
  assert.deepEqual(project.rungs[0].instructions.map((i) => [i.id, i.kind]), [
    ["src", "XIC"], ["dst", "XIO"],
  ]);
  assert.equal(project.rungs[0].instructions[1].tag, "Start_PB");
  assert.equal(previous.rungs[0].instructions[1].tag, "Stop_PB");
  assert.equal(project.tags.length, previous.tags.length);
});

test("copy tag between different rungs including a coil", () => {
  let project = createRung(initialPracticeProject(), "rung-2");
  project = insertInstruction(project, "rung-1", 0, item("src", "XIC", "Auto_Mode"));
  project = insertInstruction(project, "rung-2", 0, item("coil", "OTE", "Motor_Run"));
  project = copyInstructionTag(project, "src", "coil");
  assert.equal(project.rungs[0].instructions[0].tag, "Auto_Mode");
  assert.equal(project.rungs[1].instructions[0].tag, "Auto_Mode");
  assert.equal(project.rungs[1].instructions[0].kind, "OTE");
});

test("copy from and to contacts in OR branch without affecting topology", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, item("anchor", "XIC", "Start_PB"));
  project = addParallelContact(project, "rung-1", "anchor", item("or1", "XIO", "Stop_PB"));
  project = addParallelContact(project, "rung-1", "anchor", item("or2", "XIC", "Auto_Mode"));
  project = copyInstructionTag(project, "or1", "or2");
  assert.equal(project.rungs[0].parallelBranches?.[0].instructions[1].tag, "Stop_PB");
  project = copyInstructionTag(project, "or2", "anchor");
  assert.equal(project.rungs[0].instructions[0].tag, "Stop_PB");
  assert.deepEqual(project.rungs[0].parallelBranches?.[0].instructions.map((i) => i.id), ["or1", "or2"]);
});

test("ignore same instruction and same tag; reject missing source or target", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, item("a", "XIC", "Start_PB"));
  project = insertInstruction(project, "rung-1", 1, item("b", "XIO", "Start_PB"));
  assert.strictEqual(copyInstructionTag(project, "a", "a"), project);
  assert.strictEqual(copyInstructionTag(project, "a", "b"), project);
  assert.throws(() => copyInstructionTag(project, "fake", "a"), /origen/);
  assert.throws(() => copyInstructionTag(project, "a", "fake"), /destino/);
});

test("renamed source tag copies its current reference", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, item("a", "XIC", "Start_PB"));
  project = insertInstruction(project, "rung-1", 1, item("b", "OTE", "Motor_Run"));
  project = changeInstructionTag(project, "a", "Lamp_Run");
  project = copyInstructionTag(project, "a", "b");
  assert.equal(project.rungs[0].instructions[1].tag, "Lamp_Run");
});
