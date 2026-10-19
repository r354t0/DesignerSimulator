import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  batchDigitalSensors,createBatchSolution,initialBatchProject,
  initialBatchState,resetBatchProgramState,stepBatchPhysics,
} from "../src/plc/batchMixerSceneModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const graphic=readFileSync(new URL("../src/components/ide/BatchMixerScene.tsx",import.meta.url),"utf8");

test("HI and LO sensors return TRUE only when covered by liquid",()=>{
  const empty=initialBatchState();
  assert.deepEqual(batchDigitalSensors(empty,32),{
    DI_LowLevel:false,DI_HighLevel:false,DI_Thermostat:false,
  });
  let wet=stepBatchPhysics(empty,
    {pump1:true,pump2:false,pump3:false,heater:false},50);
  assert.ok(wet.level>0);
  assert.equal(batchDigitalSensors(wet,32).DI_LowLevel,true);
  assert.equal(batchDigitalSensors(wet,32).DI_HighLevel,false);
  for(let n=0;n<250;n++)wet=stepBatchPhysics(wet,
    {pump1:true,pump2:false,pump3:false,heater:false},50);
  assert.equal(wet.level,100);
  assert.equal(batchDigitalSensors(wet,32).DI_HighLevel,true);
  for(let n=0;n<260;n++)wet=stepBatchPhysics(wet,
    {pump1:false,pump2:false,pump3:true,heater:false},50);
  assert.equal(wet.level,0);
  assert.equal(batchDigitalSensors(wet,32).DI_LowLevel,false);
  assert.equal(batchDigitalSensors(wet,32).DI_HighLevel,false);
});

test("SCADA has readable labels beyond pumps and vessel, no obsolete level marks",()=>{
  assert.match(graphic,/<text x="590" y="57"[^>]*>TK-05 · BATCH MIXER<\/text>/);
  assert.match(graphic,/<text x="18" y=\{y-48\}/);
  assert.match(graphic,/textAnchor="end" fontSize="12" fontWeight="700"\s*fill="#243746">LO-LEVEL/);
  assert.match(graphic,/name="FM-|label=\{"FM-"/);
  assert.doesNotMatch(graphic,/<text[^>]*>90%<\/text>/);
  assert.doesNotMatch(graphic,/<text[^>]*>10%<\/text>/);
  assert.doesNotMatch(graphic,/strokeDasharray="5 5"/);
  assert.match(graphic,/fill=\{state.level>0\?"#eab308":"#64748b"\}/);
});

test("all batch solutions and resets agree that DI_LowLevel TRUE means wet",()=>{
  const initial=initialBatchProject();
  assert.equal(initial.tags.find(t=>t.name==="DI_LowLevel").value,false);
  for(const exercise of [1,2,3,4,5]){
    const solution=createBatchSolution(exercise);
    const built=buildPracticeProject(solution);
    assert.equal(built.success,true,
      "exercise "+exercise+" "+JSON.stringify(built.diagnostics));
    const start=solution.rungs.find(r=>r.id==="bm-start-fill");
    if(exercise===1||exercise===2||exercise===3){
      assert.deepEqual(start.instructions.map(i=>[i.kind,i.tag]),[
        ["XIC","ST_RunEnable"],["XIC","PB_Start"],["OTL","ST_Filling"],
      ],"exercise 1 matches the screenshot without extra lower-level contact");
    }else{
      assert.ok(start.instructions.some(i=>i.kind==="XIO"&&i.tag==="DI_LowLevel"),
        "start when empty via XIO lower probe");
    }
    if(exercise>1){
      const rearm=solution.rungs.find(r=>r.id==="bm-drained");
      if(exercise>=4){
        assert.ok(rearm.instructions.some(i=>i.kind==="XIO"&&i.tag==="DI_LowLevel"),
          "finish discharge when sensor becomes dry");
        const draining=solution.rungs.find(r=>r.id==="bm-drain-pump");
        assert.ok(draining.instructions.some(i=>i.kind==="XIC"&&i.tag==="DI_LowLevel"),
          "discharge pump only while liquid covers the low probe");
      }
    }
    assert.equal(resetBatchProgramState(solution).tags.find(t=>t.name==="DI_LowLevel").value,false);
  }
});
