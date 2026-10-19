import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
 BATCH_EXERCISES,BATCH_IO_TAGS,batchSolutionTags,batchSolutionUsedTags,
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
    else if(ex===2) assert.equal(p.rungs.length,12);
    else if(ex===3) assert.equal(p.rungs.length,14);
    else assert.equal(p.rungs.length,ex===4?16:17);
    assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="CTU")));
    if(ex===2||ex===3) {
      assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="TON" && i.tag==="TMR_Mixing")));
      assert.equal(p.tags.find(t=>t.name==="TMR_Mixing").value.PRE,8000);
    } else if(ex>=4) {
      assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="TON"&&i.tag==="TMR_Mixing")));
      assert.equal(p.tags.find(t=>t.name==="TMR_Mixing").value.PRE,4000);
    }
    if(ex===2||ex===3) assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="CTD")));
    if(ex>=4)assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="MUL")));
    if(ex>=4){
      assert.ok(p.rungs.some(r=>r.instructions.some(i=>i.kind==="MUL"&&
        i.tag==="INT_PresetP1"&&i.compareB?.mode==="literal"&&i.compareB.value===10)));
      assert.equal(p.tags.find(t=>t.name==="INT_PresetP1").type,"INT");
    }
    if(ex>=4) assert.equal(p.rungs.some(r=>r.instructions.some(i=>i.kind==="MOV")),false);
    assert.equal(p.tags.some(t=>t.name==="INT_DisplayValue"),false,
      "removed HMI display should not generate an unused output tag");
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

