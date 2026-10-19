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
  // The bottom sensor turns ON as soon as liquid reaches the probe.
  plc=applySceneSensorBoolInput(plc,"DI_LowLevel",true);
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
    if(ex===1) assert.equal(p.rungs.length,6);
    else assert.ok(p.rungs.length>=8);
    assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="CTU")));
    if(ex!==1) assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="RTO")));
    if(ex===2||ex===3) assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="CTD")));
    if(ex>=4)assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="LES")));
    if(ex>=4){
      assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="MUL"&&
        i.tag==="ST_P1PulseTarget"&&i.compareB?.mode==="literal"&&i.compareB.value===10)));
      assert.equal(p.tags.find(t=>t.name==="ST_P1PulseTarget").type,"INT");
    }
    if(ex!==1) assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="MOV")));
    const display=p.tags.find(t=>t.name==="INT_DisplayValue");
    assert.equal(display.type,"INT");
  }
});
test("Ejercicio 1: six rungs exactly match reference, with two parallel output coils in rung 4",()=>{
  const project=createBatchSolution(1);
  assert.equal(project.rungs.length,6);
  const expected=[
    [["XIC","PB_Start"],["XIO","PB_Stop"],["OTE","ST_RunEnable"]],
    [["XIC","ST_RunEnable"],["XIC","PB_Start"],["OTL","ST_Filling"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Filling"],["OTE","DO_Pump1"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Filling"],
      ["XIC","DI_Flowmeter1"],["CTU","CNT_Volume"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Filling"],
      ["GEQ",""],["OTU","ST_Filling"],["OTL","ST_Full"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Full"],["OTE","DO_FullLamp"]],
  ];
  project.rungs.forEach((rung,index)=>{
    assert.deepEqual(rung.instructions.map(item=>[item.kind,item.tag]),expected[index],
      "rung "+index+" must match the diagram");
  });
  const first=project.rungs[0];
  assert.equal(first.parallelBranches.length,1);
  assert.deepEqual(first.parallelBranches[0].instructions.map(item=>[item.kind,item.tag]),
    [["XIC","ST_RunEnable"]]);
  assert.equal(first.parallelBranches[0].anchorId,first.instructions[0].id);
  const transition=project.rungs[4];
  assert.equal(transition.parallelBranches?.length??0,0);
  assert.deepEqual(transition.instructions.slice(-2).map(x=>x.kind),["OTU","OTL"]);
  assert.deepEqual(transition.instructions[2].compareA,
    {mode:"tag",tag:"CNT_Volume.ACC"});
  assert.deepEqual(transition.instructions[2].compareB,
    {mode:"literal",value:900});
  assert.equal(project.tags.find(t=>t.name==="CNT_Volume").value.PRE,900);
  assert.ok(!project.rungs.some(rung=>rung.instructions.some(item=>
    ["RTO","TON","CTD","MOV"].includes(item.kind))),"no extra solution rungs");
  assert.equal(buildPracticeProject(project).success,true);
});

test("Ejercicio 1: STOP pauses pump and FULL pilot until run is reenabled",()=>{
  let plc=started(1);
  assert.equal(output(plc,"DO_Pump1"),true);
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(output(plc,"DO_Pump1"),false);
  assert.equal(output(plc,"DO_FullLamp"),true);
  plc=press(plc,"PB_Stop");
  assert.equal(output(plc,"DO_FullLamp"),false);
  assert.equal(output(plc,"DO_Pump1"),false);
  assert.equal(batchBool(plc.project,"ST_Full"),true,"FULL latch persists");
  plc=press(plc,"PB_Start");
  assert.equal(output(plc,"DO_FullLamp"),true);
  assert.equal(output(plc,"DO_Pump1"),false,"counter is already at preset");
});

test("lab 01 exercise 1: P1 fills via 900 rising pulses (0.1 % each), FULL and stop behave",()=>{
  let plc=started(1);
  assert.equal(output(plc,"DO_Pump1"),true);
  for(let i=0;i<899;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),899);
  assert.equal(output(plc,"DO_Pump1"),true);
  plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),900);
  assert.equal(output(plc,"DO_Pump1"),false);
  assert.equal(output(plc,"DO_FullLamp"),true);
  plc=press(plc,"PB_Stop");
  assert.equal(output(plc,"DO_Pump1"),false);
});
test("lab 01 exercise 2: RTO mixes for eight seconds, CTD drains to zero",()=>{
  let plc=started(2);
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),900);
  assert.equal(output(plc,"DO_Mixer"),true);
  for(let i=0;i<15;i++)plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Pump3"),false);
  plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Mixer"),false);
  assert.equal(output(plc,"DO_Pump3"),true);
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter3");
  assert.equal(count(plc,"CNT_Volume"),0);
  assert.equal(output(plc,"DO_Pump3"),false);
  plc=setBOOL(plc,"DI_LowLevel",false);
  plc=press(plc,"PB_Start");
  assert.equal(output(plc,"DO_Pump1"),true);
});
test("lab 01 exercise 3: STOP freezes stage and RTO resumes; continuous auto cycles",()=>{
  let plc=started(3);
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter1");
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
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter3");
  assert.equal(output(plc,"DO_Pump1"),true);
  assert.equal(output(plc,"DO_RunLamp"),true);
});
test("advanced exercise 4: integer ratio controls P1/P2, DI thermostat triggers 4 seconds",()=>{
  let plc=started(4);
  for(let i=0;i<400;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Product1"),400);
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
  plc=setBOOL(plc,"DI_LowLevel",false);
  assert.equal(output(plc,"DO_Pump3"),false);
  assert.equal(batchBool(plc.project,"ST_BatchDone"),true);
});
test("advanced exercise 5: mode B runs batches up to INT target and display increments",()=>{
  let plc=started(5,p=>setTagValue(p,"INT_BatchTarget",2));
  assert.equal(batchBool(plc.project,"DI_ModeB"),true);
  for(let lot=1;lot<=2;lot++){
    for(let i=0;i<400;i++)plc=pulse(plc,"DI_Flowmeter1");
    assert.equal(output(plc,"DO_Pump2"),true);
    plc=setBOOL(plc,"DI_HighLevel",true);
    plc=setBOOL(plc,"DI_Thermostat",true);
    for(let i=0;i<8;i++)plc=tickPracticeScan(plc);
    assert.equal(output(plc,"DO_Pump3"),true);
    plc=setBOOL(plc,"DI_HighLevel",false);
    plc=setBOOL(plc,"DI_LowLevel",false);
    assert.equal(count(plc,"CNT_Lotes"),lot);
    assert.equal(batchInt(plc.project,"INT_DisplayValue"),lot);
    if(lot===1){
      // The fill coil precedes the completed-lot transition; it turns on
      // at the following PLC scan, as expected for a top-to-bottom Ladder.
      plc=tickPracticeScan(plc);
      assert.equal(output(plc,"DO_Pump1"),true);
      plc=setBOOL(plc,"DI_LowLevel",true);
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
    DI_LowLevel:false,DI_HighLevel:false,DI_Thermostat:false,
  });
  for(let i=0;i<250;i++)
    st=stepBatchPhysics(st,{pump1:true,pump2:false,pump3:false,heater:false},50);
  assert.equal(st.level,100);
  assert.equal(st.totalPulses[0],1000);
  assert.equal(st.totalPulses[1],0);
  assert.equal(batchDigitalSensors(st,32).DI_HighLevel,true);
  assert.equal(batchDigitalSensors(st,32).DI_LowLevel,true);
  for(let i=0;i<80;i++)
    st=stepBatchPhysics(st,{pump1:false,pump2:false,pump3:false,heater:true},50);
  assert.ok(st.temperature>=32);
  assert.equal(batchDigitalSensors(st,32).DI_Thermostat,true);
  const reset=resetBatchProgramState(createBatchSolution(5));
  assert.equal(batchInt(reset,"INT_TempSP"),32);
  assert.equal(batchBool(reset,"DI_LowLevel"),false);
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
