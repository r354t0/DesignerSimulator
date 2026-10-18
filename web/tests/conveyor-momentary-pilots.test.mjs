import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyConveyorMomentaryInput, createConveyorExampleProject, readConveyorBool,
} from "../src/plc/conveyorSceneModel.ts";
import {
  initialPracticeScanState, startPracticeScans,
} from "../src/plc/practiceScanCycle.ts";

const scene = readFileSync(new URL("../src/components/ide/ConveyorScene.tsx", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/ide/MomentaryPushButton.tsx", import.meta.url), "utf8");

test("SCADA START/STOP are momentary digital inputs instead of toggle buttons", () => {
  assert.match(scene,/MomentaryPushButton compact name="START"/);
  assert.match(scene,/MomentaryPushButton compact name="STOP"/);
  assert.match(scene,/onChange=\{\(pressed\) => onInputChange\("PB_Start", pressed\)\}/);
  assert.match(scene,/onChange=\{\(pressed\) => onInputChange\("PB_Stop", pressed\)\}/);
  assert.doesNotMatch(scene,/onClick=\{\(\) => onInputChange\("PB_Start", !start\)\}/);
  assert.doesNotMatch(scene,/onClick=\{\(\) => onInputChange\("PB_Stop", !stop\)\}/);
});

test("momentary button handles pointer, touch, cancel, keyboard and focus interruptions", () => {
  assert.match(button,/onPointerDown=\{onPointerDown\}/);
  assert.match(button,/setPointerCapture\(event\.pointerId\)/);
  assert.match(button,/onPointerUp=\{\(event\) => releasePointer\(event\.pointerId\)\}/);
  assert.match(button,/onPointerCancel=\{\(event\) => releasePointer\(event\.pointerId\)\}/);
  assert.match(button,/onLostPointerCapture=\{\(event\) => releasePointer\(event\.pointerId\)\}/);
  assert.match(button,/onKeyDown=\{onKeyDown\}/);
  assert.match(button,/onKeyUp=\{onKeyUp\}/);
  assert.match(button,/event\.key !== " " && event\.key !== "Enter"/);
  assert.match(button,/window\.addEventListener\("blur"/);
  assert.match(button,/document\.addEventListener\("visibilitychange"/);
  assert.match(button,/onBlur=\{releaseAll\}/);
  assert.match(button,/onChangeRef\.current\(false\)/);
  assert.doesNotMatch(button,/onClick=/,"no sticky synthetic click handler");
});

test("momentary START/STOP pulses still drive MainRoutine latch and unlatch", () => {
  let state = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  const input = (name, pressed) => {
    state = applyConveyorMomentaryInput(state, name, pressed);
  };
  input("PB_Start",true);
  assert.equal(readConveyorBool(state.project,"DO_Motor"),true);
  input("PB_Start",false);
  assert.equal(readConveyorBool(state.project,"PB_Start"),false);
  assert.equal(readConveyorBool(state.project,"DO_Motor"),true);
  input("PB_Stop",true);
  assert.equal(readConveyorBool(state.project,"DO_Motor"),false);
  input("PB_Stop",false);
  assert.equal(readConveyorBool(state.project,"PB_Stop"),false);
  assert.equal(readConveyorBool(state.project,"DO_Motor"),false);
});

test("drive motor is on the left, no longer a right-side appendage", () => {
  assert.match(scene,/<g transform="translate\(100 0\)">/);
  assert.match(scene,/<rect x="47" y="175" width="83" height="62"/);
  assert.match(scene,/transformOrigin: "89px 206px"/);
  assert.match(scene,/MOTOR \{motorOn \? "RUN" : "OFF"\}/);
  assert.doesNotMatch(scene,/x="625" y="176" width="78"/);
  assert.doesNotMatch(scene,/transformOrigin: "664px 206px"/);
  assert.match(scene,/scene\.items\.map/);
  assert.match(scene,/CONVEYOR_SENSOR_POSITION \* CONVEYOR_BELT_LENGTH_PX/);
  assert.match(scene,/animationPlayState: motorOn \? "running" : "paused"/);
});

test("pilot LEDs replace raw tag/value table while retaining box counter", () => {
  assert.match(scene,/function PilotLed/);
  assert.match(scene,/Pilotos LED/);
  assert.match(scene,/label="EN MARCHA" lit=\{motorOn\} tone="green"/);
  assert.match(scene,/label="DETENIDA" lit=\{!motorOn\} tone="red"/);
  assert.match(scene,/label="PE-01 · CAJA" lit=\{sensor\} tone="amber"/);
  assert.match(scene,/role="status" aria-label=\{label \+ ": " \+ \(lit \? "encendido" : "apagado"\)\}/);
  assert.match(scene,/Cajas detectadas/);
  assert.match(scene,/readConveyorCount\(project\)/);
  assert.doesNotMatch(scene,/Señales de la escena/);
  assert.doesNotMatch(scene,/DO_Motor = \{Number\(motorOn\)\}/);
  assert.match(scene,/Objetivo y mapa E\/S/);
  assert.match(scene,/aria-label="Información de la escena"/);
});
