import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  applyMomentaryBoolInput, applySceneSensorBoolInput,
  initialPracticeScanState, setScanPeriod, startPracticeScans, tickPracticeScan,
} from "../src/plc/practiceScanCycle.ts";
import {
  SORT_TAGS, SORT_TEMPLATE_TAGS, SORT_BATCH_SIZE,
  applySortMomentaryInput, applySortSensorInput,
  initialSortProject, prepareSortTags, createSortExampleProject,
  initialSortState, canAddSortBox, addSortBox, readSortBool, readSortCount,
  stepSortState,
} from "../src/plc/sortSceneModel.ts";

test("scene 02 is a fully independent MainRoutine with only its nine wired tags", () => {
  const p = initialSortProject();
  assert.deepEqual(p.tags.map(t => t.name), SORT_TAGS.map(t => t.name));
  assert.equal(p.tags.length, 9);
  assert.equal(p.rungs.length, 1);
  assert.equal(p.rungs[0].instructions.length, 0);
  assert.ok(!p.tags.some(t => ["Motor_Run","CV_BoxSensor","Start_PB","CV_Count"].includes(t.name)));
  assert.equal(prepareSortTags(p), p);
  for (const def of SORT_TAGS) {
    const t = p.tags.find(t => t.name === def.name);
    assert.equal(t.type, def.type);
    assert.equal(t.description, def.description);
  }
});

test("advanced sorting template builds three independent OR rungs and four CTUs", () => {
  const project = createSortExampleProject();
  const b = buildPracticeProject(project);
  assert.equal(b.success, true, JSON.stringify(b.diagnostics));
  assert.deepEqual(project.tags.map(tag=>tag.name),[
    ...SORT_TAGS.map(tag=>tag.name),
    ...SORT_TEMPLATE_TAGS.map(tag=>tag.name),
  ]);
  assert.deepEqual(project.rungs.map(r => r.instructions.map(i => i.kind)), [
    ["OR_JUNCTION","XIC","XIO","OTE"],
    ["OR_JUNCTION","XIC","OTE"],
    ["XIC","XIC","OTE"],
    ["XIC","CTU"],["XIC","CTU"],
    ["OR_JUNCTION","XIC","CTU"],
    ["XIC","XIC","CTU"],
    ["XIC","XIC","RES"],["XIC","XIC","RES"],["XIC","XIC","RES"],
  ]);
  const [motor,stop,,,,total,batch] = project.rungs;
  assert.deepEqual(motor.parallelBranches[0].instructions.map(i=>i.tag),
    ["DO_Motor"]);
  assert.equal(motor.parallelBranches[0].endId,motor.instructions[1].id);
  assert.deepEqual(stop.parallelBranches[0].instructions.map(i=>i.tag),
    ["CNT_BatchBoxes.DN","DI_LineClear"]);
  assert.deepEqual(total.parallelBranches[0].instructions.map(i=>i.tag),
    ["DI_ExitB"]);
  assert.equal(batch.instructions[2].tag,"CNT_Lotes");
  for(const tag of ["CNT_ExitA","CNT_ExitB","CNT_BatchBoxes","CNT_Lotes"])
    assert.equal(readSortCount(project,tag),0);
  assert.equal(project.tags.find(t => t.name === "CNT_BatchBoxes").value.PRE,SORT_BATCH_SIZE);
  assert.equal(project.tags.find(t => t.name === "DI_LineClear").value,true);
  assert.equal(prepareSortTags(project),project);
});

test("sorter physics keeps boxes stationary unless MainRoutine motor is on", () => {
  const a = addSortBox(initialSortState(),"A");
  assert.equal(stepSortState(a,false,true,50),a);
  const moving = stepSortState(a,true,false,50);
  assert.ok(moving.items[0].position>a.items[0].position);
  assert.equal(moving.items[0].route,undefined);
});

