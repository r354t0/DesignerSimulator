import test from "node:test";
import assert from "node:assert/strict";
import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  changeInstructionTag, editTag, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan, stopSeriesScan } from "../src/plc/practiceRuntime.ts";
import {
  initialPracticeScanState, startPracticeScans, tickPracticeScan,
  pausePracticeScans, stepPracticeScan, resumePracticeScans,
  stopPracticeScans, setScanPeriod,
} from "../src/plc/practiceScanCycle.ts";
import { filterPracticeTags } from "../src/plc/practiceTagSearch.ts";
import { getWrappedRungLayout, OUTPUT_BRANCH_STEP } from "../src/plc/ladderWrappedLayout.ts";
import { getOnlineMonitorReadout } from "../src/plc/practiceOnlineMonitor.ts";

const contact = (id, tag) => ({ id, tag, kind: "XIC" });
const output = (id, kind, tag) => ({ id, kind, tag });
const v = (p, tag) => p.tags.find((t) => t.name === tag)?.value;
const diag = (p) => buildPracticeProject(p).diagnostics.map((d) => d.code);

function timerProgram(kind = "TON", preset = 300) {
  let p = initialPracticeProject();
  p = createTag(p, "T_Start", "Temporizador arranque", "TIMER");
  p = setTagValue(p, "T_Start", preset, "PRE");
  p = insertInstruction(p, "rung-1", 0, contact("start", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, output("timer", kind, "T_Start"));
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, contact("complete", "T_Start.DN"));
  p = insertInstruction(p, "rung-2", 1, output("motor", "OTE", "Motor_Run"));
  return p;
}

test("TON increments ACC in ms per scan and energizes DN only after PRE", () => {
  let p = timerProgram();
  assert.equal(buildPracticeProject(p).success, true);
  p = setTagValue(p, "Start_PB", true);
  let state = startPracticeScans(initialPracticeScanState(p));
  assert.deepEqual(v(state.project, "T_Start"), {
    PRE: 300, ACC: 0, EN: true, TT: true, DN: false,
  });
  for (const acc of [100, 200, 300]) {
    state = tickPracticeScan(state);
    assert.equal(v(state.project, "T_Start").ACC, acc);
  }
  assert.equal(v(state.project, "T_Start").DN, true);
  assert.equal(v(state.project, "T_Start").TT, false);
  assert.equal(v(state.project, "Motor_Run"), true);
  state = tickPracticeScan(state);
  assert.equal(v(state.project, "T_Start").ACC, 300);
  p = setTagValue(state.project, "Start_PB", false);
  const reset = evaluateSeriesScan(p, 100);
  assert.deepEqual(v(reset.project, "T_Start"), {
    PRE: 300, ACC: 0, EN: false, TT: false, DN: false,
  });
  assert.equal(v(reset.project, "Motor_Run"), false);
});

test("TOF immediately sets DN when energized then counts down after falling edge", () => {
  let p = timerProgram("TOF", 200);
  p = setTagValue(p, "Start_PB", true);
  p = evaluateSeriesScan(p, 0).project;
  assert.equal(v(p, "T_Start").DN, true);
  assert.equal(v(p, "T_Start").ACC, 0);
  p = setTagValue(p, "Start_PB", false);
  p = evaluateSeriesScan(p, 100).project;
  assert.deepEqual(v(p, "T_Start"), { PRE: 200, ACC: 100, EN: false, TT: true, DN: true });
  assert.equal(v(p, "Motor_Run"), true);
  p = evaluateSeriesScan(p, 100).project;
  assert.deepEqual(v(p, "T_Start"), { PRE: 200, ACC: 200, EN: false, TT: false, DN: false });
  assert.equal(v(p, "Motor_Run"), false);
  p = evaluateSeriesScan(p, 100).project;
  assert.equal(v(p, "T_Start").ACC, 200);
});

test("RTO preserves ACC while input false and through STOP, RES clears accumulated state", () => {
  let p = timerProgram("RTO", 250);
  p = setTagValue(p, "Start_PB", true);
  p = evaluateSeriesScan(p, 100).project;
  assert.equal(v(p, "T_Start").ACC, 100);
  p = evaluateSeriesScan(p, 100).project;
  p = setTagValue(p, "Start_PB", false);
  p = evaluateSeriesScan(p, 100).project;
  assert.equal(v(p, "T_Start").ACC, 200);
  assert.equal(v(p, "T_Start").TT, false);
  p = stopSeriesScan(p);
  assert.equal(v(p, "T_Start").ACC, 200);
  p = setTagValue(p, "Start_PB", true);
  p = evaluateSeriesScan(p, 100).project;
  assert.equal(v(p, "T_Start").ACC, 250);
  assert.equal(v(p, "T_Start").DN, true);
  p = createRung(p, "rung-3");
  p = insertInstruction(p, "rung-3", 0, contact("reset", "Stop_PB"));
  p = insertInstruction(p, "rung-3", 1, output("res", "RES", "T_Start"));
  assert.equal(buildPracticeProject(p).success, true);
  p = setTagValue(p, "Stop_PB", true);
  p = evaluateSeriesScan(p, 100).project;
  assert.equal(v(p, "T_Start").ACC, 0);
  assert.equal(v(p, "T_Start").DN, false);
  assert.equal(v(p, "T_Start").PRE, 250);
});

