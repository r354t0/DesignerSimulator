import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  initialPracticeScanState,startPracticeScans,pausePracticeScans,
  resumePracticeScans,tickPracticeScan,stepPracticeScan,stopPracticeScans,
  applySceneSensorBoolInput,
} from "../src/plc/practiceScanCycle.ts";
import {gearBool} from "../src/plc/gearSpraySceneModel.ts";
import {createGearFatProject,GEAR_FAT_COMMANDS,clearGearFatCommands}
  from "../src/plc/gearSprayFatProgram.ts";
import {
  initialGearPhysicalState,configureGearPhysical,stepGearPhysical,
} from "../src/plc/gearSprayPhysics.ts";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const outputs=plc=>({
  pumpSolenoid:gearBool(plc.project,"_310_SV_2560"),
  lubricantSolenoid:gearBool(plc.project,"_310_SV_2561"),
  atomizationSolenoid:gearBool(plc.project,"_310_SV_2563"),
});
const plantStep=(physical,plc)=>stepGearPhysical(physical,outputs(plc),50);

test("D01-D02: RUN cycles and physical pulses advance from real FAT outputs",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createGearFatProject()));
  let plant=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  const before=plc.scanCount;
  plc=tickPracticeScan(plc);
  assert.equal(plc.scanCount,before+1);
  for(const cmd of GEAR_FAT_COMMANDS)
    plc=applySceneSensorBoolInput(plc,cmd.name,true);
  assert.ok(GEAR_FAT_COMMANDS.every(cmd=>gearBool(plc.project,cmd.output)));
  for(let i=0;i<140;i++)plant=plantStep(plant,plc);
  assert.ok(plant.lubePressure>=400);
  assert.ok(plant.totalPulses>0);
});

test("D03-D05: PAUSE freezes PLC scans; SCAN advances exactly once; RESUME continues",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createGearFatProject()));
  for(const cmd of GEAR_FAT_COMMANDS)
    plc=applySceneSensorBoolInput(plc,cmd.name,true);
  let plant=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  for(let i=0;i<100;i++)plant=plantStep(plant,plc);
  const frozen=plant;
  const paused=pausePracticeScans(plc);
  assert.equal(paused.mode,"paused");
  assert.strictEqual(tickPracticeScan(paused),paused);
  assert.ok(GEAR_FAT_COMMANDS.every(cmd=>gearBool(paused.project,cmd.output)),
    "PAUSE does not de-energize the last coil image");
  const scanned=stepPracticeScan(paused);
  assert.equal(scanned.mode,"paused");
  assert.equal(scanned.scanCount,paused.scanCount+1);
  assert.equal(scanned.project.tags.length,paused.project.tags.length);
  // The physical scheduler only runs in RUN, so no plantStep call is made.
  assert.deepEqual(plant,frozen);
  plc=resumePracticeScans(scanned);
  assert.equal(plc.mode,"running");
  plc=tickPracticeScan(plc);
  assert.equal(plc.scanCount,scanned.scanCount+1);
  plant=plantStep(plant,plc);
  assert.notDeepEqual(plant,frozen);
});

test("D06-D07: STOP clears outputs and exclusively FAT commands, disarming restart",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createGearFatProject()));
  plc=applySceneSensorBoolInput(plc,"FAT_CMD_Pump",true);
  plc=applySceneSensorBoolInput(plc,"FAT_CMD_Lubricant",true);
  plc=applySceneSensorBoolInput(plc,"FAT_CMD_Atomization",true);
  plc=applySceneSensorBoolInput(plc,"_310_PLC104_YI_MillRun",true);
  const stopped=stopPracticeScans(plc);
  assert.equal(stopped.mode,"stopped");
  assert.strictEqual(tickPracticeScan(stopped),stopped);
  assert.ok(GEAR_FAT_COMMANDS.every(cmd=>!gearBool(stopped.project,cmd.output)),
    "All OTE coils should de-energize on STOP");
  const cleared=clearGearFatCommands(stopped.project);
  assert.ok(GEAR_FAT_COMMANDS.every(cmd=>!gearBool(cleared,cmd.name)));
  assert.equal(gearBool(cleared,"_310_PLC104_YI_MillRun"),true,
    "Real field input must not be changed by FAT-specific STOP");
  assert.strictEqual(clearGearFatCommands(cleared),cleared,"Disarm should be idempotent");
  const restart=startPracticeScans(initialPracticeScanState(cleared));
  assert.ok(GEAR_FAT_COMMANDS.every(cmd=>!gearBool(restart.project,cmd.output)),
    "STOP->RUN never inadvertently opens a FAT solenoid");
});

test("D08: changing scenes stops controllers and retains individual programs",()=>{
  const app=read("../src/App.tsx");
  assert.match(app,/sceneSessions\.current\[previous\] = stopPracticeScans\(current\)/);
  assert.match(app,/return stopPracticeScans\(sceneSessions\.current\[next\]\)/);
  assert.match(app,/if\(activeControllerScene\.current!=="gear"\)return/);
  assert.match(app,/gearControllerSourceRef\.current!=="virtual"/);
  assert.match(app,/if\(plc\.mode!=="running"\|\|/);
  assert.match(app,/changeScan\(stopPracticeScans\)/);
});

test("D09: original Gear Spray program is always available via reset",()=>{
  const app=read("../src/App.tsx");
  const scene=read("../src/components/ide/GearSprayScene.tsx");
  assert.match(app,/const resetGearProgram=useCallback/);
  assert.match(app,/window\.confirm\(/);
  assert.match(app,/initialPracticeScanState\(createGearCompleteProject\(\)\)/);
  assert.match(app,/changeGearPhysical\(\(\)=>initialGearPhysicalState\(\)\)/);
  assert.match(scene,/Reiniciar programa/);
  assert.match(scene,/onResetProgram=\{onResetProgram\}/);
});
