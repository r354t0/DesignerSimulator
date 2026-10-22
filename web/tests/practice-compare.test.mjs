import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, insertInstruction, createRung, createTag, createParallelBranch,
  addParallelContact, editTag, deleteTag, setTagValue, moveRung,
} from "../src/plc/practiceDocument.ts";
import {
  parseNumericOperand, numericTagOptions, setComparisonOperand, compareNumbers,
} from "../src/plc/practiceCompare.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { getWrappedRungLayout } from "../src/plc/ladderWrappedLayout.ts";
import { getPaletteCategory } from "../src/plc/instructionPalette.ts";
import { isEditableKind } from "../src/plc/ladderDragDrop.ts";

function fixture(kind = "EQU") {
  let p = initialPracticeProject();
  p = createTag(p, "Measure", "Medición REAL", "REAL");
  p = createTag(p, "Setpoint", "Consigna DINT", "DINT");
  p = insertInstruction(p, "rung-1", 0, { id: "enable", kind: "XIC", tag: "Start_PB" });
  p = insertInstruction(p, "rung-1", 1, { id: "cmp", kind, tag: "" });
  p = insertInstruction(p, "rung-1", 2, { id: "motor", kind: "OTE", tag: "Motor_Run" });
  return p;
}
const literal = (value) => ({ mode: "literal", value });
const tag = (name) => ({ mode: "tag", tag: name });
const configured = (kind, a, b) => {
  let p = fixture(kind);
  p = setComparisonOperand(p, "cmp", "A", a);
  p = setComparisonOperand(p, "cmp", "B", b);
  return p;
};
const output = (p) => p.tags.find((t) => t.name === "Motor_Run").value;

test("six compare instructions are draggable contact instructions, not output coils", () => {
  const kinds = ["EQU", "NEQ", "LES", "LEQ", "GRT", "GEQ"];
  assert.deepEqual(getPaletteCategory("compare").tools.filter((t) => t.editable).map((t) => t.id), kinds);
  for (const kind of kinds) assert.equal(isEditableKind(kind), true, kind);
});

test("literal and numeric-tag selector rejects arbitrary strings, BOOL and non-finite numbers", () => {
  let p = fixture();
  p = createTag(p, "Seconds", "", "TIMER");
  p = createTag(p, "Units", "", "COUNTER");
  const tags = numericTagOptions(p.tags).map((v) => v.name);
  for (const name of ["Measure", "Setpoint", "Seconds.PRE", "Seconds.ACC", "Units.PRE", "Units.ACC"]) {
    assert.ok(tags.includes(name), name);
  }
  assert.ok(!tags.includes("Start_PB"));
  assert.deepEqual(parseNumericOperand("-.5", p.tags), { ok: true, operand: literal(-0.5) });
  assert.deepEqual(parseNumericOperand("1e2", p.tags), { ok: true, operand: literal(100) });
  assert.deepEqual(parseNumericOperand("measure", p.tags), { ok: true, operand: tag("Measure") });
  assert.deepEqual(parseNumericOperand("units.acc", p.tags), { ok: true, operand: tag("Units.ACC") });
  for (const bad of ["", "true", "Start_PB", "Measure + 1", "Infinity", "1e5000"]) {
    assert.equal(parseNumericOperand(bad, p.tags).ok, false, bad);
  }
});

test("Build reports missing Source A/B and missing numeric declarations", () => {
  const p = fixture();
  const invalid = buildPracticeProject(p);
  assert.equal(invalid.success, false);
  assert.equal(invalid.diagnostics.filter((d) => d.code === "INVALID_COMPARE_OPERAND").length, 2);
  assert.throws(() => setComparisonOperand(p, "cmp", "A", tag("Start_PB")), /DINT\/REAL/);
  assert.throws(() => setComparisonOperand(p, "cmp", "B", tag("Missing")), /DINT\/REAL/);
  assert.throws(() => setComparisonOperand(p, "motor", "A", literal(5)), /comparación/);
});