test("PAUSE freezes ACC and one SCAN advances exactly one configured period", () => {
  let state = startPracticeScans(initialPracticeScanState(
    setTagValue(timerProgram(), "Start_PB", true)));
  state = tickPracticeScan(state);
  assert.equal(v(state.project, "T_Start").ACC, 100);
  state = pausePracticeScans(state);
  for (let i = 0; i < 5; i++) state = tickPracticeScan(state);
  assert.equal(v(state.project, "T_Start").ACC, 100);
  state = setScanPeriod(state, 250);
  state = stepPracticeScan(state);
  assert.equal(state.mode, "paused");
  assert.equal(v(state.project, "T_Start").ACC, 300);
  state = resumePracticeScans(state);
  state = tickPracticeScan(state);
  assert.equal(v(state.project, "T_Start").ACC, 300);
  assert.equal(stopPracticeScans(state).mode, "stopped");
});

test("STOP clears nonretentive TON but not RTO timer memory", () => {
  let s = startPracticeScans(initialPracticeScanState(
    setTagValue(timerProgram(), "Start_PB", true)));
  s = tickPracticeScan(s);
  s = stopPracticeScans(s);
  assert.equal(v(s.project, "T_Start").ACC, 0);
  assert.equal(v(s.project, "T_Start").EN, false);
  assert.equal(v(s.project, "T_Start").DN, false);
  s = startPracticeScans(initialPracticeScanState(
    setTagValue(timerProgram("RTO"), "Start_PB", true)));
  s = tickPracticeScan(s);
  s = stopPracticeScans(s);
  assert.equal(v(s.project, "T_Start").ACC, 100);
});

test("Build rejects wrong operand type and negative PRE", () => {
  let p = timerProgram();
  p = changeInstructionTag(p, "timer", "");
  assert.ok(diag(p).includes("MISSING_TAG"));
  p = changeInstructionTag(p, "timer", "T_Start");
  const bad = setTagValue(p, "T_Start", -25, "PRE");
  assert.ok(diag(bad).includes("INVALID_TIMER_PRESET"));
  assert.throws(() => changeInstructionTag(p, "timer", "Motor_Run"), /TIMER/);
  assert.throws(() => changeInstructionTag(p, "complete", "T_Start.ACC"), /BOOL/);
  assert.throws(() => editTag(p, "T_Start", { type: "BOOL" }), /utilizado en Ladder/);
  const broken = { ...p, rungs: p.rungs.map((r) => ({
    ...r, instructions: r.instructions.map((i) => i.id === "timer"
      ? { ...i, tag: "Motor_Run" } : i),
  })) };
  assert.ok(diag(broken).includes("INCOMPATIBLE_TAG"));
});

test("TIMER.EN TT DN are valid BOOL contacts; tag renaming propagates to members", () => {
  let p = timerProgram();
  assert.equal(buildPracticeProject(p).success, true);
  p = editTag(p, "T_Start", { name: "T_Principal" });
  assert.equal(p.rungs[0].instructions[1].tag, "T_Principal");
  assert.equal(p.rungs[1].instructions[0].tag, "T_Principal.DN");
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(filterPracticeTags(p.tags, "T_Principal").length, 0,
    "ordinary BOOL-only tag searches stay unchanged");
  assert.equal(filterPracticeTags(p.tags, "T_Principal", true)[0].type, "TIMER");
  assert.notEqual(getPracticeBuildSignature(p), getPracticeBuildSignature(timerProgram()));
});

test("Online Monitor exposes timer PRE ACC and completion flags", () => {
  let p = setTagValue(timerProgram(), "Start_PB", true);
  const frame = evaluateSeriesScan(p, 100);
  const readout = getOnlineMonitorReadout(frame.project, frame, "running",
    { kind: "instruction", instructionId: "timer" });
  assert.equal(readout.label, "TON · T_Start");
  assert.equal(readout.fields.find((f) => f.label === "ACC (ms)")?.value, "100");
  assert.equal(readout.fields.find((f) => f.label === "EN")?.value, "1 (TRUE)");
});


test("TIMER blocks have bottom clearance on ordinary and multi-output rungs", () => {
  let p = timerProgram();
  const layout = getWrappedRungLayout(p.rungs[0], 760);
  assert.ok(layout.height >= layout.coilY + 47,
    "TIMER bottom status indicators must not be cropped");
  p = insertInstruction(p, "rung-1", 2, output("reset-inline", "RES", "T_Start"));
  const stacked = getWrappedRungLayout(p.rungs[0], 760);
  assert.equal(stacked.outputYs.length, 2);
  assert.equal(stacked.outputYs[1] - stacked.outputYs[0], OUTPUT_BRANCH_STEP);
  assert.ok(stacked.height >= stacked.outputYs[1] + 47,
    "last timer block has clearance despite stacked output branches");
});
