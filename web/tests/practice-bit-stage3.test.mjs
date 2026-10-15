import test from "node:test";
import assert from "node:assert/strict";
import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createParallelBranch, addParallelContact, changeInstructionTag, setTagValue,
  createEmptyOutputBranch, fillEmptyOutputBranch,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan, prescanBitInstructions, stopSeriesScan } from "../src/plc/practiceRuntime.ts";
import {
  initialPracticeScanState, startPracticeScans, tickPracticeScan,
  pausePracticeScans, stepPracticeScan, stopPracticeScans, changePracticeScanProject,
} from "../src/plc/practiceScanCycle.ts";
import { getBitMenuTarget } from "../src/plc/practiceBitMenu.ts";
import { getOnlineMonitorReadout, getPendingScanInputs } from "../src/plc/practiceOnlineMonitor.ts";
import { getWrappedRungLayout } from "../src/plc/ladderWrappedLayout.ts";

const instruction = (id, kind, tag) => ({ id, kind, tag });
const val = (p, name) => p.tags.find((item) => item.name === name)?.value;
const codes = (p) => buildPracticeProject(p).diagnostics.map((diagnostic) => diagnostic.code);
const buildStartStop = () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, instruction("set-start", "XIC", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, instruction("latch", "OTL", "Motor_Run"));
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, instruction("reset-stop", "XIC", "Stop_PB"));
  p = insertInstruction(p, "rung-2", 1, instruction("unlatch", "OTU", "Motor_Run"));
  return p;
};

test("OTL retains its BOOL after the rung turns false and through STOP", () => {
  let p = buildStartStop();
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(codes(p).includes("DUPLICATE_OUTPUT"), false,
    "a normal OTL + OTU pair is intentional and must not warn");
  p = setTagValue(p, "Start_PB", true);
  p = evaluateSeriesScan(p).project;
  assert.equal(val(p, "Motor_Run"), true);
  p = setTagValue(p, "Start_PB", false);
  p = evaluateSeriesScan(p).project;
  assert.equal(val(p, "Motor_Run"), true, "a false OTL rung must not clear the output");
  p = stopSeriesScan(p);
  assert.equal(val(p, "Motor_Run"), true, "retentive latch must survive STOP");
});

test("OTU releases the retained BOOL only while its rung is energized", () => {
  let p = buildStartStop();
  p = evaluateSeriesScan(setTagValue(p, "Start_PB", true)).project;
  assert.equal(val(p, "Motor_Run"), true);
  p = setTagValue(p, "Start_PB", false);
  p = evaluateSeriesScan(setTagValue(p, "Stop_PB", true)).project;
  assert.equal(val(p, "Motor_Run"), false);
  p = evaluateSeriesScan(setTagValue(p, "Stop_PB", false)).project;
  assert.equal(val(p, "Motor_Run"), false);
});

test("output write order follows rung scan, with OTL/OTU sharing one BOOL", () => {
  let p = buildStartStop();
  p = setTagValue(p, "Start_PB", true);
  p = setTagValue(p, "Stop_PB", true);
  const frame = evaluateSeriesScan(p);
  assert.equal(frame.instructionFlow.latch.powerIn, true);
  assert.equal(frame.instructionFlow.unlatch.powerIn, true);
  assert.equal(frame.instructionFlow.latch.value, true);
  assert.equal(frame.instructionFlow.unlatch.value, false);
  assert.equal(val(frame.project, "Motor_Run"), false,
    "the later OTU wins when set and reset conditions are simultaneously true");
});

function oneShotProject() {
  let p = initialPracticeProject();
  p = createTag(p, "MEM_Pulse", "ONS memory BOOL", "BOOL");
  p = insertInstruction(p, "rung-1", 0, instruction("start", "XIC", "Start_PB"));
  p = insertInstruction(p, "rung-1", 1, instruction("oneshot", "ONS", "MEM_Pulse"));
  p = insertInstruction(p, "rung-1", 2, instruction("pulseOut", "OTE", "Motor_Run"));
  return p;
}

test("ONS sends exactly one scan of power on rising upstream edge", () => {
  let p = oneShotProject();
  assert.equal(buildPracticeProject(p).success, true);
  p = prescanBitInstructions(p);
  assert.equal(val(p, "MEM_Pulse"), true);
  p = evaluateSeriesScan(p).project; // low input -> rearmed
  assert.equal(val(p, "MEM_Pulse"), false);
  p = setTagValue(p, "Start_PB", true);
  const leading = evaluateSeriesScan(p);
  assert.equal(leading.instructionFlow.oneshot.powerOut, true);
  assert.equal(val(leading.project, "Motor_Run"), true);
  assert.equal(val(leading.project, "MEM_Pulse"), true);
  const second = evaluateSeriesScan(leading.project);
  assert.equal(second.instructionFlow.oneshot.powerOut, false);
  assert.equal(val(second.project, "Motor_Run"), false);
  assert.equal(second.instructionFlow.oneshot.condition, false);
  const rearm = evaluateSeriesScan(setTagValue(second.project, "Start_PB", false));
  assert.equal(val(rearm.project, "MEM_Pulse"), false);
  const retrigger = evaluateSeriesScan(setTagValue(rearm.project, "Start_PB", true));
  assert.equal(retrigger.instructionFlow.oneshot.powerOut, true);
});

