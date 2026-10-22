import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  initialGearPhysicalState, configureGearPhysical, stepGearPhysical,
  gearPhysicalSensors, gearSprayIsActive,GEAR_PULSE_HIGH_MS,
  GEAR_PULSE_PERIOD_MS,
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
  assert.equal(sensors.DI_PDB,sensors._310_SQS_2561);
  const count=state.totalPulses;
  state=advance(state,pumped,2);
  assert.equal(state.totalPulses,count);
  assert.equal(state.pulseHigh,false);
});

test("Each automatic SQS-2561 edge is HIGH exactly 100 ms and LOW before next 500 ms pulse",()=>{
  assert.equal(GEAR_PULSE_HIGH_MS,100);
  assert.equal(GEAR_PULSE_PERIOD_MS,500);
  let state=advance(configureGearPhysical(initialGearPhysicalState(),{enabled:true}),flowing,6);
  // Reconnect a new pumping cycle without relying on the browser scheduler.
  state={...state,doserPhaseMs:0,pulseHigh:false,pulseRemainingMs:0,totalPulses:0};
  const trace=[];
  for(let t=50;t<=1200;t+=50){
    state=stepGearPhysical(state,flowing,50);
    trace.push({t,high:gearPhysicalSensors(state)._310_SQS_2561,
      count:state.totalPulses});
  }
  for(const start of [500,1000]){
    assert.deepEqual(trace.filter(x=>x.t>=start&&x.t<start+100).map(x=>x.high),
      [true,true],"100 ms means TWO 50 ms physical samples");
    assert.equal(trace.find(x=>x.t===start+100).high,false,
      "Pulse must automatically return to LOW");
  }
  assert.equal(trace.at(-1).count,2);
});

test("SQS-2561 completes its 100 ms even when dosing valve closes after rising edge",()=>{
  let state=advance(configureGearPhysical(initialGearPhysicalState(),{enabled:true}),flowing,6);
  state={...state,doserPhaseMs:450,pulseHigh:false,pulseRemainingMs:0};
  state=stepGearPhysical(state,flowing,50);
  assert.equal(state.pulseHigh,true);
  assert.equal(state.pulseRemainingMs,100);
  state=stepGearPhysical(state,pumped,50);
  assert.equal(state.pulseHigh,true,
    "Falling valve edge must not truncate the already-triggered high");
  state=stepGearPhysical(state,pumped,50);
  assert.equal(state.pulseHigh,false);
  assert.equal(state.pulseRemainingMs,0);
  const off=configureGearPhysical({...state,pulseHigh:true,pulseRemainingMs:25},{
    enabled:false,
  });
  assert.equal(off.pulseHigh,false,"Disabling simulation clears a held sensor");
});

test("Loss of air, clogged filter and doser jam prevent new pulses",()=>{
  const state=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  for(const bad of [{airLoss:true},{filterBlocked:true},{doserBlocked:true}]){
    const abnormal=advance(configureGearPhysical(state,bad),flowing,12);
    assert.equal(abnormal.totalPulses,0,JSON.stringify(bad));
  }
});

test("Pressure loss slider changes decay speed, not initial pressure or growth",()=>{
  const base=configureGearPhysical(initialGearPhysicalState(),{enabled:true});
  const on={pumpSolenoid:true,lubricantSolenoid:false,atomizationSolenoid:false};
  const off={pumpSolenoid:false,lubricantSolenoid:false,atomizationSolenoid:false};
  const build=(plant,cmd,ticks)=>{
    for(let i=0;i<ticks;i++)plant=stepGearPhysical(plant,cmd,50);
    return plant;
  };
  const charged=build(base,on,100);
  const slow=build(configureGearPhysical(charged,{pressureDecayFactor:0.25}),off,20);
  const normal=build(configureGearPhysical(charged,{pressureDecayFactor:1}),off,20);
  const fast=build(configureGearPhysical(charged,{pressureDecayFactor:4}),off,20);
  assert.ok(slow.lubePressure>normal.lubePressure);
  assert.ok(normal.lubePressure>fast.lubePressure);
  assert.equal(slow.airPressure,normal.airPressure);
  const low=configureGearPhysical(base,{pressureDecayFactor:-4});
  const high=configureGearPhysical(base,{pressureDecayFactor:200});
  assert.equal(low.pressureDecayFactor,0.25);
  assert.equal(high.pressureDecayFactor,4);
  const slowBuild=build(configureGearPhysical(base,{pressureDecayFactor:0.25}),on,25);
  const fastBuild=build(configureGearPhysical(base,{pressureDecayFactor:4}),on,25);
  assert.equal(slowBuild.lubePressure,fastBuild.lubePressure,
    "Slider may not accelerate pressure buildup");
  const lossStart=build(charged,off,1);
  assert.ok(lossStart.lubePressure<charged.lubePressure);
  const pressurizedAir=build(configureGearPhysical(base,{airLoss:true,
    pressureDecayFactor:4}),off,20);
  assert.equal(pressurizedAir.airPressure,0);
  const replenish=build(configureGearPhysical(base,{airSupply:148}),off,25);
  const lowAir=configureGearPhysical(replenish,{airLoss:true,pressureDecayFactor:0.25});
  const highAir=configureGearPhysical(replenish,{airLoss:true,pressureDecayFactor:4});
  assert.ok(build(lowAir,off,10).airPressure>build(highAir,off,10).airPressure);
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
  for(const tag of ["_310_PI_2560","_310_PI_2561","_310_SQS_2561","DI_PDB","_310_LSL"])
    assert.ok(physicalEffect.includes(tag),tag);
  assert.doesNotMatch(physicalEffect,/setTagValue\(result.project,"_310_SV_/);
  assert.match(physicalEffect,/applySceneSensorBoolInput/);
  assert.match(scene,/Simulación física automática/);
  assert.match(scene,/Velocidad de pérdida de presión/);
  assert.match(scene,/pressureDecayFactor:Number\(e.target.value\)/);
  assert.match(scene,/Pérdida de aire/);
  assert.match(scene,/Filtro obstruido/);
  assert.match(scene,/Dosificador atascado/);
  assert.match(scene,/disabled=\{physics.enabled\}/);
  assert.match(scene,/onPhysicsReset/);
  assert.match(scene,/physics.totalPulses/);
  assert.match(scene,/gearSprayIsActive/);
  assert.match(scene,/se utiliza DI_PDB para los pulsos/);
  assert.doesNotMatch(scene,/DI_PDB_2/);
});
