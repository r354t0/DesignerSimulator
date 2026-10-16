import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editTag } from "../src/plc/practiceDocument.ts";
import {
  CONVEYOR_SENSOR_POSITION, CONVEYOR_EXIT_POSITION,
  CONVEYOR_BELT_LENGTH_PX, CONVEYOR_BOX_WIDTH_PX,
  CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS,
  applyConveyorMomentaryInput, applyConveyorPhotoeyeInput,
  addConveyorItem, canAddConveyorItem, createConveyorExampleProject,
  initialConveyorProject, initialConveyorState, prepareConveyorTags,
  readConveyorBool, readConveyorCount, stepConveyor,
} from "../src/plc/conveyorSceneModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  initialPracticeScanState, setScanPeriod, startPracticeScans, tickPracticeScan,
} from "../src/plc/practiceScanCycle.ts";

test("scene 1 solution follows the image: motor, stop request, CTU and RES in that order", () => {
  const p=createConveyorExampleProject();
  assert.equal(buildPracticeProject(p).success,true);
  const [motor,stop,count,reset]=p.rungs;
  assert.deepEqual(p.rungs.map(r=>r.instructions.map(i=>i.kind)),[
    ["OR_JUNCTION","XIC","XIO","OTE"],
    ["OR_JUNCTION","XIC","OTE"],
    ["XIC","CTU"],["XIO","XIC","RES"],
  ]);
  assert.equal(motor.instructions[1].tag,"Start_PB");
  assert.equal(motor.instructions[2].tag,"CV_StopRequest");
  assert.equal(motor.instructions[3].tag,"Motor_Run");
  assert.deepEqual(motor.parallelBranches[0].instructions.map(i=>i.tag),["Motor_Run"]);
  assert.equal(motor.parallelBranches[0].endId,motor.instructions[1].id,
    "STOP contact must be AFTER the OR reunion");
  assert.equal(stop.instructions[1].tag,"Stop_PB");
  assert.equal(stop.instructions[2].tag,"CV_StopRequest");
  assert.deepEqual(stop.parallelBranches[0].instructions.map(i=>i.tag),
    ["CV_Count.DN","CV_BoxSensor"]);
  assert.deepEqual(count.instructions.map(i=>i.tag),["CV_BoxSensor","CV_Count"]);
  assert.deepEqual(reset.instructions.map(i=>i.tag),
    ["CV_BoxSensor","CV_ResetPB","CV_Count"]);
});

test("PE-01 stops the five-box batch only once the final box fully exits the belt", () => {
  // In SVG coordinates the roller housing ends at x=82+507. The last box
  // physically exits only when its LEFT/trailing edge exceeds that boundary.
  const rearEdgeAtExit = 82 +
    CONVEYOR_EXIT_POSITION * CONVEYOR_BELT_LENGTH_PX -
    CONVEYOR_BOX_WIDTH_PX / 2;
  assert.ok(CONVEYOR_SENSOR_POSITION>=1.0 && CONVEYOR_SENSOR_POSITION<1.04);
  assert.ok(rearEdgeAtExit>=82+507,"whole box must be beyond the housing");
  assert.ok(CONVEYOR_SENSOR_POSITION>=
    CONVEYOR_EXIT_POSITION - CONVEYOR_BOX_WIDTH_PX/(2*CONVEYOR_BELT_LENGTH_PX),
    "PE-01 must remain occupied until the fifth box is removed");
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createConveyorExampleProject()),500));
  plc=applyConveyorMomentaryInput(plc,"Start_PB",true);
  plc=applyConveyorMomentaryInput(plc,"Start_PB",false);
  assert.equal(readConveyorBool(plc.project,"Motor_Run"),true);
  let belt=addConveyorItem(initialConveyorState()),lastId=1;
  let stoppedAt=-1;
  for(let i=0;i<190;i++){
    if(lastId<5 && canAddConveyorItem(belt)){
      belt=addConveyorItem(belt);
      lastId++;
    }
    const next=stepConveyor(belt,readConveyorBool(plc.project,"Motor_Run"),50);
    if(next.sensorActive!==belt.sensorActive){
      plc=applyConveyorPhotoeyeInput(plc,next.sensorActive);
    }
    belt=next;
    if((i+1)%10===0)plc=tickPracticeScan(plc);
    if(lastId===5 && !readConveyorBool(plc.project,"Motor_Run")){
      stoppedAt=i;
      break;
    }
  }
  assert.equal(readConveyorCount(plc.project),5);
  assert.ok(stoppedAt>=0,"batch must stop at five");
  assert.equal(readConveyorBool(plc.project,"CV_StopRequest"),true);
  assert.equal(belt.passed,5,
    "all five physical boxes must have completed discharge before batch stop");
  assert.equal(belt.items.length,0,
    "none of the five boxes may remain on the conveyor");
  assert.equal(belt.sensorActive,false,
    "PE-01 is clear once the fifth box passes the outlet");
  for(let i=0;i<20;i++){
    const next=stepConveyor(belt,readConveyorBool(plc.project,"Motor_Run"),50);
    assert.strictEqual(next,belt,"stationary motor must not move boxes");
  }
});

