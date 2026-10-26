import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildPracticeProject} from "../src/plc/practiceBuild.ts";
import {createGearPhase3AProject} from "../src/plc/gearSprayPhase3Program.ts";
import {initialGearSprayProject,gearBool,gearNumber}
  from "../src/plc/gearSpraySceneModel.ts";
import {setTagValue,setRungComment,moveRung} from "../src/plc/practiceDocument.ts";
import {
  initialPracticeScanState,startPracticeScans,tickPracticeScan,
  changePracticeScanProject,applySceneSensorBoolInput,applyMomentaryBoolInput,
} from "../src/plc/practiceScanCycle.ts";
const source=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const run=()=>startPracticeScans(initialPracticeScanState(createGearPhase3AProject()));
const scan=(p,n=2)=>{for(let i=0;i<n;i++)p=tickPracticeScan(p);return p;};
const setReal=(p,name,value)=>scan(changePracticeScanProject(p,setTagValue(p.project,name,value)));
const pulse=(p,name)=>applyMomentaryBoolInput(
  applyMomentaryBoolInput(p,name,true,true),name,false,true);

test("Phase 3A Ladder compiles and is isolated from blank default/FAT template",()=>{
  const original=initialGearSprayProject();
  const p=createGearPhase3AProject();
  assert.equal(original.tags.length,22);
  assert.equal(original.rungs[0].instructions.length,0);
  assert.equal(p.rungs.length,23);
  assert.ok(p.tags.some(x=>x.name==="ST_Run_Rly"));
  assert.ok(p.tags.some(x=>x.name==="AirPressure_In_Scaled"));
  assert.ok(!p.tags.some(x=>x.name==="PDB_RisingTrig"));
  assert.ok(!p.tags.some(x=>x.name==="P01_PDB_EdgeMemory"));
  assert.ok(!p.tags.some(x=>x.name==="DI_PDB_2"));
  assert.ok(!p.rungs.some(r=>r.id==="gear3a-p01-pulse-rise"));
  assert.ok(!p.tags.some(x=>x.name==="FAT_CMD_Pump"));
  const build=buildPracticeProject(p);
  assert.equal(build.success,true,build.diagnostics.map(d=>d.message).join("\n"));
  assert.deepEqual(original,initialGearSprayProject());
});

test("P01 LubePress_Lo remains in source rung 5 after LubePress_Hi",()=>{
  const project=createGearPhase3AProject();
  const ids=project.rungs.map(r=>r.id);
  assert.equal(ids.indexOf("gear3a-p01-hi"),3);
  assert.equal(ids.indexOf("gear3a-p01-low"),4);
  assert.equal(ids.indexOf("gear3a-p01-mill"),5);
  assert.ok(ids.indexOf("gear3a-p01-low")<ids.indexOf("gear3a-p02-auto"));
  const low=project.rungs[4];
  assert.deepEqual(low.instructions.map(i=>i.kind),["XIC","LES","OTE"]);
  assert.deepEqual(low.instructions.map(i=>i.tag),["Run_Rly","","LubePress_Lo"]);
});

test("P01 maps both transmitters and detects pressure thresholds",()=>{
  let p=run();
  assert.equal(gearBool(p.project,"AirPress_In"),false);
  p=setReal(p,"_310_PI_2561",40);
  assert.equal(gearBool(p.project,"AirPress_In"),false);
  p=setReal(p,"_310_PI_2561",45);
  assert.equal(gearBool(p.project,"AirPress_In"),true);
  assert.equal(gearNumber(p.project,"AirPressure_In_Scaled"),45);
  p=setReal(p,"_310_PI_2560",1501);
  assert.equal(gearBool(p.project,"LubePress_Hi"),true);
  assert.equal(gearNumber(p.project,"LubePressure_In_Scaled"),1501);
  p=setReal(p,"_310_PI_2560",900);
  assert.equal(gearBool(p.project,"LubePress_Hi"),false);
  assert.equal(gearBool(p.project,"LubePress_Lo"),false,
    "Low pressure is gated by ST_Run_Rly");
});

