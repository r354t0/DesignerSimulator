import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildPracticeProject} from "../src/plc/practiceBuild.ts";
import {gearBool,gearNumber} from "../src/plc/gearSpraySceneModel.ts";
import {createGearCompleteProject,GEAR_REMAINING_TAGS}
  from "../src/plc/gearSprayCompleteProgram.ts";
import {
  initialPracticeScanState,startPracticeScans,tickPracticeScan,
  applyMomentaryBoolInput,applySceneSensorBoolInput,
  changePracticeScanProject,stopPracticeScans,
} from "../src/plc/practiceScanCycle.ts";
import {setTagValue} from "../src/plc/practiceDocument.ts";

const proj=()=>createGearCompleteProject();
const run=()=>startPracticeScans(initialPracticeScanState(proj()));
const tick=(p,n=1)=>{for(let i=0;i<n;i++)p=tickPracticeScan(p);return p;};
const btn=(p,name)=>applyMomentaryBoolInput(
  applyMomentaryBoolInput(p,name,true,true),name,false,true);
const field=(p,tag,value)=>applySceneSensorBoolInput(p,tag,value);
const val=(p,tag)=>p.project.tags.find(t=>t.name===tag)?.value;
const set=(p,tag,value)=>changePracticeScanProject(
  p,setTagValue(p.project,tag,value));
const manual=()=>tick(btn(run(),"PB_Manual"),5);
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("P01–P07 template builds with all original source sections and mappings",()=>{
  const p=proj();
  const build=buildPracticeProject(p);
  assert.equal(build.success,true,
    build.diagnostics.filter(d=>d.severity==="error")
      .map(d=>d.message).join("\n"));
  assert.equal(new Set(p.tags.map(t=>t.name)).size,p.tags.length);
  const sections=["p04","p05","p06","p07"];
  for(const section of sections)
    assert.ok(p.rungs.some(r=>r.id.startsWith("gear-"+section+"-r")),
      "Missing "+section);
  for(const [rung,source] of [
    ["gear3a-p01-output-0","DO_Pump_Sol"],
    ["gear3a-p01-output-2","DO_Lubecon_Sol"],
    ["gear3a-p01-output-3","DO_Alarm_Out"],
    ["gear3a-p01-output-4","DO_LS_Healthy"],
  ]){
    assert.ok(p.rungs.find(r=>r.id===rung)?.instructions
      .some(i=>i.kind==="XIC"&&i.tag===source),rung);
  }
  assert.equal(p.rungs[4].id,"gear3a-p01-low",
    "LubePress_Lo must remain P01 rung 5");
  for(const t of ["Pump_Sol","Alarm_Out","LS_Healthy","Lubecon_Sol"])
    assert.ok(!p.tags.some(x=>x.name===t));
  for(const [name] of GEAR_REMAINING_TAGS)
    assert.ok(p.tags.some(t=>t.name===name));
  assert.equal(p.tags.find(t=>t.name==="Maint_Duration_ms")?.type,"DINT");
});

test("P04 pump switches ON under 800 and OFF above 1000 with native hysteresis",()=>{
  let p=manual();
  p=field(p,"_310_PI_2560",500);p=tick(p,4);
  assert.equal(gearBool(p.project,"ST_Pump_Rly"),true);
  assert.equal(gearBool(p.project,"ST_LubePress_800"),true);
  assert.equal(gearBool(p.project,"ST_Pump_Sol_Rly"),true);
  assert.equal(gearBool(p.project,"DO_Pump_Sol"),true);
  assert.equal(gearBool(p.project,"_310_SV_2560"),true);
  p=field(p,"_310_PI_2560",900);p=tick(p,4);
  assert.equal(gearBool(p.project,"ST_Pump_Sol_Rly"),true,
    "Must hold inside hysteresis 800-1000");
  p=field(p,"_310_PI_2560",1100);p=tick(p,4);
  assert.equal(gearBool(p.project,"ST_LubePress_1000"),true);
  assert.equal(gearBool(p.project,"DO_Pump_Sol"),false);
  assert.equal(gearBool(p.project,"_310_SV_2560"),false);
});

