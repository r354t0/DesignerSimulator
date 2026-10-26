import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialBatchState,stepBatchPhysics,batchDigitalSensors,
  BATCH_FULL_PULSES,BATCH_VOLUME_PER_PULSE_PERCENT,
} from "../src/plc/batchMixerSceneModel.ts";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const idle={pump1:false,pump2:false,pump3:false,heater:false};
const p1={...idle,pump1:true};
const p2={...idle,pump2:true};
const drain={...idle,pump3:true};
const advance=(initial,outputs,ticks)=>{
  let state=initial;
  for(let i=0;i<ticks;i++)state=stepBatchPhysics(state,outputs,50);
  return state;
};

test("Batch Mixer: 40% P1 / 60% P2 reads 400/600 on first full tank",()=>{
  let s=advance(initialBatchState(),p1,100);
  assert.equal(s.level,40);
  assert.deepEqual(s.batchPulses,[400,0,0]);
  s=advance(s,p2,150);
  assert.equal(s.level,100);
  assert.deepEqual(s.batchPulses,[400,600,0]);
  assert.deepEqual(s.totalPulses,[400,600,0]);
  assert.equal(s.batchPulses[0]+s.batchPulses[1],BATCH_FULL_PULSES);
  assert.equal(batchDigitalSensors(s,32).DI_HighLevel,true);
});

test("Batch Mixer: keep completed ratio through discharge, reset only on new batch",()=>{
  let s=advance(advance(initialBatchState(),p1,100),p2,150);
  s=advance(s,drain,250);
  assert.equal(s.level,0);
  assert.deepEqual(s.batchPulses,[400,600,1000]);
  assert.deepEqual(s.totalPulses,[400,600,1000]);
  // First incoming pulse of the next fill clears only the presentation
  // counters; the lifetime flowmeter totals stay monotonic for PLC edges.
  s=stepBatchPhysics(s,p1,50);
  assert.equal(s.level,0.4);
  assert.deepEqual(s.batchPulses,[4,0,0]);
  assert.deepEqual(s.totalPulses,[404,600,1000]);
  s=advance(s,p1,99);
  s=advance(s,p2,150);
  assert.equal(s.level,100);
  assert.deepEqual(s.batchPulses,[400,600,0],
    "second correctly controlled batch also displays 400/600");
  assert.deepEqual(s.totalPulses,[800,1200,1000],
    "internal counters for digital pulse generation remain cumulative");
});

test("Batch Mixer: no SCADA display goes above 1000 inlet pulses for one fill",()=>{
  let s=advance(initialBatchState(),p1,100);
  s=advance(s,p2,600);
  assert.equal(s.level,100);
  assert.deepEqual(s.batchPulses,[400,600,0]);
  assert.equal(s.totalPulses[1],600,
    "no pulse is emitted when tank capacity is already at 100%");
  assert.equal(BATCH_VOLUME_PER_PULSE_PERCENT,0.1);
});

test("Batch Mixer: other modes truthfully show each batch rather than historical totals",()=>{
  let s=advance(advance(initialBatchState(),p1,100),p2,150);
  s=advance(s,drain,250);
  s=advance(s,p2,250); // A Ladder that forgets RES CNT_Volume uses only P2.
  assert.equal(s.level,100);
  assert.deepEqual(s.batchPulses,[0,1000,0],
    "the SCADA must not falsely claim the programmed 40/60 ratio");
  assert.deepEqual(s.totalPulses,[400,1600,1000]);
});

test("SCADA removes numeric DISPLAY and organizes system, input and output LED groups",()=>{
  const scene=source("../src/components/ide/BatchMixerScene.tsx");
  const model=source("../src/plc/batchMixerSceneModel.ts");
  assert.doesNotMatch(scene,/aria-label="INT_DisplayValue"|>DISPLAY<\/span>/);
  assert.doesNotMatch(model,/name: "INT_DisplayValue"/);
  assert.match(scene,/state\.batchPulses\[0\].*state\.batchPulses\[1\]/);
  assert.match(scene,/String\(state\.batchPulses\[2\]\)/);
  const status=scene.indexOf('aria-label="Estado del sistema"');
  const input=scene.indexOf('aria-label="Entradas digitales"');
  const output=scene.indexOf('aria-label="Salidas digitales"');
  assert.ok(status>0&&input>status&&output>input,
    "system pilots first, then all inputs, then actuator outputs");
  for(const name of ["RUN","IDLE","FULL"])
    assert.match(scene.slice(status,input),new RegExp('name="'+name+'"'));
  for(const name of ["PB START","PB STOP","PB ENTER","FM-1","FM-2","FM-3",
    "HI-LEVEL","LO-LEVEL","THERMOSTAT","MODO A","MODO B","MODO C"])
    assert.match(scene.slice(input,output),new RegExp('name="'+name+'"'));
  for(const name of ["PUMP 1","PUMP 2","PUMP 3","MIXER","HEATER"])
    assert.match(scene.slice(output),new RegExp('name="'+name+'"'));
});

test("Batch Mixer process expands when its dock is pulled right, other scenes unchanged",()=>{
  const scene=source("../src/components/ide/BatchMixerScene.tsx");
  const css=source("../src/workspace.css");
  assert.match(scene,/className="sort-scada-shell batch-scada-shell scada-control-shell/);
  assert.match(css,/\.scada-process-panel\s*\{[\s\S]*?max-width: 800px/);
  assert.match(css,/\.batch-scada-shell \.scada-process-panel\s*\{\s*max-width: 1120px/);
  assert.match(css,/@container scada \(min-width: 1000px\)[\s\S]*?\.batch-scada-shell \.scada-scene-workspace\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css,/@container scada \(min-width: 1400px\)[\s\S]*?\.batch-scada-shell \.scada-scene-workspace\s*\{\s*grid-template-columns: minmax\(0, 1120px\) minmax\(260px, 1fr\)/);
  assert.match(scene,/className="block h-auto w-full min-w-\[580px\]"/);
});
