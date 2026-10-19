import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GEAR_FIELD_INPUTS, GEAR_FIELD_OUTPUTS, GEAR_HMI_PUSHBUTTONS,
  GEAR_HMI_SETPOINTS, GEAR_SCADA_TAGS, GEAR_CYCLE_INPUTS,
  initialGearSprayProject, prepareGearSprayTags,
  gearBool, gearNumber, writeGearScadaInput,
} from "../src/plc/gearSpraySceneModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { createTag, setTagValue } from "../src/plc/practiceDocument.ts";
import {
  initialPracticeScanState, applySceneSensorBoolInput,
  applyMomentaryBoolInput, startPracticeScans, stopPracticeScans,
} from "../src/plc/practiceScanCycle.ts";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const physicalInputTags=[
  "_310_PI_2561","_310_PI_2560","_310_PLC104_YI_MillRun",
  "_310_SQS_2561","_310_LSL",
];
const physicalOutputTags=[
  "_310_SV_2560","_310_SV_2563","_310_SV_2561",
  "_310_UY_2560","_310_YI_SystemHealthy",
  "_310_YI_LubricationSystemRunning",
];

test("Gear Spray phase 1 registers exactly the P01 physical CCW I/O and HMI values",()=>{
  assert.deepEqual(GEAR_FIELD_INPUTS.map(t=>t.name),physicalInputTags);
  assert.deepEqual(GEAR_FIELD_OUTPUTS.map(t=>t.name),physicalOutputTags);
  assert.deepEqual(GEAR_HMI_PUSHBUTTONS.map(t=>t.name),[
    "PB_Auto","PB_Manual","PB_Maint","PB_Extra",
    "PB_Reset","PB_Lubpress_Release",
  ]);
  assert.deepEqual(GEAR_HMI_SETPOINTS.map(t=>t.name),[
    "TMR_Freq_SP","CNT_LubeFlo_SP","TMR_LubeFlo_SP",
    "Maint_Duration_Min",
  ]);
  assert.equal(GEAR_SCADA_TAGS.length,22);
  assert.equal(new Set(GEAR_SCADA_TAGS.map(t=>t.name)).size,22);
  assert.deepEqual(GEAR_CYCLE_INPUTS.map(t=>t.name),["DI_PDB"]);
  assert.ok(!GEAR_SCADA_TAGS.some(t=>t.name==="DI_PDB_2"));
  assert.ok(GEAR_HMI_SETPOINTS.every(t=>t.type==="DINT"));
  assert.ok(GEAR_FIELD_INPUTS.slice(0,2).every(t=>t.type==="REAL"));
  const p=initialGearSprayProject();
  assert.deepEqual(p.tags.map(t=>t.name),GEAR_SCADA_TAGS.map(t=>t.name));
  assert.equal(p.rungs.length,1);
  assert.equal(p.rungs[0].instructions.length,0);
  assert.ok(p.tags.every(t=>!t.name.startsWith("ST_")&&!t.name.startsWith("ALM_")));
  // MainRoutine deliberately starts blank. Until the CCW logic is ported,
  // the build correctly refuses an empty rung rather than running fake PLC logic.
  assert.equal(buildPracticeProject(p).success,false);
});

test("Gear Spray preserves customized programs/tags when revisiting",()=>{
  const original=initialGearSprayProject();
  assert.strictEqual(prepareGearSprayTags(original),original);
  let withCustom=createTag(original,"ST_Custom_Test","Logic user","BOOL");
  withCustom=setTagValue(withCustom,"_310_PI_2561",54.5);
  assert.strictEqual(prepareGearSprayTags(withCustom),withCustom);
  const missing={...withCustom,tags:withCustom.tags.filter(t=>t.name!=="PB_Extra")};
  const restored=prepareGearSprayTags(missing);
  assert.equal(restored.tags.length,withCustom.tags.length);
  assert.equal(restored.tags.find(t=>t.name==="_310_PI_2561").value,54.5);
  assert.equal(restored.tags.find(t=>t.name==="ST_Custom_Test").type,"BOOL");
  const corrupt={...original,tags:original.tags.map(t=>
    t.name==="_310_PI_2561"?{...t,type:"BOOL"}:t)};
  assert.throws(()=>prepareGearSprayTags(corrupt),/debe ser REAL/);
});

test("HMI can modify only documented physical inputs and setpoints, never physical outputs",()=>{
  let p=initialGearSprayProject();
  p=writeGearScadaInput(p,"_310_PI_2561",52.5);
  p=writeGearScadaInput(p,"_310_PI_2560",890.2);
  p=writeGearScadaInput(p,"_310_LSL",true);
  p=writeGearScadaInput(p,"PB_Extra",true);
  p=writeGearScadaInput(p,"CNT_LubeFlo_SP",12);
  assert.equal(gearNumber(p,"_310_PI_2561"),52.5);
  assert.equal(gearNumber(p,"_310_PI_2560"),890.2);
  assert.equal(gearBool(p,"_310_LSL"),true);
  assert.equal(gearBool(p,"PB_Extra"),true);
  assert.equal(gearNumber(p,"CNT_LubeFlo_SP"),12);
  assert.throws(()=>writeGearScadaInput(p,"_310_SV_2560",true),/no editable/);
  assert.throws(()=>writeGearScadaInput(p,"_310_UY_2560",true),/no editable/);
  assert.throws(()=>writeGearScadaInput(p,"ST_Auto_Mode",true),/no editable/);
  assert.throws(()=>writeGearScadaInput(p,"_310_PI_2561",-1),/presión/);
  assert.throws(()=>writeGearScadaInput(p,"PB_Auto",1),/BOOL/);
  assert.throws(()=>writeGearScadaInput(p,"TMR_Freq_SP",1.25),/DINT/);
  assert.throws(()=>writeGearScadaInput(p,"TMR_Freq_SP",2147483648),/DINT/);
  assert.equal(gearBool(p,"_310_SV_2560"),false,
    "no output is energized by changing a field input alone");
});

