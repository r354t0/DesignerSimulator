import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS,
  CONVEYOR_SENSOR_TAG, CONVEYOR_SENSOR_POSITION,
  applyConveyorMomentaryInput, applyConveyorPhotoeyeInput,
  addConveyorItem, canAddConveyorItem, initialConveyorState, stepConveyor,
  createConveyorExampleProject,
  initialConveyorProject, prepareConveyorTags, readConveyorBool, readConveyorCount,
} from "../src/plc/conveyorSceneModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  initialPracticeScanState, setScanPeriod, startPracticeScans, tickPracticeScan,
} from "../src/plc/practiceScanCycle.ts";

const pulse = (state, tag) =>
  applyConveyorMomentaryInput(
    applyConveyorMomentaryInput(state, tag, true), tag, false);
const eye = (state, value) => applyConveyorPhotoeyeInput(state, value);
const acc = state => readConveyorCount(state.project);
const on = (state, tag) => readConveyorBool(state.project, tag);

test("advanced template is opt-in: five tags stay unchanged until loaded", () => {
  const initial = initialConveyorProject();
  assert.deepEqual(initial.tags.map(t => t.name), CONVEYOR_TAGS.map(t => t.name));
  assert.equal(initial.rungs.length, 1);
  assert.equal(initial.rungs[0].instructions.length, 0);
  const example = createConveyorExampleProject();
  assert.deepEqual(example.tags.map(t => t.name),
    [...CONVEYOR_TAGS, ...CONVEYOR_TEMPLATE_TAGS].map(t => t.name));
  assert.equal(example.rungs.length, 4);
  assert.equal(prepareConveyorTags(example), example, "revisiting never erases optional exercise tags");
  assert.ok(example.tags.every(t => t.description.length <= 19));
});

test("Build accepts BOTH independent OR groups with no missing branch or duplicate coil", () => {
  const p = createConveyorExampleProject();
  const result = buildPracticeProject(p);
  assert.equal(result.success, true, JSON.stringify(result.diagnostics));
  assert.equal(result.warnings, 0, JSON.stringify(result.diagnostics));
  const [motor, stop, count, reset] = p.rungs;
  assert.deepEqual(motor.instructions.map(i => [i.kind,i.tag]), [
    ["OR_JUNCTION",""], ["XIC","PB_Start"],
    ["XIO","ST_StopRequest"], ["OTE","DO_Motor"],
  ]);
  assert.equal(motor.parallelBranches.length,1);
  assert.deepEqual(motor.parallelBranches[0].instructions.map(i=>[i.kind,i.tag]),
    [["XIC","DO_Motor"]]);
  assert.equal(motor.parallelBranches[0].endId, motor.instructions[1].id,
    "motor branch rejoins BEFORE XIO stop interlock");
  assert.deepEqual(stop.instructions.map(i => i.kind),
    ["OR_JUNCTION","XIC","OTE"]);
  assert.equal(stop.parallelBranches.length, 1);
  assert.deepEqual(stop.parallelBranches[0].instructions.map(i => [i.kind,i.tag]),
    [["XIC","CNT_Boxes.DN"],["XIO","DI_BoxSensor"]]);
  assert.equal(stop.parallelBranches[0].endId,
    stop.instructions[1].id, "lower OR rejoins at end of upper STOP contact");
  assert.deepEqual(count.instructions.map(i => [i.kind,i.tag]),
    [["XIC","DI_BoxSensor"],["CTU","CNT_Boxes"]]);
  assert.deepEqual(reset.instructions.map(i => [i.kind,i.tag]),
    [["XIO","DI_BoxSensor"],["XIC","PB_Reset"],["RES","CNT_Boxes"]]);
});

test("short START makes a sealed-in OTE; STOP takes priority and retains count", () => {
  let s = startPracticeScans(setScanPeriod(
    initialPracticeScanState(createConveyorExampleProject()),500));
  assert.equal(on(s,"DO_Motor"),false);
  s = pulse(s,"PB_Start");
  assert.equal(on(s,"DO_Motor"),true,"motor energizes on short start press");
  s = tickPracticeScan(s);
  assert.equal(on(s,"DO_Motor"),true,"OTE retains by its OR lower seal-in contact");
  for (let i=0;i<2;i++) {
    s = eye(s,true);
    s = eye(s,false);
  }
  assert.equal(acc(s),2);
  s = pulse(s,"PB_Stop");
  assert.equal(on(s,"DO_Motor"),false);
  assert.equal(acc(s),2,"STOP does not clear user production counters");
  s = tickPracticeScan(s);
  assert.equal(on(s,"DO_Motor"),false,"no spontaneous restart");
  s = pulse(s,"PB_Start");
  assert.equal(on(s,"DO_Motor"),true,"new start resumes incomplete batch");
});

test("fifth rising photoeye edge activates DN; belt stops only after the box clears PE-01", () => {
  let s = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  s = pulse(s,"PB_Start");
  for (let i=1;i<=5;i++) {
    s = eye(s,true);
    assert.equal(acc(s),i, "independent rising edge " + i);
    if(i===5){
      assert.equal(on(s,"DO_Motor"),true,
        "do not trap the fifth box over the beam");
      assert.equal(on(s,"ST_StopRequest"),false);
      assert.equal(s.project.tags.find(t=>t.name==="CNT_Boxes").value.DN,true);
    }
    s = eye(s,false);
    if(i<5)assert.equal(on(s,"DO_Motor"),true);
  }
  assert.equal(on(s,"ST_StopRequest"),true);
  assert.equal(on(s,"DO_Motor"),false,"batch complete, beam clear, motor stopped");
  s = pulse(s,"PB_Start");
  assert.equal(on(s,"DO_Motor"),false,"full batch blocks restart without reset");
});

test("RESET LOTE is momentary, needs photoeye clear and allows another five-box batch", () => {
  let s = startPracticeScans(initialPracticeScanState(createConveyorExampleProject()));
  s = pulse(s,"PB_Start");
  for (let i=0;i<5;i++){
    s=eye(s,true);
    s=eye(s,false);
  }
  assert.equal(acc(s),5);
  s=eye(s,true);
  s=pulse(s,"PB_Reset");
  assert.equal(acc(s),6,"reset inhibited when beam is occupied");
  s=eye(s,false);
  s=pulse(s,"PB_Reset");
  assert.equal(acc(s),0);
  assert.equal(s.project.tags.find(t=>t.name==="CNT_Boxes").value.DN,false);
  assert.equal(on(s,"PB_Reset"),false);
  assert.equal(on(s,"DO_Motor"),false);
  s=pulse(s,"PB_Start");
  assert.equal(on(s,"DO_Motor"),true);
  s=eye(s,true);
  assert.equal(acc(s),1,"new batch starts at 1, not 6");
});

test("advanced SCADA controls, map E/S and help match optional template logic",()=>{
  const scene=readFileSync(new URL("../src/components/ide/ConveyorScene.tsx",import.meta.url),"utf8");
  const info=readFileSync(new URL("../src/components/ide/ConveyorSceneInfoDialog.tsx",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  assert.match(scene,/resetAvailable && \(/);
  assert.match(scene,/MomentaryPushButton compact name="RESET LOTE"/);
  assert.match(scene,/onInputChange\("PB_Reset", pressed\)/);
  assert.match(scene,/PilotLed label="LOTE COMPLETO"/);
  assert.match(info,/CONVEYOR_TEMPLATE_TAGS\.filter/);
  assert.match(info,/CNT_Boxes\.DN/);
  assert.match(info,/RES CNT_Boxes/);
  assert.match(app,/applyConveyorMomentaryInput\(state, tag, value\)/);
});
