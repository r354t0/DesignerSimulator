import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 GEAR_OPC_OUTPUT_TAGS,GEAR_OPC_INPUT_TAGS,GEAR_OPC_OBSERVE_TAGS,
 validGearOpcOutputSnapshot,validGearOpcInput,
 initialGearOpcStatus,GEAR_OPC_DEFAULT_SOCKET,
} from "../src/plc/gearOpcUaBridge.ts";
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
  assert.match(app,/gearOpcOutputsRef\.current\[name\]===true/);
  assert.match(app,/gearOpcClientRef\.current\?\.sendInput\(name,value\)/);
  assert.match(app,/return;/);
  assert.match(app,/changeScan\(stopPracticeScans\)/);
  assert.match(app,/if\(!real&&plc\.mode!=="running"\)return/);
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
