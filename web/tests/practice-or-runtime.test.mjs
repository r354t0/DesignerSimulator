import test from "node:test";
import assert from "node:assert/strict";
import {
  addParallelContact, createParallelBranch, createRung, createTag,
  initialPracticeProject, insertInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan, stopSeriesScan } from "../src/plc/practiceRuntime.ts";

const xic = (id, tag) => ({ id, kind: "XIC", tag });
const xio = (id, tag) => ({ id, kind: "XIO", tag });
const ote = (id, tag) => ({ id, kind: "OTE", tag });
const value = (project, name) => project.tags.find((tag) => tag.name === name)?.value;

function createThreeWayOr() {
  let p = initialPracticeProject();
  p = createTag(p, "Bypass", "Rama auxiliar", "BOOL");
  p = insertInstruction(p, "rung-1", 0, xic("main", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, xio("permissive", "Stop_PB"));
  p = insertInstruction(p, "rung-1", 2, ote("coil", "Motor_Run"));
  p = createParallelBranch(p, "rung-1", "main");
  p = createParallelBranch(p, "rung-1", "main");
  const [a, b] = p.rungs[0].parallelBranches;
  p = addParallelContact(p, "rung-1", "main", xic("a1", "Auto_Mode"), 0, a.id);
  p = addParallelContact(p, "rung-1", "main", xic("b1", "Lamp_Run"), 0, b.id);
  p = addParallelContact(p, "rung-1", "main", xio("b2", "Bypass"), 1, b.id);
  return { p, a: a.id, b: b.id };
}

test("three-way OR merges any one energized path and keeps downstream AND", () => {
  const { p, a, b } = createThreeWayOr();
  assert.equal(buildPracticeProject(p).success, true);
  const set = (source, name, flag) => setTagValue(source, name, flag);

  const scenarios = [
    { main: 0, auto: 0, lamp: 0, bypass: 1, stop: 0, output: false },
    { main: 1, auto: 0, lamp: 0, bypass: 1, stop: 0, output: true },
    { main: 0, auto: 1, lamp: 0, bypass: 1, stop: 0, output: true },
    { main: 0, auto: 0, lamp: 1, bypass: 0, stop: 0, output: true },
    { main: 0, auto: 0, lamp: 1, bypass: 1, stop: 0, output: false },
    { main: 0, auto: 1, lamp: 1, bypass: 1, stop: 1, output: false },
    { main: 1, auto: 1, lamp: 1, bypass: 0, stop: 0, output: true },
  ];

  for (const scenario of scenarios) {
    let state = p;
    for (const [tag, flag] of [
      ["Start_PB", scenario.main], ["Auto_Mode", scenario.auto],
      ["Lamp_Run", scenario.lamp], ["Bypass", scenario.bypass], ["Stop_PB", scenario.stop],
    ]) state = set(state, tag, flag === 1);
    const result = evaluateSeriesScan(state);
    assert.equal(value(result.project, "Motor_Run"), scenario.output, JSON.stringify(scenario));
    assert.equal(result.rungPower["rung-1"], scenario.output);
    assert.equal(result.branchInput[a], true);
    assert.equal(result.branchInput[b], true);
  }
});

test("individual OR flow records distinguish main contact, serial branch, merge and output", () => {
  const { p, a, b } = createThreeWayOr();
  let state = setTagValue(p, "Lamp_Run", true);
  const scan = evaluateSeriesScan(state);
  assert.equal(scan.instructionFlow.main.powerOut, false);
  assert.equal(scan.instructionFlow.a1.powerOut, false);
  assert.equal(scan.instructionFlow.b1.powerIn, true);
  assert.equal(scan.instructionFlow.b1.powerOut, true);
  assert.equal(scan.instructionFlow.b2.condition, true);
  assert.equal(scan.instructionFlow.b2.powerOut, true);
  assert.equal(scan.branchPower[a], false);
  assert.equal(scan.branchPower[b], true);
  assert.equal(scan.joinedPower.main, true);
  assert.equal(scan.instructionFlow.permissive.powerIn, true);
  assert.equal(scan.instructionFlow.coil.powerIn, true);

  state = setTagValue(state, "Stop_PB", true);
  const stoppedByInterlock = evaluateSeriesScan(state);
  assert.equal(stoppedByInterlock.joinedPower.main, true);
  assert.equal(stoppedByInterlock.instructionFlow.permissive.powerOut, false);
  assert.equal(stoppedByInterlock.rungPower["rung-1"], false);
});

test("serial OR contact with TRUE tag does not conduct if previous contact blocked the lane", () => {
  const { p, b } = createThreeWayOr();
  let state = setTagValue(p, "Bypass", false);
  const scan = evaluateSeriesScan(state);
  assert.equal(scan.instructionFlow.b1.value, false);
  assert.equal(scan.instructionFlow.b1.powerOut, false);
  assert.equal(scan.instructionFlow.b2.condition, true);
  assert.equal(scan.instructionFlow.b2.powerIn, false);
  assert.equal(scan.instructionFlow.b2.powerOut, false);
  assert.equal(scan.branchPower[b], false);
});

test("two different parallel groups in series require both groups to conduct", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("g1", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, xic("g2", "Stop_PB"));
  p = insertInstruction(p, "rung-1", 2, ote("out", "Motor_Run"));
  p = createParallelBranch(p, "rung-1", "g1");
  p = createParallelBranch(p, "rung-1", "g2");
  const [a, b] = p.rungs[0].parallelBranches;
  p = addParallelContact(p, "rung-1", "g1", xic("or-a", "Auto_Mode"), 0, a.id);
  p = addParallelContact(p, "rung-1", "g2", xic("or-b", "Lamp_Run"), 0, b.id);
  assert.equal(buildPracticeProject(p).success, true);

  p = setTagValue(p, "Auto_Mode", true);
  let run = evaluateSeriesScan(p);
  assert.equal(run.joinedPower.g1, true);
  assert.equal(run.joinedPower.g2, false);
  assert.equal(value(run.project, "Motor_Run"), false);

  p = setTagValue(p, "Lamp_Run", true);
  run = evaluateSeriesScan(p);
  assert.equal(run.joinedPower.g1, true);
  assert.equal(run.joinedPower.g2, true);
  assert.equal(value(run.project, "Motor_Run"), true);
});

