import test from "node:test";
import assert from "node:assert/strict";
import {
  createParallelBranch, createEmptyOutputBranch, addParallelContact,
  initialPracticeProject, insertInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { getOnlineMonitorReadout, getPendingScanInputs } from "../src/plc/practiceOnlineMonitor.ts";

const xic = (id, tag) => ({ id, kind: "XIC", tag });
const xio = (id, tag) => ({ id, kind: "XIO", tag });
const ote = (id, tag) => ({ id, kind: "OTE", tag });
const instr = (instructionId) => ({ kind: "instruction", instructionId });
const by = (fields, label) => fields.find((field) => field.label === label)?.value;

function twoContacts() {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("start", "Start_PB"));
  project = insertInstruction(project, "rung-1", 1, xio("stop", "Stop_PB"));
  project = insertInstruction(project, "rung-1", 2, ote("motor", "Motor_Run"));
  return project;
}

test("offline inspector distinguishes unavailable scan from monitoring input BOOL", () => {
  const p = twoContacts();
  assert.equal(getOnlineMonitorReadout(p, null, "stopped", null), null);
  const result = getOnlineMonitorReadout(p, null, "stopped", instr("start"));
  assert.equal(result.status, "unavailable");
  assert.equal(result.fields.length, 0);
  assert.match(result.explanation, /RUN/);
  assert.deepEqual(getPendingScanInputs(p, null), []);
  assert.equal(getOnlineMonitorReadout(p, null, "running", instr("ghost")), null);
});

test("XIC inspector explains tag TRUE without upstream flow versus energized flow", () => {
  let p = twoContacts();
  let frame = evaluateSeriesScan(p);
  const blocked = getOnlineMonitorReadout(frame.project, frame, "running", instr("start"));
  assert.equal(blocked.status, "blocked");
  assert.equal(by(blocked.fields, "Bit leído en scan"), "0 (FALSE)");
  assert.equal(by(blocked.fields, "Condición"), "No cumple");
  assert.equal(by(blocked.fields, "Energía entrada"), "Energizado");
  assert.equal(by(blocked.fields, "Energía salida"), "Sin energía");

  p = setTagValue(p, "Start_PB", true);
  frame = evaluateSeriesScan(p);
  const powered = getOnlineMonitorReadout(frame.project, frame, "running", instr("start"));
  assert.equal(powered.status, "energized");
  assert.equal(by(powered.fields, "Energía salida"), "Energizado");
});

test("XIO condition uses NOT raw BOOL; branch and downstream coil inspection", () => {
  let p = twoContacts();
  p = setTagValue(p, "Start_PB", true);
  let frame = evaluateSeriesScan(p);
  const xioValue = getOnlineMonitorReadout(frame.project, frame, "running", instr("stop"));
  assert.equal(xioValue.label, "XIO · Stop_PB");
  assert.equal(by(xioValue.fields, "Bit leído en scan"), "0 (FALSE)");
  assert.equal(by(xioValue.fields, "Condición"), "Cumple");
  const output = getOnlineMonitorReadout(frame.project, frame, "running", instr("motor"));
  assert.equal(output.status, "energized");
  assert.equal(by(output.fields, "Valor de salida"), "1 (TRUE)");

  p = setTagValue(p, "Stop_PB", true);
  frame = evaluateSeriesScan(p);
  const blocked = getOnlineMonitorReadout(frame.project, frame, "running", instr("stop"));
  assert.equal(by(blocked.fields, "Condición"), "No cumple");
  assert.equal(blocked.status, "blocked");
});

test("PAUSE displays last scanned inputs separately from a changed BOOL awaiting SCAN", () => {
  let p = twoContacts();
  p = setTagValue(p, "Start_PB", true);
  const frame = evaluateSeriesScan(p);
  const changed = setTagValue(frame.project, "Start_PB", false);
  assert.deepEqual(getPendingScanInputs(changed, frame), ["Start_PB"]);
  const monitor = getOnlineMonitorReadout(changed, frame, "paused", instr("start"));
  assert.equal(monitor.status, "paused");
  assert.equal(by(monitor.fields, "Bit leído en scan"), "1 (TRUE)");
  assert.equal(by(monitor.fields, "Entrada pendiente"), "0 (FALSE)");
  assert.equal(monitor.fields.find((field) => field.label === "Entrada pendiente")?.changed, true);
  assert.match(monitor.explanation, /último scan/);
  const coil = getOnlineMonitorReadout(changed, frame, "paused", instr("motor"));
  assert.equal(by(coil.fields, "Valor de salida"), "1 (TRUE)");
  assert.equal(coil.pendingInputs, 1);
  const refreshed = evaluateSeriesScan(changed);
  assert.deepEqual(getPendingScanInputs(refreshed.project, refreshed), []);
  assert.equal(by(getOnlineMonitorReadout(refreshed.project, refreshed, "paused", instr("motor")).fields,
    "Valor de salida"), "0 (FALSE)");
});

test("monitor accounts for OR branch and rung power using the snapshot, not recomputation", () => {
  let p = twoContacts();
  p = createParallelBranch(p, "rung-1", "start");
  const branch = p.rungs[0].parallelBranches[0];
  p = addParallelContact(p, "rung-1", "start", xic("auto", "Auto_Mode"), 0, branch.id);
  p = setTagValue(p, "Auto_Mode", true);
  const frame = evaluateSeriesScan(p);
  const monitor = getOnlineMonitorReadout(frame.project, frame, "running",
    { kind: "branch", rungId: "rung-1", branchId: branch.id });
  assert.equal(monitor.status, "energized");
  assert.equal(by(monitor.fields, "Contactos en serie"), "1");
  assert.equal(by(monitor.fields, "Energía salida"), "Energizado");
  const rung = getOnlineMonitorReadout(frame.project, frame, "running",
    { kind: "rung", rungId: "rung-1" });
  assert.equal(by(rung.fields, "Resultado rung"), "Energizado");
  assert.equal(by(rung.fields, "Bobinas OTE"), "1");
  assert.equal(getOnlineMonitorReadout(p, frame, "running",
    { kind: "rung", rungId: "unknown" }), null);
});

test("empty output-side OR lane is reported as incomplete without pretending it conducts", () => {
  const p = createEmptyOutputBranch(twoContacts(), "rung-1");
  const readout = getOnlineMonitorReadout(p, null, "stopped",
    { kind: "branch", rungId: "rung-1", branchId: "output-or-1" });
  assert.equal(readout.label, "Rama de salida vacía");
  assert.match(readout.explanation, /bobina OTE/);
  assert.equal(readout.fields.length, 0);
});

test("pending input count excludes OTE-controlled outputs and only considers BOOL", () => {
  let p = twoContacts();
  p = setTagValue(p, "Start_PB", true);
  const frame = evaluateSeriesScan(p);
  p = setTagValue(frame.project, "Start_PB", false);
  p = setTagValue(p, "Motor_Run", false);
  assert.deepEqual(getPendingScanInputs(p, frame), ["Start_PB"]);
});
