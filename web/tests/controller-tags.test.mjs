import test from "node:test";
import assert from "node:assert/strict";
import {
  createTag, editTag, setTagValue, deleteTag, createRung, insertInstruction,
  addParallelContact, initialPracticeProject,
} from "../src/plc/practiceDocument.ts";

const xic = (id, tag) => ({ id, kind: "XIC", tag });
test("new tags default to BOOL, decimal, read/write and value zero", () => {
  let p = initialPracticeProject();
  p = createTag(p, "PB_Test", "Pulsador de prueba");
  assert.deepEqual(p.tags.at(-1), {
    name: "PB_Test", description: "Pulsador de prueba", type: "BOOL", value: false,
    externalAccess: "Read/Write", constant: false, style: "Decimal",
  });
  p = setTagValue(p, "PB_Test", true);
  assert.equal(p.tags.at(-1).value, true);
  assert.throws(() => setTagValue(p, "PB_Test", 1), /booleanos/);
});

test("monitor values support DINT and REAL with validation", () => {
  let p = createTag(initialPracticeProject(), "CounterIndex", "Acumulado", "DINT");
  p = setTagValue(p, "CounterIndex", 123);
  assert.equal(p.tags.at(-1).value, 123);
  assert.throws(() => setTagValue(p, "CounterIndex", 1.2), /entero/);
  assert.throws(() => setTagValue(p, "CounterIndex", 2147483648), /entero/);
  p = createTag(p, "Temperature", "PV", "REAL");
  p = setTagValue(p, "Temperature", 12.75);
  assert.equal(p.tags.at(-1).value, 12.75);
  assert.throws(() => setTagValue(p, "Temperature", Infinity), /numérico válido/);
});

test("TIMER and COUNTER members can be edited and only declared members accepted", () => {
  let p = createTag(initialPracticeProject(), "TMR_Test", "Supervisión", "TIMER");
  p = createTag(p, "CNT_Test", "Lotes", "COUNTER");
  p = setTagValue(p, "TMR_Test", 2000, "PRE");
  p = setTagValue(p, "TMR_Test", true, "DN");
  p = setTagValue(p, "CNT_Test", 4, "ACC");
  assert.equal(p.tags.find((t) => t.name === "TMR_Test").value.PRE, 2000);
  assert.equal(p.tags.find((t) => t.name === "TMR_Test").value.DN, true);
  assert.equal(p.tags.find((t) => t.name === "CNT_Test").value.ACC, 4);
  assert.throws(() => setTagValue(p, "TMR_Test", 1, "DN"), /booleanos/);
  assert.throws(() => setTagValue(p, "TMR_Test", 1, "BAD"), /miembro válido/);
});

test("renaming updates main and OR references atomically and blocks duplicate names", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("main", "Start_PB"));
  p = addParallelContact(p, "rung-1", "main", xic("or", "Stop_PB"));
  p = createRung(p, "rung-2");
  p = insertInstruction(p, "rung-2", 0, xic("other", "Start_PB"));
  const old = p;
  p = editTag(p, "Start_PB", { name: "PB_Start", description: "Arranque" });
  assert.equal(p.rungs[0].instructions[0].tag, "PB_Start");
  assert.equal(p.rungs[1].instructions[0].tag, "PB_Start");
  assert.equal(p.rungs[0].parallelBranches[0].instructions[0].tag, "Stop_PB");
  assert.equal(p.tags.find((t) => t.name === "PB_Start").description, "Arranque");
  assert.equal(old.rungs[0].instructions[0].tag, "Start_PB");
  assert.throws(() => editTag(p, "PB_Start", { name: "Stop_PB" }), /Ya existe/);
});

test("refuse incompatible types for Ladder references but support unused types", () => {
  let p = insertInstruction(initialPracticeProject(), "rung-1", 0, xic("ref", "Start_PB"));
  assert.throws(() => editTag(p, "Start_PB", { type: "DINT" }), /utilizado en Ladder/);
  assert.throws(() => deleteTag(p, "Start_PB"), /utilizado en Ladder/);
  p = createTag(p, "Level", "Valor de nivel", "DINT");
  assert.throws(() => insertInstruction(p, "rung-1", 1, xic("bad", "Level")), /solo admiten tags BOOL/);
  p = editTag(p, "Level", { type: "REAL" });
  assert.equal(p.tags.at(-1).type, "REAL");
  p = deleteTag(p, "Level");
  assert.equal(p.tags.some((t) => t.name === "Level"), false);
});

test("constant tags prevent editing and metadata values survive renaming", () => {
  let p = createTag(initialPracticeProject(), "Setpoint", "Límite", "DINT");
  p = setTagValue(p, "Setpoint", 145);
  p = editTag(p, "Setpoint", { name: "Limit_SP", constant: true, externalAccess: "Read Only", style: "Hex" });
  assert.equal(p.tags.at(-1).value, 145);
  assert.equal(p.tags.at(-1).style, "Hex");
  assert.throws(() => setTagValue(p, "Limit_SP", 234), /constante/);
});
