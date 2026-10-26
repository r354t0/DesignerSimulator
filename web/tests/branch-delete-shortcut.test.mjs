import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveLadderDeleteAction,
  shouldDeleteSelectedBranch,
} from "../src/plc/ladderShortcuts.ts";
import {
  addParallelContact,
  createParallelBranch,
  initialPracticeProject,
  insertInstruction,
  removeParallelBranch,
} from "../src/plc/practiceDocument.ts";

const base = {
  key: "Delete", hasSelectedInstruction: false, hasSelectedBranch: true,
  hasSelectedRung: false, isTextEditing: false,
  isTagSelectorOpen: false, isDragging: false,
};
const instruction = (id, kind = "XIC") => ({ id, kind, tag: "" });

test("Delete recognizes selected OR branch and prioritizes against its parent rung", () => {
  assert.equal(resolveLadderDeleteAction(base), "branch");
  assert.equal(shouldDeleteSelectedBranch(base), true);
  assert.equal(resolveLadderDeleteAction({ ...base, hasSelectedRung: true }), "branch");
  assert.equal(resolveLadderDeleteAction({ ...base, hasSelectedInstruction: true }), "instruction");
  assert.equal(resolveLadderDeleteAction({ ...base, hasSelectedBranch: false, hasSelectedRung: true }), "rung");
  assert.equal(resolveLadderDeleteAction({ ...base, hasSelectedBranch: false }), null);
});

test("editing tags, dialogs, dragging or shortcut modifiers never delete a branch", () => {
  for (const field of ["isTextEditing", "isTagSelectorOpen", "isDragging", "ctrlKey", "altKey", "metaKey"]) {
    assert.equal(resolveLadderDeleteAction({ ...base, [field]: true }), null, field);
  }
  assert.equal(resolveLadderDeleteAction({ ...base, key: "Backspace" }), null);
});

test("Delete of selected populated OR branch retains parent rung and sibling OR lanes", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, instruction("anchor"));
  project = insertInstruction(project, "rung-1", 1, instruction("motor", "OTE"));
  project = createParallelBranch(project, "rung-1", "anchor");
  project = createParallelBranch(project, "rung-1", "anchor");
  project = createParallelBranch(project, "rung-1", "anchor");
  const [first, second, third] = project.rungs[0].parallelBranches;
  project = addParallelContact(project, "rung-1", "anchor", instruction("p1"), 0, first.id);
  project = addParallelContact(project, "rung-1", "anchor", instruction("p2"), 0, second.id);
  project = addParallelContact(project, "rung-1", "anchor", instruction("p3"), 0, second.id);
  project = addParallelContact(project, "rung-1", "anchor", instruction("p4"), 0, third.id);
  const before = project;
  project = removeParallelBranch(project, "rung-1", "anchor", second.id);
  assert.deepEqual(project.rungs[0].instructions.map((item) => item.id), ["anchor", "motor"]);
  assert.deepEqual(project.rungs[0].parallelBranches.map((branch) => branch.id), [first.id, third.id]);
  assert.deepEqual(project.rungs[0].parallelBranches.map((branch) => branch.instructions.map((part) => part.id)),
    [["p1"], ["p4"]]);
  assert.equal(before.rungs[0].parallelBranches.length, 3);
});

test("Delete of selected empty OR path removes only that path", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, instruction("anchor"));
  project = createParallelBranch(project, "rung-1", "anchor");
  const selectedBranchId = project.rungs[0].parallelBranches[0].id;
  project = removeParallelBranch(project, "rung-1", "anchor", selectedBranchId);
  assert.deepEqual(project.rungs[0].parallelBranches, []);
  assert.equal(project.rungs[0].instructions[0].id, "anchor");
});