test("all comparison operators evaluate their numeric conditions per scan", () => {
  const cases = [
    ["EQU", 2, 2, true], ["EQU", 2, 3, false],
    ["NEQ", 2, 3, true], ["NEQ", 2, 2, false],
    ["LES", -3, 1, true], ["LES", 2, 2, false],
    ["LEQ", 2, 2, true], ["LEQ", 3, 2, false],
    ["GRT", 3, 2, true], ["GRT", 2, 2, false],
    ["GEQ", 2, 2, true], ["GEQ", 1, 2, false],
  ];
  for (const [kind, a, b, result] of cases) {
    const p = setTagValue(configured(kind, literal(a), literal(b)), "Start_PB", true);
    assert.equal(buildPracticeProject(p).success, true, kind);
    const scan = evaluateSeriesScan(p);
    assert.equal(scan.instructionFlow.cmp.condition, result, kind);
    assert.equal(scan.instructionFlow.cmp.value, result, kind);
    assert.equal(scan.instructionFlow.cmp.powerOut, result, kind);
    assert.equal(output(scan.project), result, kind);
  }
});

test("true comparison with false upstream XIC does not energize output", () => {
  const p = configured("EQU", literal(1), literal(1));
  const scan = evaluateSeriesScan(p);
  assert.equal(scan.instructionFlow.cmp.condition, true);
  assert.equal(scan.instructionFlow.cmp.powerIn, false);
  assert.equal(scan.instructionFlow.cmp.powerOut, false);
  assert.equal(output(scan.project), false);
});

test("tag values are read at every scan without making Build stale", () => {
  let p = configured("GRT", tag("Measure"), tag("Setpoint"));
  p = setTagValue(p, "Start_PB", true);
  p = setTagValue(p, "Setpoint", 7);
  const signature = getPracticeBuildSignature(p);
  p = setTagValue(p, "Measure", 7.5);
  assert.equal(getPracticeBuildSignature(p), signature);
  assert.equal(output(evaluateSeriesScan(p).project), true);
  p = setTagValue(p, "Measure", 5.5);
  assert.equal(output(evaluateSeriesScan(p).project), false);
  p = editTag(p, "Measure", { name: "MeasuredValue" });
  assert.equal(p.rungs[0].instructions[1].compareA.tag, "MeasuredValue");
  assert.equal(buildPracticeProject(p).success, true);
  assert.throws(() => deleteTag(p, "MeasuredValue"), /utilizado/);
  assert.throws(() => editTag(p, "MeasuredValue", { type: "BOOL" }), /utilizado/);
});

test("comparison operand config invalidates Build but does not lose instruction IDs", () => {
  const p = fixture("LES");
  const next = setComparisonOperand(p, "cmp", "A", literal(2));
  assert.notEqual(getPracticeBuildSignature(next), getPracticeBuildSignature(p));
  assert.equal(p.rungs[0].instructions[1].compareA, undefined);
  const after = setComparisonOperand(next, "cmp", "B", literal(3));
  assert.equal(after.rungs[0].instructions[1].id, "cmp");
  assert.equal(buildPracticeProject(after).success, true);
});

test("comparison works in OR lane and preserves source operands when rung moves", () => {
  let p = initialPracticeProject();
  p = createTag(p, "Pressure", "", "REAL");
  p = insertInstruction(p, "rung-1", 0, { id: "anchor", kind: "XIC", tag: "Stop_PB" });
  p = insertInstruction(p, "rung-1", 1, { id: "coil", kind: "OTE", tag: "Motor_Run" });
  p = createParallelBranch(p, "rung-1", "anchor");
  p = addParallelContact(p, "rung-1", "anchor", { id: "or-cmp", kind: "GEQ", tag: "" });
  p = setComparisonOperand(p, "or-cmp", "A", tag("Pressure"));
  p = setComparisonOperand(p, "or-cmp", "B", literal(10));
  p = setTagValue(p, "Pressure", 12);
  assert.equal(buildPracticeProject(p).success, true);
  const result = evaluateSeriesScan(p);
  assert.equal(result.instructionFlow["or-cmp"].condition, true);
  assert.equal(output(result.project), true);
  p = createRung(p, "rung-2");
  const moved = moveRung(p, "rung-1", "rung-2", "after");
  assert.equal(moved.rungs.at(-1).parallelBranches[0].instructions[0].compareB.value, 10);
});

test("compare blocks have a safe margin and do not overlap the next rung", () => {
  const p = fixture();
  const layout = getWrappedRungLayout(p.rungs[0], 760);
  assert.ok(layout.height >= layout.rows[0].mainY + 41 + 18);
  const withBranch = { ...p.rungs[0], parallelBranches: [{
    id: "or1", anchorId: "enable", instructions: [{ id: "cmp-or", kind: "LES", tag: "" }],
  }] };
  const layoutOr = getWrappedRungLayout(withBranch, 760);
  const lane = layoutOr.groups[0].branchLanes[0];
  assert.ok(layoutOr.height >= lane.y + 41 + 18);
});
