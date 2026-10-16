import test from "node:test";
import assert from "node:assert/strict";
import { shouldDeleteSelectedInstruction } from "../src/plc/ladderShortcuts.ts";
import {
  addParallelContact,
  createRung,
  insertInstruction,
  initialPracticeProject,
  findInstruction,
  removeInstruction,
} from "../src/plc/practiceDocument.ts";

const ready = {
  key: "Delete",
  hasSelectedInstruction: true,
  isTextEditing: false,
  isTagSelectorOpen: false,
  isDragging: false,
};

test("Delete works only for a selected instruction in an editable rung", () => {
  assert.equal(shouldDeleteSelectedInstruction(ready), true);
  assert.equal(shouldDeleteSelectedInstruction({ ...ready, hasSelectedInstruction: false }), false);
  assert.equal(shouldDeleteSelectedInstruction({ ...ready, key: "Backspace" }), false);
  assert.equal(shouldDeleteSelectedInstruction({ ...ready, key: "Enter" }), false);
});

test("Delete never intercepts typing, tag pickers, dragging, or modified shortcuts", () => {
  for (const key of ["isTextEditing", "isTagSelectorOpen", "isDragging", "ctrlKey", "altKey", "metaKey"]) {
    assert.equal(shouldDeleteSelectedInstruction({ ...ready, [key]: true }), false, key);
  }
});

test("deleting selected contact removes it without deleting the rung or other instructions", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, { id: "selected", kind: "XIC", tag: "" });
  project = insertInstruction(project, "rung-1", 1, { id: "other", kind: "XIO", tag: "Stop_PB" });
  project = insertInstruction(project, "rung-1", 2, { id: "out", kind: "OTE", tag: "" });
  const previous = project;
  project = removeInstruction(project, "selected");
  assert.deepEqual(project.rungs[0].instructions.map((x) => x.id), ["other", "out"]);
  assert.equal(project.rungs.length, 1);
  assert.ok(findInstruction(previous, "selected"));
});

test("deleting a parallel contact preserves its OR path, deleting an anchor promotes the path", () => {
  let project = createRung(initialPracticeProject(), "rung-2");
  project = insertInstruction(project, "rung-1", 0, { id: "anchor", kind: "XIC", tag: "" });
  project = addParallelContact(project, "rung-1", "anchor", { id: "or-1", kind: "XIO", tag: "" });
  project = addParallelContact(project, "rung-1", "anchor", { id: "or-2", kind: "XIC", tag: "" });
  let updated = removeInstruction(project, "or-1");
  assert.deepEqual(updated.rungs[0].parallelBranches[0].instructions.map((x) => x.id), ["or-2"]);
  assert.equal(updated.rungs.length, 2);
  updated = removeInstruction(project, "anchor");
  assert.deepEqual(updated.rungs[0].instructions.map((x) => x.id), ["or-1", "or-2"]);
  assert.equal(updated.rungs[0].parallelBranches.length, 0);
});