test("photoeye stays HIGH until a box completely leaves the discharge mouth",()=>{
  let belt={
    ...initialConveyorState(),
    items:[{id:5,position:CONVEYOR_EXIT_POSITION-0.015}],
    nextId:6,passed:4,sensorActive:true,
  };
  const nearly=stepConveyor(belt,true,50);
  assert.equal(nearly.items.length,1,
    "box remains in scene until its trailing edge clears the discharge");
  assert.equal(nearly.sensorActive,true,
    "photoeye cannot go LOW and stop the motor while the box is still visible");
  assert.equal(nearly.passed,4);
  const discharged=stepConveyor(nearly,true,50);
  assert.equal(discharged.items.length,0,"box leaves the scene");
  assert.equal(discharged.passed,5);
  assert.equal(discharged.sensorActive,false,
    "the falling photoeye edge occurs in the SAME frame as final discharge");
});

test("quick STOP works with motor rung before stop-request rung, and release permits restart",()=>{
  let p=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createConveyorExampleProject()),500));
  p=applyConveyorMomentaryInput(p,"Start_PB",true);
  p=applyConveyorMomentaryInput(p,"Start_PB",false);
  assert.equal(readConveyorBool(p.project,"Motor_Run"),true);
  p=applyConveyorMomentaryInput(p,"Stop_PB",true);
  assert.equal(readConveyorBool(p.project,"Motor_Run"),false,
    "STOP must propagate without waiting another 500ms cyclic scan");
  p=applyConveyorMomentaryInput(p,"Stop_PB",false);
  assert.equal(readConveyorBool(p.project,"CV_StopRequest"),false);
  p=applyConveyorMomentaryInput(p,"Start_PB",true);
  assert.equal(readConveyorBool(p.project,"Motor_Run"),true);
});

test("compact auto descriptions replace only old default copy, not user edits",()=>{
  const defaults=[...CONVEYOR_TAGS,...CONVEYOR_TEMPLATE_TAGS];
  assert.ok(defaults.every(item=>item.description.length<=19));
  const oldCopy=new Map([
    ["Start_PB","Faja: pulsador START de marcha"],
    ["Stop_PB","Faja: pulsador STOP de parada"],
    ["CV_BoxSensor","Faja: sensor fotoeléctrico de presencia de caja (PE-01)"],
    ["Motor_Run","Faja: orden de marcha del motor transportador"],
    ["CV_Count","Faja: contador CTU de cajas detectadas por PE-01"],
    ["CV_ResetPB","Faja: pulsador momentáneo RESET LOTE"],
    ["CV_StopRequest","Faja: solicitud de parada por STOP o lote completo"],
  ]);
  let p=createConveyorExampleProject();
  for (const [name,description]of oldCopy)p=editTag(p,name,{description});
  p=prepareConveyorTags(p);
  for (const spec of defaults)assert.equal(
    p.tags.find(item=>item.name===spec.name).description,spec.description);
  p=editTag(p,"CV_BoxSensor",{description:"Sensor modificado por operador"});
  p=editTag(p,"CV_StopRequest",{description:"Parada personalizada"});
  assert.equal(prepareConveyorTags(p),p,"customized tags must remain unchanged");
  const basic=initialConveyorProject();
  assert.equal(basic.tags.length,5,"extra template tags stay opt-in");
});

test("numbered rung gutter no longer displays 6-point grip and stays draggable",()=>{
  const editor=readFileSync(new URL("../src/components/ide/PracticeEditor.tsx",import.meta.url),"utf8");
  const info=readFileSync(new URL("../src/components/ide/ConveyorSceneInfoDialog.tsx",import.meta.url),"utf8");
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(editor,/<GripVertical/);
  assert.match(editor,/aria-label=\{"Seleccionar o arrastrar rung " \+ rungIndex\}/);
  assert.match(editor,/onDragStart=\{\(event\) => beginRungMove\(event, rung.id\)\}/);
  assert.match(info,/Rung 0: OR \(Start_PB \| Motor_Run\)/);
  assert.match(info,/Rung 2: CV_BoxSensor → CTU CV_Count/);
  assert.match(app,/applyConveyorPhotoeyeInput\(current, next.sensorActive\)/);
  assert.match(app,/applyConveyorMomentaryInput\(state, tag, value\)/);
});