test("Gear Spray operator inputs use shared Ladder scan mechanics, not an independent motor",()=>{
  let plc=startPracticeScans(initialPracticeScanState(initialGearSprayProject()));
  plc=applySceneSensorBoolInput(plc,"_310_PLC104_YI_MillRun",true);
  assert.equal(gearBool(plc.project,"_310_PLC104_YI_MillRun"),true);
  plc=applyMomentaryBoolInput(plc,"PB_Auto",true,true);
  assert.equal(gearBool(plc.project,"PB_Auto"),true);
  plc=applyMomentaryBoolInput(plc,"PB_Auto",false,true);
  assert.equal(gearBool(plc.project,"PB_Auto"),false);
  assert.equal(gearBool(plc.project,"_310_SV_2560"),false);
  plc=stopPracticeScans(plc);
  assert.equal(plc.mode,"stopped");
});

test("Scene 6 UI shows process and only nonredundant LED groups",()=>{
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  const labels=[
    "TAMBOR","BOMBA NEUMÁTICA","FILTRO","BLOQUE DOSIFICADOR",
    "BOQUILLAS","MOLINO","Vista de proceso","Tablero de mando",
    "Instrumentación y setpoints","Alarmas y diagnóstico",
  ];
  for(const label of labels) assert.ok(scene.includes(label),"missing "+label);
  const status=scene.indexOf('<ScadaLedGroup kind="status">');
  const outputs=scene.indexOf('<ScadaLedGroup kind="outputs">');
  assert.ok(status>=0&&outputs>status);
  assert.doesNotMatch(scene,/<ScadaLedGroup kind="inputs">/);
  const led=scene.slice(scene.indexOf("Pilotos LED y equipos"),
    scene.indexOf("Alarmas y diagnóstico"));
  assert.doesNotMatch(led,/_310_SV_256[013]/);
  assert.doesNotMatch(led,/_310_PLC104_YI_MillRun/);
  assert.doesNotMatch(scene,/Programa y referencias/);
  assert.match(scene,/scada-scene-workspace/);
  assert.match(scene,/scada-process-panel/);
  assert.match(scene,/scada-scene-sidebar/);
  assert.match(scene,/scada-control-shell/);
  assert.match(scene,/MomentaryPushButton/);
  assert.match(scene,/onDigitalInput\(/);
  assert.match(scene,/onAnalogInput\(/);
  assert.match(scene,/onSetpoint\(/);
  assert.match(scene,/onPushButton\(/);
  assert.match(scene,/onOpenTags/);
  for(const name of physicalOutputTags)assert.ok(scene.includes(name),"output "+name+" not wired");
  assert.doesNotMatch(scene,/stepGearPhysics|runGearUdfb|GearSpraySimulationEngine/);
  assert.match(scene,/pendientes de portar/);
  assert.match(scene,/Física FAT · Fase 3A P01\/P02 disponible/);
});

test("App adds Gear Spray as independent programming scene and restores its scan state",()=>{
  const app=source("../src/App.tsx");
  assert.match(app,/type SimulationTab = [^;]*"gear"/);
  assert.match(app,/type ProgrammingScene = [^;]*"gear"/);
  assert.match(app,/gear: initialPracticeScanState\(initialGearSprayProject\(\)\)/);
  assert.match(app,/<option value="gear">Gear Spray · Molino de bolas<\/option>/);
  assert.match(app,/<GearSprayScene project=\{practice\} mode=\{practiceMode\}/);
  assert.match(app,/prepareGearSprayTags\(state\.project\)/);
  assert.match(app,/changeScan\(state=>applyMomentaryBoolInput\(state,tag,value,true\)\)/);
  assert.match(app,/const sampled=applySceneSensorBoolInput\(state,tag,value\)/);
  assert.match(app,/applySceneSensorBoolInput\(sampled,"DI_PDB",value\)/);
  assert.match(app,/writeGearScadaInput\(state\.project,tag,value\)/);
  const tags=source("../src/components/ide/ControllerTags.tsx");
  assert.match(tags,/activeScene === "gear" \? "MainRoutine · Gear Spray"/);
});

test("DI_PDB reemplaza el alias temporal y conserva el vínculo con el sensor físico",()=>{
  const model=source("../src/plc/gearSpraySceneModel.ts");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(model,/GEAR_DOSER_PULSE_TAG="DI_PDB"/);
  assert.match(model,/_310_SQS_2561/);
  assert.doesNotMatch(model,/DI_PDB_2/);
  assert.match(scene,/alimenta DI_PDB/);
  assert.match(scene,/Pulso del dosificador \(DI_PDB\)/);
  assert.match(scene,/AFI para la alarma de alta presión/);
  assert.match(scene,/Referencia original: 0–1480/);
  assert.match(scene,/max=\{isAir\?148:1480\}/);
});
