import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, createTag, insertInstruction, editTag, deleteTag,
  setTagValue, setInstructionTimerPreset, isValidTimerPreset,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import {
  initialPracticeScanState, startPracticeScans, tickPracticeScan,
  changePracticeScanProject,
} from "../src/plc/practiceScanCycle.ts";
import { getTagPickerRows } from "../src/plc/practiceTagPicker.ts";

function configured() {
  let p = initialPracticeProject();
  p = createTag(p, "Timer_01", "Retardo de arranque", "TIMER");
  p = createTag(p, "Setpoint_ms", "Referencia tiempo", "DINT");
  p = setTagValue(p, "Timer_01", 100, "PRE");
  p = setTagValue(p, "Setpoint_ms", 250);
  p = insertInstruction(p, "rung-1", 0, { id: "enable", kind: "XIC", tag: "Start_PB" });
  p = insertInstruction(p, "rung-1", 1, { id: "ton", kind: "TON", tag: "Timer_01" });
  return p;
}

test("PRE literal overrides TIMER.PRE, is shown in runtime and counts from scanned value", () => {
  let p = setInstructionTimerPreset(configured(), "ton", { mode: "literal", value: 400 });
  assert.equal(buildPracticeProject(p).success, true);
  const frame = evaluateSeriesScan(setTagValue(p, "Start_PB", true), 100);
  assert.equal(frame.project.tags.find((t) => t.name === "Timer_01").value.PRE, 400);
  assert.equal(frame.project.tags.find((t) => t.name === "Timer_01").value.ACC, 100);
  assert.equal(frame.project.tags.find((t) => t.name === "Timer_01").value.DN, false);
});

test("PRE DINT is sampled on every scan, without unnecessarily invalidating Build", () => {
  let p = setInstructionTimerPreset(configured(), "ton", { mode: "tag", tag: "Setpoint_ms" });
  p = setTagValue(p, "Start_PB", true);
  let state = startPracticeScans(initialPracticeScanState(p));
  const stableSignature = getPracticeBuildSignature(state.project);
  state = tickPracticeScan(state);
  assert.equal(state.project.tags.find((t) => t.name === "Timer_01").value.PRE, 250);
  state = changePracticeScanProject(state, setTagValue(state.project, "Setpoint_ms", 450));
  assert.equal(state.mode, "running");
  assert.equal(getPracticeBuildSignature(state.project), stableSignature);
  state = tickPracticeScan(state);
  const timer = state.project.tags.find((t) => t.name === "Timer_01").value;
  assert.equal(timer.PRE, 450);
  assert.equal(timer.ACC, 200);
  assert.equal(timer.DN, false);
});

test("changing PRE configuration invalidates Build, but editing referenced DINT value does not", () => {
  const p = configured();
  const configuredLiteral = setInstructionTimerPreset(p, "ton", { mode: "literal", value: 350 });
  assert.notEqual(getPracticeBuildSignature(configuredLiteral), getPracticeBuildSignature(p));
  const renamedValue = setTagValue(configuredLiteral, "Setpoint_ms", 350);
  assert.equal(getPracticeBuildSignature(renamedValue), getPracticeBuildSignature(configuredLiteral));
  const restored = setInstructionTimerPreset(configuredLiteral, "ton", undefined);
  assert.equal(getPracticeBuildSignature(restored), getPracticeBuildSignature(p));
});

test("Build checks PRE type, malformed literal, missing DINT and negative value", () => {
  let p = configured();
  assert.equal(isValidTimerPreset(2147483647), true);
  assert.equal(isValidTimerPreset(-1), false);
  assert.throws(() => setInstructionTimerPreset(p, "ton", { mode: "literal", value: -10 }), /PRE/);
  assert.throws(() => setInstructionTimerPreset(p, "ton", { mode: "tag", tag: "Start_PB" }), /DINT/);
  assert.throws(() => setInstructionTimerPreset(p, "ton", { mode: "tag", tag: "Absent" }), /DINT/);
  p = setInstructionTimerPreset(p, "ton", { mode: "tag", tag: "Setpoint_ms" });
  assert.throws(() => setTagValue(p, "Setpoint_ms", -1), /PRE/);
  const malformed = { ...p, rungs: p.rungs.map((rung) => ({
    ...rung, instructions: rung.instructions.map((item) => item.id === "ton"
      ? { ...item, preset: { mode: "literal", value: -1 } } : item),
  })) };
  assert.ok(buildPracticeProject(malformed).diagnostics.some((d) => d.code === "INVALID_TIMER_PRESET"));
  const unknown = { ...p, rungs: p.rungs.map((rung) => ({
    ...rung, instructions: rung.instructions.map((item) => item.id === "ton"
      ? { ...item, preset: { mode: "tag", tag: "Missing" } } : item),
  })) };
  assert.ok(buildPracticeProject(unknown).diagnostics.some((d) => d.code === "UNKNOWN_TIMER_PRESET_TAG"));
});

test("referenced DINT cannot be removed or changed to another type; renaming updates PRE", () => {
  let p = setInstructionTimerPreset(configured(), "ton", { mode: "tag", tag: "Setpoint_ms" });
  assert.throws(() => deleteTag(p, "Setpoint_ms"), /utilizado/);
  assert.throws(() => editTag(p, "Setpoint_ms", { type: "REAL" }), /utilizado/);
  p = editTag(p, "Setpoint_ms", { name: "NuevoPreset" });
  assert.equal(p.rungs[0].instructions[1].preset.tag, "NuevoPreset");
  assert.equal(buildPracticeProject(p).success, true);
});

test("selector groups TIMER members; PRE/ACC are shown read-only and not assigned to XIC", () => {
  const p = configured();
  const collapsed = getTagPickerRows(p.tags, "XIC", "");
  const root = collapsed.find((item) => item.name === "Timer_01");
  assert.equal(root.expandable, true);
  assert.equal(root.selectable, false);
  assert.ok(!collapsed.some((item) => item.name === "Timer_01.DN"));
  const expanded = getTagPickerRows(p.tags, "XIC", "", ["Timer_01"]);
  assert.deepEqual(expanded.filter((item) => item.depth === 1).map((item) => item.name),
    ["Timer_01.PRE", "Timer_01.ACC", "Timer_01.EN", "Timer_01.TT", "Timer_01.DN"]);
  assert.deepEqual(expanded.filter((item) => item.depth === 1 && item.selectable)
    .map((item) => item.name), ["Timer_01.EN", "Timer_01.TT", "Timer_01.DN"]);
  const search = getTagPickerRows(p.tags, "XIO", "Timer_01.DN");
  assert.equal(search.find((item) => item.name === "Timer_01.DN")?.selectable, true);
  assert.equal(getTagPickerRows(p.tags, "OTE", "").some((item) => item.name.startsWith("Timer_01")), false);
  assert.equal(getTagPickerRows(p.tags, "OTL", "").some((item) => item.name.startsWith("Timer_01")), false);
  assert.deepEqual(getTagPickerRows(p.tags, "TON", "").filter((item) => item.name === "Timer_01")
    .map((item) => item.selectable), [true]);
});
