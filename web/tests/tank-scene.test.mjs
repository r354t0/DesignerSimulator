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
  assert.equal(project.tags.find(t=>t.name==="AI_LevelPct").value,TANK_INITIAL_PERCENT);
  assert.equal(project.tags.find(t=>t.name==="DI_LowLevel").value,true);
  assert.equal(project.tags.find(t=>t.name==="DI_HighLevel").value,false);
  assert.equal(prepareTankTags(project),project);
  assert.equal(project.tags.some(t=>t.name==="Sort_Motor"||t.name==="Motor_Run"),false);
  for(const def of TANK_TAGS) assert.equal(project.tags.find(t=>t.name===def.name).description,def.description);
});

test("tank automatic tag registration is idempotent, does not mutate user rungs or tags",()=>{
  let project=initialTankProject();
  project=editTag(project,"DO_Pump",{description:"Descripción personalizada"});
  project=insertInstruction(project,"rung-1",0,{id:"custom",kind:"XIC",tag:"PB_Start"});
  const source=project.rungs;
  const update=prepareTankTags(project);
  assert.equal(update,project);
  assert.equal(update.rungs,source);
  assert.equal(update.tags.find(t=>t.name==="DO_Pump").description,"Descripción personalizada");
  assert.equal(prepareTankTags(update),update);
});

test("tank tag registration rejects wrong type without partial mutation",()=>{
  let project=initialTankProject();
  project=editTag(project,"AI_LevelPct",{type:"BOOL"});
  assert.throws(()=>prepareTankTags(project),/AI_LevelPct.*REAL/);
  assert.equal(project.tags.find(t=>t.name==="AI_LevelPct").type,"BOOL");
});

