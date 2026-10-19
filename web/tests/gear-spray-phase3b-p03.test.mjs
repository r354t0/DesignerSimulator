import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildPracticeProject,getPracticeBuildSignature} from "../src/plc/practiceBuild.ts";
import {createGearPhase3Project} from "../src/plc/gearSprayP03Program.ts";
import {gearBool,gearNumber} from "../src/plc/gearSpraySceneModel.ts";
import {setTagValue} from "../src/plc/practiceDocument.ts";
import {
  initialPracticeScanState,startPracticeScans,tickPracticeScan,
  applyMomentaryBoolInput,applySceneSensorBoolInput,stopPracticeScans,
  changePracticeScanProject,
} from "../src/plc/practiceScanCycle.ts";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const scan=(state,n=1)=>{for(let i=0;i<n;i++)state=tickPracticeScan(state);return state;};
const timer=(p,name)=>p.project.tags.find(t=>t.name===name)?.value;
const project=()=>{
  let p=createGearPhase3Project();
  p=setTagValue(p,"TMR_Freq_SP",5000);
  p=setTagValue(p,"CNT_LubeFlo_SP",2);
  return p;
};
const run=()=>startPracticeScans(initialPracticeScanState(project()));
const button=(p,name)=>{
  p=applyMomentaryBoolInput(p,name,true,true);
  return applyMomentaryBoolInput(p,name,false,true);
};
const digital=(p,name,value)=>applySceneSensorBoolInput(p,name,value);
const gotoManualCycle=()=>{
  let p=run();
  p=button(p,"PB_Manual");
  for(let n=0;n<12&&gearNumber(p.project,"SM_Cycle_State")!==20;n++)p=scan(p);
  return p;
};

test("P03 has eleven ordered original CCW rungs and P01 low pressure is unmoved",()=>{
  const p=createGearPhase3Project();
  const ids=p.rungs.filter(r=>r.id.startsWith("gear-p03-r")).map(r=>r.id);
  assert.deepEqual(ids,Array.from({length:11},(_,i)=>
    "gear-p03-r"+String(i+1).padStart(2,"0")));
  assert.equal(p.rungs[4].id,"gear3a-p01-low");
  assert.match(p.rungs.find(r=>r.id==="gear-p03-r01").comment,/P03/);
  const fb=p.rungs.find(r=>r.id==="gear-p03-r05");
  assert.deepEqual(fb.instructions.map(i=>i.kind),["XIC","GEAR_SEQ"]);
  assert.equal(fb.instructions[1].tag,"ST_Cycle_Rly");
  for(const [id,kind,q] of [
    ["gear-p03-r02","TON","TMR_Freq_Dn"],
    ["gear-p03-r03","TON","TMR_Startup_Cycle_Dn"],
    ["gear-p03-r04","CTU","CNT_Lubeflo_Dn"],
    ["gear-p03-r08","TOF","TMR_Purge_Dn"],
  ]){
    const r=p.rungs.find(r=>r.id===id);
    const block=r.instructions.find(i=>i.kind===kind);
    assert.ok(block,id);
    assert.equal(block.doneTag,q);
    assert.equal(r.instructions.filter(i=>i.kind===kind).length,1);
  }
  assert.equal(p.rungs.find(r=>r.id==="gear-p03-r04")
    .instructions.find(i=>i.kind==="CTU").resetTag,"CNT_Lubeflo_Rst");
  for(const id of ["gear-p03-r06","gear-p03-r07","gear-p03-r11"]){
    const r=p.rungs.find(r=>r.id===id);
    assert.equal(r.parallelBranches.length,1,id);
    assert.equal(r.instructions.filter(i=>i.kind==="OTE").length,1,id);
  }
  const validated=buildPracticeProject(p);
  assert.equal(validated.success,true,
    validated.diagnostics.filter(d=>d.severity==="error").map(d=>d.message).join("\n"));
  assert.equal(getPracticeBuildSignature(p),getPracticeBuildSignature(
    structuredClone(p)));
});

test("P03 manual startup drives state 0 -> 10 -> 20 with a single executable FB rung",()=>{
  let p=run();
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),0);
  assert.equal(gearBool(p.project,"DO_LS_Healthy"),true);
  assert.equal(gearBool(p.project,"ST_Cycle_Rly"),false);
  p=button(p,"PB_Manual");
  for(let i=0;i<15&&gearNumber(p.project,"SM_Cycle_State")!==20;i++)p=scan(p);
  assert.equal(gearBool(p.project,"ST_Man_Mode"),true);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),true);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),20);
  assert.equal(gearBool(p.project,"ST_Cycle_Rly"),true);
  assert.equal(gearBool(p.project,"DO_Lubecon_Sol"),true);
  assert.equal(gearBool(p.project,"ST_Pump_Rly"),true);
  // P04 controls actual pump. The P03 staging must NOT fabricate Pump_Sol.
  assert.equal(gearBool(p.project,"_310_SV_2560"),false);
});