test("P05 AFI high-pressure timer is intentionally disabled via false contact",()=>{
  const p=proj();
  const rung=p.rungs.find(r=>r.id==="gear-p05-r06");
  assert.ok(rung);
  assert.equal(rung.instructions[0].kind,"EQU");
  assert.deepEqual(rung.instructions[0].compareA,{mode:"literal",value:0});
  assert.deepEqual(rung.instructions[0].compareB,{mode:"literal",value:1});
  let st=manual();
  st=field(st,"_310_PI_2560",1600);
  st=tick(st,70);
  assert.equal(val(st,"TMR_LubePress_Hi").DN,false);
  assert.equal(gearBool(st.project,"ALM_HiPress_Rly"),false);
});

test("P05 low-pressure alarm triggers and P07 calculates nonzero fault code",()=>{
  let p=manual();
  p=field(p,"_310_PI_2560",100);
  p=tick(p,120);
  assert.equal(val(p,"TMR_LubePress_Lo").DN,true);
  assert.equal(gearBool(p.project,"ST_General_Trip_Rly"),true);
  assert.equal(gearBool(p.project,"ALM_LoPress_Rly"),true);
  assert.equal(gearNumber(p.project,"Fault_Code"),3);
  assert.equal(gearNumber(p.project,"SM_Cycle_State"),90);
});

test("P06 has native RES, minute counter, maintenance timer and CTD LOAD",()=>{
  const p=proj();
  for(const [id,target] of [
    ["gear-p06-r03","CNT_Hour24"],
    ["gear-p06-r05","CTN_MaintMode"],
  ]){
    const rung=p.rungs.find(r=>r.id===id);
    assert.equal(rung.instructions.filter(i=>i.kind==="RES").length,1,id);
    assert.equal(rung.instructions.find(i=>i.kind==="RES").tag,target);
  }
  const ctd=p.rungs.find(r=>r.id==="gear-p06-r09")
    .instructions.find(i=>i.kind==="CTD");
  assert.equal(ctd.tag,"CNT_Shutdown");
  assert.equal(ctd.loadTag,"CNT_Shutdown_Rst");
  assert.equal(ctd.preset.value,20);
  const calc=p.rungs.find(r=>r.id==="gear-p06-r00");
  assert.equal(calc.instructions.find(i=>i.kind==="MUL").tag,"Maint_Duration_ms");
  let running=run();
  running=tick(running,3);
  assert.equal(val(running,"CNT_Shutdown").ACC,20);
  assert.equal(gearNumber(running.project,"Maint_Duration_ms"),1800000);
  assert.equal(val(running,"TMR_Maint").PRE,1800000);
  assert.equal(val(running,"CNT_Hour24").PRE,1440);
});

test("P07 arithmetic reads current timer/counter members and exposes HMI values",()=>{
  let p=manual();
  p=tick(p,5);
  assert.equal(typeof gearNumber(p.project,"NextCycle_Show"),"number");
  assert.equal(typeof gearNumber(p.project,"FloAlrm_Remain"),"number");
  assert.equal(gearNumber(p.project,"Maint_Duration_ms"),1800000);
  assert.equal(gearNumber(p.project,"Fault_Code"),0);
  assert.equal(gearNumber(p.project,"Shutdown_Time_Remaining"),20);
  const rung=p.project.rungs.find(r=>r.id==="gear-p07-r06");
  assert.deepEqual(rung.instructions.filter(i=>["SUB","DIV"].includes(i.kind))
    .map(i=>i.kind),["SUB","DIV"]);
  for(const t of ["TMR_Freq.ACC","TMR_LoFlo.ACC","TMR_Maint.ACC",
    "CNT_Shutdown.ACC"])
    assert.ok(p.project.rungs.some(r=>r.instructions.some(i=>
      i.compareA?.mode==="tag"&&i.compareA.tag===t||
      i.compareB?.mode==="tag"&&i.compareB.tag===t)),t);
});

test("STOP de-energizes pump, alarm and atomizer; no hidden SCADA logic",()=>{
  let p=manual();p=field(p,"_310_PI_2560",300);p=tick(p,3);
  assert.equal(gearBool(p.project,"_310_SV_2560"),true);
  p=stopPracticeScans(p);
  for(const t of ["_310_SV_2560","_310_SV_2561","_310_SV_2563",
    "_310_UY_2560"])
    assert.equal(gearBool(p.project,t),false,t);
  const app=read("../src/App.tsx");
  const scene=read("../src/components/ide/GearSprayScene.tsx");
  assert.match(app,/createGearCompleteProject/);
  assert.match(scene,/Cargar P01–P07 \(FAT integrado\)/);
});
