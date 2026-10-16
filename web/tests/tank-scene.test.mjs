import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialTankProject, createTankExampleProject, initialTankState,
  prepareTankTags, tankSensorInputs, stepTankState, readTankBool,
  hasTankTags, TANK_TAGS, TANK_INITIAL_PERCENT,
  TANK_HIGH_PERCENT, TANK_LOW_PERCENT,
} from "../src/plc/tankSceneModel.ts";
import { setTagValue, editTag, insertInstruction } from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  applyMomentaryBoolInput, applySceneSensorBoolInput,
  changePracticeScanProject, initialPracticeScanState,
  setScanPeriod, startPracticeScans, tickPracticeScan,
  pausePracticeScans, stopPracticeScans,
} from "../src/plc/practiceScanCycle.ts";

test("tank MainRoutine starts empty, with 10 scene-specific documented tags and 10% level",()=>{
  const project=initialTankProject();
  assert.equal(hasTankTags(project),true);
  assert.deepEqual(project.tags.map(t=>t.name),TANK_TAGS.map(t=>t.name));
  assert.equal(project.tags.length,10);
  assert.equal(project.rungs.length,1);
  assert.equal(project.rungs[0].instructions.length,0);
  assert.equal(project.tags.find(t=>t.name==="Tank_LevelPct").value,TANK_INITIAL_PERCENT);
  assert.equal(project.tags.find(t=>t.name==="Tank_LowLS").value,true);
  assert.equal(project.tags.find(t=>t.name==="Tank_HighLS").value,false);
  assert.equal(prepareTankTags(project),project);
  assert.equal(project.tags.some(t=>t.name==="Sort_Motor"||t.name==="Motor_Run"),false);
  for(const def of TANK_TAGS) assert.equal(project.tags.find(t=>t.name===def.name).description,def.description);
});

test("tank automatic tag registration is idempotent, does not mutate user rungs or tags",()=>{
  let project=initialTankProject();
  project=editTag(project,"Tank_Pump",{description:"Descripción personalizada"});
  project=insertInstruction(project,"rung-1",0,{id:"custom",kind:"XIC",tag:"Tank_StartPB"});
  const source=project.rungs;
  const update=prepareTankTags(project);
  assert.equal(update,project);
  assert.equal(update.rungs,source);
  assert.equal(update.tags.find(t=>t.name==="Tank_Pump").description,"Descripción personalizada");
  assert.equal(prepareTankTags(update),update);
});

test("tank tag registration rejects wrong type without partial mutation",()=>{
  let project=initialTankProject();
  project=editTag(project,"Tank_LevelPct",{type:"BOOL"});
  assert.throws(()=>prepareTankTags(project),/Tank_LevelPct.*REAL/);
  assert.equal(project.tags.find(t=>t.name==="Tank_LevelPct").type,"BOOL");
});

test("tank Ladder template builds with fill memory, high stop, pump, inlet and drain",()=>{
  const project=createTankExampleProject(),result=buildPracticeProject(project);
  assert.equal(result.success,true,JSON.stringify(result.diagnostics));
  assert.deepEqual(project.rungs.map(r=>r.instructions.map(i=>i.kind)),[
    ["XIC","XIO","OTL"],["XIC","OTU"],["XIC","OTU"],
    ["XIC","OTE"],["XIC","OTE"],["XIC","OTE"],
  ]);
});

test("tank physics is output-driven, capped and freezes in PLC STOP/PAUSE",()=>{
  const initial=initialTankState();
  assert.strictEqual(stepTankState(initial,false,false,false,50),initial);
  assert.strictEqual(stepTankState(initial,true,false,false,50),initial);
  assert.strictEqual(stepTankState(initial,false,true,false,50),initial);
  const fill=stepTankState(initial,true,true,false,50);
  assert.ok(fill.levelPercent>initial.levelPercent);
  const drain=stepTankState(fill,false,false,true,50);
  assert.ok(drain.levelPercent<fill.levelPercent);
  assert.equal(tankSensorInputs(15).Tank_LowLS,true);
  assert.equal(tankSensorInputs(15.01).Tank_LowLS,false);
  assert.equal(tankSensorInputs(90).Tank_HighLS,true);
  assert.equal(tankSensorInputs(89.99).Tank_HighLS,false);
  let state={...initial,levelPercent:99.9};
  state=stepTankState(state,true,true,false,150);
  assert.equal(state.levelPercent,100);
  state=stepTankState({...state,levelPercent:0},false,false,true,150);
  assert.equal(state.levelPercent,0);
});

