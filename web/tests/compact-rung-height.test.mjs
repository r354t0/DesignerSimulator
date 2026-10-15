import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_MAIN_Y, PRACTICE_BRANCH_Y, PRACTICE_BRANCH_GAP,
  PRACTICE_MAIN_HEIGHT, PRACTICE_OR_HEIGHT,
  getPracticeRungHeight, branchLaneY, findVisualLadderDropTarget,
} from "../src/plc/ladderDragDrop.ts";
import { getInstructionSelectionFrame } from "../src/plc/ladderSelection.ts";
import {
  initialPracticeProject, insertInstruction, createParallelBranch,
} from "../src/plc/practiceDocument.ts";

test("single rung is compact while leaving the comment and selection visible", () => {
  const frame = getInstructionSelectionFrame(2, 96);
  const height = getPracticeRungHeight(0);
  assert.equal(height, PRACTICE_MAIN_HEIGHT);
  assert.ok(height < 122, "reduce the previous oversized rung height");
  assert.ok(PRACTICE_MAIN_Y + frame.top >= 8, "compact top padding must still contain two-line comments");
  assert.ok(height - (PRACTICE_MAIN_Y + frame.top + frame.height) >= 3,
    "selected symbol must fit BELOW its rail with a small margin");
  assert.equal(getPracticeRungHeight(0, false), height);
  // Recover upper space without undoing the ONS bottom-margin correction.
  assert.ok(height <= 104, "shorter rung from reduced upper padding");
  assert.ok(height - (PRACTICE_MAIN_Y + 22) >= 8,
    "keep the lower ONS symbol clear of the next rung");
});

test("OR heights account for actual lanes and leave no large bottom padding", () => {
  const frame = getInstructionSelectionFrame(2, 96);
  assert.equal(getPracticeRungHeight(1), PRACTICE_OR_HEIGHT);
  assert.equal(getPracticeRungHeight(2), PRACTICE_OR_HEIGHT + PRACTICE_BRANCH_GAP);
  assert.equal(getPracticeRungHeight(3), PRACTICE_OR_HEIGHT + 2 * PRACTICE_BRANCH_GAP);
  for (const lanes of [1, 2, 3, 5]) {
    const bottomOfLast = branchLaneY(lanes - 1) + frame.top + frame.height;
    const height = getPracticeRungHeight(lanes);
    assert.ok(height - bottomOfLast >= 3, "last OR selection must fit inside rung");
    assert.ok(height - bottomOfLast <= 20, "compact margin below OR, including ONS label clearance");
  }
  assert.equal(getPracticeRungHeight(0, true), PRACTICE_OR_HEIGHT,
    "keep a provisional OR drop lane during an active drag");
  assert.ok(PRACTICE_BRANCH_Y - PRACTICE_MAIN_Y >= 78);
  assert.ok(PRACTICE_OR_HEIGHT - (PRACTICE_BRANCH_Y + 22) >= 8,
    "retain ONS bottom clearance in the lowest OR branch");
});

test("compact placement preserves main and OR drag-and-drop targets", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, {
    id: "contact", kind: "XIC", tag: "",
  });
  const mainTarget = findVisualLadderDropTarget(
    project, "rung-1", "XIC", 98, PRACTICE_MAIN_Y, 760,
  );
  assert.equal(mainTarget?.lane, "main");

  project = createParallelBranch(project, "rung-1", "contact");
  const branchTarget = findVisualLadderDropTarget(
    project, "rung-1", "XIO", 136, PRACTICE_BRANCH_Y, 760,
  );
  assert.equal(branchTarget?.lane, "parallel");
  assert.equal(branchTarget?.anchorId, "contact");
});
