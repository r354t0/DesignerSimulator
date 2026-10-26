import test from "node:test";
import assert from "node:assert/strict";
import {
  createRung,
  insertRungBelow,
  removeRung,
  insertInstruction,
  addParallelContact,
  createParallelBranch,
  getParallelBranchTarget,
  initialPracticeProject,
} from "../src/plc/practiceDocument.ts";
import {
  resolveLadderDeleteAction,
  shouldDeleteSelectedInstruction,
  shouldDeleteSelectedRung,
} from "../src/plc/ladderShortcuts.ts";

const xic = (id) => ({ id, kind: "XIC", tag: "" });
const xio = (id) => ({ id, kind: "XIO", tag: "" });
const ote = (id) => ({ id, kind: "OTE", tag: "" });
const ids = (project) => project.rungs.map((rung) => rung.id);

test("first toolbar action inserts immediately below selected rung preserving order", () => {
  let project = createRung(initialPracticeProject(), "rung-2");
  project = createRung(project, "rung-3");
  const previous = project;
  project = insertRungBelow(project, "new-rung", "rung-1");
  assert.deepEqual(ids(project), ["rung-1", "new-rung", "rung-2", "rung-3"]);
  assert.deepEqual(ids(previous), ["rung-1", "rung-2", "rung-3"]);
  assert.deepEqual(project.rungs[1].instructions, []);
  assert.deepEqual(project.rungs[1].parallelBranches, []);
});

test("insert after last rung, append without selection, and create first rung in empty document", () => {
  let p = initialPracticeProject();
  p = insertRungBelow(p, "second", "rung-1");
  p = insertRungBelow(p, "third", null);
  assert.deepEqual(ids(p), ["rung-1", "second", "third"]);
  assert.deepEqual(ids(insertRungBelow(removeRung(p, "rung-1"), "first", "third")),
    ["second", "third", "first"]);
  let none = { ...p, rungs: [] };
  none = insertRungBelow(none, "fresh");
  assert.deepEqual(ids(none), ["fresh"]);
  assert.throws(() => insertRungBelow(p, "bad", "not-a-rung"), /seleccionado/);
  assert.throws(() => insertRungBelow(p, "rung-1", "third"), /ya existe/);
});

test("second toolbar action resolves selected contact or first unused contact in selected rung", () => {
  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = insertInstruction(p, "rung-1", 1, xio("stop"));
  p = insertInstruction(p, "rung-1", 2, ote("motor"));
  p = insertInstruction(p, "rung-2", 0, xic("sensor"));

  assert.deepEqual(getParallelBranchTarget(p, "stop", "rung-2"),
    { rungId: "rung-1", anchorId: "stop" });
  assert.deepEqual(getParallelBranchTarget(p, null, "rung-1"),
    { rungId: "rung-1", anchorId: "start" });
  assert.deepEqual(getParallelBranchTarget(p, null, "rung-2"),
    { rungId: "rung-2", anchorId: "sensor" });
  assert.equal(getParallelBranchTarget(p, "motor", "rung-1"), null);
  assert.equal(getParallelBranchTarget(p, null, null), null);

  p = createParallelBranch(p, "rung-1", "start");
  assert.deepEqual(getParallelBranchTarget(p, null, "rung-1"),
    { rungId: "rung-1", anchorId: "start" });
  assert.deepEqual(getParallelBranchTarget(p, "start", "rung-1"),
    { rungId: "rung-1", anchorId: "start" });
  p = addParallelContact(p, "rung-1", "start", xic("parallel"));
  assert.equal(getParallelBranchTarget(p, "parallel", "rung-1"), null);
  p = createParallelBranch(p, "rung-1", "stop");
  assert.deepEqual(getParallelBranchTarget(p, null, "rung-1"),
    { rungId: "rung-1", anchorId: "start" });
});

test("Delete prioritizes selected instruction; selected rung deletes full network", () => {
  const ready = {
    key: "Delete", isTextEditing: false, isTagSelectorOpen: false, isDragging: false,
    hasSelectedInstruction: false, hasSelectedRung: true,
  };
  assert.equal(resolveLadderDeleteAction(ready), "rung");
  assert.equal(shouldDeleteSelectedRung(ready), true);
  assert.equal(shouldDeleteSelectedInstruction(ready), false);
  assert.equal(resolveLadderDeleteAction({ ...ready, hasSelectedInstruction: true }), "instruction");
  assert.equal(resolveLadderDeleteAction({ ...ready, hasSelectedRung: false }), null);

  let p = createRung(initialPracticeProject(), "rung-2");
  p = insertInstruction(p, "rung-1", 0, xic("start"));
  p = addParallelContact(p, "rung-1", "start", xio("bypass"));
  p = insertInstruction(p, "rung-1", 1, ote("out"));
  p = insertInstruction(p, "rung-2", 0, xic("keep"));
  const previous = p;
  p = removeRung(p, "rung-1");
  assert.deepEqual(ids(p), ["rung-2"]);
  assert.deepEqual(p.rungs[0].instructions.map((i) => i.id), ["keep"]);
  assert.equal(previous.rungs[0].parallelBranches[0].instructions[0].id, "bypass");
});

test("Delete never affects text editing, tag dialogs, dragging or modified keys", () => {
  const base = {
    key: "Delete", hasSelectedInstruction: false, hasSelectedRung: true,
    isTextEditing: false, isTagSelectorOpen: false, isDragging: false,
  };
  for (const name of ["isTextEditing", "isTagSelectorOpen", "isDragging", "ctrlKey", "altKey", "metaKey"]) {
    assert.equal(resolveLadderDeleteAction({ ...base, [name]: true }), null, name);
  }
  assert.equal(resolveLadderDeleteAction({ ...base, key: "Backspace" }), null);
});