test("tank reference Ladder builds with actual independent OR, TON and CTU",()=>{
  const project=createTankExampleProject(),result=buildPracticeProject(project);
  assert.equal(result.success,true,JSON.stringify(result.diagnostics));
  assert.equal(project.rungs.length,22);
  assert.equal(project.rungs.some(r=>r.id==="tank-fill-next"),false,
    "the former rung 22 must be removed");
  const begin=project.rungs.find(r=>r.id==="tank-begin");
  assert.deepEqual(begin.instructions.map(i=>i.kind),
    ["OR_JUNCTION","XIC","XIO","XIO","XIO","OTL"]);
  assert.deepEqual(begin.instructions.slice(1,5).map(i=>i.tag),
    ["ST_RunEnable","ST_Filling","ST_Mixing","ST_Draining"]);
  assert.equal(begin.instructions.at(-1).tag,"ST_Filling");
  assert.equal(begin.parallelBranches.length,1);
  assert.deepEqual(begin.parallelBranches[0].instructions.map(i=>i.tag),
    ["ST_ToFill"],"ToFill must bypass the entire upper contact chain");
  assert.equal(begin.parallelBranches[0].endId,begin.instructions[4].id,
    "ToFill branch must rejoin after ST_Draining");
  const joins=project.rungs.filter(r=>r.instructions.some(i=>i.kind==="OR_JUNCTION"));
  assert.ok(joins.length>=5,"the training template must use several real OR junctions");
  assert.ok(joins.every(r=>r.parallelBranches?.some(b=>b.instructions.length>0)));
  assert.equal(project.rungs.filter(r=>r.instructions.some(i=>i.kind==="TON")).length,4);
  assert.equal(project.rungs.filter(r=>r.instructions.some(i=>i.kind==="CTU")).length,1);
  for (const [name,pre] of Object.entries(TANK_TIMER_PRESETS)) {
    assert.equal(project.tags.find(t=>t.name===name).value.PRE,pre);
  }
  assert.equal(project.tags.find(t=>t.name==="CNT_Batches").value.PRE,TANK_BATCH_TARGET);
  // Mix and drain activate in the same scan AFTER their source stage's OTU.
  // Drain-to-fill loops back to R1, therefore its OTL runs NEXT scan.
  for (const [transition, ending, start, oldStage, newStage] of [
    ["tank-to-mix","tank-fill-end","tank-mix-begin","ST_Filling","ST_Mixing"],
    ["tank-to-drain","tank-mix-end","tank-drain-begin","ST_Mixing","ST_Draining"],
  ]) {
    const index = (id) => project.rungs.findIndex(r=>r.id===id);
    assert.ok(index(transition)<index(ending) && index(ending)<index(start),
      transition+" must occur before OTU and OTL");
    const lookup = (id,kind,tag) => project.rungs[index(id)].instructions
      .some(i=>i.kind===kind && i.tag===tag);
    const signal = {
      "tank-to-mix":"ST_ToMix","tank-to-drain":"ST_ToDrain",
      "tank-to-fill":"ST_ToFill",
    }[transition];
    assert.equal(lookup(transition,"OTE",signal),true);
    assert.equal(lookup(ending,"OTU",oldStage),true);
    assert.equal(lookup(start,"OTL",newStage),true);
  }
  assert.ok(project.rungs.findIndex(r=>r.id==="tank-to-fill") <
    project.rungs.findIndex(r=>r.id==="tank-drain-end"),
    "DrainStage must be unlatched only after ToFill is captured");
  assert.ok(project.rungs.findIndex(r=>r.id==="tank-begin") <
    project.rungs.findIndex(r=>r.id==="tank-drain-end"),
    "re-entry to FillStage via R1 is evaluated on the following scan");
  assert.ok(project.rungs.findIndex(r=>r.id==="tank-batch-counter") <
    project.rungs.findIndex(r=>r.id==="tank-to-fill"),
    "batch CTU must be evaluated before deciding on another batch");
  assert.ok(project.rungs.find(r=>r.id==="tank-to-fill").instructions
    .some(i=>i.kind==="XIO"&&i.tag==="CNT_Batches.DN"),
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
  assert.equal(tankSensorInputs(15).DI_LowLevel,true);
  assert.equal(tankSensorInputs(15.01).DI_LowLevel,false);
  assert.equal(tankSensorInputs(90).DI_HighLevel,true);
  assert.equal(tankSensorInputs(89.99).DI_HighLevel,false);
  let state={...initial,levelPercent:99.9};
  state=stepTankState(state,true,true,false,150);
  assert.equal(state.levelPercent,100);
  state=stepTankState({...state,levelPercent:0},false,false,true,150);
  assert.equal(state.levelPercent,0);
});

function assertExclusiveStages(plc, context="scan") {
  const active=["ST_Filling","ST_Mixing","ST_Draining"]
    .filter(tag=>readTankBool(plc.project,tag));
  assert.ok(active.length<=1,
    context+": more than one stage active: "+active.join(", "));
}

test("transition flags preserve OTU→OTL semantics in one scan",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"PB_Start",true);
  plc=applyMomentaryBoolInput(plc,"PB_Start",false);
  assertExclusiveStages(plc,"initial fill");
  assert.equal(readTankBool(plc.project,"ST_Filling"),true);
  // Simulate the physically consistent tank sensors at the end of filling.
  plc=applySceneSensorBoolInput(plc,"DI_LowLevel",false);
  plc=applySceneSensorBoolInput(plc,"DI_HighLevel",true);
  assertExclusiveStages(plc,"fill to mix");
  assert.equal(readTankBool(plc.project,"ST_ToMix"),true);
  assert.equal(readTankBool(plc.project,"ST_Filling"),false);
  assert.equal(readTankBool(plc.project,"ST_Mixing"),true);
  for(let i=0;i<8;i++) {
    plc=tickPracticeScan(plc);
    assertExclusiveStages(plc,"mixing countdown "+i);
  }
  assert.equal(readTankBool(plc.project,"ST_ToDrain"),true);
  assert.equal(readTankBool(plc.project,"ST_Mixing"),false);
  assert.equal(readTankBool(plc.project,"ST_Draining"),true);
  plc=applySceneSensorBoolInput(plc,"DI_HighLevel",false);
  plc=applySceneSensorBoolInput(plc,"DI_LowLevel",true);
  assertExclusiveStages(plc,"drain to next fill");
  assert.equal(readTankBool(plc.project,"ST_ToFill"),true);
  assert.equal(readTankBool(plc.project,"ST_Draining"),false);
  assert.equal(readTankBool(plc.project,"ST_Filling"),false,
    "R1 is above the transition rung and must not latch FillStage in this scan");
  assert.equal(plc.project.tags.find(t=>t.name==="CNT_Batches").value.ACC,1);
  // The following scan loops back through R1, latches FillStage, then ToFill
  // resets as a non-retentive OTE without creating a separate rung 22.
  plc=tickPracticeScan(plc);
  assertExclusiveStages(plc,"return to fill through OR in rung 1");
  assert.equal(readTankBool(plc.project,"ST_Filling"),true);
  assert.equal(readTankBool(plc.project,"ST_ToMix"),false);
  assert.equal(readTankBool(plc.project,"ST_ToDrain"),false);
  assert.equal(readTankBool(plc.project,"ST_ToFill"),false);
});

