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
  const next=stepSortState(belt,isOn(plc,"Sort_Motor"),isOn(plc,"Sort_Divert"),50);
  let state=plc;
  for(const [name,value] of [
    ["Sort_TypeB",next.sensorTypeB],
    ["Sort_AExit",next.sensorExitA],
    ["Sort_BExit",next.sensorExitB],
    ["Sort_LineClear",next.lineClear],
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
  plc=pulse(plc,"Sort_StartPB");
  assert.equal(isOn(plc,"Sort_Motor"),true);
  plc=applySortMomentaryInput(plc,"Sort_StopPB",true);
  assert.equal(isOn(plc,"Sort_Motor"),false,"pressed STOP must stop immediately");
  plc=applySortMomentaryInput(plc,"Sort_StopPB",false);
  assert.equal(isOn(plc,"Sort_StopRequest"),false);
  assert.equal(count(plc,"Sort_CountTotal"),0);
  plc=pulse(plc,"Sort_StartPB");
  assert.equal(isOn(plc,"Sort_Motor"),true);
});

test("six alternating A/B boxes correctly route, count, empty and stop with 500ms scans",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createSortExampleProject()),500));
  plc=pulse(plc,"Sort_StartPB");
  const result=runSix(plc,["A","B","A","B","A","B"]);
  plc=result.plc;
  assert.equal(result.belt.exitA,3);
  assert.equal(result.belt.exitB,3);
  assert.equal(result.belt.errors,0);
  assert.equal(result.belt.items.length,0);
  assert.equal(count(plc,"Sort_CountA"),3);
  assert.equal(count(plc,"Sort_CountB"),3);
  assert.equal(count(plc,"Sort_CountTotal"),SORT_BATCH_SIZE);
  assert.equal(count(plc,"Sort_Batches"),1);
  assert.equal(isOn(plc,"Sort_StopRequest"),true);
  assert.equal(isOn(plc,"Sort_Motor"),false);
  assert.equal(isOn(plc,"Sort_LineClear"),true);
  plc=pulse(plc,"Sort_StartPB");
  assert.equal(isOn(plc,"Sort_Motor"),false,"full batch locks START until reset");
});

test("RESET when the lines are empty resets A, B and TOTAL, not lifetime batches",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createSortExampleProject()),500));
  plc=pulse(plc,"Sort_StartPB");
  ({plc}=runSix(plc,["A","B","A","B","A","B"]));
  assert.equal(count(plc,"Sort_Batches"),1);
  plc=pulse(plc,"Sort_ResetPB");
  assert.equal(isOn(plc,"Sort_ResetPB"),false);
  for(const tag of ["Sort_CountA","Sort_CountB","Sort_CountTotal"])
    assert.equal(count(plc,tag),0,"reset "+tag);
  assert.equal(count(plc,"Sort_Batches"),1,"lifetime counter must survive reset");
  assert.equal(isOn(plc,"Sort_StopRequest"),false);
  plc=pulse(plc,"Sort_StartPB");
  assert.equal(isOn(plc,"Sort_Motor"),true);
  ({plc}=runSix(plc,["B","A","B","A","B","A"]));
  assert.equal(count(plc,"Sort_Batches"),2,"batch CTU must count second finished lot");
  assert.equal(count(plc,"Sort_CountTotal"),6);
  assert.equal(isOn(plc,"Sort_Motor"),false);
});

test("RESET is blocked while boxes remain in transit",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createSortExampleProject()));
  plc=pulse(plc,"Sort_StartPB");
  let belt=addSortBox(initialSortState(),"B");
  ({plc,belt}=advanceOne(plc,belt));
  assert.equal(isOn(plc,"Sort_LineClear"),false);
  plc=pulse(plc,"Sort_ResetPB");
  assert.equal(count(plc,"Sort_CountTotal"),0);
  assert.equal(isOn(plc,"Sort_ResetPB"),false);
  assert.equal(belt.items.length,1);
});

test("SCADA, physical inputs and tutorial mention advanced control and count widgets",()=>{
  const view=readFileSync(new URL("../src/components/ide/SortScene.tsx",import.meta.url),"utf8");
  const info=readFileSync(new URL("../src/components/ide/SortSceneInfoDialog.tsx",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  assert.match(view,/MomentaryPushButton name="RESET LOTE"/);
  assert.match(view,/Pilot label="LOTE COMPLETO"/);
  assert.match(view,/Pilot label="LÍNEAS LIBRES"/);
  assert.match(view,/Sort_CountTotal/);
  assert.match(view,/Sort_Batches/);
  assert.match(app,/applySortSensorInput\(state, name, value\)/);
  assert.match(app,/applySortMomentaryInput\(state, tag, value\)/);
  assert.match(app,/\["Sort_LineClear", next\.lineClear\]/);
  assert.match(info,/Sort_CountTotal\.DN/);
  assert.match(info,/SORT_TEMPLATE_TAGS\.filter/);
  assert.match(info,/R5: OR \(Sort_AExit \| Sort_BExit\)/);
});

test("optional tag registration is idempotent and preserves custom descriptions",()=>{
  let project=createSortExampleProject();
  assert.strictEqual(prepareSortTags(project),project);
  project=editTag(project,"Sort_CountTotal",{description:"Total personalizado"});
  project=editTag(project,"Sort_LineClear",{description:"Vacío personalizado"});
  assert.strictEqual(prepareSortTags(project),project);
  assert.equal(project.tags.find(t=>t.name==="Sort_CountTotal").description,
    "Total personalizado");
});
