import test from "node:test";
import assert from "node:assert/strict";
import {
  getPaletteCategory,
  isImplementedPaletteInstruction,
  PALETTE_CATEGORIES,
} from "../src/plc/instructionPalette.ts";

test("Studio-style palette contains every visible category in a stable order", () => {
  assert.deepEqual(PALETTE_CATEGORIES.map((item) => item.id), [
    "favorites", "add-on", "alarms", "bit", "timer-counter",
    "input-output", "compare", "move-logical", "compute-math",
    "file-misc", "file-shift",
  ]);
  assert.ok(PALETTE_CATEGORIES.every((category) => category.label && category.tools.length));
});

test("Favorites and Bit expose all enabled Bit instructions", () => {
  for (const categoryId of ["favorites", "bit"]) {
    const category = getPaletteCategory(categoryId);
    assert.deepEqual(category.tools.filter((tool) => tool.editable).map((tool) => tool.id),
      ["XIC", "XIO", "OTE", "OTL", "OTU", "ONS"]);
  }
});

test("no unsupported instruction falsely claims editable behavior", () => {
  for (const category of PALETTE_CATEGORIES) {
    const ids = category.tools.map((tool) => tool.id);
    assert.equal(ids.length, new Set(ids).size, category.id + " contains duplicates");
    for (const tool of category.tools) {
      assert.equal(tool.editable, isImplementedPaletteInstruction(tool.id),
        category.id + ": " + tool.id);
      assert.equal(Boolean(tool.editable && tool.previewOnly), false);
    }
  }
});

test("timers and counters are editable in PracticeRoutine", () => {
  const tools = getPaletteCategory("timer-counter").tools;
  for (const name of ["TON", "TOF", "RTO", "RES"]) {
    const tool = tools.find((item) => item.id === name);
    assert.ok(tool);
    assert.equal(tool.editable, true);
  }
  for (const name of ["CTU", "CTD"]) {
    const tool = tools.find((item) => item.id === name);
    assert.ok(tool);
    assert.equal(tool.editable, true);
    assert.equal(Boolean(tool.previewOnly), false);
  }
});

test("changing a category does not require supporting its unimplemented tools", () => {
  assert.equal(getPaletteCategory("compare").tools.filter((tool) => tool.editable).length, 6);
  assert.deepEqual(getPaletteCategory("move-logical").tools.filter((tool) => tool.editable).map((tool) => tool.id), ["MOV"]);
  assert.deepEqual(getPaletteCategory("compute-math").tools.filter((tool) => tool.editable).map((tool) => tool.id),
    ["ADD", "SUB", "MUL", "DIV"]);
  assert.ok(getPaletteCategory("bit").tools.some((tool) => tool.editable));
});
