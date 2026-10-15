import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, insertInstruction, createEmptyOutputBranch,
  removeEmptyOutputBranch, fillEmptyOutputBranch, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { getWrappedRungLayout, findWrappedLadderDropTarget } from "../src/plc/ladderWrappedLayout.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";

const xic = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const ote = (id, tag = "") => ({ id, kind: "OTE", tag });
function populated() {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-1", 1, ote("motor", "Motor_Run"));
  return p;
}
test("OR on selected OTE only creates EMPTY conductor with no new instruction", () => {
  const before = populated();
  const next = createEmptyOutputBranch(before, "rung-1");
  assert.deepEqual(next.rungs[0].instructions, before.rungs[0].instructions);
  assert.equal(next.rungs[0].instructions.filter((i) => i.kind === "OTE").length, 1);
  assert.deepEqual(next.rungs[0].emptyOutputBranches, ["output-or-1"]);
  assert.notEqual(getPracticeBuildSignature(next), getPracticeBuildSignature(before));
  const result = buildPracticeProject(next);
  assert.equal(result.success, false);
  assert.equal(result.diagnostics.find((d) => d.code === "EMPTY_OUTPUT_BRANCH")?.branchId, "output-or-1");
});

test("select empty lane and insert OTE from palette, then assign BOOL and RUN", () => {
  let p = createEmptyOutputBranch(populated(), "rung-1");
  p = fillEmptyOutputBranch(p, "rung-1", "output-or-1", ote("lamp"));
  assert.deepEqual(p.rungs[0].emptyOutputBranches, []);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["start", "motor", "lamp"]);
  assert.equal(buildPracticeProject(p).diagnostics.some((d) => d.code === "MISSING_TAG"), true);
  p = { ...p, rungs: p.rungs.map((r) => ({ ...r,
    instructions: r.instructions.map((i) => i.id === "lamp" ? { ...i, tag: "Lamp_Run" } : i),
  })) };
  assert.equal(buildPracticeProject(p).success, true);
  p = setTagValue(p, "Start_PB", true);
  const run = evaluateSeriesScan(p);
  assert.equal(run.writes.Motor_Run, true);
  assert.equal(run.writes.Lamp_Run, true);
});

test("remove empty lane with Supr operation without deleting connected outputs", () => {
  let p = createEmptyOutputBranch(populated(), "rung-1");
  p = createEmptyOutputBranch(p, "rung-1");
  assert.deepEqual(p.rungs[0].emptyOutputBranches, ["output-or-1", "output-or-2"]);
  p = removeEmptyOutputBranch(p, "rung-1", "output-or-1");
  assert.deepEqual(p.rungs[0].emptyOutputBranches, ["output-or-2"]);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["start", "motor"]);
  p = removeEmptyOutputBranch(p, "rung-1", "output-or-2");
  assert.equal(buildPracticeProject(p).success, true);
});

test("empty output lane reserves drawing space and exposes drop target for OTE", () => {
  const p = createEmptyOutputBranch(populated(), "rung-1");
  const layout = getWrappedRungLayout(p.rungs[0], 760);
  assert.equal(layout.outputYs.length, 1);
  assert.equal(layout.emptyOutputYs.length, 1);
  assert.ok(layout.emptyOutputYs[0] > layout.outputYs[0]);
  assert.ok(layout.height > layout.emptyOutputYs[0]);
  const target = findWrappedLadderDropTarget(p, "rung-1", "OTE",
    layout.coilX, layout.emptyOutputYs[0], 760);
  assert.equal(target?.branchId, "output-or-1");
  assert.equal(target?.y, layout.emptyOutputYs[0]);
});

test("only OTEs can fill empty output branches and unselected lane remains untouched", () => {
  let p = createEmptyOutputBranch(populated(), "rung-1");
  assert.throws(() => fillEmptyOutputBranch(p, "rung-1", "output-or-1", xic("bad")), /OTE/);
  assert.throws(() => fillEmptyOutputBranch(p, "rung-1", "unknown", ote("bad")), /vacía/);
  p = fillEmptyOutputBranch(p, "rung-1", "output-or-1", ote("ok"));
  assert.equal(p.rungs[0].instructions.length, 3);
  assert.throws(() => removeEmptyOutputBranch(p, "rung-1", "output-or-1"), /No existe/);
});

test("limits count completed coils together with empty lanes", () => {
  let p = populated();
  for (let i = 0; i < 7; i++) p = createEmptyOutputBranch(p, "rung-1");
  assert.throws(() => createEmptyOutputBranch(p, "rung-1"), /Máximo 8/);
  const build = buildPracticeProject(p);
  assert.equal(build.diagnostics.filter((d) => d.code === "EMPTY_OUTPUT_BRANCH").length, 7);
  const noCoil = initialPracticeProject();
  assert.throws(() => createEmptyOutputBranch(noCoil, "rung-1"), /bobina OTE/);
});


test("a reserved eighth empty output lane can be filled but a ninth output is rejected", () => {
  let p = populated();
  for (let i = 0; i < 7; i++) p = createEmptyOutputBranch(p, "rung-1");
  assert.throws(() => insertInstruction(p, "rung-1", 0, ote("ninth")), /Máximo 8/);
  p = fillEmptyOutputBranch(p, "rung-1", "output-or-7", ote("eighth"));
  assert.equal(p.rungs[0].instructions.filter((item) => item.kind === "OTE").length, 2);
  assert.equal(p.rungs[0].emptyOutputBranches.length, 6);
  assert.equal(buildPracticeProject(p).diagnostics.filter((d) => d.code === "OUTPUT_LIMIT").length, 0);
  assert.throws(() => createEmptyOutputBranch(p, "rung-1"), /Máximo 8/);
});
