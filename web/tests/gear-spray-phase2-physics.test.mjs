import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  initialGearPhysicalState, configureGearPhysical, stepGearPhysical,
  gearPhysicalSensors, gearSprayIsActive,
} from "../src/plc/gearSprayPhysics.ts";

const outputs={pumpSolenoid:false,lubricantSolenoid:false,atomizationSolenoid:false};
const pumped={...outputs,pumpSolenoid:true};
const flowing={pumpSolenoid:true,lubricantSolenoid:true,atomizationSolenoid:true};
function advance(initial, out, seconds) {
  let state=initial;
  for(let i=0;i<seconds*20;i++)state=stepGearPhysical(state,out,50);
  return state;
}
const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Model does nothing unless enabled and is deterministic for a given time",()=>{
  const before=initialGearPhysicalState();
  assert.strictEqual(stepGearPhysical(before,flowing,50),before);
  const enabled=configureGearPhysical(before,{enabled:true});
  assert.strictEqual(stepGearPhysical(enabled,flowing,0),enabled);
  assert.strictEqual(stepGearPhysical(enabled,flowing,Number.NaN),enabled);
  assert.deepEqual(advance(enabled,flowing,5),advance(enabled,flowing,5));
});

test("Air source pressure exists upstream of nozzles; pump builds lube pressure only with PLC output",()=>{
  const state=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  const idle=advance(state,outputs,6);
  assert.equal(idle.airPressure,100);
  assert.equal(idle.lubePressure,0);
  assert.equal(idle.totalPulses,0);
  const pressured=advance(idle,pumped,6);
  assert.equal(pressured.lubePressure,1050);
  assert.equal(pressured.totalPulses,0);
  assert.equal(pressured.drumPercent,100);
  assert.equal(gearSprayIsActive(pressured,flowing),true);
  assert.equal(gearSprayIsActive(pressured,pumped),false);
});

test("Lube pulses and level consumption require SV-2561 and sufficient pressure",()=>{
  let state=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  state=advance(state,flowing,10);
  assert.ok(state.totalPulses>0);
  assert.ok(state.lubePressure>=400);
  assert.ok(state.drumPercent<100);
  const sensors=gearPhysicalSensors(state);
  assert.equal(sensors._310_PI_2561,state.airPressure);
  assert.equal(sensors._310_PI_2560,state.lubePressure);
  const count=state.totalPulses;
  state=advance(state,pumped,2);
  assert.equal(state.totalPulses,count);
  assert.equal(state.pulseHigh,false);
});

test("Loss of air, clogged filter and doser jam prevent new pulses",()=>{
  const state=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  for(const bad of [{airLoss:true},{filterBlocked:true},{doserBlocked:true}]){
    const abnormal=advance(configureGearPhysical(state,bad),flowing,12);
    assert.equal(abnormal.totalPulses,0,JSON.stringify(bad));
  }
});

test("Drum can be replenished and sensor polarity is an explicit test assumption",()=>{
  const state=configureGearPhysical(initialGearPhysicalState(),{
    enabled:true,drumPercent:9.5,airSupply:999,
  });
  assert.equal(state.airSupply,148);
  assert.equal(gearPhysicalSensors(state)._310_LSL,true);
  const supplied=configureGearPhysical(state,{drumPercent:90});
  assert.equal(gearPhysicalSensors(supplied)._310_LSL,false);
  const empty=advance(configureGearPhysical(state,{drumPercent:0}),flowing,10);
  assert.equal(empty.lubePressure,0);
  assert.equal(empty.totalPulses,0);
});

test("Scene 06 physics only runs under its own PLC RUN and writes input tags only",()=>{
  const app=source("../src/App.tsx");
  const scene=source("../src/components/ide/GearSprayScene.tsx");
  const physicalEffect=app.slice(app.indexOf("// Gear Spray phase 2:"),app.indexOf("// Advance the five fixed demo rungs"));
  assert.match(physicalEffect,/practiceMode!=="running"/);
  assert.match(physicalEffect,/activeControllerScene.current!=="gear"/);
  assert.match(physicalEffect,/if\(!physical.enabled\)return|!physical.enabled\)return/);
  for(const tag of ["_310_SV_2560","_310_SV_2561","_310_SV_2563"])
    assert.ok(physicalEffect.includes(tag),tag);
  for(const tag of ["_310_PI_2560","_310_PI_2561","_310_SQS_2561","_310_LSL"])
    assert.ok(physicalEffect.includes(tag),tag);
  assert.doesNotMatch(physicalEffect,/setTagValue\(result.project,"_310_SV_/);
  assert.match(physicalEffect,/applySceneSensorBoolInput/);
  assert.match(scene,/Simulación física automática/);
  assert.match(scene,/Pérdida de aire/);
  assert.match(scene,/Filtro obstruido/);
  assert.match(scene,/Dosificador atascado/);
  assert.match(scene,/disabled=\{physics.enabled\}/);
  assert.match(scene,/onPhysicsReset/);
  assert.match(scene,/physics.totalPulses/);
  assert.match(scene,/gearSprayIsActive/);
  assert.match(scene,/DI_PDB\/DI_PDB_2 pendientes/);
});
