import test from "node:test";
import assert from "node:assert/strict";
import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  setInstructionPreset, setInstructionTimerPreset, setTagValue, editTag,
  isValidCounterPreset, MAX_TIMER_PRESET, MIN_COUNTER_PRESET,
} from "../src/plc/practiceDocument.ts";
import { parsePresetInput, getAssignablePresetTags } from "../src/plc/timerPresetInput.ts";
import { getWrappedRungLayout } from "../src/plc/ladderWrappedLayout.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";

function withCounter() {
  let project = initialPracticeProject();
  project = createTag(project, "Count", "Conteo", "COUNTER");
  project = createTag(project, "Target", "Consigna", "DINT");
  project = createTag(project, "Negative", "Consigna negativa", "DINT");
  project = setTagValue(project, "Target", 3);
  project = setTagValue(project, "Negative", -5);
  project = insertInstruction(project, "rung-1", 0,
    { id: "input", kind: "XIC", tag: "Start_PB" });
  project = insertInstruction(project, "rung-1", 1,
    { id: "ctu", kind: "CTU", tag: "Count" });
  return project;
}
const pre = (project) => project.tags.find((item) => item.name === "Count").value.PRE;

test("COUNTER PRE accepts signed DINT range and rejects fractions/overflow", () => {
  const p = withCounter();
  assert.equal(isValidCounterPreset(MIN_COUNTER_PRESET), true);
  assert.equal(isValidCounterPreset(MAX_TIMER_PRESET), true);
  for (const value of [0, -5, MIN_COUNTER_PRESET, MAX_TIMER_PRESET]) {
    assert.deepEqual(parsePresetInput(String(value), p.tags, "counter"), {
      ok: true, preset: { mode: "literal", value },
    });
  }
  for (const input of ["", "3.5", "2147483648", "-2147483649", "Unknown"]) {
    assert.equal(parsePresetInput(input, p.tags, "counter").ok, false, input);
  }
  assert.deepEqual(parsePresetInput("negative", p.tags, "counter"), {
    ok: true, preset: { mode: "tag", tag: "Negative" },
  });
  assert.deepEqual(getAssignablePresetTags(p.tags, "counter").map((tag) => tag.name),
    ["Target", "Negative"]);
  assert.deepEqual(getAssignablePresetTags(p.tags, "timer").map((tag) => tag.name), ["Target"]);
});

test("CTU literal PRE is applied each scan and persists to COUNTER.PRE", () => {
  const p = setInstructionPreset(withCounter(), "ctu", { mode: "literal", value: 1 });
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(pre(p), 0);
  const tick = evaluateSeriesScan(setTagValue(p, "Start_PB", true)).project;
  assert.equal(pre(tick), 1);
  assert.equal(tick.tags.find((tag) => tag.name === "Count").value.DN, true);
});

test("COUNTER PRE DINT updates dynamically without invalidating built logic", () => {
  let p = setInstructionPreset(withCounter(), "ctu", { mode: "tag", tag: "Target" });
  const sig = getPracticeBuildSignature(p);
  p = evaluateSeriesScan(setTagValue(p, "Start_PB", true)).project;
  assert.equal(pre(p), 3);
  p = setTagValue(p, "Target", 1);
  assert.equal(getPracticeBuildSignature(p), sig);
  p = evaluateSeriesScan(p).project;
  assert.equal(pre(p), 1);
  assert.equal(p.tags.find((tag) => tag.name === "Count").value.DN, true);
  p = setTagValue(p, "Target", -3);
  p = evaluateSeriesScan(p).project;
  assert.equal(pre(p), -3);
});

test("PRE value and DINT reference are safe across Build, rename and reset to native PRE", () => {
  let p = setInstructionPreset(withCounter(), "ctu", { mode: "tag", tag: "Negative" });
  assert.equal(buildPracticeProject(p).success, true);
  p = editTag(p, "Negative", { name: "TargetSigned" });
  assert.equal(p.rungs[0].instructions[1].preset.tag, "TargetSigned");
  assert.equal(buildPracticeProject(p).success, true);
  const restored = setInstructionPreset(p, "ctu", undefined);
  assert.equal(restored.rungs[0].instructions[1].preset, undefined);
  assert.equal(buildPracticeProject(restored).success, true);
});

test("Build rejects malformed counter PRE while timer validation remains unchanged", () => {
  const p = withCounter();
  assert.throws(() => setInstructionPreset(p, "ctu", { mode: "literal", value: 2147483648 }), /PRE/);
  assert.throws(() => setInstructionPreset(p, "ctu", { mode: "tag", tag: "Start_PB" }), /DINT/);
  assert.throws(() => setInstructionTimerPreset(p, "ctu", { mode: "literal", value: 2.5 }), /PRE/);
  const invalid = {
    ...p, rungs: p.rungs.map((rung) => ({
      ...rung, instructions: rung.instructions.map((item) => item.id === "ctu"
        ? { ...item, preset: { mode: "literal", value: 2.5 } } : item),
    })),
  };
  assert.ok(buildPracticeProject(invalid).diagnostics.some((d) => d.code === "INVALID_COUNTER_PRESET"));
  const missing = {
    ...p, rungs: p.rungs.map((rung) => ({
      ...rung, instructions: rung.instructions.map((item) => item.id === "ctu"
        ? { ...item, preset: { mode: "tag", tag: "Absent" } } : item),
    })),
  };
  assert.ok(buildPracticeProject(missing).diagnostics.some((d) => d.code === "UNKNOWN_COUNTER_PRESET_TAG"));
});

test("CTD shares the inline preset mechanism; RES cannot receive a PRE", () => {
  let p = withCounter();
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0,
    { id: "ctd", kind: "CTD", tag: "Count" });
  p = createRung(p, "rung-3");
  p = insertInstruction(p, "rung-3", 0,
    { id: "res", kind: "RES", tag: "Count" });
  p = setInstructionPreset(p, "ctd", { mode: "literal", value: -2 });
  assert.equal(buildPracticeProject(p).success, true);
  assert.throws(() => setInstructionPreset(p, "res", { mode: "literal", value: 2 }), /Selecciona/);
});

test("counter and timer rungs reserve enough clearance below their final block", () => {
  for (const kind of ["CTU", "CTD", "TON", "TOF", "RTO"]) {
    let p = initialPracticeProject();
    p = insertInstruction(p, "rung-1", 0, {
      id: "block", kind, tag: "",
    });
    const layout = getWrappedRungLayout(p.rungs[0], 760);
    const lastOutput = layout.outputYs.at(-1);
    assert.ok(layout.height - (lastOutput + 41) >= 18,
      kind + " should have >18px of room underneath status bits");
    assert.ok(layout.width >= 480);
  }
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, { id: "bit", kind: "OTE", tag: "" });
  const ordinary = getWrappedRungLayout(p.rungs[0], 760);
  assert.ok(ordinary.height < getWrappedRungLayout({
    ...p.rungs[0],
    instructions: [{ id: "counter", kind: "CTU", tag: "" }],
  }, 760).height);
});

test("multi-output CTU with OR lanes keeps the last block inside its own rung", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, { id: "ctu", kind: "CTU", tag: "" });
  p = insertInstruction(p, "rung-1", 1, { id: "ctd", kind: "CTD", tag: "" });
  const layout = getWrappedRungLayout(p.rungs[0], 760);
  assert.ok(layout.height >= layout.outputYs.at(-1) + 41 + 18);
});