function stepPhysicalTank(plc,physics) {
  const next=stepTankState(physics,
    readTankBool(plc.project,"Tank_Pump"),
    readTankBool(plc.project,"Tank_InletValve"),
    readTankBool(plc.project,"Tank_DrainValve"),50);
  const sensors=tankSensorInputs(next.levelPercent);
  let program=plc;
  const l=program.project.tags.find(t=>t.name==="Tank_LevelPct");
  if(l.value!==sensors.Tank_LevelPct){
    program=changePracticeScanProject(program,setTagValue(program.project,"Tank_LevelPct",sensors.Tank_LevelPct));
  }
  for(const name of ["Tank_LowLS","Tank_HighLS"]){
    if(readTankBool(program.project,name)!==sensors[name]){
      program=applySceneSensorBoolInput(program,name,sensors[name]);
    }
  }
  return {plc:program,physics:next};
}

test("tank fills from 10% and automatically stops when HIGHLS reaches 90% at 500ms scan",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  assert.equal(readTankBool(plc.project,"Tank_Pump"),true);
  assert.equal(readTankBool(plc.project,"Tank_InletValve"),true);
  let physics=initialTankState();
  let highSeen=false,lowCleared=false;
  for(let i=0;i<190;i++){
    ({plc,physics}=stepPhysicalTank(plc,physics));
    if(!readTankBool(plc.project,"Tank_LowLS"))lowCleared=true;
    if(readTankBool(plc.project,"Tank_HighLS")){highSeen=true;break;}
    if(i%10===9) plc=tickPracticeScan(plc);
  }
  assert.equal(lowCleared,true);
  assert.equal(highSeen,true,"level-high sensor never activated");
  assert.ok(physics.levelPercent>=TANK_HIGH_PERCENT && physics.levelPercent<92);
  assert.equal(readTankBool(plc.project,"Tank_RunCmd"),false,
    "HighLS must unlatch fill request in the same event");
  assert.equal(readTankBool(plc.project,"Tank_Pump"),false);
  assert.equal(readTankBool(plc.project,"Tank_InletValve"),false);
  const level=physics.levelPercent;
  for(let i=0;i<30;i++){({plc,physics}=stepPhysicalTank(plc,physics));}
  assert.equal(physics.levelPercent,level,"fill must not restart without START");
});

test("momentary DRAIN button opens and CLOSES solenoid on release without waiting 500ms",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  const before=plc.scanCount;
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",true,true);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),true);
  assert.equal(plc.scanCount,before+1);
  let physical=initialTankState();
  ({plc,physics:physical}=stepPhysicalTank(plc,physical));
  assert.ok(physical.levelPercent<TANK_INITIAL_PERCENT);
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",false,true);
  assert.equal(readTankBool(plc.project,"Tank_DrainPB"),false);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),false);
  assert.equal(plc.scanCount,before+2);
  const after=stepTankState(physical,false,false,false,50);
  assert.equal(after.levelPercent,physical.levelPercent);
});

test("STOP and PAUSE freeze virtual tank outputs and process inputs",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createTankExampleProject()));
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  assert.equal(readTankBool(plc.project,"Tank_Pump"),true);
  plc=applyMomentaryBoolInput(plc,"Tank_StopPB",true);
  assert.equal(readTankBool(plc.project,"Tank_Pump"),false);
  plc=applyMomentaryBoolInput(plc,"Tank_StopPB",false);
  plc=pausePracticeScans(plc);
  const scans=plc.scanCount;
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",true,true);
  assert.equal(plc.scanCount,scans);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),false);
  plc=stopPracticeScans(plc);
  assert.equal(plc.mode,"stopped");
});

test("scene integrates with selector, separate project, info dialog and momentary buttons",()=>{
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const view=readFileSync(new URL("../src/components/ide/TankScene.tsx",import.meta.url),"utf8");
  const info=readFileSync(new URL("../src/components/ide/TankSceneInfoDialog.tsx",import.meta.url),"utf8");
  const tags=readFileSync(new URL("../src/components/ide/ControllerTags.tsx",import.meta.url),"utf8");
  assert.match(app,/<option value="tank">Sistema de llenado de tanques<\/option>/);
  assert.match(app,/tank: initialPracticeScanState\(initialTankProject\(\)\)/);
  assert.match(app,/activeControllerScene\.current !== "tank"/);
  assert.match(app,/stepTankState\(tankRef\.current/);
  assert.match(app,/applySceneSensorBoolInput\(result, name, value\)/);
  assert.match(app,/tag === "Tank_DrainPB"/);
  assert.match(tags,/MainRoutine · Sistema de llenado de tanques/);
  assert.match(view,/MomentaryPushButton name="START"/);
  assert.match(view,/MomentaryPushButton name="STOP"/);
  assert.match(view,/MomentaryPushButton name="DRENAR" tone="drain"/);
  assert.match(view,/Pilotos LED y nivel/);
  assert.match(view,/Objetivo y mapa E\/S/);
  assert.match(info,/Objetivo del ejercicio/);
  assert.match(info,/Mapa E\/S · Señales del tanque/);
  assert.match(info,/Cargar plantilla Ladder/);
});
