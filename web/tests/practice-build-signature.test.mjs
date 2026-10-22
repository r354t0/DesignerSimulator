import test from "node:test";
import assert from "node:assert/strict";
import { getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import {
  initialPracticeProject, insertInstruction, changeInstructionTag,
  editTag, setTagValue, createParallelBranch, addParallelContact,
} from "../src/plc/practiceDocument.ts";

test("Monitor Tags values do not invalidate the structural Build", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, { id: "i1", kind: "XIC", tag: "Start_PB" });
  p = insertInstruction(p, "rung-1", 1, { id: "o1", kind: "OTE", tag: "Motor_Run" });
  const signature = getPracticeBuildSignature(p);
  const valueChange = setTagValue(p, "Start_PB", true);
  assert.equal(getPracticeBuildSignature(valueChange), signature);
  const descriptionChange = editTag(p, "Start_PB", { description: "Arranque de proceso" });
  assert.equal(getPracticeBuildSignature(descriptionChange), signature);
});

test("editing operands, adding OR branches and tag types invalidates Build", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, { id: "i1", kind: "XIC", tag: "Start_PB" });
  const baseline = getPracticeBuildSignature(p);
  const readdressed = changeInstructionTag(p, "i1", "Stop_PB");
  assert.notEqual(getPracticeBuildSignature(readdressed), baseline);
  const newBranch = createParallelBranch(p, "rung-1", "i1");
  assert.notEqual(getPracticeBuildSignature(newBranch), baseline);
  const populated = addParallelContact(newBranch, "rung-1", "i1", { id: "b1", kind: "XIC", tag: "Auto_Mode" });
  assert.notEqual(getPracticeBuildSignature(populated), getPracticeBuildSignature(newBranch));
  const constantOutput = editTag(p, "Motor_Run", { constant: true });
  assert.notEqual(getPracticeBuildSignature(constantOutput), baseline);
});

test("signatures are stable over deep copies", () => {
  const p = initialPracticeProject();
  assert.equal(getPracticeBuildSignature(p), getPracticeBuildSignature(structuredClone(p)));
});
