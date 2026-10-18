import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editTag } from "../src/plc/practiceDocument.ts";
import {
  initialSortProject, createSortExampleProject, prepareSortTags, readSortBool,
  initialSortState, addSortBox, canAddSortBox, stepSortState, readSortCount,
  SORT_TAGS, SORT_TEMPLATE_TAGS, SORT_BATCH_SIZE,
  applySortMomentaryInput, applySortSensorInput,
} from "../src/plc/sortSceneModel.ts";
import {
  initialPracticeScanState, setScanPeriod, startPracticeScans, tickPracticeScan,
} from "../src/plc/practiceScanCycle.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const pulse=(state,tag)=>applySortMomentaryInput(
  applySortMomentaryInput(state,tag,true),tag,false);
const isOn=(s,tag)=>readSortBool(s.project,tag);
const count=(s,tag)=>readSortCount(s.project,tag);

function advanceOne(plc, belt) {
  const next=stepSortState(belt,isOn(plc,"DO_Motor"),isOn(plc,"DO_Diverter"),50);
  let state=plc;
  for(const [name,value] of [
    ["DI_TypeB",next.sensorTypeB],
    ["DI_ExitA",next.sensorExitA],
    ["DI_ExitB",next.sensorExitB],
    ["DI_LineClear",next.lineClear],
  ]){
    if(state.project.tags.some(t=>t.name===name && t.value!==value))
      state=applySortSensorInput(state,name,value);
  }
  return {plc:state,belt:next};
}

function runSix(plc,types) {
  let belt=initialSortState();
  for(let i=0;i<310;i++){
    if(i%18===0 && i/18<types.length){
      assert.equal(canAddSortBox(belt),true,"entrance clear before next box "+i);
      belt=addSortBox(belt,types[i/18]);
    }
    ({plc,belt}=advanceOne(plc,belt));
    if(i%10===9) plc=tickPracticeScan(plc);
  }
  return {plc,belt};
}

test("scene 1 info now specifies advanced seal-in, CTU, RESET, and full discharge",()=>{
  const info=readFileSync(new URL("../src/components/ide/ConveyorSceneInfoDialog.tsx",import.meta.url),"utf8");
  assert.match(info,/un lote de cinco cajas/);
  assert.match(info,/quinta salga por completo/);
  assert.match(info,/STOP debe detener la marcha sin borrar el conteo/);
  assert.match(info,/RESET LOTE/);
  assert.match(info,/ramas OR/);
});

test("scene 2 optional 5 tags do not leak into the nine base tags",()=>{
  const base=initialSortProject();
  assert.equal(base.tags.length,9);
  assert.deepEqual(base.tags.map(t=>t.name),SORT_TAGS.map(t=>t.name));
  const advanced=createSortExampleProject();
  assert.equal(advanced.tags.length,14);
  assert.deepEqual(advanced.tags.map(t=>t.name),[
    ...SORT_TAGS.map(t=>t.name),...SORT_TEMPLATE_TAGS.map(t=>t.name),
  ]);
  assert.equal(buildPracticeProject(advanced).success,true);
});

test("quick STOP propagates across later STOP rung without clearing any counters",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createSortExampleProject()),500));
  plc=pulse(plc,"PB_Start");
  assert.equal(isOn(plc,"DO_Motor"),true);
  plc=applySortMomentaryInput(plc,"PB_Stop",true);
  assert.equal(isOn(plc,"DO_Motor"),false,"pressed STOP must stop immediately");
  plc=applySortMomentaryInput(plc,"PB_Stop",false);
  assert.equal(isOn(plc,"ST_StopRequest"),false);
  assert.equal(count(plc,"CNT_BatchBoxes"),0);
  plc=pulse(plc,"PB_Start");
  assert.equal(isOn(plc,"DO_Motor"),true);
});

