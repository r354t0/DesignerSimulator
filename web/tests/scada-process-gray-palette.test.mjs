import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("the four process simulation canvases use white #FFFFFF", () => {
  for (const scene of ["Conveyor", "Sort", "Tank", "Traffic"]) {
    const view = source("../src/components/ide/"+scene+"Scene.tsx");
    // The sorter draws its simulation in a dedicated SVG component.
    const canvas = scene === "Sort"
      ? source("../src/components/ide/SortProcessGraphic.tsx") : view;
    assert.match(canvas, /scada-process-canvas/, scene);
    assert.match(canvas, /bg-\[#ffffff\]/, scene);
    assert.match(view, /scada-process-panel/, scene);
    assert.match(view, /scada-scene-workspace/, scene);
  }
  for (const scene of ["Conveyor", "Tank", "Traffic"]) {
    const view = source("../src/components/ide/"+scene+"Scene.tsx");
    assert.match(view, /<rect width="760" height="(?:260|290|440)" fill="#ffffff"\s*\/>/, scene);
  }
  const sorter = source("../src/components/ide/SortProcessGraphic.tsx");
  assert.match(sorter, /<rect width="760" height="320" fill="#ffffff"\s*\/>/);
  assert.doesNotMatch(sorter, /<rect width="760" height="320" fill="#101f2c"/);
  const traffic = source("../src/components/ide/TrafficScene.tsx");
  assert.doesNotMatch(traffic, /<rect width="760" height="440" fill="#17342f"/);
});

test("labels and roads/equipment retain contrast while operation LEDs remain independent", () => {
  const sorter = source("../src/components/ide/SortProcessGraphic.tsx");
  assert.match(sorter, /TRANSPORTE Y DESVÍO · DV-01/);
  assert.match(sorter, /fill="#263b4b"/);
  const conveyor = source("../src/components/ide/ConveyorScene.tsx");
  assert.match(conveyor, /fill="#183c51" fontWeight="700">PE-01/);
  const tank = source("../src/components/ide/TankScene.tsx");
  assert.match(tank, /fill="#334155" fontWeight="700"/);
  const traffic = source("../src/components/ide/TrafficScene.tsx");
  assert.match(traffic, /fill="#485560"/);
  assert.match(traffic, /fill="#1f3443"/);
  for (const scene of ["Conveyor", "Sort", "Tank", "Traffic"]) {
    const view = source("../src/components/ide/"+scene+"Scene.tsx");
    assert.match(view, /scada-pilot-grid/, scene);
  }
});

test("dark SCADA chrome remains unchanged and white is scoped to process area", () => {
  const css = source("../src/workspace.css");
  assert.match(css, /\.sort-scada-shell\s*\{[\s\S]*?#0b1823;/);
  assert.match(css, /\.sort-panel\s*\{[\s\S]*?background: linear-gradient\(145deg, #192c3b 0%, #12212e 100%\)/);
  assert.match(css, /\.scada-process-canvas\s*\{\s*background: #ffffff;/);
  assert.doesNotMatch(css, /Neutral light HMI palette|\.sort-scada-shell\s*\{\s*background: #ffffff;/);
});
