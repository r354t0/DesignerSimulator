import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, createTag, createRung, insertInstruction,
  setTagValue, defaultTagValue,
} from "../src/plc/practiceDocument.ts";
import { evaluateSeriesScan, prescanBitInstructions } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { getTagPickerRows } from "../src/plc/practiceTagPicker.ts";

const counter = (project, name = "Count_01") =>
  project.tags.find((tag) => tag.name === name).value;

function fixture(kind = "CTU", preset = 2, accumulated = 0) {
  let project = initialPracticeProject();
  project = createTag(project, "Count_01", "Número de piezas", "COUNTER");
  project = setTagValue(project, "Count_01", preset, "PRE");
  project = setTagValue(project, "Count_01", accumulated, "ACC");
  project = insertInstruction(project, "rung-1", 0,
    { id: "input", kind: "XIC", tag: "Start_PB" });
  project = insertInstruction(project, "rung-1", 1,
    { id: "counter", kind, tag: "Count_01" });
  return project;
}
const withInput = (project, value) => setTagValue(project, "Start_PB", value);
const scan = (project) => evaluateSeriesScan(project).project;

test("new COUNTER defaults to signed PRE/ACC and five BOOL status members", () => {
  assert.deepEqual(defaultTagValue("COUNTER"), {
    PRE: 0, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false,
  });
});

test("CTU increments once per rising edge and does not double-count a held input", () => {
  let p = fixture("CTU", 2);
  assert.equal(buildPracticeProject(p).success, true);
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, 1);
  assert.equal(counter(p).CU, true);
  assert.equal(counter(p).DN, false);
  p = scan(p);
  assert.equal(counter(p).ACC, 1);
  p = scan(withInput(p, false));
  assert.equal(counter(p).CU, false);
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, 2);
  assert.equal(counter(p).DN, true);
});

test("CTD decrements on rising edges and DONE follows ACC >= PRE", () => {
  let p = fixture("CTD", 1, 2);
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, 1);
  assert.equal(counter(p).DN, true);
  p = scan(p);
  assert.equal(counter(p).ACC, 1);
  p = scan(withInput(p, false));
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, 0);
  assert.equal(counter(p).DN, false);
  assert.equal(counter(p).CD, true);
});

test("prescan arms CU/CD so held inputs do not produce spurious first pulses", () => {
  let p = fixture("CTU", 3);
  p = prescanBitInstructions(p);
  assert.equal(counter(p).CU, true);
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, 0);
  p = scan(withInput(p, false));
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, 1);
});

test("COUNTER is retentive across unpowered scans; RES clears ACC and flags", () => {
  let p = fixture("CTU", 1, 2);
  p = createRung(p, "reset-rung");
  p = insertInstruction(p, "reset-rung", 0, {
    id: "reset-contact", kind: "XIC", tag: "Stop_PB",
  });
  p = insertInstruction(p, "reset-rung", 1, {
    id: "res", kind: "RES", tag: "Count_01",
  });
  assert.equal(buildPracticeProject(p).success, true);
  p = scan(withInput(p, false));
  assert.equal(counter(p).ACC, 2);
  p = scan(setTagValue(p, "Stop_PB", true));
  assert.deepEqual(counter(p), {
    PRE: 1, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false,
  });
});

test("CU/CD overflow and underflow wrap DINT and latch OV/UN", () => {
  let p = fixture("CTU", 1, 2147483647);
  p = scan(withInput(p, true));
  assert.equal(counter(p).ACC, -2147483648);
  assert.equal(counter(p).OV, true);
  assert.equal(counter(p).DN, false);
  let q = fixture("CTD", 1, -2147483648);
  q = scan(withInput(q, true));
  assert.equal(counter(q).ACC, 2147483647);
  assert.equal(counter(q).UN, true);
  assert.equal(counter(q).DN, true);
});

test("COUNTER status members are readable by XIC/XIO but not writable by OTE", () => {
  const p = fixture();
  const expanded = getTagPickerRows(p.tags, "XIC", "", ["Count_01"])
    .filter((row) => row.depth === 1);
  assert.deepEqual(expanded.map((row) => row.name), [
    "Count_01.PRE", "Count_01.ACC", "Count_01.CU", "Count_01.CD",
    "Count_01.DN", "Count_01.OV", "Count_01.UN",
  ]);
  assert.deepEqual(expanded.filter((row) => row.selectable).map((row) => row.name),
    ["Count_01.CU", "Count_01.CD", "Count_01.DN", "Count_01.OV", "Count_01.UN"]);
  const root = getTagPickerRows(p.tags, "CTU", "").find((item) => item.name === "Count_01");
  assert.equal(root?.selectable, true);
  assert.equal(getTagPickerRows(p.tags, "RES", "").find((item) => item.name === "Count_01")?.selectable, true);
  assert.throws(() => insertInstruction(p, "rung-1", 2, {
    id: "write", kind: "OTE", tag: "Count_01.DN",
  }), /BOOL/);
});

test("Build rejects invalid COUNTER operand/type and malformed COUNTER values", () => {
  let p = initialPracticeProject();
  p = insertInstruction(p, "rung-1", 0, {
    id: "bad", kind: "CTU", tag: "Start_PB",
  });
  assert.ok(buildPracticeProject(p).diagnostics.some((d) => d.code === "INCOMPATIBLE_TAG"));
  const broken = fixture("CTU");
  const modified = {
    ...broken, tags: broken.tags.map((tag) => tag.name === "Count_01"
      ? { ...tag, value: { ...tag.value, PRE: 1.7 } } : tag),
  };
  assert.ok(buildPracticeProject(modified).diagnostics.some((d) => d.code === "INVALID_COUNTER_STATE"));
});