test("six alternating A/B boxes correctly route, count, empty and stop with 500ms scans",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createSortExampleProject()),500));
  plc=pulse(plc,"PB_Start");
  const result=runSix(plc,["A","B","A","B","A","B"]);
  plc=result.plc;
  assert.equal(result.belt.exitA,3);
  assert.equal(result.belt.exitB,3);
  assert.equal(result.belt.errors,0);
  assert.equal(result.belt.items.length,0);
  assert.equal(count(plc,"CNT_ExitA"),3);
  assert.equal(count(plc,"CNT_ExitB"),3);
  assert.equal(count(plc,"CNT_BatchBoxes"),SORT_BATCH_SIZE);
  assert.equal(count(plc,"CNT_Lotes"),1);
  assert.equal(isOn(plc,"ST_StopRequest"),true);
  assert.equal(isOn(plc,"DO_Motor"),false);
  assert.equal(isOn(plc,"DI_LineClear"),true);
  plc=pulse(plc,"PB_Start");
  assert.equal(isOn(plc,"DO_Motor"),false,"full batch locks START until reset");
});

test("RESET when the lines are empty resets A, B and TOTAL, not lifetime batches",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createSortExampleProject()),500));
  plc=pulse(plc,"PB_Start");
  ({plc}=runSix(plc,["A","B","A","B","A","B"]));
  assert.equal(count(plc,"CNT_Lotes"),1);
  plc=pulse(plc,"PB_Reset");
  assert.equal(isOn(plc,"PB_Reset"),false);
  for(const tag of ["CNT_ExitA","CNT_ExitB","CNT_BatchBoxes"])
    assert.equal(count(plc,tag),0,"reset "+tag);
  assert.equal(count(plc,"CNT_Lotes"),1,"lifetime counter must survive reset");
  assert.equal(isOn(plc,"ST_StopRequest"),false);
  plc=pulse(plc,"PB_Start");
  assert.equal(isOn(plc,"DO_Motor"),true);
  ({plc}=runSix(plc,["B","A","B","A","B","A"]));
  assert.equal(count(plc,"CNT_Lotes"),2,"batch CTU must count second finished lot");
  assert.equal(count(plc,"CNT_BatchBoxes"),6);
  assert.equal(isOn(plc,"DO_Motor"),false);
});

test("RESET is blocked while boxes remain in transit",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createSortExampleProject()));
  plc=pulse(plc,"PB_Start");
  let belt=addSortBox(initialSortState(),"B");
  ({plc,belt}=advanceOne(plc,belt));
  assert.equal(isOn(plc,"DI_LineClear"),false);
  plc=pulse(plc,"PB_Reset");
  assert.equal(count(plc,"CNT_BatchBoxes"),0);
  assert.equal(isOn(plc,"PB_Reset"),false);
  assert.equal(belt.items.length,1);
});

test("SCADA, physical inputs and tutorial mention advanced control and count widgets",()=>{
  const view=readFileSync(new URL("../src/components/ide/SortScene.tsx",import.meta.url),"utf8");
  const info=readFileSync(new URL("../src/components/ide/SortSceneInfoDialog.tsx",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  assert.match(view,/MomentaryPushButton compact name="RESET LOTE"/);
  assert.match(view,/Pilot label="LOTE COMPLETO"/);
  assert.match(view,/Pilot label="LÍNEAS LIBRES"/);
  assert.match(view,/CNT_BatchBoxes/);
  assert.match(view,/CNT_Lotes/);
  assert.match(app,/applySortSensorInput\(state, name, value\)/);
  assert.match(app,/applySortMomentaryInput\(state, tag, value\)/);
  assert.match(app,/\["DI_LineClear", next\.lineClear\]/);
  assert.match(info,/CNT_BatchBoxes\.DN/);
  assert.match(info,/SORT_TEMPLATE_TAGS\.filter/);
  assert.match(info,/R5: OR \(DI_ExitA \| DI_ExitB\)/);
});

test("optional tag registration is idempotent and preserves custom descriptions",()=>{
  let project=createSortExampleProject();
  assert.strictEqual(prepareSortTags(project),project);
  project=editTag(project,"CNT_BatchBoxes",{description:"Total personalizado"});
  project=editTag(project,"DI_LineClear",{description:"Vacío personalizado"});
  assert.strictEqual(prepareSortTags(project),project);
  assert.equal(project.tags.find(t=>t.name==="CNT_BatchBoxes").description,
    "Total personalizado");
});
