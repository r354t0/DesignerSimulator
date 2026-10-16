import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialPracticeProject, createTag, editTag, setTagValue, insertInstruction,
} from "../src/plc/practiceDocument.ts";
import { getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import {
  changePracticeScanProject, initialPracticeScanState, startPracticeScans,
} from "../src/plc/practiceScanCycle.ts";
import {
  CONVEYOR_TAGS, hasConveyorTags, prepareConveyorTags,
  CONVEYOR_SENSOR_TAG, CONVEYOR_COUNT_TAG,
} from "../src/plc/conveyorSceneModel.ts";

test("scene defines a complete and self-documenting E/S contract", () => {
  assert.deepEqual(CONVEYOR_TAGS.map((tag) => [tag.name, tag.type, tag.direction]), [
    ["Start_PB", "BOOL", "Entrada"],
    ["Stop_PB", "BOOL", "Entrada"],
    ["CV_BoxSensor", "BOOL", "Entrada"],
    ["Motor_Run", "BOOL", "Salida"],
    ["CV_Count", "COUNTER", "Interna"],
  ]);
  for (const definition of CONVEYOR_TAGS) {
    assert.ok(definition.description.startsWith("Faja: "), definition.name);
  }
});

test("first entrance to conveyor prepares ALL five linked tags and useful descriptions", () => {
  const project = initialPracticeProject();
  const prepared = prepareConveyorTags(project);
  assert.equal(hasConveyorTags(project), false);
  assert.equal(hasConveyorTags(prepared), true);
  assert.equal(prepared.tags.length, project.tags.length + 2);
  assert.deepEqual(prepared.rungs, project.rungs);
  for (const definition of CONVEYOR_TAGS) {
    const tag = prepared.tags.find((entry) => entry.name === definition.name);
    assert.equal(tag.type, definition.type, definition.name);
    assert.equal(tag.description, definition.description, definition.name);
  }
  assert.equal(prepareConveyorTags(prepared), prepared,
    "reopening the scene must not duplicate tags or trigger a needless update");
});

test("scene preserves custom descriptions, tag values, and existing Ladder logic", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0,
    { id: "original-contact", kind: "XIC", tag: "Start_PB" });
  project = editTag(project, "Start_PB", { description: "Descripción personalizada del usuario" });
  project = setTagValue(project, "Start_PB", true);
  project = setTagValue(project, "Motor_Run", true);
  const rungReference = project.rungs;
  const prepared = prepareConveyorTags(project);
  assert.equal(prepared.rungs, rungReference);
  assert.equal(prepared.tags.find(t => t.name === "Start_PB").value, true);
  assert.equal(prepared.tags.find(t => t.name === "Motor_Run").value, true);
  assert.equal(prepared.tags.find(t => t.name === "Start_PB").description,
    "Descripción personalizada del usuario");
  assert.equal(prepareConveyorTags(prepared), prepared);
});

test("registering a scene with a conflicting tag type is atomic and non-destructive", () => {
  let project = initialPracticeProject();
  project = createTag(project, CONVEYOR_SENSOR_TAG, "Otra funcionalidad", "DINT");
  const originalTags = project.tags;
  assert.throws(() => prepareConveyorTags(project), /CV_BoxSensor.*BOOL.*DINT/);
  assert.equal(project.tags, originalTags);
  assert.equal(project.tags.some(t => t.name === CONVEYOR_COUNT_TAG), false,
    "never partially register scene tags before checking all conflicts");

  project = editTag(initialPracticeProject(), "Motor_Run", { type: "STRING" });
  assert.throws(() => prepareConveyorTags(project), /Motor_Run.*BOOL.*STRING/);
});

test("revisiting repairs missing tags but does not change an established PLC state", () => {
  let project = prepareConveyorTags(initialPracticeProject());
  project = setTagValue(project, CONVEYOR_COUNT_TAG, 7, "ACC");
  project = setTagValue(project, "Start_PB", true);
  project = editTag(project, "Motor_Run", { description: "Motor personalizado" });
  const original = project.tags.find(t => t.name === CONVEYOR_COUNT_TAG).value;
  const prepared = prepareConveyorTags(project);
  assert.equal(prepared, project);
  assert.equal(prepared.tags.find(t => t.name === CONVEYOR_COUNT_TAG).value, original);
  assert.equal(prepared.tags.find(t => t.name === "Motor_Run").description,
    "Motor personalizado");
});

test("filling a generic description does not invalidate a running controller build", () => {
  let project = prepareConveyorTags(initialPracticeProject());
  project = editTag(project, "Stop_PB", { description: "Pulsador de parada" });
  const signature = getPracticeBuildSignature(project);
  const result = prepareConveyorTags(project);
  assert.equal(getPracticeBuildSignature(result), signature);
  assert.notEqual(result, project);
  assert.equal(result.tags.find(t => t.name === "Stop_PB").description,
    CONVEYOR_TAGS.find(t => t.name === "Stop_PB").description);

  const run = startPracticeScans(initialPracticeScanState(project));
  const next = changePracticeScanProject(run, result);
  assert.equal(next.mode, "running", "display-only descriptions must not stop RUN");
});

test("scene is registered on activation and displays the complete I/O map", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const scene = readFileSync(new URL("../src/components/ide/ConveyorScene.tsx", import.meta.url), "utf8");
  assert.match(app, /useEffect\(\(\) => \{\s*if \(simulationTab === "conveyor"\) prepareConveyor\(\);/);
  assert.match(app, /next === state\.project \? state : changePracticeScanProject\(state, next\)/);
  assert.match(scene, /CONVEYOR_TAGS\.map\(/);
  assert.match(scene, /Mapa E\/S · Tags vinculados a la simulación/);
  assert.match(scene, /Abrir Controller Tags/);
});
