import test from "node:test";
import assert from "node:assert/strict";
import {
  initialGearSequenceState,evaluateGearSequence,
} from "../src/plc/gearSpraySequence.ts";

const idle={
  run:false,healthy:false,manual:false,freqDone:false,startupDone:true,
  extraPulse:false,flowDone:false,purgeActive:false,resetPulse:false,
  tripActive:false,
};
const step=(memory,input)=>evaluateGearSequence(memory,{...idle,...input});
const next=(memory,input)=>step(memory,input).memory;

test("State 0 stays inactive without RUN; RUN initializes to WAIT 10",()=>{
  const first=step(initialGearSequenceState(),{});
  assert.equal(first.output.state,0);
  assert.equal(first.output.cycleRun,false);
  const started=step(first.memory,{run:true,healthy:true});
  assert.equal(started.output.state,10);
  assert.equal(started.output.permissive,true);
  assert.equal(started.output.blocked,false);
});

test("Request starts lubrication 20; flow completion goes purge 30 then wait 10",()=>{
  let memory=initialGearSequenceState();
  const env={run:true,healthy:true,startupDone:true};
  memory=next(memory,env);
  const req=step(memory,{...env,freqDone:true});
  assert.equal(req.output.request,true);
  assert.equal(req.output.state,20);
  assert.equal(req.output.cycleRun,true);
  memory=req.memory;
  const flow=step(memory,{...env,flowDone:true,purgeActive:true});
  assert.equal(flow.output.state,30);
  assert.equal(flow.output.cycleRun,false);
  memory=flow.memory;
  const purge=step(memory,{...env,purgeActive:true});
  assert.equal(purge.output.state,30);
  const clear=step(purge.memory,env);
  assert.equal(clear.output.state,10);
});

test("Original startup condition NOT startupDone requests cycle without frequency timer",()=>{
  const init=next(initialGearSequenceState(),{run:true,healthy:true});
  const start=step(init,{run:true,healthy:true,startupDone:false});
  assert.equal(start.output.state,20);
  assert.equal(start.output.cycleRun,true);
});

test("Manual bypasses HEALTHY while AUTO without HEALTHY latches trip and block 90",()=>{
  const mode=step(initialGearSequenceState(),{run:true,manual:true});
  assert.equal(mode.output.permissive,true);
  assert.equal(mode.output.blocked,false);
  const first=step(initialGearSequenceState(),{run:true});
  assert.equal(first.output.state,10,
    "Cold healthy value is qualified on the next scan");
  assert.equal(first.output.cycleRun,false,
    "During qualification the lubricating output must stay OFF");
  assert.equal(first.memory.blockLatched,false);
  const notHealthy=step(first.memory,{run:true});
  assert.equal(notHealthy.output.state,90);
  assert.equal(notHealthy.output.blocked,true);
  assert.equal(notHealthy.memory.blockLatched,true);
  assert.equal(notHealthy.output.rearmHold,true);
});

test("An actual trip blocks immediately even on the first RUN scan",()=>{
  const trip=step(initialGearSequenceState(),{
    run:true,healthy:false,tripActive:true,
  });
  assert.equal(trip.output.state,90);
  assert.equal(trip.memory.blockLatched,true);
  assert.equal(trip.output.cycleRun,false);
});

test("Cold false healthy settles if P06 grants permission on next scan",()=>{
  const first=step(initialGearSequenceState(),{
    run:true,healthy:false,manual:false,startupDone:false,
  });
  assert.equal(first.output.state,10);
  assert.equal(first.output.cycleRun,false);
  assert.equal(first.memory.blockLatched,false);
  const settled=step(first.memory,{
    run:true,healthy:true,manual:false,startupDone:false,
  });
  assert.equal(settled.output.state,20);
  assert.equal(settled.output.cycleRun,true);
  assert.equal(settled.memory.blockLatched,false);
});

test("Trip has highest priority; reset while trip active cannot release block",()=>{
  const ready=next(initialGearSequenceState(),{run:true,healthy:true});
  const trip=step(ready,{run:true,healthy:true,tripActive:true,freqDone:true});
  assert.equal(trip.output.state,90);
  assert.equal(trip.output.cycleRun,false);
  const still=step(trip.memory,{run:true,healthy:true,tripActive:true,resetPulse:true});
  assert.equal(still.output.state,90);
  assert.equal(still.memory.blockLatched,true);
});

test("Recovery reset releases latched trip but holds cycles until prerequisites clear",()=>{
  let memory=next(initialGearSequenceState(),{run:true,healthy:true});
  memory=next(memory,{run:true,healthy:true,tripActive:true});
  const reset=step(memory,{run:true,healthy:true,resetPulse:true,freqDone:true});
  assert.equal(reset.memory.blockLatched,false);
  assert.equal(reset.memory.recoveryHold,true);
  assert.equal(reset.output.state,10);
  const hold=step(reset.memory,{run:true,healthy:true,freqDone:true});
  assert.equal(hold.output.rearmHold,true);
  assert.equal(hold.output.cycleRun,false);
  const noFlow=step(hold.memory,{run:true,healthy:true,startupDone:true});
  assert.equal(noFlow.output.state,10);
  assert.equal(noFlow.output.rearmHold,false);
  const resumed=step(noFlow.memory,{run:true,healthy:true,freqDone:true});
  assert.equal(resumed.output.state,20);
  assert.equal(resumed.output.cycleRun,true);
});

test("When RUN drops, state goes 0 but block memory is not cleared implicitly",()=>{
  let mem=next(initialGearSequenceState(),{run:true,healthy:true});
  mem=next(mem,{run:true,healthy:true,tripActive:true});
  const off=step(mem,{run:false,healthy:true});
  assert.equal(off.output.state,0);
  assert.equal(off.memory.blockLatched,true);
  assert.equal(off.memory.recoveryHold,true);
  const on=step(off.memory,{run:true,healthy:true});
  assert.equal(on.output.state,90);
  const reset=step(on.memory,{run:true,healthy:true,resetPulse:true});
  assert.equal(reset.output.state,10);
});

test("CycleRun drops immediately when flowDone or permissive absent",()=>{
  const env={run:true,healthy:true,freqDone:true,startupDone:true};
  let mem=next(initialGearSequenceState(),env);
  const active=step(mem,env);
  assert.equal(active.output.cycleRun,true);
  assert.equal(step(active.memory,{...env,flowDone:true}).output.cycleRun,false);
});
