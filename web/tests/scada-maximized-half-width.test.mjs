import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("../src/App.tsx");
const css=read("../src/workspace.css");

test("Maximize tabset detection only activates for visible simulation tab, not the Ladder editor",()=>{
  assert.match(app,/tabSetEnableMaximize: true/);
  assert.match(app,/const \[simulationMaximized, setSimulationMaximized\] = useState\(false\)/);
  assert.match(app,/const maximized = updatedModel\.getMaximizedTabset\(\)/);
  assert.match(app,/setSimulationMaximized\(maximized\?\.getSelectedNode\(\)\?\.getId\(\) === "simulation"\)/);
  assert.match(app,/onModelChange=\{syncTabSelection\}/);
  assert.match(app,/simulationMaximized \? " scada-tabset-maximized" : ""/);
  assert.match(app,/getNodeById\("workspace-editor"\)/);
});

test("in maximized tabset every scene has two equal proportional 50%-maximum columns",()=>{
  assert.match(css,/@container scada \(min-width: 1024px\)/);
  assert.match(css,/\.scada-tabset-maximized \.scada-scene-workspace,\s*\.scada-tabset-maximized \.batch-scada-shell \.scada-scene-workspace\s*\{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css,/\.scada-tabset-maximized \.scada-process-panel,\s*\.scada-tabset-maximized \.batch-scada-shell \.scada-process-panel\s*\{\s*max-width: 100%/);
  assert.match(css,/@container scada \(max-width: 1023\.98px\)/);
  assert.match(css,/grid-template-columns: minmax\(0, 1fr\);\s*\}\s*\}\s*$/);
});

test("all five SCADA scenes use the shared responsive workspace and keep process before controls",()=>{
  for(const name of ["Conveyor","Sort","Tank","Traffic","BatchMixer"]){
    const code=read("../src/components/ide/"+name+"Scene.tsx");
    const root=code.indexOf("scada-control-shell");
    const process=code.indexOf('className="scada-scene-workspace"');
    const panel=code.indexOf("scada-process-panel",process);
    const sidebar=code.indexOf("scada-scene-sidebar",panel);
    assert.ok(root>=0&&process>root&&panel>process&&sidebar>panel,
      name+": Maximize layout must apply equally to process/sidebar");
    assert.match(code,/Vista de proceso/);
    assert.match(code,/Tablero de mando/);
  }
});

test("normal tabset retains previous 800px / Batch Mixer 1120px process limits",()=>{
  assert.match(css,/\.scada-process-panel\s*\{[^}]*max-width: 800px/s);
  assert.match(css,/\.batch-scada-shell \.scada-process-panel\s*\{\s*max-width: 1120px/);
  assert.match(css,/\.scada-control-shell\s*\{\s*container: scada \/ inline-size/);
  assert.match(css,/\.scada-scene-sidebar\s*\{[^}]*gap: 12px/s);
});
