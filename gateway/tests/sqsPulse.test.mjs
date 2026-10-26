import test from "node:test";
import assert from "node:assert/strict";
import {writeSqsPulse100,SQS_PULSE_HIGH_MS}
  from "../src/sqsPulse.mjs";

test("Gateway holds SQS HIGH for one 100 ms window then writes LOW",async()=>{
  const events=[];
  await writeSqsPulse100(
    async()=>{events.push("HIGH");},
    async()=>{events.push("LOW");},
    async ms=>{events.push("WAIT "+ms);},
  );
  assert.equal(SQS_PULSE_HIGH_MS,100);
  assert.deepEqual(events,["HIGH","WAIT 100","LOW"]);
});

test("Gateway releases SQS even if its 100ms wait fails",async()=>{
  const events=[];
  await assert.rejects(writeSqsPulse100(
    async()=>{events.push("HIGH");},
    async()=>{events.push("LOW");},
    async()=>{throw Error("timer interrupted");},
  ),/timer interrupted/);
  assert.deepEqual(events,["HIGH","LOW"]);
});

test("Gateway never sends LOW or starts timer when high write fails",async()=>{
  const events=[];
  await assert.rejects(writeSqsPulse100(
    async()=>{events.push("attempt HIGH");throw Error("BadWrite");},
    async()=>{events.push("LOW");},
    async()=>{events.push("timer");},
  ),/BadWrite/);
  assert.deepEqual(events,["attempt HIGH"]);
});
