import test from "node:test";
import assert from "node:assert/strict";
import {
 createBatchSolution,initialBatchState,stepBatchPhysics,
 batchDigitalSensors,batchBool,batchInt,batchCounter,
} from "../src/plc/batchMixerSceneModel.ts";
import { setTagValue } from "../src/plc/practiceDocument.ts";
import { initialPracticeScanState,startPracticeScans,setScanPeriod,
  tickPracticeScan,applySceneSensorBoolInput,applyMomentaryBoolInput,
} from "../src/plc/practiceScanCycle.ts";

function simulator(exercise, projectOverride=project=>project) {
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(projectOverride(createBatchSolution(exercise))),100));
  let state=initialBatchState();
  plc=applyMomentaryBoolInput(plc,"PB_Start",true);
  plc=applyMomentaryBoolInput(plc,"PB_Start",false);
  let elapsed=0;
  const step=()=>{
    const before=state;
    const current=plc.project;
    const next=stepBatchPhysics(before,{
      pump1:batchBool(current,"DO_Pump1"),
      pump2:batchBool(current,"DO_Pump2"),
      pump3:batchBool(current,"DO_Pump3"),
      heater:batchBool(current,"DO_Heater"),
    },50);
    state=next;
    const flow=["DI_Flowmeter1","DI_Flowmeter2","DI_Flowmeter3"];
    for(let i=0;i<3;i++)for(let n=before.totalPulses[i];n<next.totalPulses[i];n++){
      plc=applySceneSensorBoolInput(plc,flow[i],true);
      plc=applySceneSensorBoolInput(plc,flow[i],false);
    }
    const signals=batchDigitalSensors(state,batchInt(plc.project,"INT_TempSP"));
    for(const [tag,value] of Object.entries(signals)){
      if(batchBool(plc.project,tag)!==value)
        plc=applySceneSensorBoolInput(plc,tag,value);
    }
    elapsed++;
    if(elapsed%2===0) plc=tickPracticeScan(plc);
  };
  const until=(predicate,limit=1100)=>{
    for(let i=0;i<limit;i++){
      if(predicate())return true;
      step();
    }
    return predicate();
  };
  return {step,until,get physical(){return state;},
    get controller(){return plc;},
    get timeMs(){return elapsed*50;}};
}

test("integrated E1: real pump moves 90%, Flowmeter 1 counts and stops pump",()=>{
  const sim=simulator(1);
  assert.equal(sim.until(()=>sim.physical.level>=90),true);
  for(let i=0;i<3;i++)sim.step();
  assert.equal(sim.physical.level,90);
  assert.equal(batchCounter(sim.controller.project,"CNT_Volume"),900);
  assert.equal(batchBool(sim.controller.project,"DO_Pump1"),false);
  assert.equal(batchBool(sim.controller.project,"DO_FullLamp"),true);
});

test("integrated E4: two products, digital thermostat, 4s hold and drain to low",()=>{
  const sim=simulator(4,p=>setTagValue(p,"INT_TempSP",24));
  assert.equal(sim.until(()=>sim.physical.level===100),true);
  assert.equal(sim.physical.totalPulses[0],400);
  assert.equal(sim.physical.totalPulses[1],600);
  assert.equal(sim.until(()=>batchBool(sim.controller.project,"DI_Thermostat")),true);
  assert.equal(sim.physical.temperature>=24,true);
  assert.equal(sim.until(()=>batchBool(sim.controller.project,"DO_Pump3")),true);
  const temperatureAtDrainStart=sim.physical.temperature;
  for(let i=0;i<20;i++)sim.step();
  assert.ok(sim.physical.temperature<temperatureAtDrainStart,
    "E4 SCADA must cool as soon as the draining pump is active");
  assert.equal(batchBool(sim.controller.project,"DI_Thermostat"),false,
    "digital thermostat clears as temperature drops below the INT setpoint");
  assert.equal(sim.until(()=>sim.physical.level===0),true);
  for(let i=0;i<3;i++)sim.step();
  assert.equal(sim.physical.temperature,20,
    "the empty vessel must be at ambient for the next batch");
  assert.equal(batchBool(sim.controller.project,"DO_Pump3"),false);
  assert.equal(batchBool(sim.controller.project,"ST_Draining"),false);
  assert.equal(batchBool(sim.controller.project,"DI_LowLevel"),false);
});

test("integrated E5: two configured batches complete, then everything stops",()=>{
  const sim=simulator(5,p=>{
    p=setTagValue(p,"INT_TempSP",20);
    p=setTagValue(p,"INT_BatchTarget",2);
    return p;
  });
  assert.equal(sim.until(()=>batchCounter(sim.controller.project,"CNT_Lotes")>=2,2400),true);
  for(let i=0;i<3;i++)sim.step();
  assert.equal(batchCounter(sim.controller.project,"CNT_Lotes"),2);
  // The requested 17-rung reference does not contain MOV INT_DisplayValue;
  // the SCADA display reads the CNT_Lotes.ACC member directly.
  assert.equal(batchCounter(sim.controller.project,"CNT_Lotes"),2);
  assert.equal(batchBool(sim.controller.project,"DO_Pump1"),false);
  assert.equal(batchBool(sim.controller.project,"DO_Pump2"),false);
  assert.equal(batchBool(sim.controller.project,"DO_Pump3"),false);
  assert.equal(batchBool(sim.controller.project,"DO_Mixer"),false);
  assert.equal(sim.physical.level,0);
});
