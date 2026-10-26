import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 GEAR_OPC_OUTPUT_TAGS,GEAR_OPC_INPUT_TAGS,GEAR_OPC_OBSERVE_TAGS,
 validGearOpcOutputSnapshot,validGearOpcInput,
 initialGearOpcStatus,GEAR_OPC_DEFAULT_SOCKET,
} from "../src/plc/gearOpcUaBridge.ts";
import {
 initialGearSprayProject, writeGearScadaInput, gearNumber, gearBool,
 applyGearPhysicalTelemetry,
} from "../src/plc/gearSpraySceneModel.ts";
import {initialGearPhysicalState} from "../src/plc/gearSprayPhysics.ts";
const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("OPC UA bridge has correct physical read/write directions",()=>{
  assert.equal(GEAR_OPC_OUTPUT_TAGS.length,6);
  assert.equal(GEAR_OPC_INPUT_TAGS.length,15);
  assert.ok(GEAR_OPC_OUTPUT_TAGS.includes("_310_SV_2560"));
  assert.ok(GEAR_OPC_INPUT_TAGS.includes("_310_SQS_2561"));
  assert.ok(!GEAR_OPC_INPUT_TAGS.includes("_310_SV_2560"));
  assert.ok(!GEAR_OPC_INPUT_TAGS.includes("ST_Run_Rly"));
  assert.equal(GEAR_OPC_DEFAULT_SOCKET,"ws://127.0.0.1:8765");
  assert.deepEqual(initialGearOpcStatus().observedTags,[]);
});

test("Rejects incomplete or low-quality virtual gateway snapshot",()=>{
  const outputs=Object.fromEntries(GEAR_OPC_OUTPUT_TAGS.map(t=>[t,false]));
  const valid={type:"snapshot",outputs,quality:"Good",ts:123456};
  assert.equal(validGearOpcOutputSnapshot(valid),true);
  assert.equal(validGearOpcOutputSnapshot({...valid,quality:"Bad"}),false);
  assert.equal(validGearOpcOutputSnapshot({...valid,
    outputs:{...outputs,_310_SV_2560:1}}),false);
  assert.equal(validGearOpcOutputSnapshot({...valid,
    outputs:{_310_SV_2560:false}}),false);
  assert.equal(validGearOpcOutputSnapshot({...valid,
    diagnostics:{SM_Cycle_State:10,Fault_Code:0,
      "CTN_Lubeflo.ACC":3}}),true);
  assert.equal(validGearOpcOutputSnapshot({...valid,
    diagnostics:{SM_Cycle_State:"RUN"}}),false);
  assert.equal(validGearOpcOutputSnapshot({...valid,
    diagnostics:{UnknownTag:true}}),false);
});

test("Only physical inputs and HMI commands may be written",()=>{
  assert.equal(validGearOpcInput("PB_Reset",true),true);
  assert.equal(validGearOpcInput("_310_PI_2560",123.45),true);
  assert.equal(validGearOpcInput("CNT_LubeFlo_SP",5),true);
  assert.equal(validGearOpcInput("CNT_LubeFlo_SP",5.2),false);
  assert.equal(validGearOpcInput("_310_SV_2560",true),false);
  assert.equal(validGearOpcInput("Fault_Code",2),false);
  assert.equal(validGearOpcInput("PB_Auto",1),false);
  assert.equal(validGearOpcInput("_310_PI_2560",-1),false);
  assert.equal(GEAR_OPC_OBSERVE_TAGS.Fault_Code,"number");
});

test("Only one controller drives plant; real mode cannot run local Ladder",()=>{
  const app=source("../src/App.tsx");
  assert.match(app,/gearControllerSourceRef\.current==="opcua"/);
  assert.match(app,/outputs\[name\]=message\.outputs\[name\]===true/);
  assert.match(app,/gearOpcClientRef\.current\?\.sendPhysicalConfig\(patch\)/);
  assert.match(app,/return;/);
  assert.match(app,/changeScan\(stopPracticeScans\)/);
  assert.match(app,/gearControllerSourceRef\.current!=="virtual"/);
  assert.match(app,/disconnectGearOpc\(\)/);
  assert.match(app,/GEAR_OPC_OUTPUT_TAGS/);
  assert.match(app,/const connectGearOpc=useCallback/);
});