function runSortWithExample() {
  let plc = startPracticeScans(setScanPeriod(
    initialPracticeScanState(createSortExampleProject()), 500));
  plc = applyMomentaryBoolInput(plc,"PB_Start",true);
  plc = applyMomentaryBoolInput(plc,"PB_Start",false);
  assert.equal(readSortBool(plc.project,"DO_Motor"),true);
  let state = initialSortState();
  state = addSortBox(state,"A");
  let sawB = false;
  let sawDivert = false;
  for(let i=0;i<180;i++){
    if(i===17){
      assert.equal(canAddSortBox(state),true);
      state = addSortBox(state,"B");
    }
    const next = stepSortState(state,
      readSortBool(plc.project,"DO_Motor"),
      readSortBool(plc.project,"DO_Diverter"),50);
    state = next;
    for(const [tag,value] of [
      ["DI_TypeB",state.sensorTypeB],
      ["DI_ExitA",state.sensorExitA],
      ["DI_ExitB",state.sensorExitB],
    ]){
      const prior=readSortBool(plc.project,tag);
      if(prior !== value) plc=applySceneSensorBoolInput(plc,tag,value);
    }
    if(state.sensorTypeB) sawB=true;
    if(readSortBool(plc.project,"DO_Diverter")) sawDivert=true;
    if((i+1)%10===0)plc=tickPracticeScan(plc);
  }
  return {plc,state,sawB,sawDivert};
}

test("500ms PLC scan sorts A→A and B→B; both exit CTUs count exactly once", () => {
  const {plc,state,sawB,sawDivert}=runSortWithExample();
  assert.equal(sawB,true,"B detection was never active");
  assert.equal(sawDivert,true,"B diverter never actuated");
  assert.equal(state.exitA,1);
  assert.equal(state.exitB,1);
  assert.equal(state.errors,0,"correct example must not misroute boxes");
  assert.equal(readSortCount(plc.project,"CNT_ExitA"),1);
  assert.equal(readSortCount(plc.project,"CNT_ExitB"),1);
  assert.equal(state.sensorTypeB,false);
  assert.equal(state.sensorExitA,false);
  assert.equal(state.sensorExitB,false);
});

test("without DO_Diverter, B is routed to exit A and mismatch is displayed",()=>{
  let state=addSortBox(initialSortState(),"B");
  for(let i=0;i<120;i++) state=stepSortState(state,true,false,50);
  assert.equal(state.exitA,1);
  assert.equal(state.exitB,0);
  assert.equal(state.errors,1);
});

test("motor stopping freezes classification, and boxes cannot overlap at entrance",()=>{
  let state=addSortBox(initialSortState(),"A");
  assert.equal(canAddSortBox(state),false);
  assert.strictEqual(addSortBox(state,"B"),state);
  for(let i=0;i<18;i++) state=stepSortState(state,true,false,50);
  assert.equal(canAddSortBox(state),true);
  state=addSortBox(state,"B");
  assert.equal(state.items.length,2);
  assert.strictEqual(stepSortState(state,false,true,100),state);
});

test("two sorting programs with custom tags and rungs remain scene-local",()=>{
  const a=initialSortProject();
  const b=initialSortProject();
  assert.notStrictEqual(a,b);
  assert.equal(prepareSortTags(a),a);
  assert.equal(prepareSortTags(b),b);
});

test("App exposes scene switch and independently saved MainRoutine sessions",()=>{
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const tags=readFileSync(new URL("../src/components/ide/ControllerTags.tsx",import.meta.url),"utf8");
  const view=readFileSync(new URL("../src/components/ide/SortScene.tsx",import.meta.url),"utf8");
  const info=readFileSync(new URL("../src/components/ide/SortSceneInfoDialog.tsx",import.meta.url),"utf8");
  assert.match(app,/<option value="sorting">Clasificación de cajas<\/option>/);
  assert.match(app,/sceneSessions\.current\[previous\] = stopSceneController\(current,previous\)/);
  assert.match(app,/stopSceneController\(sceneSessions\.current\[next\],next\)/);
  assert.match(app,/<SortScene project=\{practice\}/);
  assert.match(app,/applySortSensorInput\(state, name, value\)/);
  assert.match(tags,/activeScene === "motor" \? "demo" : "practice"/);
  assert.match(tags,/MainRoutine · Clasificación de cajas/);
  assert.match(view,/Pilotos LED y producción/);
  assert.match(view,/<Pilot label="SALIDA A" active=\{state\.sensorExitA\} color="green"\/>/);
  assert.match(view,/<Pilot label="SALIDA B" active=\{state\.sensorExitB\} color="amber"\/>/);
  assert.match(view,/MomentaryPushButton compact name="START"/);
  assert.match(view,/onAddBox\("A"\)/);
  assert.match(view,/onAddBox\("B"\)/);
  assert.match(info,/Mapa E\/S · Señales del clasificador/);
  assert.match(info,/Objetivo del ejercicio/);
});