function stepPhysicalTank(plc,physics) {
  const next=stepTankState(physics,
    readTankBool(plc.project,"DO_Pump"),
    readTankBool(plc.project,"DO_InletValve"),
    readTankBool(plc.project,"DO_DrainValve"),50);
  const sensors=tankSensorInputs(next.levelPercent);
  let program=plc;
  const l=program.project.tags.find(t=>t.name==="AI_LevelPct");
  if(l.value!==sensors.AI_LevelPct){
    program=changePracticeScanProject(program,setTagValue(program.project,"AI_LevelPct",sensors.AI_LevelPct));
  }
  for(const name of ["DI_LowLevel","DI_HighLevel"]){
    if(readTankBool(program.project,name)!==sensors[name]){
      program=applySceneSensorBoolInput(program,name,sensors[name]);
    }
  }
  return {plc:program,physics:next};
}

test("tank preopens inlet, delays pump, mixes, drains and stops after three batches",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"PB_Start",true);
  plc=applyMomentaryBoolInput(plc,"PB_Start",false);
  assert.equal(readTankBool(plc.project,"ST_RunEnable"),true);
  assert.equal(readTankBool(plc.project,"DO_InletValve"),true);
  assert.equal(readTankBool(plc.project,"DO_Pump"),false);
  for (let i=0;i<2;i++) {
    plc=tickPracticeScan(plc);
    assert.equal(readTankBool(plc.project,"DO_Pump"),false);
  }
  plc=tickPracticeScan(plc);
  assert.equal(plc.project.tags.find(t=>t.name==="TMR_StartDelay").value.DN,true);
  assert.equal(readTankBool(plc.project,"DO_Pump"),true);

  let physics=initialTankState();
  let mixed=false,drained=false,alarm=false,lowCleared=false,highSeen=false;
  for (let i=0;i<1450;i++) {
    ({plc,physics}=stepPhysicalTank(plc,physics));
    assertExclusiveStages(plc,"tank physical step "+i);
    mixed ||= readTankBool(plc.project,"DO_Mixer");
    drained ||= readTankBool(plc.project,"DO_DrainValve");
    alarm ||= readTankBool(plc.project,"ALM_ProcessTimeout");
    lowCleared ||= !readTankBool(plc.project,"DI_LowLevel");
    highSeen ||= readTankBool(plc.project,"DI_HighLevel");
    if (i%10===9) plc=tickPracticeScan(plc);
    assertExclusiveStages(plc,"tank cyclic scan "+i);
    const count=plc.project.tags.find(t=>t.name==="CNT_Batches").value.ACC;
    if(count===TANK_BATCH_TARGET && !readTankBool(plc.project,"ST_RunEnable"))break;
    if(i===1449) assert.fail("three-batch sequence did not complete");
  }
  assert.equal(alarm,false,"normal process must not trip either watchdog");
  assert.equal(mixed,true); assert.equal(drained,true);
  assert.equal(lowCleared,true);assert.equal(highSeen,true);
  assert.equal(plc.project.tags.find(t=>t.name==="CNT_Batches").value.ACC,3);
  for(const output of ["DO_Pump","DO_InletValve","DO_Mixer","DO_DrainValve"]){
    assert.equal(readTankBool(plc.project,output),false,output);
  }
  assert.equal(readTankBool(plc.project,"ST_RunEnable"),false);
  assert.ok(physics.levelPercent <= TANK_LOW_PERCENT);
});