test("Gear scene has dedicated OPC UA, quality/status and read-only command blocking",()=>{
  const ui=source("../src/components/ide/GearSprayScene.tsx");
  assert.match(ui,/Micro850 real · OPC UA/);
  assert.match(ui,/onOpcConnect/);
  assert.match(ui,/onOpcDisconnect/);
  assert.match(ui,/URL gateway OPC UA/);
  assert.match(ui,/opcStatus\.writable/);
  assert.match(ui,/disabled=\{controllerSource==="opcua"&&!opcWritable\}/);
  assert.match(ui,/observed\("SM_Cycle_State"\)/);
  assert.match(ui,/observed\("Fault_Code"\)/);
  assert.match(ui,/Sin NodeId de lectura/);
});

test("manual REAL inputs survive gateway idle snapshots",()=>{
  let p=initialGearSprayProject();
  p=writeGearScadaInput(p,"_310_PI_2561",78.5);
  p=writeGearScadaInput(p,"_310_PI_2560",654.3);
  p=writeGearScadaInput(p,"_310_SQS_2561",true);
  const idle=initialGearPhysicalState();
  assert.strictEqual(applyGearPhysicalTelemetry(p,idle,false),p);
  assert.equal(gearNumber(p,"_310_PI_2561"),78.5);
  assert.equal(gearNumber(p,"_310_PI_2560"),654.3);
  assert.equal(gearBool(p,"_310_SQS_2561"),true);
});

test("automatic physical telemetry owns sensors only while HIL enabled",()=>{
  const p=writeGearScadaInput(initialGearSprayProject(),"_310_PI_2560",200);
  const active={...initialGearPhysicalState(),enabled:true,
    airPressure:84.5,lubePressure:920.3,pulseHigh:true};
  const auto=applyGearPhysicalTelemetry(p,active,false);
  assert.equal(gearNumber(auto,"_310_PI_2561"),84.5);
  assert.equal(gearNumber(auto,"_310_PI_2560"),920.3);
  assert.equal(gearBool(auto,"_310_SQS_2561"),true);
  assert.equal(gearBool(auto,"DI_PDB"),true);
  const idle={...active,enabled:false,airPressure:0,lubePressure:0,pulseHigh:false};
  const manual=applyGearPhysicalTelemetry(auto,idle,true);
  assert.equal(gearNumber(manual,"_310_PI_2561"),84.5);
  assert.equal(gearNumber(manual,"_310_PI_2560"),920.3);
  assert.equal(gearBool(manual,"_310_SQS_2561"),false);
  assert.equal(gearBool(manual,"DI_PDB"),false);
  const adjusted=writeGearScadaInput(manual,"_310_PI_2561",55.1);
  assert.strictEqual(applyGearPhysicalTelemetry(adjusted,idle,false),adjusted);
});

test("browser virtual analog model remains independent of Node HIL PDB",()=>{
  const app=source("../src/App.tsx");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  assert.ok(app.includes("applyGearPhysicalTelemetry(state.project,physical,wasEnabled)"));
  assert.ok(app.includes("changeGearPhysical(()=>initialGearPhysicalState())"));
  const loop=app.slice(app.indexOf("// Gear Spray phase 2:"),
    app.indexOf("// Advance the five fixed demo rungs"));
  assert.ok(loop.includes('gearControllerSourceRef.current!=="virtual"'));
  assert.ok(loop.includes("stepGearPhysical"));
  assert.ok(loop.includes("gearPhysicalSensors(next)"));
  assert.ok(scene.includes('disabled={controllerSource==="opcua"&&!opcWritable}'));
  assert.ok(scene.includes("onAnalogInput(input.name as GearAnalogInput,value)"));
});
