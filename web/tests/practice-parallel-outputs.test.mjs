import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PARALLEL_OUTPUTS, addParallelContact, changeInstructionTag,
  createParallelBranch, initialPracticeProject, insertInstruction,
  removeInstruction, moveInstruction, createRung, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { getWrappedRungLayout, findWrappedLadderDropTarget, OUTPUT_BRANCH_STEP } from "../src/plc/ladderWrappedLayout.ts";
import { getRungGeometry, findLadderDropTarget } from "../src/plc/ladderDragDrop.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan, stopSeriesScan } from "../src/plc/practiceRuntime.ts";
import { getBitMenuTarget, invertInstructionBit } from "../src/plc/practiceBitMenu.ts";

const xic = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const ote = (id, tag = "") => ({ id, kind: "OTE", tag });
const val = (project, tag) => project.tags.find((item) => item.name === tag)?.value;

function outputs() {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-1", 1, ote("motor", "Motor_Run"));
  p = insertInstruction(p, "rung-1", 1, ote("lamp", "Lamp_Run"));
  return p;
}

test("separate OTE branches write TRUE/FALSE simultaneously and STOP resets all", () => {
  let p = outputs();
  assert.deepEqual(p.rungs[0].instructions.map((item) => item.id), ["start", "motor", "lamp"]);
  assert.deepEqual(buildPracticeProject(p).diagnostics, []);
  p = setTagValue(p, "Start_PB", true);
  let scan = evaluateSeriesScan(p);
  assert.equal(scan.writes.Motor_Run, true);
  assert.equal(scan.writes.Lamp_Run, true);
  assert.equal(val(scan.project, "Motor_Run"), true);
  assert.equal(val(scan.project, "Lamp_Run"), true);
  const stopped = stopSeriesScan(scan.project);
  assert.equal(val(stopped, "Motor_Run"), false);
  assert.equal(val(stopped, "Lamp_Run"), false);
  assert.equal(val(stopped, "Start_PB"), true);
  p = setTagValue(scan.project, "Start_PB", false);
  scan = evaluateSeriesScan(p);
  assert.equal(val(scan.project, "Motor_Run"), false);
  assert.equal(val(scan.project, "Lamp_Run"), false);
});

test("multi-output rung also responds to OR-contact branches", () => {
  let p = outputs();
  p = createParallelBranch(p, "rung-1", "start");
  const branchId = p.rungs[0].parallelBranches[0].id;
  p = addParallelContact(p, "rung-1", "start", xic("auto", "Auto_Mode"), 0, branchId);
  assert.equal(buildPracticeProject(p).success, true);
  p = setTagValue(p, "Auto_Mode", true);
  const scan = evaluateSeriesScan(p);
  assert.equal(scan.branchPower[branchId], true);
  assert.equal(scan.rungPower["rung-1"], true);
  assert.deepEqual(scan.writes, { Motor_Run: true, Lamp_Run: true });
});

test("palette OR on an OTE can add a blank second coil, requiring its own tag before RUN", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-1", 1, ote("motor", "Motor_Run"));
  p = insertInstruction(p, "rung-1", 1, ote("new-coil"));
  let result = buildPracticeProject(p);
  assert.equal(result.success, false);
  assert.equal(result.diagnostics.find((d) => d.instructionId === "new-coil")?.code, "MISSING_TAG");
  p = changeInstructionTag(p, "new-coil", "Lamp_Run");
  result = buildPracticeProject(p);
  assert.equal(result.success, true);
});

test("individual deletion and cross-rung movement preserve other outputs", () => {
  let p = outputs();
  p = removeInstruction(p, "motor");
  assert.deepEqual(p.rungs[0].instructions.map((item) => item.id), ["start", "lamp"]);
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, ote("other", "Motor_Run"));
  p = moveInstruction(p, "lamp", "rung-2", 0);
  assert.deepEqual(p.rungs[1].instructions.map((item) => item.id), ["other", "lamp"]);
  assert.equal(p.rungs[0].instructions[0].id, "start");
});

test("editor draws each parallel output separately with stable shared x and enough height", () => {
  const p = outputs();
  const layout = getWrappedRungLayout(p.rungs[0], 760);
  assert.equal(layout.outputYs.length, 2);
  assert.equal(layout.outputYs[1] - layout.outputYs[0], OUTPUT_BRANCH_STEP);
  assert.equal(layout.outputYs[0], layout.coilY);
  assert.ok(layout.height - layout.outputYs[1] >= 16, "no clipped coil at bottom");
  assert.equal(layout.coilX, getRungGeometry(p.rungs[0], 760).coilX);
  // Dragging a third output must NOT grow the current rung (or move its siblings).
  // Targeting stays in the existing output lane; the new branch is created only
  // when the user actually drops the instruction.
  const drop = findWrappedLadderDropTarget(
    p, "rung-1", "OTE", layout.coilX, layout.outputYs.at(-1), 760,
  );
  assert.equal(drop?.lane, "main");
  assert.equal(drop?.kind, "OTE");
  assert.equal(getWrappedRungLayout(p.rungs[0], 760).height, layout.height);
  assert.equal(findWrappedLadderDropTarget(
    p, "rung-1", "OTE", layout.coilX, layout.height + 40, 760,
  ), null, "dragging must not reveal a provisional third output lane");
  assert.ok(findLadderDropTarget(p, "rung-1", "OTE", layout.coilX, 760));
});

test("output limit is guarded by editor model and Build", () => {
  let p = initialPracticeProject();
  for (let i = 0; i < MAX_PARALLEL_OUTPUTS; i++) {
    p = insertInstruction(p, "rung-1", 0, ote("out-" + i, "Lamp_Run"));
  }
  assert.throws(() => insertInstruction(p, "rung-1", 0, ote("overflow")), /Máximo 8/);
  const malformed = { ...p, rungs: [{ ...p.rungs[0],
    instructions: [...p.rungs[0].instructions, ote("overflow", "Motor_Run")] }] };
  assert.ok(buildPracticeProject(malformed).diagnostics.some((d) => d.code === "OUTPUT_LIMIT"));
});

test("right-click bit inversion flips a BOOL once and respects OTE ownership", () => {
  let p = outputs();
  assert.equal(getBitMenuTarget(p, "start", true)?.editable, true);
  p = invertInstructionBit(p, "start", true);
  assert.equal(val(p, "Start_PB"), true);
  p = invertInstructionBit(p, "start", true);
  assert.equal(val(p, "Start_PB"), false);
  assert.throws(() => invertInstructionBit(p, "start", false), /Inicia RUN/);
  assert.throws(() => invertInstructionBit(p, "motor", true), /OTE/);
  assert.throws(() => invertInstructionBit(p, "lamp", true), /OTE/);
});