test("ONS startup prescan suppresses a false pulse if input was already on at RUN", () => {
  let p = oneShotProject();
  p = setTagValue(p, "Start_PB", true);
  let state = startPracticeScans(initialPracticeScanState(p));
  assert.equal(state.mode, "running");
  assert.equal(state.frame.instructionFlow.oneshot.powerOut, false);
  assert.equal(val(state.project, "Motor_Run"), false);
  state = tickPracticeScan(state);
  assert.equal(val(state.project, "Motor_Run"), false);
  state = changePracticeScanProject(state, setTagValue(state.project, "Start_PB", false));
  state = tickPracticeScan(state);
  state = changePracticeScanProject(state, setTagValue(state.project, "Start_PB", true));
  state = tickPracticeScan(state);
  assert.equal(val(state.project, "Motor_Run"), true);
});

test("PAUSE freezes ONS state until exactly one step, preserving memory on STOP", () => {
  let state = startPracticeScans(initialPracticeScanState(oneShotProject()));
  assert.equal(val(state.project, "MEM_Pulse"), false);
  state = pausePracticeScans(state);
  const frozen = state.frame;
  state = changePracticeScanProject(state, setTagValue(state.project, "Start_PB", true));
  assert.strictEqual(state.frame, frozen);
  assert.equal(val(state.project, "Motor_Run"), false);
  state = stepPracticeScan(state);
  assert.equal(state.mode, "paused");
  assert.equal(val(state.project, "Motor_Run"), true);
  const count = state.scanCount;
  state = stepPracticeScan(state);
  assert.equal(state.scanCount, count + 1);
  assert.equal(val(state.project, "Motor_Run"), false);
  const stopped = stopPracticeScans(state);
  assert.equal(val(stopped.project, "MEM_Pulse"), true);
  assert.equal(val(stopped.project, "Motor_Run"), false);
});

test("Build rejects unassigned and non-BOOL ONS, shared storage and conflicting writers", () => {
  let p = oneShotProject();
  p = changeInstructionTag(p, "oneshot", "");
  assert.ok(codes(p).includes("MISSING_TAG"));
  p = changeInstructionTag(p, "oneshot", "MEM_Pulse");
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, instruction("duplicate", "ONS", "MEM_Pulse"));
  assert.ok(codes(p).includes("SHARED_ONS_STORAGE"));
  p = insertInstruction(p, "rung-2", 1, instruction("writer", "OTL", "MEM_Pulse"));
  assert.ok(codes(p).includes("ONS_STORAGE_CONFLICT"));
  const corrupted = {
    ...p, rungs: p.rungs.map((rung) => rung.id === "rung-2"
      ? { ...rung, instructions: rung.instructions.map((item) =>
        item.id === "writer" ? { ...item, tag: "Motor_Run" } : item) }
      : rung),
    tags: p.tags.map((tag) =>
      tag.name === "MEM_Pulse" ? { ...tag, type: "DINT", value: 0 } : tag),
  };
  assert.ok(codes(corrupted).includes("INCOMPATIBLE_TAG"));
});

test("ONS retains contact role in OR branches, and OTL/OTU share parallel output slots", () => {
  let p = oneShotProject();
  p = createParallelBranch(p, "rung-1", "start");
  const branch = p.rungs[0].parallelBranches[0];
  p = createTag(p, "MEM_Or", "Alternate ONS memory", "BOOL");
  p = addParallelContact(p, "rung-1", "start",
    instruction("orOneShot", "ONS", "MEM_Or"), 0, branch.id);
  p = createEmptyOutputBranch(p, "rung-1");
  p = fillEmptyOutputBranch(p, "rung-1", p.rungs[0].emptyOutputBranches[0],
    instruction("latchedOutput", "OTL", "Lamp_Run"));
  assert.equal(buildPracticeProject(p).success, true);
  const layout = getWrappedRungLayout(p.rungs[0], 760);
  assert.equal(layout.outputYs.length, 2);
  assert.ok(layout.groups[0].branchLanes.length > 0);
  assert.equal(layout.groups[0].branchLanes[0].centers.length, 1);
  assert.notEqual(getPracticeBuildSignature(p), getPracticeBuildSignature(oneShotProject()));
});

test("monitor and right-click never treat latched or one-shot-owned BOOLs as writable inputs", () => {
  const p = oneShotProject();
  assert.equal(getBitMenuTarget(p, "start", true).editable, true);
  assert.equal(getBitMenuTarget(p, "oneshot", true).editable, false);
  assert.match(getBitMenuTarget(p, "oneshot", true).reason, /ONS/);
  const latch = buildStartStop();
  assert.equal(getBitMenuTarget(latch, "latch", true).editable, false);
  assert.equal(getBitMenuTarget(latch, "unlatch", true).editable, false);
  const frame = evaluateSeriesScan(prescanBitInstructions(p));
  const selected = getOnlineMonitorReadout(frame.project, frame, "running",
    { kind: "instruction", instructionId: "oneshot" });
  assert.equal(selected.label, "ONS · MEM_Pulse");
  assert.equal(selected.fields.find((field) => field.label === "Pulso de un scan")?.value, "INACTIVO");
  assert.deepEqual(getPendingScanInputs(frame.project, frame), []);
});
