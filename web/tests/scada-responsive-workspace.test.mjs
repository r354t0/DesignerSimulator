import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("all four SCADA scenes cap the process area and position commands in an independent sidebar",()=>{
  for(const scene of ["Conveyor","Sort","Tank","Traffic"]){
    const src=read("../src/components/ide/"+scene+"Scene.tsx");
    const workspace=src.indexOf('className="scada-scene-workspace"');
    const process=src.indexOf("scada-process-panel",workspace);
    const sidebar=src.indexOf('className="scada-scene-sidebar"',process);
    const commands=src.indexOf('className="scada-dashboard-grid',sidebar);
    assert.ok(workspace>=0&&workspace<process&&process<sidebar&&sidebar<commands,
      scene+": process must precede sidebar and command/LED dashboard");
    assert.match(src,/aria-label="Controles e indicadores del SCADA"/);
    assert.match(src,/sort-scada-shell scada-control-shell/);
    assert.equal((src.match(/scada-scene-workspace/g)||[]).length,1);
    assert.equal((src.match(/scada-scene-sidebar/g)||[]).length,1);
  }
});

test("SCADA layout uses dock-panel width: max process 800px, wide side panels, compact LED columns",()=>{
  const css=read("../src/workspace.css");
  assert.match(css,/\.scada-process-panel\s*\{[^}]*max-width:\s*800px/s);
  assert.match(css,/@container scada \(min-width: 1000px\)/);
  assert.match(css,/grid-template-columns: minmax\(0, 800px\) minmax\(270px, 1fr\)/);
  assert.match(css,/@container scada \(min-width: 1550px\)/);
  assert.match(css,/grid-template-columns: 205px minmax\(0, 1fr\)/);
  assert.match(css,/\.scada-pilot-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  // The previously approved charcoal palette is unchanged.
  assert.match(css,/#0b1823/);
  assert.match(css,/#192c3b/);
  assert.doesNotMatch(css,/Neutral light HMI palette|\.sort-scada-shell\s*\{\s*background: #c0c0c0/);
});

test("process itself remains available before the sidebar, with the optional time panels retained",()=>{
  const tank=read("../src/components/ide/TankScene.tsx");
  const traffic=read("../src/components/ide/TrafficScene.tsx");
  assert.ok(tank.indexOf("scada-scene-sidebar")<tank.indexOf("Temporizadores TON"));
  assert.ok(traffic.indexOf("scada-scene-sidebar")<traffic.indexOf("Supervisión de ciclo"));
  for(const scene of ["Conveyor","Sort","Tank","Traffic"]){
    const src=read("../src/components/ide/"+scene+"Scene.tsx");
    assert.match(src,/Vista de proceso/);
    assert.match(src,/Tablero de mando/);
  }
});