test("top-to-bottom order uses energized OR output immediately in next rung", () => {
  let { p, a } = createThreeWayOr();
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, xic("downstream", "Motor_Run"));
  p = insertInstruction(p, "rung-2", 1, ote("lamp", "Lamp_Run"));
  p = setTagValue(p, "Auto_Mode", true);
  const result = evaluateSeriesScan(p);
  assert.equal(result.branchPower[a], true);
  assert.equal(value(result.project, "Motor_Run"), true);
  assert.equal(value(result.project, "Lamp_Run"), true);
  assert.equal(result.instructionFlow.downstream.value, true);
  assert.equal(stopSeriesScan(result.project).tags.find((tag) => tag.name === "Lamp_Run")?.value, false);
});

test("Build guards empty, missing and invalid OR branches before RUN", () => {
  let { p } = createThreeWayOr();
  p = createParallelBranch(p, "rung-1", "main");
  const missing = p.rungs[0].parallelBranches.at(-1);
  const build = buildPracticeProject(p);
  assert.equal(build.success, false);
  assert.equal(build.diagnostics.find((d) => d.code === "EMPTY_OR_BRANCH")?.branchId, missing.id);
  assert.throws(() => evaluateSeriesScan(p), /está vacía/);

  const malformed = {
    ...p, rungs: p.rungs.map((rung) => ({
      ...rung,
      parallelBranches: rung.parallelBranches.map((branch) =>
        branch.id === missing.id ? { ...branch, anchorId: "nonexistent",
          instructions: [xic("oops", "Start_PB")] } : branch),
    })),
  };
  assert.equal(buildPracticeProject(malformed).success, false);
  assert.throws(() => evaluateSeriesScan(malformed), /contacto principal válido/);
});
