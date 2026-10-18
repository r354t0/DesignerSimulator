import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
 BATCH_EXERCISES,BATCH_IO_TAGS,batchSolutionTags,
 initialBatchProject,prepareBatchTags,createBatchSolution,
 initialBatchState,batchDigitalSensors,stepBatchPhysics,resetBatchProgramState,
 batchBool,batchInt,batchCounter,
} from "../src/plc/batchMixerSceneModel.ts";
import {
 initialPracticeScanState,startPracticeScans,setScanPeriod,tickPracticeScan,
 applyMomentaryBoolInput,applySceneSensorBoolInput,
} from "../src/plc/practiceScanCycle.ts";
import {setTagValue} from "../src/plc/practiceDocument.ts";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const press=(state,name)=>{
  state=applyMomentaryBoolInput(state,name,true,name==="PB_Stop");
  return applyMomentaryBoolInput(state,name,false,name==="PB_Stop");
};
const pulse=(state,name)=>{
  state=applySceneSensorBoolInput(state,name,true);
  return applySceneSensorBoolInput(state,name,false);
};
const count=(plc,name)=>batchCounter(plc.project,name);
const output=(plc,name)=>batchBool(plc.project,name);
const started=(exercise,adjust=project=>project)=>{
  const project=adjust(createBatchSolution(exercise));
  const build=buildPracticeProject(project);
  assert.equal(build.success,true,"Exercise "+exercise+": "+JSON.stringify(build.diagnostics));
  let plc=startPracticeScans(setScanPeriod(initialPracticeScanState(project),500));
  plc=press(plc,"PB_Start");
  // After the first inflow pulse, the physically empty-level switch drops.
  plc=applySceneSensorBoolInput(plc,"DI_LowLevel",false);
  return plc;
};
const setBOOL=(plc,name,value)=>applySceneSensorBoolInput(plc,name,value);

