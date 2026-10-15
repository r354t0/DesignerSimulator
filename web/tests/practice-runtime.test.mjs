import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSeriesScan, getUnsupportedSeriesRungs, stopSeriesScan,
} from "../src/plc/practiceRuntime.ts";
import {
  initialPracticeProject, insertInstruction, createRung, createParallelBranch,
  setTagValue, createTag,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const xic = (id, tag) => ({ id, kind: "XIC", tag });
const xio = (id, tag) => ({ id, kind: "XIO", tag });
const ote = (id, tag) => ({ id, kind: "OTE", tag });
const get = (project, name) => project.tags.find((tag) => tag.name === name)?.value;

function series() {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("start", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, xio("stop", "Stop_PB"));
  p = insertInstruction(p, "rung-1", 2, ote("motor", "Motor_Run"));
  return p;
}

test("Build-valid XIC/XIO AND rung updates OTE to TRUE when conditions conduct", () => {
  let p = series();
  assert.equal(buildPracticeProject(p).success, true);
  p = setTagValue(p, "Start_PB", true);
  const result = evaluateSeriesScan(p);
  assert.equal(get(result.project, "Motor_Run"), true);
  assert.equal(result.rungPower["rung-1"], true);
  assert.deepEqual(result.instructionFlow.start,
    { powerIn: true, condition: true, powerOut: true, value: true });
  assert.deepEqual(result.instructionFlow.stop,
    { powerIn: true, condition: true, powerOut: true, value: false });
  assert.deepEqual(result.instructionFlow.motor,
    { powerIn: true, condition: true, powerOut: true, value: true });
  assert.equal(get(p, "Motor_Run"), false, "scans must not mutate caller data");
});

test("FALSE XIC and TRUE XIO suppress downstream power and reset OTE", () => {
  const initial = series();
  const falseXic = evaluateSeriesScan(initial);
  assert.equal(falseXic.instructionFlow.start.powerOut, false);
  assert.equal(falseXic.instructionFlow.stop.condition, true);
  assert.equal(falseXic.instructionFlow.stop.powerOut, false);
  let p = setTagValue(initial, "Start_PB", true);
  p = setTagValue(p, "Stop_PB", true);
  p = setTagValue(p, "Motor_Run", true);
  const scan = evaluateSeriesScan(p);
  assert.equal(scan.instructionFlow.start.powerOut, true);
  assert.equal(scan.instructionFlow.stop.condition, false);
  assert.equal(scan.instructionFlow.stop.powerOut, false);
  assert.equal(get(scan.project, "Motor_Run"), false);
});

test("scan is idempotent and no-op preserves project reference", () => {
  let p = series();
  const idle = evaluateSeriesScan(p);
  assert.strictEqual(idle.project, p);
  p = setTagValue(p, "Start_PB", true);
  const first = evaluateSeriesScan(p);
  const second = evaluateSeriesScan(first.project);
  assert.strictEqual(second.project, first.project);
  assert.deepEqual(second.writes, first.writes);
});

test("rungs evaluate top-to-bottom using OTE values from earlier rungs", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("a", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, ote("out-a", "Motor_Run"));
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, xic("b", "Motor_Run"));
  p = insertInstruction(p, "rung-2", 1, ote("out-b", "Lamp_Run"));
  p = setTagValue(p, "Start_PB", true);
  const scan = evaluateSeriesScan(p);
  assert.equal(get(scan.project, "Motor_Run"), true);
  assert.equal(get(scan.project, "Lamp_Run"), true);
  assert.equal(scan.instructionFlow.b.value, true);
  assert.equal(scan.rungPower["rung-2"], true);
});

test("rungs without OTE are non-writing; unconditional OTE writes TRUE", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("only", "Start_PB"));
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, ote("out", "Motor_Run"));
  const scan = evaluateSeriesScan(p);
  assert.equal(scan.rungPower["rung-1"], false);
  assert.equal(scan.rungPower["rung-2"], true);
  assert.equal(get(scan.project, "Motor_Run"), true);
});

test("STOP resets OTE-written outputs but preserves inputs and unrelated BOOL values", () => {
  let p = series();
  p = setTagValue(p, "Start_PB", true);
  p = setTagValue(p, "Lamp_Run", true);
  p = evaluateSeriesScan(p).project;
  const stopped = stopSeriesScan(p);
  assert.equal(get(stopped, "Motor_Run"), false);
  assert.equal(get(stopped, "Start_PB"), true);
  assert.equal(get(stopped, "Lamp_Run"), true);
  assert.strictEqual(stopSeriesScan(stopped), stopped);
});

test("Stage 2B rejects populated and empty OR lanes instead of silently ignoring them", () => {
  let p = series();
  p = createParallelBranch(p, "rung-1", "start");
  assert.deepEqual(getUnsupportedSeriesRungs(p), ["rung-1"]);
  assert.throws(() => evaluateSeriesScan(p), /Etapa C/);
  assert.equal(buildPracticeProject(p).success, false); // empty OR is already a Build error
  const branchId = p.rungs[0].parallelBranches[0].id;
  const patched = { ...p, rungs: p.rungs.map((rung) => ({
    ...rung, parallelBranches: rung.parallelBranches?.map((branch) => ({
      ...branch, instructions: branch.id === branchId
        ? [xic("parallel", "Auto_Mode")] : branch.instructions,
    })),
  })) };
  assert.equal(buildPracticeProject(patched).success, true);
  assert.throws(() => evaluateSeriesScan(patched), /Etapa C/);
});

test("invalid BOOL reference and unsupported opcode fail fast", () => {
  let p = series();
  let damaged = { ...p, rungs: p.rungs.map((rung) => ({
    ...rung, instructions: rung.instructions.map((i) => i.id === "start"
      ? { ...i, tag: "NOT_DEFINED" } : i),
  })) };
  assert.throws(() => evaluateSeriesScan(damaged), /incompatible/);
  p = createTag(p, "Analog_SP", "setpoint", "REAL");
  damaged = { ...p, rungs: p.rungs.map((rung) => ({
    ...rung, instructions: rung.instructions.map((i) => i.id === "start"
      ? { ...i, kind: "MOV" } : i),
  })) };
  assert.throws(() => evaluateSeriesScan(damaged), /no ejecutable/);
});