test("Ejercicio 2: twelve rungs replicate both reference images with TON TT/DN and CTD",()=>{
  const one=createBatchSolution(1);
  const two=createBatchSolution(2);
  assert.equal(two.rungs.length,12);
  for(let n=0;n<6;n++) {
    assert.deepEqual(two.rungs[n].instructions.map(i=>[i.kind,i.tag]),
      one.rungs[n].instructions.map(i=>[i.kind,i.tag]),"same initial rung "+n);
    assert.deepEqual((two.rungs[n].parallelBranches??[]).map(b=>
      b.instructions.map(i=>[i.kind,i.tag])),
      (one.rungs[n].parallelBranches??[]).map(b=>
        b.instructions.map(i=>[i.kind,i.tag])),"same OR branch "+n);
  }
  const expected=[
    [["XIC","ST_RunEnable"],["XIC","ST_Full"],["TON","TMR_Mixing"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Full"],["XIC","TMR_Mixing.TT"],
      ["OTE","DO_Mixer"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Full"],["XIC","TMR_Mixing.DN"],
      ["OTU","ST_Full"],["OTL","ST_Draining"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Draining"],["OTE","DO_Pump3"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Draining"],
      ["XIC","DI_Flowmeter3"],["CTD","CNT_Volume"]],
    [["XIC","ST_RunEnable"],["XIC","ST_Draining"],
      ["LEQ",""],["OTU","ST_Draining"]],
  ];
  expected.forEach((items,offset)=>{
    assert.deepEqual(two.rungs[6+offset].instructions.map(i=>[i.kind,i.tag]),items,
      "exercise 2 rung "+(6+offset));
  });
  assert.deepEqual(two.rungs[11].instructions[2].compareA,
    {mode:"tag",tag:"CNT_Volume.ACC"});
  assert.deepEqual(two.rungs[11].instructions[2].compareB,
    {mode:"literal",value:0});
  assert.equal(two.tags.find(t=>t.name==="TMR_Mixing").value.PRE,8000);
  assert.equal(two.tags.find(t=>t.name==="CNT_Volume").value.PRE,900);
  assert.equal(batchSolutionTags(2).length,6);
  assert.deepEqual(batchSolutionTags(2).map(t=>t.name),
    ["ST_RunEnable","ST_Filling","ST_Full","ST_Draining","CNT_Volume","TMR_Mixing"]);
  assert.ok(!two.rungs.some(r=>r.instructions.some(i=>
    ["RTO","RES","MOV"].includes(i.kind))));
  assert.equal(buildPracticeProject(two).success,true);
});

test("Ejercicios 1 y 2: information lists only tags actually referenced in Ladder",()=>{
  for(const exercise of [1,2]){
    const program=createBatchSolution(exercise);
    const used=batchSolutionUsedTags(exercise);
    const names=used.map(t=>t.name);
    assert.equal(names.length,new Set(names).size);
    const actual=new Set();
    for(const rung of program.rungs){
      for(const item of [...rung.instructions,
        ...(rung.parallelBranches??[]).flatMap(b=>b.instructions)]){
        if(item.tag)actual.add(item.tag.split(".")[0]);
        for(const operand of [item.compareA,item.compareB,item.preset])
          if(operand?.mode==="tag")actual.add(operand.tag.split(".")[0]);
      }
    }
    assert.deepEqual(new Set(names),actual);
    assert.deepEqual(new Set(names.filter(t=>t.startsWith("ST_")||
      t.startsWith("TMR_")||t.startsWith("CNT_"))),
      new Set(batchSolutionTags(exercise).map(t=>t.name)));
    for(const unused of ["PB_Enter","DO_RunLamp","DO_IdleLamp","INT_DisplayValue",
      "DI_HighLevel","DI_LowLevel","ST_ToMix","ST_Mixing","ST_BatchDone"]) {
      assert.equal(names.includes(unused),false,exercise+" should omit "+unused);
    }
  }
  const info=source("../src/components/ide/BatchMixerSceneInfoDialog.tsx");
  assert.match(info,/batchSolutionUsedTags\(exercise\)/);
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
  // In the reference rung order, R2 precedes the GEQ/OTU of R4.
  // A new START can therefore energize P1 for one PLC pass while R4
  // immediately clears ST_Filling; the next scan deenergizes the pump.
  assert.equal(batchBool(plc.project,"ST_Filling"),false);
  plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Pump1"),false,"R2 follows the cleared filling latch");
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
test("Ejercicio 3: adds ONLY the two pictured RUN/IDLE rungs between E2 rungs 0 and 1",()=>{
  const second=createBatchSolution(2);
  const third=createBatchSolution(3);
  assert.equal(second.rungs.length,12);
  assert.equal(third.rungs.length,14);
  const signature=rung=>({
    instructions:rung.instructions.map(i=>[i.kind,i.tag,i.compareA,i.compareB]),
    branches:(rung.parallelBranches??[]).map(branch=>
      branch.instructions.map(i=>[i.kind,i.tag])),
  });
  assert.deepEqual(signature(third.rungs[0]),signature(second.rungs[0]));
  for(let n=1;n<12;n++)
    assert.deepEqual(signature(third.rungs[n+2]),signature(second.rungs[n]),
      "exercise 3 rung "+(n+2)+" preserves exercise 2 rung "+n);
  const idle=third.rungs[1];
  assert.deepEqual(idle.instructions.map(i=>[i.kind,i.tag]),[
    ["XIC","PB_Stop"],["XIO","PB_Start"],["OTE","DO_IdleLamp"],
  ]);
  assert.equal(idle.parallelBranches.length,1);
  assert.equal(idle.parallelBranches[0].anchorId,idle.instructions[0].id);
  assert.deepEqual(idle.parallelBranches[0].instructions.map(i=>[i.kind,i.tag]),
    [["XIC","DO_IdleLamp"]]);
  assert.deepEqual(third.rungs[2].instructions.map(i=>[i.kind,i.tag]),[
    ["XIC","ST_RunEnable"],["OTE","DO_RunLamp"],
  ]);
  assert.deepEqual(batchSolutionTags(3).map(t=>t.name),
    ["ST_RunEnable","ST_Filling","ST_Full","ST_Draining","CNT_Volume","TMR_Mixing"]);
  assert.equal(third.tags.find(t=>t.name==="TMR_Mixing").value.PRE,8000);
  assert.equal(buildPracticeProject(third).success,true);
});
test("Ejercicio 3: STOP seals IDLE, START clears IDLE and enables RUN",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createBatchSolution(3)),500));
  plc=press(plc,"PB_Stop");
  assert.equal(output(plc,"DO_IdleLamp"),true);
  assert.equal(output(plc,"DO_RunLamp"),false);
  plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_IdleLamp"),true,"IDLE stays latched after STOP releases");
  plc=press(plc,"PB_Start");
  assert.equal(output(plc,"DO_IdleLamp"),false,"START unlatches IDLE");
  assert.equal(output(plc,"DO_RunLamp"),true);
  assert.equal(output(plc,"DO_Pump1"),true);
  plc=press(plc,"PB_Stop");
  assert.equal(output(plc,"DO_IdleLamp"),true);
  assert.equal(output(plc,"DO_RunLamp"),false);
  assert.equal(output(plc,"DO_Pump1"),false);
});
test("Ejercicio 3: existing E2 TON and CTD remain unchanged through the cycle",()=>{
  let plc=started(3);
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),900);
  assert.equal(output(plc,"DO_Mixer"),true);
  for(let i=0;i<16;i++)plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Mixer"),false);
  assert.equal(output(plc,"DO_Pump3"),true);
  for(let i=0;i<900;i++)plc=pulse(plc,"DI_Flowmeter3");
  assert.equal(count(plc,"CNT_Volume"),0);
  assert.equal(output(plc,"DO_Pump3"),false);
  assert.equal(output(plc,"DO_RunLamp"),true,
    "RUN pilot is tied to ST_RunEnable, as pictured");
});
test("advanced E4: pumps, thermostat DI and the 4000ms TON follow screenshot",()=>{
  let plc=started(4);
  assert.equal(output(plc,"DO_Pump1"),true);
  for(let i=0;i<400;i++)plc=pulse(plc,"DI_Flowmeter1");
  assert.equal(count(plc,"CNT_Volume"),400);
  assert.equal(output(plc,"DO_Pump1"),false);
  assert.equal(output(plc,"DO_Pump2"),true);
  plc=setBOOL(plc,"DI_HighLevel",true);
  assert.equal(output(plc,"DO_Pump2"),false);
  assert.equal(output(plc,"DO_Heater"),true);
  assert.equal(output(plc,"DO_Mixer"),true);
  plc=setBOOL(plc,"DI_Thermostat",true);
  assert.equal(output(plc,"DO_Heater"),false);
  for(let i=0;i<8;i++)plc=tickPracticeScan(plc);
  assert.equal(output(plc,"DO_Mixer"),false);
  assert.equal(output(plc,"DO_Pump3"),true);
  plc=setBOOL(plc,"DI_LowLevel",false);
  assert.equal(output(plc,"DO_Pump3"),false);
  assert.equal(batchBool(plc.project,"ST_Draining"),false);
});
test("advanced E5: Mode B counts lots via ST_BatchComplete and CTU",()=>{
  let plc=started(5,p=>setTagValue(p,"INT_BatchTarget",2));
  assert.equal(batchBool(plc.project,"DI_ModeB"),true);
  for(let lot=1;lot<=2;lot++){
    if(lot===1)for(let i=0;i<400;i++)plc=pulse(plc,"DI_Flowmeter1");
    assert.equal(output(plc,"DO_Pump2"),true);
    plc=setBOOL(plc,"DI_HighLevel",true);
    plc=setBOOL(plc,"DI_Thermostat",true);
    for(let i=0;i<8;i++)plc=tickPracticeScan(plc);
    assert.equal(output(plc,"DO_Pump3"),true);
    plc=setBOOL(plc,"DI_HighLevel",false);
    plc=setBOOL(plc,"DI_LowLevel",false);
    assert.equal(count(plc,"CNT_Lotes"),lot);
    if(lot===1){
      plc=tickPracticeScan(plc);
      assert.equal(batchBool(plc.project,"ST_Filling"),true);
      plc=setBOOL(plc,"DI_LowLevel",true);
      plc=setBOOL(plc,"DI_Thermostat",false);
    }else{
      assert.equal(output(plc,"DO_Pump3"),false);
      assert.equal(plc.project.tags.find(t=>t.name==="CNT_Lotes").value.DN,true);
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