test("P01 level and physical SQS pulse drive PDB and DI_PDB on native Ladder",()=>{
  let p=run();
  p=applySceneSensorBoolInput(p,"_310_LSL",true);
  assert.equal(gearBool(p.project,"Low_Level"),true);
  p=applySceneSensorBoolInput(p,"_310_SQS_2561",true);
  assert.equal(gearBool(p.project,"PDB"),true);
  assert.equal(gearBool(p.project,"DI_PDB"),true);
  p=applySceneSensorBoolInput(p,"_310_SQS_2561",false);
  assert.equal(gearBool(p.project,"DI_PDB"),false);
  assert.ok(!p.project.tags.some(x=>x.name==="P01_PDB_EdgeMemory"));
});

test("P02 AUTO latches, requires Mill_Run for ST_Run_Rly and drives running lamp",()=>{
  let p=run();
  p=pulse(p,"PB_Auto");
  assert.equal(gearBool(p.project,"ST_Auto_Mode"),true);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),false);
  p=applySceneSensorBoolInput(p,"_310_PLC104_YI_MillRun",true);
  p=scan(p,4);
  assert.equal(gearBool(p.project,"DI_Mill_Run"),true);
  assert.equal(gearBool(p.project,"ST_Auto_Mode"),true);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),true);
  assert.equal(gearBool(p.project,"_310_YI_LubricationSystemRunning"),true);
  p=setReal(p,"_310_PI_2560",200);
  assert.equal(gearBool(p.project,"LubePress_Lo"),true);
  p=setReal(p,"_310_PI_2560",600);
  assert.equal(gearBool(p.project,"LubePress_Lo"),false);
});

test("P02 MANUAL works only with the mill stopped and disables AUTO",()=>{
  let p=run();
  p=pulse(p,"PB_Manual");
  p=scan(p,3);
  assert.equal(gearBool(p.project,"ST_Man_Mode"),true);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),true);
  assert.equal(gearBool(p.project,"ST_Auto_Selected"),false);
  p=applySceneSensorBoolInput(p,"_310_PLC104_YI_MillRun",true);
  p=scan(p,3);
  assert.equal(gearBool(p.project,"ST_Man_Mode"),false);
});

test("P02 MAINT requires mill running, preserves alarm/spray outputs off",()=>{
  let p=run();
  p=pulse(p,"PB_Maint");
  assert.equal(gearBool(p.project,"ST_Maint_Mode"),false);
  p=applySceneSensorBoolInput(p,"_310_PLC104_YI_MillRun",true);
  p=pulse(p,"PB_Maint");
  p=scan(p,3);
  assert.equal(gearBool(p.project,"ST_Maint_Mode"),true);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),true);
  for(const x of ["_310_SV_2560","_310_SV_2561","_310_SV_2563","_310_UY_2560"])
    assert.equal(gearBool(p.project,x),false,
      "Phase 3A may not energize P03-P05 outputs: "+x);
});


