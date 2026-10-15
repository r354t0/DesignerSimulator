import test from "node:test";
import assert from "node:assert/strict";
import {
  changeInstructionTag,
  createRung,
  createTag,
  initialPracticeProject,
  insertInstruction,
  removeInstruction,
  removeRung,
} from "../src/plc/practiceDocument.ts";

const contact = (id, kind = "XIC", tag = "Start_PB") => ({ id, kind, tag });

test("create and remove editable rungs without mutating the previous project", () => {
  const initial = initialPracticeProject();
  const updated = createRung(initial, "rung-2");
  assert.equal(initial.rungs.length, 1);
  assert.equal(updated.rungs.length, 2);
  assert.deepEqual(removeRung(updated, "rung-1").rungs.map((r) => r.id), ["rung-2"]);
  assert.throws(() => createRung(updated, "rung-1"), /ya existe/);
});

test("contact insertion respects index and OTE stays last", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, contact("x1"));
  p = insertInstruction(p, "rung-1", 1, contact("out", "OTE", "Motor_Run"));
  p = insertInstruction(p, "rung-1", 0, contact("x2", "XIO", "Stop_PB"));
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["x2", "x1", "out"]);
  p = insertInstruction(p, "rung-1", 9, contact("out-2", "OTE", "Lamp_Run"));
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["x2", "x1", "out", "out-2"]);
  assert.throws(() => insertInstruction(p, "rung-99", 0, contact("x3")), /No se encontró/);
});

test("instruction tag can be reassigned and deleted without damaging the rung", () => {
  const p = insertInstruction(initialPracticeProject(), "rung-1", 0, contact("x1"));
  const changed = changeInstructionTag(p, "x1", "Auto_Mode");
  assert.equal(changed.rungs[0].instructions[0].tag, "Auto_Mode");
  assert.equal(p.rungs[0].instructions[0].tag, "Start_PB");
  assert.deepEqual(removeInstruction(changed, "x1").rungs[0].instructions, []);
  assert.throws(() => changeInstructionTag(changed, "x1", "Unknown"), /existente/);
});

test("tag creation validates identifier, duplicate names and truncates descriptions", () => {
  const initial = initialPracticeProject();
  const changed = createTag(initial, "Sensor_Level", "Nuevo sensor");
  assert.equal(changed.tags.at(-1)?.name, "Sensor_Level");
  assert.equal(initial.tags.length, 5);
  assert.throws(() => createTag(changed, "sensor_level", ""), /Ya existe/);
  assert.throws(() => createTag(changed, "123-Bad", ""), /debe iniciar/);
  assert.equal(createTag(changed, "X".repeat(40), "a".repeat(150)).tags.at(-1)?.description.length, 120);
});

test("expanded contact limit supports multiple OR lanes plus main contacts", () => {
  let p = initialPracticeProject();
  for (let i = 0; i < 32; i++) p = insertInstruction(p, "rung-1", i, contact("c-" + i));
  assert.equal(p.rungs[0].instructions.length, 32);
  assert.throws(() => insertInstruction(p, "rung-1", 32, contact("too-many")), /Máximo 32/);
  assert.throws(() => insertInstruction(p, "rung-1", 0, contact("ton", "TON")), /aún no está habilitada/);
});
