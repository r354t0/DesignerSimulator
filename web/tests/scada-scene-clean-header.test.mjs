import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const conveyor = readFileSync(new URL("../src/components/ide/ConveyorScene.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../src/components/ide/ConveyorSceneInfoDialog.tsx", import.meta.url), "utf8");

test("the simulation navigation is a single compact selector, not large secondary tabs", () => {
  assert.match(app, /<select id="simulation-scene-selector" value=\{simulationTab\}/);
  assert.match(app, /chooseSimulationTab\(event\.target\.value as SimulationTab\)/);
  assert.match(app, /<option value="sorting">Clasificación de cajas<\/option>/);
  assert.match(app, /<option value="conveyor">Faja transportadora<\/option>/);
  assert.match(app, /<option value="motor">Motor · DEMO<\/option>/);
  assert.doesNotMatch(app, /aria-pressed=\{simulationTab === "conveyor"\}/);
  assert.doesNotMatch(app, /aria-pressed=\{simulationTab === "motor"\}/);
});

test("SCADA view has no extra documentation or PLC developer-status header", () => {
  assert.doesNotMatch(conveyor, /Escena 01 · Faja transportadora/);
  assert.doesNotMatch(conveyor, /Entradas físicas simuladas.*Controller Tags/);
  assert.doesNotMatch(conveyor, /PracticeRoutine (RUN|STOP|PAUSE)/);
  assert.doesNotMatch(conveyor, /Build y RUN se inician desde PracticeRoutine/);
  assert.doesNotMatch(conveyor, /Pulsadores tipo interruptor/);
  assert.doesNotMatch(conveyor, /<header className=/);
  assert.match(conveyor, /Línea de transporte/);
  assert.doesNotMatch(conveyor, /Motor_Run = \{Number\(motorOn\)\}/);
  assert.match(conveyor, /Objetivo y mapa E\/S/);
  assert.match(conveyor, /Tablero de mando/);
  assert.match(conveyor, /Pilotos LED/);
  assert.doesNotMatch(conveyor, /Señales de la escena/);
});

test("the information dialog remains accessible from a compact icon in the process card", () => {
  assert.match(conveyor, /aria-label="Información de la escena"/);
  assert.match(conveyor, /aria-haspopup="dialog" aria-expanded=\{infoOpen\}/);
  assert.match(conveyor, /onClick=\{\(\) => setInfoOpen\(true\)\}/);
  assert.match(conveyor, /<ConveyorSceneInfoDialog open=\{infoOpen\}/);
  assert.match(dialog, /Objetivo del ejercicio/);
  assert.match(dialog, /Mapa E\/S · Tags vinculados a la simulación/);
});

test("SCADA operator controls still update the PLC tags and physical scene", () => {
  assert.match(conveyor, /onChange=\{\(pressed\) => onInputChange\("Start_PB", pressed\)\}/);
  assert.match(conveyor, /onChange=\{\(pressed\) => onInputChange\("Stop_PB", pressed\)\}/);
  assert.match(conveyor, /onClick=\{onAddItem\}/);
  assert.match(conveyor, /onClick=\{onResetScene\}/);
  assert.match(conveyor, /CONVEYOR_SENSOR_TAG/);
  assert.match(conveyor, /readConveyorCount\(project\)/);
  assert.match(conveyor, /!wired &&/);
});
