import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createGearCompleteProject} from "../src/plc/gearSprayCompleteProgram.ts";
import {initialGearPhysicalState,configureGearPhysical} from "../src/plc/gearSprayPhysics.ts";
import {initialPracticeScanState,startPracticeScans,tickPracticeScan}
  from "../src/plc/practiceScanCycle.ts";
import {setTagValue} from "../src/plc/practiceDocument.ts";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Scene 06 is born with full P01-P07 Ladder and preserves it while visiting other scenes",()=>{
  const app=source("../src/App.tsx");
  assert.match(app,/gear:\s*initialPracticeScanState\(createGearCompleteProject\(\)\)/);
  assert.match(app,/sceneSessions\.current\[previous\] = stopPracticeScans\(current\)/);
  assert.match(app,/return stopPracticeScans\(sceneSessions\.current\[next\]\)/);
  const p=createGearCompleteProject();
  for(const program of ["p01","p02","p03","p04","p05","p06","p07"])
    assert.ok(p.rungs.some(r=>r.id.includes(program)),program);
  assert.equal(initialPracticeScanState(p).mode,"stopped");
});

test("Information reset returns canonical program and physics including counters, tags and setpoints",()=>{
  const app=source("../src/App.tsx");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(app,/const resetGearProgram=useCallback/);
  assert.match(app,/window\.confirm\(/);
  assert.match(app,/\.\.\.initialPracticeScanState\(createGearCompleteProject\(\)\)/);
  assert.match(app,/changeGearPhysical\(\(\)=>initialGearPhysicalState\(\)\)/);
  assert.match(app,/setGearSetupError\(null\)/);
  assert.match(app,/onResetProgram=\{resetGearProgram\}/);
  assert.match(scene,/onClick=\{onResetProgram\}/);
  assert.match(scene,/Reiniciar programa/);
  assert.match(scene,/InfoModal[\s\S]*onResetProgram/);
  let changed=startPracticeScans(initialPracticeScanState(createGearCompleteProject()));
  changed=tickPracticeScan(changed);
  const modified=setTagValue(changed.project,"TMR_Freq_SP",150000);
  assert.notDeepEqual(modified,createGearCompleteProject());
  const restored=initialPracticeScanState(createGearCompleteProject());
  assert.deepEqual(restored.project,createGearCompleteProject());
  assert.equal(restored.mode,"stopped");
  assert.equal(restored.scanCount,0);
  assert.equal(restored.project.tags.find(t=>t.name==="TMR_Freq_SP").value,60000);
  const injected=configureGearPhysical(initialGearPhysicalState(),{
    enabled:true,airSupply:50,drumPercent:10,pressureDecayFactor:4,airLoss:true
  });
  assert.notDeepEqual(injected,initialGearPhysicalState());
  assert.equal(initialGearPhysicalState().enabled,false);
});

test("Analog checkbox shows either original analog controls or complete physical panel",()=>{
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(scene,/Entradas analógicas/);
  assert.match(scene,/aria-label="Simulación física automática"/);
  assert.match(scene,/checked=\{physics.enabled\}/);
  assert.match(scene,/onPhysicsChange\(\{enabled:e.target.checked\}\)/);
  assert.match(scene,/\{physics.enabled \? \(/);
  assert.match(scene,/Modelo físico · Fase 2/);
  assert.match(scene,/Aire disponible en la acometida/);
  assert.match(scene,/Lubricante disponible en el tambor/);
  assert.match(scene,/Velocidad de pérdida de presión/);
  assert.match(scene,/Inyección de fallas físicas/);
  assert.match(scene,/\) : \(\s*<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">/);
  assert.match(scene,/GEAR_FIELD_INPUTS.filter\(x=>x.type==="REAL"\)/);
  assert.match(scene,/Setpoints de operación/);
  assert.doesNotMatch(scene,/Banco de pruebas FAT · Etapa B/);
  assert.doesNotMatch(scene,/Fase 3 · P01–P07 sistema integrado/);
  assert.doesNotMatch(scene,/Cargar P01–P07 \(FAT integrado\)/);
  assert.doesNotMatch(scene,/Cargar Ladder temporal FAT/);
});