test("fill watchdog faults with no level progress and keeps actuators safe",()=>{
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(createTankExampleProject()),500));
  plc=applyMomentaryBoolInput(plc,"PB_Start",true);
  plc=applyMomentaryBoolInput(plc,"PB_Start",false);
  for(let i=0;i<45;i++)plc=tickPracticeScan(plc);
  assert.equal(readTankBool(plc.project,"ALM_ProcessTimeout"),true);
  assert.equal(readTankBool(plc.project,"ST_RunEnable"),false);
  for(const output of ["DO_Pump","DO_InletValve","DO_Mixer","DO_DrainValve"]){
    assert.equal(readTankBool(plc.project,output),false,output);
  }
  // RESET only while the automatic cycle is idle.
  plc=applyMomentaryBoolInput(plc,"PB_Reset",true,true);
  assert.equal(readTankBool(plc.project,"ALM_ProcessTimeout"),false);
  plc=applyMomentaryBoolInput(plc,"PB_Reset",false,true);
});

test("manual drain is blocked below LSL and during the automatic cycle",()=>{
  let p=createTankExampleProject();
  let plc=startPracticeScans(initialPracticeScanState(p));
  plc=applyMomentaryBoolInput(plc,"PB_Drain",true,true);
  assert.equal(readTankBool(plc.project,"DO_DrainValve"),false,"LSL is active");
  plc=applyMomentaryBoolInput(plc,"PB_Drain",false,true);
  p=setTagValue(plc.project,"DI_LowLevel",false);
  p=setTagValue(p,"AI_LevelPct",30);
  plc=changePracticeScanProject(plc,p);
  plc=applyMomentaryBoolInput(plc,"PB_Drain",true,true);
  assert.equal(readTankBool(plc.project,"DO_DrainValve"),true);
  plc=applyMomentaryBoolInput(plc,"PB_Drain",false,true);
  assert.equal(readTankBool(plc.project,"DO_DrainValve"),false);
  plc=applyMomentaryBoolInput(plc,"PB_Start",true);
  plc=applyMomentaryBoolInput(plc,"PB_Start",false);
  plc=applyMomentaryBoolInput(plc,"PB_Drain",true,true);
  assert.equal(readTankBool(plc.project,"DO_DrainValve"),false);
});

test("STOP and PAUSE freeze the simulated process and timers",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createTankExampleProject()));
  plc=applyMomentaryBoolInput(plc,"PB_Start",true);
  plc=applyMomentaryBoolInput(plc,"PB_Start",false);
  assert.equal(readTankBool(plc.project,"DO_InletValve"),true);
  plc=applyMomentaryBoolInput(plc,"PB_Stop",true);
  assert.equal(readTankBool(plc.project,"ST_RunEnable"),false);
  assert.equal(readTankBool(plc.project,"DO_InletValve"),false);
  plc=applyMomentaryBoolInput(plc,"PB_Stop",false);
  plc=pausePracticeScans(plc);
  const scans=plc.scanCount;
  const acc=plc.project.tags.find(t=>t.name==="TMR_StartDelay").value.ACC;
  plc=applyMomentaryBoolInput(plc,"PB_Drain",true,true);
  assert.equal(plc.scanCount,scans);
  assert.equal(plc.project.tags.find(t=>t.name==="TMR_StartDelay").value.ACC,acc);
  plc=stopPracticeScans(plc);
  assert.equal(plc.mode,"stopped");
});