test("P02 keeps every lock-in network inside a single Ladder rung",()=>{
  const project=createGearPhase3AProject();
  const find=(id)=>project.rungs.find(r=>r.id===id);
  const auto=find("gear3a-p02-auto");
  assert.ok(auto);
  assert.equal(auto.parallelBranches.length,2,
    "AUTO needs two independent OR groups on the same rung");
  assert.deepEqual(auto.parallelBranches.map(b=>b.instructions.map(i=>i.tag)),
    [["ST_Auto_Mode"],["DI_Mill_Run"]]);
  assert.ok(auto.instructions.some(i=>i.tag==="PB_Auto"));
  assert.ok(auto.instructions.some(i=>i.tag==="PB_Maint"&&i.kind==="XIO"));
  assert.equal(auto.instructions.filter(i=>i.kind==="OTE").length,1);
  for(const [id,branches] of [
    ["gear3a-p02-manual",1],["gear3a-p02-maint",1],
    ["gear3a-p02-run",2],["gear3a-p02-selected",1]
  ]){
    const rung=find(id);
    assert.equal(rung.parallelBranches.length,branches,id);
    assert.equal(rung.instructions.filter(i=>i.kind==="OTE").length,1,id);
  }
  assert.deepEqual(find("gear3a-p02-run").parallelBranches
    .map(b=>b.instructions.map(i=>i.tag)),
    [["ST_Maint_Mode","DI_Mill_Run"],["ST_Man_Mode"]]);
  assert.equal(project.rungs.some(r=>r.id==="gear3a-p02-autoreq"),false);
  assert.ok(!project.tags.some(t=>t.name.startsWith("P02_")));
  assert.ok(!project.rungs.some(r=>r.id==="gear3a-p02-manreq"));
});

test("Rung annotations identify P01 and P02, edit safely during RUN, and move with rung",()=>{
  const project=createGearPhase3AProject();
  const first=project.rungs[0];
  const mode=project.rungs.find(r=>r.id==="gear3a-p02-auto");
  assert.match(first.comment,/P01/);
  assert.match(mode.comment,/P02/);
  let plc=run();
  const before=plc.scanCount;
  const edited=setRungComment(plc.project,mode.id,"P02 - Enclavamientos");
  plc=changePracticeScanProject(plc,edited);
  assert.equal(plc.mode,"running",
    "Comments must not stop or restart the active PLC");
  assert.equal(plc.scanCount,before);
  assert.strictEqual(setRungComment(edited,mode.id,"P02 - Enclavamientos"),edited);
  const moved=moveRung(edited,mode.id,first.id,"before");
  assert.equal(moved.rungs[0].comment,"P02 - Enclavamientos");
  assert.deepEqual(moved.rungs[0].parallelBranches,mode.parallelBranches);
  const clear=setRungComment(moved,mode.id,"");
  assert.equal(clear.rungs[0].comment,"");
  assert.throws(()=>setRungComment(clear,"missing-rung","X"),/rung/);
});

test("P02 AUTO lock-in is not artificially gated by earlier helper OTE",()=>{
  let p=run();
  p=pulse(p,"PB_Auto");
  assert.equal(gearBool(p.project,"ST_Auto_Mode"),true);
  // Loss of Mill_Run with no conflicting input leaves AUTO selected; RUN drops.
  p=applySceneSensorBoolInput(p,"_310_PLC104_YI_MillRun",true);
  p=scan(p,1);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),true);
  p=applySceneSensorBoolInput(p,"_310_PLC104_YI_MillRun",false);
  p=scan(p,1);
  assert.equal(gearBool(p.project,"ST_Auto_Mode"),true);
  assert.equal(gearBool(p.project,"ST_Run_Rly"),false);
  // A manual request while AUTO selected and mill stopped can override AUTO.
  p=applyMomentaryBoolInput(p,"PB_Manual",true,true);
  p=scan(p,1);
  assert.equal(gearBool(p.project,"ST_Auto_Mode"),false);
  assert.equal(gearBool(p.project,"ST_Man_Mode"),true);
  p=applyMomentaryBoolInput(p,"PB_Manual",false,true);
  assert.equal(gearBool(p.project,"ST_Man_Mode"),true);
});

test("Gear Spray is dedicated P01-P07 on first entry, with a manual reset",()=>{
  const app=source("../src/App.tsx");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(app,/gear: initialPracticeScanState\(createGearCompleteProject\(\)\)/);
  assert.match(app,/const resetGearProgram=useCallback/);
  assert.match(scene,/Reiniciar programa/);
  assert.doesNotMatch(scene,/onRestorePhase3/);
  assert.doesNotMatch(scene,/Banco de pruebas FAT/);
});
