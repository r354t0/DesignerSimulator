import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDemoBlocks,
  resetDemoCounters,
  stepDemoBlocks,
} from "../src/plc/timerCounterDemo.ts";

const values = (changes = {}) => ({
  PB_Start: false, PB_Stop: false, DI_AutoMode: false,
  DO_Motor: false, DO_StopPermissive: true, DO_RunLamp: false, ...changes,
});

function tick(previous, changes, ms = 0) {
  return stepDemoBlocks(previous, values(changes), ms);
}

function advance(previous, changes, ms) {
  let state = previous;
  let remaining = ms;
  while (remaining > 0) {
    const step = Math.min(100, remaining);
    state = tick(state, changes, step);
    remaining -= step;
  }
  return state;
}

test("TON accumulates while true, sets TT then DN, and resets when false", () => {
  let s = initialDemoBlocks();
  s = advance(s, { PB_Start: true }, 4900);
  assert.equal(s.TON.en, true);
  assert.equal(s.TON.acc, 4900);
  assert.equal(s.TON.tt, true);
  assert.equal(s.TON.dn, false);
  s = advance(s, { PB_Start: true }, 150);
  assert.equal(s.TON.acc, 5000);
  assert.equal(s.TON.tt, false);
  assert.equal(s.TON.dn, true);
  s = tick(s, { PB_Start: false });
  assert.equal(s.TON.acc, 0);
  assert.equal(s.TON.dn, false);
});

test("TOF starts done after an energized rung and delays clearing DN", () => {
  let s = initialDemoBlocks();
  assert.equal(s.TOF.dn, false);
  assert.equal(s.TOF.acc, 2500);
  s = tick(s, { DO_Motor: true });
  assert.equal(s.TOF.en, true);
  assert.equal(s.TOF.dn, true);
  assert.equal(s.TOF.acc, 0);
  s = advance(s, { DO_Motor: false }, 1200);
  assert.equal(s.TOF.en, false);
  assert.equal(s.TOF.tt, true);
  assert.equal(s.TOF.dn, true);
  assert.equal(s.TOF.acc, 1200);
  s = advance(s, { DO_Motor: false }, 1300);
  assert.equal(s.TOF.acc, 2500);
  assert.equal(s.TOF.tt, false);
  assert.equal(s.TOF.dn, false);
});

test("custom TONOFF separates connection and disconnection delays", () => {
  let s = initialDemoBlocks();
  s = advance(s, { DI_AutoMode: true }, 1700);
  assert.equal(s.TONOFF.phase, "on-delay");
  assert.equal(s.TONOFF.tt, true);
  assert.equal(s.TONOFF.dn, false);
  s = advance(s, { DI_AutoMode: true }, 100);
  assert.equal(s.TONOFF.phase, "on");
  assert.equal(s.TONOFF.dn, true);
  s = tick(s, { DI_AutoMode: false });
  assert.equal(s.TONOFF.phase, "off-delay");
  assert.equal(s.TONOFF.dn, true);
  s = advance(s, { DI_AutoMode: false }, 1000);
  assert.equal(s.TONOFF.dn, true);
  assert.equal(s.TONOFF.acc, 1000);
  s = advance(s, { DI_AutoMode: false }, 1200);
  assert.equal(s.TONOFF.phase, "idle");
  assert.equal(s.TONOFF.dn, false);
  assert.equal(s.TONOFF.tt, false);
});

test("CTU and CTD count only rising edges and respect explicit reset/preload", () => {
  let s = initialDemoBlocks();
  assert.equal(s.CTU.acc, 0);
  assert.equal(s.CTD.acc, 8);
  assert.equal(s.CTD.dn, true); // Logix uses ACC >= PRE

  s = tick(s, { PB_Start: true, PB_Stop: true });
  assert.equal(s.CTU.acc, 1);
  assert.equal(s.CTD.acc, 7);
  assert.equal(s.CTU.cu, true);
  assert.equal(s.CTD.cd, true);
  assert.equal(s.CTD.dn, false);

  s = tick(s, { PB_Start: true, PB_Stop: true }, 150);
  assert.equal(s.CTU.acc, 1);
  assert.equal(s.CTD.acc, 7);

  s = tick(s, {});
  s = tick(s, { PB_Start: true, PB_Stop: true });
  assert.equal(s.CTU.acc, 2);
  assert.equal(s.CTD.acc, 6);

  s = resetDemoCounters(s);
  assert.equal(s.CTU.acc, 0);
  assert.equal(s.CTD.acc, 8);
  // Held inputs should not count again merely because RESET was pressed.
  s = tick(s, { PB_Start: true, PB_Stop: true });
  assert.equal(s.CTU.acc, 0);
  assert.equal(s.CTD.acc, 8);
});

test("CTU done turns true at its preset", () => {
  let s = initialDemoBlocks();
  for (let i = 0; i < 10; i++) {
    s = tick(s, { PB_Start: false });
    s = tick(s, { PB_Start: true });
  }
  assert.equal(s.CTU.acc, 10);
  assert.equal(s.CTU.dn, true);
});
