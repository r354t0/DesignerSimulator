import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialTankProject, createTankExampleProject, initialTankState,
  prepareTankTags, tankSensorInputs, stepTankState, readTankBool,
  hasTankTags, TANK_TAGS, TANK_INITIAL_PERCENT,
  TANK_HIGH_PERCENT, TANK_LOW_PERCENT, TANK_BATCH_TARGET, TANK_TIMER_PRESETS,
} from "../src/plc/tankSceneModel.ts";
import { setTagValue, editTag, insertInstruction } from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  applyMomentaryBoolInput, applySceneSensorBoolInput,
  changePracticeScanProject, initialPracticeScanState,
  setScanPeriod, startPracticeScans, tickPracticeScan,
  pausePracticeScans, stopPracticeScans,
} from "../src/plc/practiceScanCycle.ts";

test("tank MainRoutine starts empty, with documented process, timer and batch tags",()=>{
  const project=initialTankProject();
  assert.equal(hasTankTags(project),true);
  assert.deepEqual(project.tags.map(t=>t.name),TANK_TAGS.map(t=>t.name));
  assert.equal(project.tags.length,24);
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

test("tank reference Ladder builds with actual independent OR, TON and CTU",()=>{
  const project=createTankExampleProject(),result=buildPracticeProject(project);
  assert.equal(result.success,true,JSON.stringify(result.diagnostics));
  assert.equal(project.rungs.length,23);
  const joins=project.rungs.filter(r=>r.instructions.some(i=>i.kind==="OR_JUNCTION"));
  assert.ok(joins.length>=5,"the training template must use several real OR junctions");
  assert.ok(joins.every(r=>r.parallelBranches?.some(b=>b.instructions.length>0)));
  assert.equal(project.rungs.filter(r=>r.instructions.some(i=>i.kind==="TON")).length,4);
  assert.equal(project.rungs.filter(r=>r.instructions.some(i=>i.kind==="CTU")).length,1);
  for (const [name,pre] of Object.entries(TANK_TIMER_PRESETS)) {
    assert.equal(project.tags.find(t=>t.name===name).value.PRE,pre);
  }
  assert.equal(project.tags.find(t=>t.name==="Tank_Batches").value.PRE,TANK_BATCH_TARGET);
  // Every transfer is captured before deactivating the old stage, and
  // the new stage is latched only AFTER the OTU rung.
  for (const [transition, ending, start, oldStage, newStage] of [
    ["tank-to-mix","tank-fill-end","tank-mix-begin","Tank_FillStage","Tank_MixStage"],
    ["tank-to-drain","tank-mix-end","tank-drain-begin","Tank_MixStage","Tank_DrainStage"],
    ["tank-to-fill","tank-drain-end","tank-fill-next","Tank_DrainStage","Tank_FillStage"],
  ]) {
    const index = (id) => project.rungs.findIndex(r=>r.id===id);
    assert.ok(index(transition)<index(ending) && index(ending)<index(start),
      transition+" must occur before OTU and OTL");
    const lookup = (id,kind,tag) => project.rungs[index(id)].instructions
      .some(i=>i.kind===kind && i.tag===tag);
    const signal = {
      "tank-to-mix":"Tank_ToMix","tank-to-drain":"Tank_ToDrain",
      "tank-to-fill":"Tank_ToFill",
    }[transition];
    assert.equal(lookup(transition,"OTE",signal),true);
    assert.equal(lookup(ending,"OTU",oldStage),true);
    assert.equal(lookup(start,"OTL",newStage),true);
  }
  assert.ok(project.rungs.findIndex(r=>r.id==="tank-batch-counter") <
    project.rungs.findIndex(r=>r.id==="tank-to-fill"),
    "batch CTU must be evaluated before deciding on another batch");
  assert.ok(project.rungs.find(r=>r.id==="tank-to-fill").instructions
    .some(i=>i.kind==="XIO"&&i.tag==="Tank_Batches.DN"),
    "the last batch cannot cause a fourth fill");
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

function assertExclusiveStages(plc, context="scan") {
  const active=["Tank_FillStage","Tank_MixStage","Tank_DrainStage"]
    .filter(tag=>readTankBool(plc.project,tag));
  assert.ok(active.length<=1,
    context+": more than one stage active: "+active.join(", "));
}

test("transition flags preserve OTU→OTL semantics in one scan",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  assertExclusiveStages(plc,"initial fill");
  assert.equal(readTankBool(plc.project,"Tank_FillStage"),true);
  // Simulate the physically consistent tank sensors at the end of filling.
  plc=applySceneSensorBoolInput(plc,"Tank_LowLS",false);
  plc=applySceneSensorBoolInput(plc,"Tank_HighLS",true);
  assertExclusiveStages(plc,"fill to mix");
  assert.equal(readTankBool(plc.project,"Tank_ToMix"),true);
  assert.equal(readTankBool(plc.project,"Tank_FillStage"),false);
  assert.equal(readTankBool(plc.project,"Tank_MixStage"),true);
  for(let i=0;i<8;i++) {
    plc=tickPracticeScan(plc);
    assertExclusiveStages(plc,"mixing countdown "+i);
  }
  assert.equal(readTankBool(plc.project,"Tank_ToDrain"),true);
  assert.equal(readTankBool(plc.project,"Tank_MixStage"),false);
  assert.equal(readTankBool(plc.project,"Tank_DrainStage"),true);
  plc=applySceneSensorBoolInput(plc,"Tank_HighLS",false);
  plc=applySceneSensorBoolInput(plc,"Tank_LowLS",true);
  assertExclusiveStages(plc,"drain to next fill");
  assert.equal(readTankBool(plc.project,"Tank_ToFill"),true);
  assert.equal(readTankBool(plc.project,"Tank_DrainStage"),false);
  assert.equal(readTankBool(plc.project,"Tank_FillStage"),true);
  assert.equal(plc.project.tags.find(t=>t.name==="Tank_Batches").value.ACC,1);
  // First subsequent scan clears transition bits (non-retentive OTE).
  plc=tickPracticeScan(plc);
  assertExclusiveStages(plc,"transition flags reset");
  assert.equal(readTankBool(plc.project,"Tank_ToMix"),false);
  assert.equal(readTankBool(plc.project,"Tank_ToDrain"),false);
  assert.equal(readTankBool(plc.project,"Tank_ToFill"),false);
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

test("tank preopens inlet, delays pump, mixes, drains and stops after three batches",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  assert.equal(readTankBool(plc.project,"Tank_RunCmd"),true);
  assert.equal(readTankBool(plc.project,"Tank_InletValve"),true);
  assert.equal(readTankBool(plc.project,"Tank_Pump"),false);
  for (let i=0;i<2;i++) {
    plc=tickPracticeScan(plc);
    assert.equal(readTankBool(plc.project,"Tank_Pump"),false);
  }
  plc=tickPracticeScan(plc);
  assert.equal(plc.project.tags.find(t=>t.name==="Tank_TStart").value.DN,true);
  assert.equal(readTankBool(plc.project,"Tank_Pump"),true);

  let physics=initialTankState();
  let mixed=false,drained=false,alarm=false,lowCleared=false,highSeen=false;
  for (let i=0;i<1450;i++) {
    ({plc,physics}=stepPhysicalTank(plc,physics));
    assertExclusiveStages(plc,"tank physical step "+i);
    mixed ||= readTankBool(plc.project,"Tank_Mixer");
    drained ||= readTankBool(plc.project,"Tank_DrainValve");
    alarm ||= readTankBool(plc.project,"Tank_Alarm");
    lowCleared ||= !readTankBool(plc.project,"Tank_LowLS");
    highSeen ||= readTankBool(plc.project,"Tank_HighLS");
    if (i%10===9) plc=tickPracticeScan(plc);
    assertExclusiveStages(plc,"tank cyclic scan "+i);
    const count=plc.project.tags.find(t=>t.name==="Tank_Batches").value.ACC;
    if(count===TANK_BATCH_TARGET && !readTankBool(plc.project,"Tank_RunCmd"))break;
    if(i===1449) assert.fail("three-batch sequence did not complete");
  }
  assert.equal(alarm,false,"normal process must not trip either watchdog");
  assert.equal(mixed,true); assert.equal(drained,true);
  assert.equal(lowCleared,true);assert.equal(highSeen,true);
  assert.equal(plc.project.tags.find(t=>t.name==="Tank_Batches").value.ACC,3);
  for(const output of ["Tank_Pump","Tank_InletValve","Tank_Mixer","Tank_DrainValve"]){
    assert.equal(readTankBool(plc.project,output),false,output);
  }
  assert.equal(readTankBool(plc.project,"Tank_RunCmd"),false);
  assert.ok(physics.levelPercent <= TANK_LOW_PERCENT);
});

test("fill watchdog faults with no level progress and keeps actuators safe",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  for(let i=0;i<45;i++)plc=tickPracticeScan(plc);
  assert.equal(readTankBool(plc.project,"Tank_Alarm"),true);
  assert.equal(readTankBool(plc.project,"Tank_RunCmd"),false);
  for(const output of ["Tank_Pump","Tank_InletValve","Tank_Mixer","Tank_DrainValve"]){
    assert.equal(readTankBool(plc.project,output),false,output);
  }
  // RESET only while the automatic cycle is idle.
  plc=applyMomentaryBoolInput(plc,"Tank_ResetPB",true,true);
  assert.equal(readTankBool(plc.project,"Tank_Alarm"),false);
  plc=applyMomentaryBoolInput(plc,"Tank_ResetPB",false,true);
});

test("manual drain is blocked below LSL and during the automatic cycle",()=>{
  let p=createTankExampleProject();
  let plc=startPracticeScans(initialPracticeScanState(p));
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",true,true);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),false,"LSL is active");
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",false,true);
  p=setTagValue(plc.project,"Tank_LowLS",false);
  p=setTagValue(p,"Tank_LevelPct",30);
  plc=changePracticeScanProject(plc,p);
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",true,true);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),true);
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",false,true);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),false);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",true,true);
  assert.equal(readTankBool(plc.project,"Tank_DrainValve"),false);
});

test("STOP and PAUSE freeze the simulated process and timers",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createTankExampleProject()));
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",true);
  plc=applyMomentaryBoolInput(plc,"Tank_StartPB",false);
  assert.equal(readTankBool(plc.project,"Tank_InletValve"),true);
  plc=applyMomentaryBoolInput(plc,"Tank_StopPB",true);
  assert.equal(readTankBool(plc.project,"Tank_RunCmd"),false);
  assert.equal(readTankBool(plc.project,"Tank_InletValve"),false);
  plc=applyMomentaryBoolInput(plc,"Tank_StopPB",false);
  plc=pausePracticeScans(plc);
  const scans=plc.scanCount;
  const acc=plc.project.tags.find(t=>t.name==="Tank_TStart").value.ACC;
  plc=applyMomentaryBoolInput(plc,"Tank_DrainPB",true,true);
  assert.equal(plc.scanCount,scans);
  assert.equal(plc.project.tags.find(t=>t.name==="Tank_TStart").value.ACC,acc);
  plc=stopPracticeScans(plc);
  assert.equal(plc.mode,"stopped");
});


