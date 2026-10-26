import test from "node:test";
import assert from "node:assert/strict";
import {createBatchSolution,batchSolutionTags,batchSolutionUsedTags} from "../src/plc/batchMixerSceneModel.ts";
import {buildPracticeProject} from "../src/plc/practiceBuild.ts";

const shaped=rung=>rung.instructions.map(i=>[i.kind,i.tag]);
const standard=[
  [["XIC","PB_Start"],["XIO","PB_Stop"],["OTE","ST_RunEnable"]],
  [["XIC","PB_Stop"],["XIO","PB_Start"],["OTE","DO_IdleLamp"]],
  [["XIC","ST_RunEnable"],["OTE","DO_RunLamp"]],
  [["XIC","ST_RunEnable"],["XIC","DI_ModeA"],["XIC","PB_Start"],
    ["OTL","ST_Filling"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Filling"],["XIO","CNT_Volume.DN"],
    ["OTE","DO_Pump1"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Filling"],["MUL","INT_PresetP1"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Filling"],["XIC","DI_Flowmeter1"],
    ["CTU","CNT_Volume"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Filling"],["XIC","CNT_Volume.DN"],
    ["XIO","DI_HighLevel"],["OTE","DO_Pump2"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Filling"],["XIC","DI_HighLevel"],
    ["OTU","ST_Filling"],["OTL","ST_Full"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Full"],["OTE","DO_FullLamp"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Full"],["XIO","DI_Thermostat"],
    ["OTE","DO_Heater"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Full"],["XIC","DI_Thermostat"],
    ["TON","TMR_Mixing"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Full"],["XIO","TMR_Mixing.DN"],
    ["OTE","DO_Mixer"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Full"],["XIC","TMR_Mixing.DN"],
    ["OTU","ST_Full"],["OTL","ST_Draining"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Draining"],["XIC","DI_LowLevel"],
    ["OTE","DO_Pump3"]],
  [["XIC","ST_RunEnable"],["XIC","ST_Draining"],["XIO","DI_LowLevel"],
    ["OTU","ST_Draining"]],
];

test("E4: exact 16 rung layout from first three reference images",()=>{
  const p=createBatchSolution(4);
  assert.equal(p.rungs.length,16);
  for(let i=0;i<16;i++)
    assert.deepEqual(shaped(p.rungs[i]),standard[i],"E4 R"+i);
  assert.deepEqual(p.rungs[5].instructions[2].compareA,{mode:"tag",tag:"INT_RatioP1"});
  assert.deepEqual(p.rungs[5].instructions[2].compareB,{mode:"literal",value:10});
  assert.deepEqual(p.rungs[6].instructions[3].preset,{mode:"tag",tag:"INT_PresetP1"});
  assert.equal(p.tags.find(t=>t.name==="CNT_Volume").value.PRE,400);
  assert.equal(p.tags.find(t=>t.name==="INT_PresetP1").value,400);
  assert.equal(p.tags.find(t=>t.name==="TMR_Mixing").value.PRE,4000);
  assert.equal(p.rungs[8].instructions.slice(-2).map(i=>i.kind).join(","),"OTU,OTL");
  assert.equal(p.rungs[13].instructions.slice(-2).map(i=>i.kind).join(","),"OTU,OTL");
  assert.equal(buildPracticeProject(p).success,true);
});
test("E5: same 16 rungs, Mode B OR lane and final CNT_Lotes rung",()=>{
  const e4=createBatchSolution(4);
  const p=createBatchSolution(5);
  assert.equal(p.rungs.length,17);
  for(const n of [0,1,2,4,5,6,7,8,9,10,11,12,13,14])
    assert.deepEqual(shaped(p.rungs[n]),shaped(e4.rungs[n]),"E5 R"+n);
  assert.deepEqual(shaped(p.rungs[3]),[
    ["XIC","ST_RunEnable"],["XIC","PB_Start"],["OTL","ST_Filling"],
  ]);
  assert.equal(p.rungs[3].parallelBranches.length,1);
  const branch=p.rungs[3].parallelBranches[0];
  assert.equal(branch.anchorId,p.rungs[3].instructions[1].id);
  assert.deepEqual(branch.instructions.map(i=>[i.kind,i.tag]),[
    ["XIC","DI_ModeB"],["XIC","ST_BatchComplete"],["XIO","CNT_Lotes.DN"],
  ]);
  assert.deepEqual(shaped(p.rungs[15]),[
    ["XIC","ST_RunEnable"],["XIC","ST_Draining"],["XIO","DI_LowLevel"],
    ["OTU","ST_Draining"],["OTE","ST_BatchComplete"],
  ]);
  assert.deepEqual(shaped(p.rungs[16]),[
    ["XIC","ST_RunEnable"],["XIC","DI_ModeB"],["XIC","ST_BatchComplete"],
    ["CTU","CNT_Lotes"],
  ]);
  assert.deepEqual(p.rungs[16].instructions[3].preset,
    {mode:"tag",tag:"INT_BatchTarget"});
  assert.equal(p.tags.find(t=>t.name==="CNT_Lotes").value.PRE,3);
  assert.equal(buildPracticeProject(p).success,true);
});
test("E4/E5 auxiliary tag tables contain only declarations actually used by Ladder",()=>{
  for(const exercise of [4,5]){
    const p=createBatchSolution(exercise);
    const used=new Set();
    for(const rung of p.rungs)for(const ins of [
      ...rung.instructions,
      ...(rung.parallelBranches??[]).flatMap(branch=>branch.instructions)]){
      if(ins.tag)used.add(ins.tag.split(".")[0]);
      for(const operand of [ins.compareA,ins.compareB,ins.preset])
        if(operand?.mode==="tag")used.add(operand.tag.split(".")[0]);
    }
    assert.deepEqual(new Set(batchSolutionUsedTags(exercise).map(t=>t.name)),used);
    assert.deepEqual(new Set(batchSolutionTags(exercise).map(t=>t.name)),
      new Set([...used].filter(x=>p.tags.find(t=>t.name===x) &&
        !["PB_","DI_","DO_","INT_RatioP1","INT_BatchTarget","INT_TempSP"].some(prefix=>
          x.startsWith(prefix)))));
    const aux=batchSolutionTags(exercise).map(t=>t.name);
    for(const invalid of ["ST_Mixing","ST_ToMix","ST_ToDrain","CNT_Product1",
      "ST_P1PulseTarget","TMR_PostTemp4s","ST_BatchDone"])
      assert.ok(!aux.includes(invalid),"unused "+invalid);
  }
});
