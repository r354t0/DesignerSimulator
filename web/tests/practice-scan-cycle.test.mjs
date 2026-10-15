import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeScanState, startPracticeScans, tickPracticeScan,
  pausePracticeScans, resumePracticeScans, stepPracticeScan, stopPracticeScans,
  changePracticeScanProject, setScanPeriod, getRunAction,
} from "../src/plc/practiceScanCycle.ts";
import {
  initialPracticeProject, insertInstruction, createParallelBranch,
  addParallelContact, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
const xic = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const ote = (id, tag = "Motor_Run") => ({ id, kind: "OTE", tag });
const get = (state, name) => state.project.tags.find((t) => t.name === name)?.value;
const fresh = () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-1", 1, ote("motor"));
  assert.equal(buildPracticeProject(p).success, true);
  return initialPracticeScanState(p);
};
const input = (state, value) =>
  changePracticeScanProject(state, setTagValue(state.project, "Start_PB", value));

test("RUN starts with one scan and configured period; periodic ticks accumulate", () => {
  let state = fresh();
  assert.equal(state.scanPeriodMs, 100);
  assert.equal(state.mode, "stopped");
  state = input(state, true);
  state = startPracticeScans(state);
  assert.equal(state.mode, "running");
  assert.equal(state.scanCount, 1);
  assert.equal(get(state, "Motor_Run"), true);
  assert.equal(state.frame?.instructionFlow.start.powerOut, true);
  assert.ok(state.lastScanDurationMs >= 0);
  assert.equal(tickPracticeScan(state).scanCount, 2);
  state = tickPracticeScan(state);
  assert.equal(state.scanCount, 2);
  assert.equal(state.frame?.rungPower["rung-1"], true);
  assert.ok(state.maxScanDurationMs >= state.lastScanDurationMs);
});

test("input changes are sampled by next scan rather than evaluated immediately", () => {
  let state = startPracticeScans(fresh());
  assert.equal(get(state, "Motor_Run"), false);
  state = input(state, true);
  assert.equal(get(state, "Motor_Run"), false);
  assert.equal(state.frame?.instructionFlow.start.powerOut, false);
  state = tickPracticeScan(state);
  assert.equal(get(state, "Motor_Run"), true);
  assert.equal(state.frame?.instructionFlow.start.powerOut, true);
});

test("PAUSE freezes scan count, output and visual power even as inputs change", () => {
  let state = input(fresh(), true);
  state = pausePracticeScans(startPracticeScans(state));
  assert.equal(state.mode, "paused");
  assert.equal(get(state, "Motor_Run"), true);
  const frozen = state.frame;
  state = input(state, false);
  const count = state.scanCount;
  assert.equal(get(state, "Start_PB"), false);
  assert.equal(get(state, "Motor_Run"), true);
  assert.strictEqual(state.frame, frozen);
  assert.strictEqual(tickPracticeScan(state), state);
  assert.equal(state.scanCount, count);
});

test("single SCAN from PAUSE computes exactly one pass and stays paused", () => {
  let state = pausePracticeScans(startPracticeScans(input(fresh(), true)));
  state = input(state, false);
  const count = state.scanCount;
  state = stepPracticeScan(state);
  assert.equal(state.mode, "paused");
  assert.equal(state.scanCount, count + 1);
  assert.equal(get(state, "Motor_Run"), false);
  assert.equal(state.frame?.instructionFlow.start.powerOut, false);
  const stopped = stopPracticeScans(state);
  assert.strictEqual(stepPracticeScan(stopped), stopped);
});

test("RESUME continues same session and a fresh RUN resets scan counter", () => {
  let state = startPracticeScans(fresh());
  state = tickPracticeScan(state);
  state = pausePracticeScans(state);
  state = resumePracticeScans(state);
  assert.equal(state.mode, "running");
  assert.equal(tickPracticeScan(state).scanCount, 3);
  state = startPracticeScans(state);
  assert.equal(state.scanCount, 1);
});

test("STOP resets outputs and preserves inputs; no background scans may continue", () => {
  let state = startPracticeScans(input(fresh(), true));
  state = stopPracticeScans(state);
  assert.equal(state.mode, "stopped");
  assert.equal(state.frame, null);
  assert.equal(get(state, "Motor_Run"), false);
  assert.equal(get(state, "Start_PB"), true);
  assert.strictEqual(tickPracticeScan(state), state);
  assert.strictEqual(pausePracticeScans(state), state);
  assert.strictEqual(resumePracticeScans(state), state);
});

test("structural editing while RUN/PAUSE stops and clears existing outputs", () => {
  for (const mode of ["running", "paused"]) {
    let state = startPracticeScans(input(fresh(), true));
    if (mode === "paused") state = pausePracticeScans(state);
    let changed = insertInstruction(state.project, "rung-1", 1, xic("permissive", "Stop_PB"));
    state = changePracticeScanProject(state, changed);
    assert.equal(state.mode, "stopped");
    assert.equal(state.frame, null);
    assert.equal(get(state, "Motor_Run"), false);
    assert.deepEqual(state.project.rungs[0].instructions.map((i) => i.id),
      ["start", "permissive", "motor"]);
  }
});

test("changing scan period preserves session; rejects out-of-range periods", () => {
  let state = startPracticeScans(fresh());
  const previousCount = state.scanCount;
  state = setScanPeriod(state, 250);
  assert.equal(state.scanPeriodMs, 250);
  assert.equal(state.scanCount, previousCount);
  for (const value of [0, 10, 30, 75, 1000]) {
    assert.throws(() => setScanPeriod(state, value), /Período/);
  }
});

test("multiple rungs, OR conditions and parallel OTE outputs evaluate each scan", () => {
  let p = fresh().project;
  p = createParallelBranch(p, "rung-1", "start");
  const branchId = p.rungs[0].parallelBranches[0].id;
  p = addParallelContact(p, "rung-1", "start", xic("alternative", "Auto_Mode"), 0, branchId);
  p = insertInstruction(p, "rung-1", 2, ote("lamp", "Lamp_Run"));
  assert.equal(buildPracticeProject(p).success, true);
  let state = startPracticeScans(initialPracticeScanState(p));
  assert.equal(get(state, "Motor_Run"), false);
  state = changePracticeScanProject(state, setTagValue(state.project, "Auto_Mode", true));
  state = tickPracticeScan(state);
  assert.equal(get(state, "Motor_Run"), true);
  assert.equal(get(state, "Lamp_Run"), true);
  assert.equal(state.frame?.branchPower[branchId], true);
});


test("single RUN button launches Build only from STOP and RESUMEs the paused session", () => {
  assert.equal(getRunAction("stopped"), "build-and-start");
  assert.equal(getRunAction("paused"), "resume");
  assert.equal(getRunAction("running"), "none");

  let state = startPracticeScans(input(fresh(), true));
  state = tickPracticeScan(state);
  state = pausePracticeScans(state);
  const countBeforeResume = state.scanCount;
  const scanSnapshot = state.frame;
  state = input(state, false);
  // RUN while PAUSED does not rebuild or reset the same session.
  state = getRunAction(state.mode) === "resume" ? resumePracticeScans(state) : state;
  assert.equal(state.mode, "running");
  assert.equal(state.scanCount, countBeforeResume);
  assert.strictEqual(state.frame, scanSnapshot);
  assert.equal(get(state, "Motor_Run"), true);
  state = tickPracticeScan(state);
  assert.equal(state.scanCount, countBeforeResume + 1);
  assert.equal(get(state, "Motor_Run"), false);
  assert.equal(getRunAction(state.mode), "none");
});
