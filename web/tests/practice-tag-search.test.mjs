import test from "node:test";
import assert from "node:assert/strict";
import { filterPracticeTags } from "../src/plc/practiceTagSearch.ts";

const tags = [
  { name: "Start_PB", description: "Pulsador de arranque" },
  { name: "Stop_PB", description: "Pulsador de parada" },
  { name: "Motor_Run", description: "Motor habilitado" },
  { name: "Motor_Ready", description: "Permisivo motor" },
  { name: "Auto_Mode", description: "Modo automático" },
];

test("empty query lists all existing tags in predictable alphabetical order", () => {
  assert.deepEqual(filterPracticeTags(tags, "").map((t) => t.name),
    ["Auto_Mode", "Motor_Ready", "Motor_Run", "Start_PB", "Stop_PB"]);
  assert.equal(filterPracticeTags(tags, " ").length, tags.length);
});

test("matches tag names case-insensitively and ranks prefix first", () => {
  assert.deepEqual(filterPracticeTags(tags, "MOTOR").map((t) => t.name),
    ["Motor_Ready", "Motor_Run"]);
  assert.deepEqual(filterPracticeTags(tags, "_PB").map((t) => t.name),
    ["Start_PB", "Stop_PB"]);
});

test("searches descriptions as well, including accented Spanish text", () => {
  assert.deepEqual(filterPracticeTags(tags, "PERMISIVO").map((t) => t.name),
    ["Motor_Ready"]);
  assert.deepEqual(filterPracticeTags(tags, "automático").map((t) => t.name),
    ["Auto_Mode"]);
});

test("unknown strings return no candidates and never fabricate variables", () => {
  assert.deepEqual(filterPracticeTags(tags, "NoExiste"), []);
  assert.deepEqual(filterPracticeTags([], "Start"), []);
  assert.equal(tags.length, 5);
});
