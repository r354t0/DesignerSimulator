import test from "node:test";
import assert from "node:assert/strict";
import {
  createParallelBranch, addParallelContact, createRung, insertInstruction,
  getOrMainContactIds, initialPracticeProject, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { getRungGeometry, CONTACT_STEP } from "../src/plc/ladderDragDrop.ts";
import { getWrappedRungLayout, findWrappedLadderDropTarget } from "../src/plc/ladderWrappedLayout.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";

const c = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const o = (id, tag = "Motor_Run") => ({ id, kind: "OTE", tag });
const val = (project, name) => project.tags.find((tag) => tag.name === name)?.value;

function upperPath() {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, c("start"));
  project = insertInstruction(project, "rung-1", 1, o("output"));
  project = createParallelBranch(project, "rung-1", "start");
  const branchId = project.rungs[0].parallelBranches[0].id;
  project = addParallelContact(project, "rung-1", "start", c("bypass", "Auto_Mode"), 0, branchId);
  return { project, branchId };
}

test("main contact inserted after OR anchor extends its upper series path", () => {
  let { project } = upperPath();
  project = insertInstruction(project, "rung-1", 1, c("stop", "Stop_PB"));
  project = insertInstruction(project, "rung-1", 2, c("estop", "Lamp_Run"));
  assert.deepEqual(getOrMainContactIds(project.rungs[0], "start"), ["start", "stop", "estop"]);
  assert.deepEqual(project.rungs[0].instructions.map((part) => part.id),
    ["start", "stop", "estop", "output"]);
  const geometry = getRungGeometry(project.rungs[0]);
  assert.equal(geometry.groups.length, 1);
  assert.deepEqual(geometry.groups[0].mainIds, ["start", "stop", "estop"]);
  assert.equal(geometry.groups[0].mainCenters[1] - geometry.groups[0].mainCenters[0], CONTACT_STEP);
});

test("OR bypass carries power when upper path has multiple contacts in series", () => {
  let { project } = upperPath();
  project = insertInstruction(project, "rung-1", 1, c("stop", "Stop_PB"));
  assert.equal(buildPracticeProject(project).success, true);
  project = setTagValue(project, "Start_PB", true);
  // upper series path is blocked by Stop_PB=0 but OR bypass conducts via Auto_Mode=1
  project = setTagValue(project, "Auto_Mode", true);
  let scan = evaluateSeriesScan(project);
  assert.equal(scan.instructionFlow.start.powerOut, true);
  assert.equal(scan.instructionFlow.stop.powerOut, false);
  assert.equal(scan.joinedPower.start, true);
  assert.equal(val(scan.project, "Motor_Run"), true);
  project = setTagValue(project, "Auto_Mode", false);
  scan = evaluateSeriesScan(project);
  assert.equal(val(scan.project, "Motor_Run"), false);
  project = setTagValue(project, "Stop_PB", true);
  scan = evaluateSeriesScan(project);
  assert.equal(val(scan.project, "Motor_Run"), true);
});

test("all sibling OR lanes extend together and Build signature tracks the join point", () => {
  let { project } = upperPath();
  project = createParallelBranch(project, "rung-1", "start");
  const next = insertInstruction(project, "rung-1", 1, c("second"));
  assert.notEqual(getPracticeBuildSignature(project), getPracticeBuildSignature(next));
  assert.ok(next.rungs[0].parallelBranches.every((branch) => branch.endId === "second"));
});

test("long rung folds into additional lines without moving the OTE out of its rung", () => {
  let project = initialPracticeProject();
  for (let i = 0; i < 7; i++) {
    project = insertInstruction(project, "rung-1", i, c("c-" + i));
  }
  project = insertInstruction(project, "rung-1", 7, o("out"));
  const layout = getWrappedRungLayout(project.rungs[0], 760);
  assert.equal(layout.wrapped, true);
  assert.ok(layout.rows.length >= 2);
  assert.ok(layout.height > layout.rows[0].height);
  assert.ok(layout.coilY > layout.rows[0].mainY);
  assert.equal(layout.groups.length, 7);
  assert.ok(layout.groups.at(-1).mainY > layout.groups[0].mainY);
});

test("new rows support drag/drop to the main path", () => {
  let project = initialPracticeProject();
  for (let i = 0; i < 7; i++) {
    project = insertInstruction(project, "rung-1", i, c("c-" + i));
  }
  const layout = getWrappedRungLayout(project.rungs[0], 760, true);
  assert.ok(layout.rows.length > 1);
  const nextRow = layout.rows[1];
  const drop = findWrappedLadderDropTarget(project, "rung-1", "XIC",
    nextRow.groups[0].mainCenters[0] + 39, nextRow.mainY, 760);
  assert.equal(drop?.lane, "main");
  assert.ok((drop?.position ?? 0) >= 5);
  assert.equal(drop?.y, nextRow.mainY);
});

test("OR group remains undivided when layout wraps; branches keep their own coordinates", () => {
  let { project, branchId } = upperPath();
  project = insertInstruction(project, "rung-1", 1, c("second", "Stop_PB"));
  for (let i = 0; i < 7; i++) {
    project = insertInstruction(project, "rung-1", i + 2, c("other-" + i));
  }
  const layout = getWrappedRungLayout(project.rungs[0], 760);
  const group = layout.groups.find((item) => item.anchorId === "start");
  assert.ok(group);
  assert.deepEqual(group.mainIds.slice(0, 2), ["start", "second"]);
  assert.equal(group.branchLanes[0].id, branchId);
  assert.equal(group.branchLanes[0].y, group.mainY + 79);
  assert.ok(layout.rows.length >= 2);
});
