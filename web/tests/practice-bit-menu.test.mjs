import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact, createParallelBranch, createTag,
  initialPracticeProject, insertInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { getBitMenuTarget } from "../src/plc/practiceBitMenu.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";

const xic = (id, tag) => ({ id, tag, kind: "XIC" });
const ote = (id, tag) => ({ id, tag, kind: "OTE" });
const tagValue = (project, name) => project.tags.find((tag) => tag.name === name)?.value;

test("right-click writable input is enabled during RUN; changing it updates OTE", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("input", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, ote("motor", "Motor_Run"));
  assert.deepEqual(getBitMenuTarget(p, "input", true), {
    instructionId: "input", tagName: "Start_PB", value: false, editable: true,
  });
  assert.equal(getBitMenuTarget(p, "input", false)?.editable, false);
  p = setTagValue(p, "Start_PB", true);
  const scan = evaluateSeriesScan(p);
  assert.equal(tagValue(scan.project, "Motor_Run"), true);
  assert.equal(getBitMenuTarget(scan.project, "input", true)?.value, true);
});

test("OTE outputs remain protected both on the coil and referenced contacts", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("start", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, ote("out", "Motor_Run"));
  p = insertInstruction(p, "rung-1", 1, xic("feedback", "Motor_Run"));
  assert.equal(getBitMenuTarget(p, "out", true)?.editable, false);
  assert.match(getBitMenuTarget(p, "feedback", true)?.reason, /OTE/);
});

test("missing operands, constants and undefined references cannot be changed", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("unset", ""));
  assert.match(getBitMenuTarget(p, "unset", true)?.reason, /Asigna/);
  p = insertInstruction(p, "rung-1", 1, xic("input", "Start_PB"));
  const constant = { ...p, tags: p.tags.map((tag) =>
    tag.name === "Start_PB" ? { ...tag, constant: true } : tag) };
  assert.equal(getBitMenuTarget(constant, "input", true)?.editable, false);
  assert.match(getBitMenuTarget(constant, "input", true)?.reason, /constante/);
  assert.equal(getBitMenuTarget(p, "unknown", true), null);
});

test("branch contacts use same bit menu and remain writable during RUN", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("main", "Start_PB"));
  p = createParallelBranch(p, "rung-1", "main");
  const branchId = p.rungs[0].parallelBranches[0].id;
  p = addParallelContact(p, "rung-1", "main", xic("bypass", "Auto_Mode"), 0, branchId);
  assert.equal(getBitMenuTarget(p, "bypass", true)?.editable, true);
});

test("many OR contacts do not prevent insertion of additional main contacts", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("main", "Start_PB"));
  p = createParallelBranch(p, "rung-1", "main");
  const branchId = p.rungs[0].parallelBranches[0].id;
  for (let i = 0; i < 10; i++) {
    p = addParallelContact(p, "rung-1", "main", xic("branch-" + i, "Auto_Mode"), i, branchId);
  }
  p = insertInstruction(p, "rung-1", 1, xic("after-or", "Stop_PB"));
  p = insertInstruction(p, "rung-1", 2, ote("output", "Motor_Run"));
  assert.deepEqual(p.rungs[0].instructions.map((item) => item.id),
    ["main", "after-or", "output"]);
  assert.equal(p.rungs[0].parallelBranches[0].instructions.length, 10);
});
