import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildPracticeProject} from "../src/plc/practiceBuild.ts";
import {gearBool,initialGearSprayProject} from "../src/plc/gearSpraySceneModel.ts";
import {createGearFatProject,GEAR_FAT_COMMANDS,isGearFatCommand}
  from "../src/plc/gearSprayFatProgram.ts";
import {
  initialPracticeScanState,startPracticeScans,applySceneSensorBoolInput,
  tickPracticeScan,
} from "../src/plc/practiceScanCycle.ts";
import {
  initialGearPhysicalState,configureGearPhysical,stepGearPhysical,gearPhysicalSensors,
} from "../src/plc/gearSprayPhysics.ts";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("FAT template is separate from the 22-tag default and compiles cleanly",()=>{
  const original=initialGearSprayProject();
  const example=createGearFatProject();
  assert.equal(original.tags.length,22);
  assert.equal(example.tags.length,25);
  assert.equal(original.rungs[0].instructions.length,0);
  assert.equal(example.rungs.length,3);
  assert.equal(buildPracticeProject(example).success,true);
  assert.equal(new Set(GEAR_FAT_COMMANDS.map(c=>c.name)).size,3);
  for(const {name,output} of GEAR_FAT_COMMANDS){
    assert.equal(example.tags.find(t=>t.name===name)?.type,"BOOL");
    assert.equal(example.tags.find(t=>t.name===output)?.type,"BOOL");
  }
  assert.equal(isGearFatCommand("FAT_CMD_Pump"),true);
  assert.equal(isGearFatCommand("PB_Auto"),false);
  assert.notDeepEqual(example,original);
});

test("One FAT input only energizes its corresponding PLC output on RUN",()=>{
  let state=startPracticeScans(initialPracticeScanState(createGearFatProject()));
  assert.equal(state.mode,"running");
  for(const tag of GEAR_FAT_COMMANDS){
    assert.equal(gearBool(state.project,tag.output),false,tag.output);
  }
  for(const command of GEAR_FAT_COMMANDS){
    state=applySceneSensorBoolInput(state,command.name,true);
    assert.equal(gearBool(state.project,command.output),true,command.output);
    for(const other of GEAR_FAT_COMMANDS.filter(x=>x!==command))
      assert.equal(gearBool(state.project,other.output),false,
        "Other coil energised: "+other.output);
    state=applySceneSensorBoolInput(state,command.name,false);
    assert.equal(gearBool(state.project,command.output),false);
  }
  state=tickPracticeScan(state);
  for(const cmd of GEAR_FAT_COMMANDS)
    assert.equal(gearBool(state.project,cmd.output),false);
});

test("FAT actuators drive the plant and DI_PDB follows SQS sensor",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createGearFatProject()));
  let plant=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  const inputs=GEAR_FAT_COMMANDS.map(cmd=>cmd.name);
  // Air first, then establish pressure and open the lubricant feed.
  plc=applySceneSensorBoolInput(plc,inputs[0],true);
  for(let i=0;i<100;i++)plant=stepGearPhysical(plant,{
    pumpSolenoid:gearBool(plc.project,"_310_SV_2560"),
    lubricantSolenoid:gearBool(plc.project,"_310_SV_2561"),
    atomizationSolenoid:gearBool(plc.project,"_310_SV_2563"),
  },50);
  assert.ok(plant.lubePressure>=400);
  assert.equal(plant.totalPulses,0);
  plc=applySceneSensorBoolInput(plc,inputs[1],true);
  plc=applySceneSensorBoolInput(plc,inputs[2],true);
  for(let i=0;i<80;i++)plant=stepGearPhysical(plant,{
    pumpSolenoid:gearBool(plc.project,"_310_SV_2560"),
    lubricantSolenoid:gearBool(plc.project,"_310_SV_2561"),
    atomizationSolenoid:gearBool(plc.project,"_310_SV_2563"),
  },50);
  assert.ok(plant.totalPulses>0);
  assert.ok(plant.drumPercent<100);
  const s=gearPhysicalSensors(plant);
  assert.equal(s.DI_PDB,s._310_SQS_2561);
});

test("Scene 06 hides temporary FAT loader and runs the canonical project by default",()=>{
  const app=source("../src/App.tsx");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(app,/gear: initialPracticeScanState\(createGearCompleteProject\(\)\)/);
  assert.doesNotMatch(scene,/Banco de pruebas FAT · Etapa B/);
  assert.doesNotMatch(scene,/Cargar Ladder temporal FAT/);
  assert.doesNotMatch(scene,/Cargar P01–P07 \(FAT integrado\)/);
  assert.match(scene,/Simulación física automática/);
});
