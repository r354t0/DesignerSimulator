import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 initialHilPhysical,configureHilPhysical,stepHilPhysical,
 sensorsFromHil,validatePhysicalPatch,SQS_PERIOD_MS,SQS_HIGH_MS,
} from "../src/physicalPlant.mjs";
const outputs={pumpSolenoid:true,lubricantSolenoid:true,atomizationSolenoid:true};
const build=()=>{
 let p=configureHilPhysical(initialHilPhysical(),{enabled:true});
 for(let i=0;i<120;i++)p=stepHilPhysical(p,outputs,50);
 return {...p,doserPhaseMs:0,pulseRemainingMs:0,pulseHigh:false,totalPulses:0};
};
test("HIL plant generates independent SQS-2561 100 ms rising edges every 500 ms",()=>{
 assert.equal(SQS_PERIOD_MS,500);assert.equal(SQS_HIGH_MS,100);
 let p=build(),on=[];
 for(let t=50;t<=1500;t+=50){
  p=stepHilPhysical(p,outputs,50);
  if(sensorsFromHil(p)._310_SQS_2561)on.push(t);
 }
 assert.deepEqual(on,[500,550,1000,1050,1500]);
 assert.equal(p.totalPulses,3);
});
test("HIL physical pressure and pulses advance with Node steps and no WebSocket",()=>{
 let p=configureHilPhysical(initialHilPhysical(),{enabled:true});
 for(let i=0;i<200;i++)p=stepHilPhysical(p,outputs,50);
 assert.ok(p.airPressure>=95);
 assert.ok(p.lubePressure>=400);
 assert.ok(p.totalPulses>0);
 assert.equal(sensorsFromHil(p).DI_PDB,p.pulseHigh);
});
test("HIL completes 100 ms pulse even when lubricant output drops",()=>{
 let p={...build(),doserPhaseMs:450};
 p=stepHilPhysical(p,outputs,50);
 assert.equal(p.pulseHigh,true);
 p=stepHilPhysical(p,{...outputs,lubricantSolenoid:false},50);
 assert.equal(p.pulseHigh,true);
 p=stepHilPhysical(p,{...outputs,lubricantSolenoid:false},50);
 assert.equal(p.pulseHigh,false);
});
test("HIL refuses unauthorized fields and invalid ranges; disable resets active pulse",()=>{
 for(const patch of [{evil:true},{enabled:1},{airSupply:10000},
  {pressureDecayFactor:0},{drumPercent:Infinity},{}])
   assert.throws(()=>validatePhysicalPatch(patch));
 let p={...build(),pulseHigh:true,pulseRemainingMs:80,doserPhaseMs:100};
 p=configureHilPhysical(p,{enabled:false});
 assert.equal(p.enabled,false);
 assert.equal(p.pulseHigh,false);
 assert.equal(p.pulseRemainingMs,0);
 assert.equal(p.doserPhaseMs,0);
});
test("Browser is not the physical clock when OPC UA controls Gear Spray",()=>{
 const app=readFileSync(new URL("../../web/src/App.tsx",import.meta.url),"utf8");
 const loop=app.slice(app.indexOf("// Gear Spray phase 2:"),app.indexOf("// Advance the five fixed demo rungs"));
 assert.match(loop,/gearControllerSourceRef.current!=="virtual"/);
 assert.doesNotMatch(loop,/gearOpcClientRef.current\?\.sendInput/);
 const server=readFileSync(new URL("../src/server.mjs",import.meta.url),"utf8");
 assert.match(server,/const physicalTimer=setInterval/);
 assert.match(server,/enqueueHilWrite\("_310_SQS_2561",true\)/);
 assert.match(server,/ws.on\("close",\(\)=>clients.delete\(ws\)\)/);
});