test("P03 counter reaches preset using DI_PDB pulses and same-rung CTU RESET/Q",()=>{
  let p=gotoManualCycle();
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),20);
  assert.equal(gearBool(p.project,"CNT_Lubeflo_Rst"),false);
  p=digital(p,"_310_SQS_2561",true);
  assert.equal(timer(p,"CTN_Lubeflo").ACC,1);
  p=digital(p,"_310_SQS_2561",false);
  p=digital(p,"_310_SQS_2561",true);
  assert.equal(timer(p,"CTN_Lubeflo").ACC,2);
  assert.equal(gearBool(p.project,"CNT_Lubeflo_Dn"),true);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),30);
  assert.equal(gearBool(p.project,"ST_Cycle_Rly"),false);
  assert.equal(gearBool(p.project,"TMR_Purge_Dn"),true);
});

test("P03 TOF purges 30 seconds and clears counter at end of purge",()=>{
  let p=gotoManualCycle();
  // The frequency timer would otherwise request the next cycle after 5 s.
  // Isolate the 30 s TOF boundary from the next scheduled lubrication.
  p=changePracticeScanProject(p,setTagValue(p.project,"TMR_Freq_SP",120000));
  p=digital(p,"_310_SQS_2561",true);
  p=digital(p,"_310_SQS_2561",false);
  p=digital(p,"_310_SQS_2561",true);
  p=digital(p,"_310_SQS_2561",false);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),30);
  assert.equal(gearBool(p.project,"TMR_Purge_Dn"),true);
  p=scan(p,299);
  assert.equal(gearBool(p.project,"TMR_Purge_Dn"),true);
  p=scan(p,3);
  assert.equal(gearBool(p.project,"TMR_Purge_Dn"),false);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),10);
  assert.equal(gearBool(p.project,"CNT_Lubeflo_Rst"),true);
  p=scan(p);
  assert.equal(timer(p,"CTN_Lubeflo").ACC,0);
});

test("P03 general trip blocks in 90; reset requires healthy conditions and recovers",()=>{
  let p=gotoManualCycle();
  p=digital(p,"ST_General_Trip_Rly",true);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),90);
  assert.equal(gearBool(p.project,"SM_Cycle_Blocked"),true);
  assert.equal(gearBool(p.project,"ST_Cycle_Rly"),false);
  p=button(p,"PB_Reset");
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),90);
  p=digital(p,"ST_General_Trip_Rly",false);
  p=button(p,"PB_Reset");
  assert.equal(gearBool(p.project,"SM_Cycle_Blocked"),false);
  assert.equal(gearBool(p.project,"SM_Cycle_RearmHold"),true);
  // After startup timer completes and all requests are clear, hold drops.
  p=scan(p,12);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),10);
});

test("P03 STOP clears live cycle and Q signals, but does not erase block memory",()=>{
  let p=gotoManualCycle();
  assert.equal(gearBool(p.project,"ST_Cycle_Rly"),true);
  p=stopPracticeScans(p);
  assert.equal(p.mode,"stopped");
  assert.equal(gearBool(p.project,"ST_Cycle_Rly"),false);
  assert.equal(gearBool(p.project,"TMR_Freq_Dn"),false);
  assert.equal(gearBool(p.project,"TMR_Startup_Cycle_Dn"),false);
  assert.equal(gearBool(p.project,"TMR_Purge_Dn"),false);
  assert.equal(gearBool(p.project,"DO_Lubecon_Sol"),false);
});

test("P03 program stays visible inside native Ladder while P04-P07 remain unported",()=>{
  const app=read("../src/App.tsx");
  const scene=read("../src/components/ide/GearSprayScene.tsx");
  const editor=read("../src/components/ide/PracticeEditor.tsx");
  assert.match(app,/createGearPhase3Project/);
  assert.match(scene,/Cargar P01 \+ P02 \+ P03 \(Fase 3B\)/);
  assert.match(editor,/FB_GearSpray_Sequence/);
  assert.match(editor,/output.doneTag/);
  assert.match(editor,/output.resetTag/);
  assert.match(scene,/P04–P07 y la lógica completa de alarmas todavía pendientes/);
});
