import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("three SCADA scenes share a compact command board and give remaining width to LED panels", () => {
  const scenes = [
    ["ConveyorScene.tsx", 3],
    ["SortScene.tsx", 3],
    ["TankScene.tsx", 4],
  ];
  for (const [file, expectedButtons] of scenes) {
    const view = source("../src/components/ide/" + file);
    assert.match(view, /scada-control-shell/);
    assert.match(view, /scada-dashboard-grid/);
    assert.match(view, /scada-command-buttons grid max-w-\\[210px\\] grid-cols-2 gap-2/);
    assert.match(view, /scada-pilot-grid grid grid-cols-2 gap-2/);
    assert.match(view, /sort-panel min-w-0 rounded-lg/);
    assert.equal((view.match(/<MomentaryPushButton compact/g) ?? []).length,
      expectedButtons, file + " should use the smaller buttons");
  }
});

test("compact controls retain full momentary pointer and keyboard release behavior", () => {
  const buttons = source("../src/components/ide/MomentaryPushButton.tsx");
  assert.match(buttons, /compact\\?: boolean/);
  assert.match(buttons, /compact = false/);
  assert.match(buttons, /compact \\? "h-12 min-h-12 w-full/);
  for (const handler of ["onPointerDown","onPointerUp","onPointerCancel",
    "onLostPointerCapture","onKeyDown","onKeyUp","onBlur"]) {
    assert.match(buttons, new RegExp(handler + "="));
  }
  assert.match(buttons, /onChangeRef\\.current\\(false\\)/);
});

test("responsive dashboard reserves a narrow board and expands signal columns by SCADA panel width", () => {
  const css = source("../src/workspace.css");
  assert.match(css, /\\.scada-control-shell\\s*\\{\\s*container: scada \\/ inline-size/);
  assert.match(css, /@container scada \\(min-width: 540px\\)/);
  assert.match(css, /grid-template-columns: minmax\\(185px, 205px\\) minmax\\(0, 1fr\\)/);
  assert.match(css, /@container scada \\(min-width: 850px\\)/);
});