test("Batch Mixer starts with SCADA E/S only and all numeric HMI inputs are INT",()=>{
  const initial=initialBatchProject();
  assert.deepEqual(initial.tags.map(x=>x.name),BATCH_IO_TAGS.map(x=>x.name));
  assert.ok(initial.tags.every(x=>x.type==="BOOL"||x.type==="INT"));
  assert.ok(initial.tags.filter(x=>x.name.startsWith("INT_")).every(x=>x.type==="INT"));
  assert.equal(initial.tags.find(x=>x.name==="DI_Thermostat").type,"BOOL");
  assert.equal(initial.tags.some(x=>x.type==="REAL"),false);
  assert.equal(initial.tags.some(x=>x.type==="TIMER"||x.type==="COUNTER"),false);
  assert.equal(initial.rungs.length,1);
  assert.equal(initial.rungs[0].instructions.length,0);
  assert.strictEqual(prepareBatchTags(initial),initial);
});
test("five recommended solutions build independently and introduce only their own auxiliary tags",()=>{
  assert.equal(BATCH_EXERCISES.length,5);
  for(const ex of [1,2,3,4,5]){
    const p=createBatchSolution(ex);
    const build=buildPracticeProject(p);
    assert.equal(build.success,true,"Exercise "+ex+" diagnostics "+JSON.stringify(build.diagnostics));
    const added=p.tags.filter(t=>!BATCH_IO_TAGS.some(io=>io.name===t.name));
    assert.deepEqual(added.map(x=>x.name),batchSolutionTags(ex).map(x=>x.name));
    assert.ok(p.rungs.length>=8);
    assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="CTU")));
    if(ex!==1) assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="RTO")));
    if(ex===2||ex===3) assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="CTD")));
    if(ex>=4)assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="LES")));
    assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="MOV")));
    const display=p.tags.find(t=>t.name==="INT_DisplayValue");
    assert.equal(display.type,"INT");
  }
});
test("lab 01 exercise 1: P1 fills via 90 rising pulses, FULL and stop behave",()=>{
  let plc=started(1);
  assert.equal(output(plc,"DO_Pump1"),true);
  for(let i=0;i<89;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),89);
  assert.equal(output(plc,"DO_Pump1"),true);
  plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),90);
  assert.equal(output(plc,"DO_Pump1"),false);
  assert.equal(output(plc,"DO_FullLamp"),true);
  plc=press(plc,"PB_Stop");
  assert.equal(output(plc,"DO_Pump1"),false);
});
test("lab 01 exercise 2: RTO mixes for eight seconds, CTD drains to zero",()=>{
  let plc=started(2);
  for(let i=0;i<90;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),90);
  assert.equal(output(plc,"DO_Mixer"),true);
  for(let i=0;i<15;i++)plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Pump3"),false);
  plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Mixer"),false);
  assert.equal(output(plc,"DO_Pump3"),true);
  for(let i=0;i<90;i++)plc=pulse(plc,"DI_Flowmeter3");
  assert.equal(count(plc,"CNT_Volume"),0);
  assert.equal(output(plc,"DO_Pump3"),false);
  plc=setBOOL(plc,"DI_LowLevel",true);
  plc=press(plc,"PB_Start");
  assert.equal(output(plc,"DO_Pump1"),true);
});
test("lab 01 exercise 3: STOP freezes stage and RTO resumes; continuous auto cycles",()=>{
  let plc=started(3);
  for(let i=0;i<90;i++)plc=pulse(plc,"DI_Flowmeter1");
  for(let i=0;i<7;i++)plc=tickPracticeScan(plc);
  const elapsed=plc.project.tags.find(t=>t.name==="TMR_Mix8s").value.ACC;
  assert.ok(elapsed>0);
  plc=press(plc,"PB_Stop");
  assert.equal(output(plc,"DO_Mixer"),false);
  for(let i=0;i<8;i++)plc=tickPracticeScan(plc);
  assert.equal(plc.project.tags.find(t=>t.name==="TMR_Mix8s").value.ACC,elapsed);
  plc=press(plc,"PB_Start");
  assert.equal(output(plc,"DO_Mixer"),true);
  for(let i=0;i<9;i++)plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Pump3"),true);
  for(let i=0;i<90;i++)plc=pulse(plc,"DI_Flowmeter3");
  assert.equal(output(plc,"DO_Pump1"),true);
  assert.equal(output(plc,"DO_RunLamp"),true);
});
test("advanced exercise 4: integer ratio controls P1/P2, DI thermostat triggers 4 seconds",()=>{
  let plc=started(4);
  for(let i=0;i<40;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Product1"),40);
  assert.equal(output(plc,"DO_Pump1"),false);
  assert.equal(output(plc,"DO_Pump2"),true);
  plc=setBOOL(plc,"DI_HighLevel",true);
  assert.equal(output(plc,"DO_Pump2"),false);
  assert.equal(output(plc,"DO_Heater"),true);
  assert.equal(output(plc,"DO_Mixer"),true);
  plc=setBOOL(plc,"DI_Thermostat",true);
  assert.equal(output(plc,"DO_Heater"),false);
  for(let i=0;i<8;i++)plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Pump3"),true);
  assert.equal(output(plc,"DO_Mixer"),false);
  plc=setBOOL(plc,"DI_HighLevel",false);
  plc=setBOOL(plc,"DI_LowLevel",true);
  assert.equal(output(plc,"DO_Pump3"),false);
  assert.equal(batchBool(plc.project,"ST_BatchDone"),true);
});
test("advanced exercise 5: mode B runs batches up to INT target and display increments",()=>{
  let plc=started(5,p=>setTagValue(p,"INT_BatchTarget",2));
  assert.equal(batchBool(plc.project,"DI_ModeB"),true);
  for(let lot=1;lot<=2;lot++){
    for(let i=0;i<40;i++)plc=pulse(plc,"DI_Flowmeter1");
    assert.equal(output(plc,"DO_Pump2"),true);
    plc=setBOOL(plc,"DI_HighLevel",true);
    plc=setBOOL(plc,"DI_Thermostat",true);
    for(let i=0;i<8;i++)plc=tickPracticeScan(plc);
    assert.equal(output(plc,"DO_Pump3"),true);
    plc=setBOOL(plc,"DI_HighLevel",false);
    plc=setBOOL(plc,"DI_LowLevel",true);
    assert.equal(count(plc,"CNT_Lotes"),lot);
    assert.equal(batchInt(plc.project,"INT_DisplayValue"),lot);
    if(lot===1){
      assert.equal(output(plc,"DO_Pump1"),true);
      plc=setBOOL(plc,"DI_LowLevel",false);
      plc=setBOOL(plc,"DI_Thermostat",false);
    }else{
      assert.equal(output(plc,"DO_Pump1"),false);
      assert.equal(output(plc,"DO_Pump2"),false);
      assert.equal(output(plc,"DO_Pump3"),false);
    }
  }
});
test("real physics generates pulses, temperature remains internal and thermostat is digital",()=>{
  let st=initialBatchState();
  assert.deepEqual(batchDigitalSensors(st,32),{
    DI_LowLevel:true,DI_HighLevel:false,DI_Thermostat:false,
  });
  for(let i=0;i<250;i++)
    st=stepBatchPhysics(st,{pump1:true,pump2:false,pump3:false,heater:false},50);
  assert.equal(st.level,100);
  assert.equal(st.totalPulses[0],100);
  assert.equal(st.totalPulses[1],0);
  assert.equal(batchDigitalSensors(st,32).DI_HighLevel,true);
  for(let i=0;i<80;i++)
    st=stepBatchPhysics(st,{pump1:false,pump2:false,pump3:false,heater:true},50);
  assert.ok(st.temperature>=32);
  assert.equal(batchDigitalSensors(st,32).DI_Thermostat,true);
  const reset=resetBatchProgramState(createBatchSolution(5));
  assert.equal(batchInt(reset,"INT_TempSP"),32);
  assert.equal(batchBool(reset,"DI_LowLevel"),true);
  assert.equal(batchBool(reset,"DI_ModeB"),true);
  assert.equal(batchCounter(reset,"CNT_Lotes"),0);
});
test("scene 5 and all five solutions are presented in App and info dialog",()=>{
  const app=source("../src/App.tsx");
  const scada=source("../src/components/ide/BatchMixerScene.tsx");
  const info=source("../src/components/ide/BatchMixerSceneInfoDialog.tsx");
  assert.match(app,/<option value="batch">Batch Mixer · Mezcla por lotes<\/option>/);
  assert.match(app,/batch: initialPracticeScanState\(initialBatchProject\(\)\)/);
  assert.match(app,/stepBatchPhysics\(previous,/);
  assert.match(app,/createBatchSolution\(exercise\)/);
  assert.match(scada,/INT_TempSP/);
  assert.match(scada,/INT_RatioP1/);
  assert.match(scada,/INT_BatchTarget/);
  assert.match(scada,/BatchProcessGraphic/);
  assert.match(info,/BATCH_EXERCISES\.map/);
  assert.match(info,/batchSolutionTags\(exercise\)/);
  assert.match(info,/Implementar Solución Recomendada/);
  assert.match(info,/Reiniciar programación para practicar/);
});
