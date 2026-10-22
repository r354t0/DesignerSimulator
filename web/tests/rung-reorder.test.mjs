import test from "node:test";
import assert from "node:assert/strict";
import {
  createRung, initialPracticeProject, insertInstruction,
  createParallelBranch, addParallelContact, createEmptyOutputBranch, moveRung,
} from "../src/plc/practiceDocument.ts";
import { getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import {
  initialPracticeScanState, startPracticeScans, changePracticeScanProject,
} from "../src/plc/practiceScanCycle.ts";
import { LADDER_RUNG_MIME, LADDER_MOVE_MIME, LADDER_TAG_MIME } from "../src/plc/ladderDragDrop.ts";

function sample() {
  let project = initialPracticeProject();
  for (const id of ["rung-2", "rung-3", "rung-4"]) {
    project = createRung(project, id);
  }
  project = insertInstruction(project, "rung-2", 0, {
    id: "rung2-xic", kind: "XIC", tag: "Start_PB",
  });
  project = insertInstruction(project, "rung-2", 1, {
    id: "rung2-ote", kind: "OTE", tag: "Motor_Run",
  });
  project = createParallelBranch(project, "rung-2", "rung2-xic");
  project = addParallelContact(project, "rung-2", "rung2-xic", {
    id: "rung2-or", kind: "XIO", tag: "Stop_PB",
  }, 0);
  project = createEmptyOutputBranch(project, "rung-2");
  return project;
}

test("whole-rung drag has a MIME type distinct from instruction and tag drags", () => {
  assert.notEqual(LADDER_RUNG_MIME, LADDER_MOVE_MIME);
  assert.notEqual(LADDER_RUNG_MIME, LADDER_TAG_MIME);
});

test("move first rung after last, preserving content and source immutability", () => {
  const project = sample();
  const originalRung = project.rungs[0];
  const next = moveRung(project, "rung-1", "rung-4", "after");
  assert.deepEqual(next.rungs.map((rung) => rung.id),
    ["rung-2", "rung-3", "rung-4", "rung-1"]);
  assert.equal(next.rungs.at(-1), originalRung);
  assert.equal(project.rungs[0], originalRung);
  assert.deepEqual(project.rungs.map((rung) => rung.id),
    ["rung-1", "rung-2", "rung-3", "rung-4"]);
});

test("move nested OR rung before the first rung without losing its branches", () => {
  const project = sample();
  const complexRung = project.rungs[1];
  const next = moveRung(project, "rung-2", "rung-1", "before");
  assert.deepEqual(next.rungs.map((rung) => rung.id),
    ["rung-2", "rung-1", "rung-3", "rung-4"]);
  assert.equal(next.rungs[0], complexRung);
  assert.deepEqual(next.rungs[0].instructions, complexRung.instructions);
  assert.deepEqual(next.rungs[0].parallelBranches, complexRung.parallelBranches);
  assert.deepEqual(next.rungs[0].emptyOutputBranches, complexRung.emptyOutputBranches);
});

test("moving up/down repeatedly works and adjacent/self-drops are no-ops", () => {
  const project = sample();
  const raised = moveRung(project, "rung-3", "rung-2", "before");
  assert.deepEqual(raised.rungs.map((rung) => rung.id),
    ["rung-1", "rung-3", "rung-2", "rung-4"]);
  const dropped = moveRung(raised, "rung-3", "rung-4", "after");
  assert.deepEqual(dropped.rungs.map((rung) => rung.id),
    ["rung-1", "rung-2", "rung-4", "rung-3"]);
  assert.equal(moveRung(project, "rung-2", "rung-2", "after"), project);
  assert.equal(moveRung(project, "rung-2", "rung-3", "before"), project);
  assert.equal(moveRung(project, "rung-2", "rung-1", "after"), project);
});

test("unknown IDs or invalid positioning reject the change without data loss", () => {
  const project = sample();
  assert.throws(() => moveRung(project, "missing", "rung-1", "before"), /No se encontró/);
  assert.throws(() => moveRung(project, "rung-1", "missing", "after"), /No se encontró/);
  assert.throws(() => moveRung(project, "rung-1", "rung-2", "invalid"), /Posición/);
  assert.equal(project.rungs.length, 4);
});

test("changing rung sequence invalidates the build and stops active scans", () => {
  const project = sample();
  const reordered = moveRung(project, "rung-2", "rung-1", "before");
  assert.notEqual(getPracticeBuildSignature(reordered), getPracticeBuildSignature(project));
  assert.equal(reordered.tags, project.tags);
  const running = startPracticeScans(initialPracticeScanState(project));
  assert.equal(running.mode, "running");
  const edited = changePracticeScanProject(running, reordered);
  assert.equal(edited.mode, "stopped");
  assert.deepEqual(edited.project.rungs.map((rung) => rung.id),
    ["rung-2", "rung-1", "rung-3", "rung-4"]);
  assert.equal(edited.frame, null);
});
