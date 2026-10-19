import test from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_AMBIENT_TEMPERATURE,BATCH_FULL_PULSES,
  BATCH_VOLUME_PER_PULSE_PERCENT,
  initialBatchState,stepBatchPhysics,batchDigitalSensors,
} from "../src/plc/batchMixerSceneModel.ts";
import { readFileSync } from "node:fs";

const idle={pump1:false,pump2:false,pump3:false,heater:false};
const fill={...idle,pump1:true};
const heat={...idle,heater:true};
const drain={...idle,pump3:true};
const advance=(start,outputs,ticks)=> {
  let result=start;
  for(let i=0;i<ticks;i++)result=stepBatchPhysics(result,outputs,50);
  return result;
};

test("the hot Batch Mixer tank cools continuously as liquid drains",()=>{
  let tank=advance(initialBatchState(),fill,250);
  assert.equal(tank.level,100);
  assert.equal(tank.totalPulses[0],BATCH_FULL_PULSES);
  assert.equal(tank.temperature,BATCH_AMBIENT_TEMPERATURE);

  tank=advance(tank,heat,80); // 4 s * 4°C/s
  assert.ok(Math.abs(tank.temperature-36)<0.0001);
  assert.equal(batchDigitalSensors(tank,32).DI_Thermostat,true);

  const hot=tank.temperature;
  let first=stepBatchPhysics(tank,drain,50);
  assert.equal(first.level,99.6);
  assert.ok(first.temperature<hot && first.temperature>BATCH_AMBIENT_TEMPERATURE,
    "cooling begins when pump 3 first removes product");

  const half=advance(first,drain,124); // 500 pulses total, tank at 50%
  assert.equal(half.level,50);
  assert.equal(half.totalPulses[2],500);
  assert.ok(Math.abs(half.temperature-28)<0.0001,
    "effective temperature decreases with removed product");
  assert.equal(batchDigitalSensors(half,32).DI_Thermostat,false,
    "thermostat DI clears after cooling below setpoint");
  assert.equal(batchDigitalSensors(half,32).DI_LowLevel,true);
  assert.equal(batchDigitalSensors(half,32).DI_HighLevel,false);

  const empty=advance(half,drain,125);
  assert.equal(empty.level,0);
  assert.equal(empty.totalPulses[2],1000);
  assert.equal(empty.temperature,BATCH_AMBIENT_TEMPERATURE);
  assert.equal(batchDigitalSensors(empty,32).DI_LowLevel,false);
  assert.equal(batchDigitalSensors(empty,32).DI_Thermostat,false);
  assert.equal(BATCH_VOLUME_PER_PULSE_PERCENT,0.1);
});

test("a new batch starts cold after draining; no hidden analog temperature tag",()=>{
  const hot=advance(advance(initialBatchState(),fill,250),heat,80);
  const empty=advance(hot,drain,250);
  const filledAgain=stepBatchPhysics(empty,fill,50);
  assert.equal(filledAgain.level,0.4);
  assert.equal(filledAgain.temperature,BATCH_AMBIENT_TEMPERATURE);
  assert.equal(batchDigitalSensors(filledAgain,32).DI_LowLevel,true);
  assert.equal(batchDigitalSensors(filledAgain,32).DI_Thermostat,false);
});

test("no draining means no artificial temperature decrease; fresh liquid cools mixing",()=>{
  const hot=advance(advance(initialBatchState(),fill,250),heat,80);
  assert.equal(advance(hot,idle,50).temperature,hot.temperature);
  // Partial vessel at 60%, hot after heating.
  const partiallyFull=advance(initialBatchState(),fill,150);
  const warmed=advance(partiallyFull,heat,60);
  const withFreshProduct=stepBatchPhysics(warmed,fill,50);
  assert.ok(withFreshProduct.temperature<warmed.temperature);
  assert.ok(withFreshProduct.temperature>BATCH_AMBIENT_TEMPERATURE);
});

test("outflow takes precedence over accidental simultaneous heating output",()=>{
  const heated=advance(advance(initialBatchState(),fill,250),heat,80);
  const next=stepBatchPhysics(heated,{...drain,heater:true},50);
  assert.ok(next.temperature<heated.temperature);
  assert.ok(next.temperature>=BATCH_AMBIENT_TEMPERATURE);
});

test("SCADA labels cooling during draining without exposing analog PLC inputs",()=>{
  const source=readFileSync(new URL("../src/components/ide/BatchMixerScene.tsx",import.meta.url),"utf8");
  assert.match(source,/out3\?"ENFRIANDO"/);
  assert.match(source,/outputs\.heater\?"CALENTANDO"/);
  const model=readFileSync(new URL("../src/plc/batchMixerSceneModel.ts",import.meta.url),"utf8");
  assert.match(model,/DI_Thermostat: state\.temperature>=sp/);
  assert.doesNotMatch(model,/name: "AI_TemperaturePV"/);
});
