import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildPracticeProject} from "../src/plc/practiceBuild.ts";
import {createGearPhase3AProject} from "../src/plc/gearSprayPhase3Program.ts";
import {initialGearSprayProject,gearBool,gearNumber}
  from "../src/plc/gearSpraySceneModel.ts";
import {setTagValue} from "../src/plc/practiceDocument.ts";
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
  assert.ok(p.rungs.length>=25);
  assert.ok(p.tags.some(x=>x.name==="ST_Run_Rly"));
  assert.ok(p.tags.some(x=>x.name==="AirPressure_In_Scaled"));
  assert.ok(p.tags.some(x=>x.name==="PDB_RisingTrig"));
  assert.ok(!p.tags.some(x=>x.name==="DI_PDB_2"));
  assert.ok(!p.tags.some(x=>x.name==="FAT_CMD_Pump"));
  const build=buildPracticeProject(p);
  assert.equal(build.success,true,build.diagnostics.map(d=>d.message).join("\n"));
  assert.deepEqual(original,initialGearSprayProject());
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
  assert.ok(p.project.tags.some(x=>x.name==="P01_PDB_EdgeMemory"));
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

test("Phase 3A loader is reversible and mutually exclusive with Stage B FAT",()=>{
  const app=source("../src/App.tsx");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(app,/createGearPhase3AProject/);
  assert.match(app,/gearPhase3Backup.current=scanRef.current.project/);
  assert.match(app,/gearPhase3Backup.current=null/);
  assert.match(app,/gearPhase3Loaded\|\|gearFatLoaded/);
  assert.match(scene,/Cargar P01 \+ P02 \(Fase 3A\)/);
  assert.match(scene,/onClick=\{onRestorePhase3\}/);
  assert.match(scene,/disabled=\{mode!=="stopped"\|\|fatLoaded\}/);
  assert.match(scene,/P03–P07, bombeo automático y alarmas todavía pendientes/);
});
