import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, createTag, editTag, deleteTag, setTagValue, insertInstruction,
  defaultTagValue, TAG_TYPES, INT_MIN, INT_MAX, MAX_STRING_LENGTH,
} from "../src/plc/practiceDocument.ts";
import {
  comparisonTagOptions, numericTagOptions, parseComparisonOperand,
  setComparisonOperand, compareValues, validateComparisonPair, numericOperandLabel,
} from "../src/plc/practiceCompare.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";

const literal = (value) => ({ mode: "literal", value });
const tag = (name) => ({ mode: "tag", tag: name });

function fixture(kind = "EQU") {
  let p = initialPracticeProject();
  p = createTag(p, "ModeA", "Estado actual", "STRING");
  p = createTag(p, "ModeB", "Estado deseado", "STRING");
  p = createTag(p, "Counter16", "Conteo", "INT");
  p = createTag(p, "Setpoint32", "Consigna", "DINT");
  p = insertInstruction(p, "rung-1", 0, { id: "cmp", kind, tag: "" });
  p = insertInstruction(p, "rung-1", 1, { id: "coil", kind: "OTE", tag: "Motor_Run" });
  return p;
}
function configured(kind, a, b) {
  let p = fixture(kind);
  p = setComparisonOperand(p, "cmp", "A", a);
  p = setComparisonOperand(p, "cmp", "B", b);
  return p;
}
const motor = (project) => project.tags.find((t) => t.name === "Motor_Run").value;

test("INT and STRING are offered and initialized correctly in Controller Tags", () => {
  assert.ok(TAG_TYPES.includes("INT"));
  assert.ok(TAG_TYPES.includes("STRING"));
  assert.equal(defaultTagValue("INT"), 0);
  assert.equal(defaultTagValue("STRING"), "");
  let p = initialPracticeProject();
  p = createTag(p, "Word", "word", "INT");
  p = createTag(p, "Text", "text", "STRING");
  assert.equal(p.tags.find((t) => t.name === "Word").type, "INT");
  assert.equal(p.tags.find((t) => t.name === "Text").value, "");
  p = setTagValue(p, "Word", INT_MIN);
  p = setTagValue(p, "Text", "MODO MANUAL");
  assert.equal(p.tags.find((t) => t.name === "Text").value, "MODO MANUAL");
  assert.equal(p.tags.find((t) => t.name === "Word").value, INT_MIN);
  p = setTagValue(p, "Word", INT_MAX);
  assert.equal(p.tags.find((t) => t.name === "Word").value, INT_MAX);
});

test("INT enforces signed 16-bit bounds and rejects fractional numeric entries", () => {
  let p = createTag(initialPracticeProject(), "Small", "", "INT");
  for (const n of [INT_MIN - 1, INT_MAX + 1, 2.25, NaN, Infinity]) {
    assert.throws(() => setTagValue(p, "Small", n), /INT|numérico/);
  }
  assert.equal(p.tags.find((t) => t.name === "Small").value, 0);
});

test("STRING permits empty values, Unicode and spaces, but not non-strings or overly long text", () => {
  let p = createTag(initialPracticeProject(), "Message", "", "STRING");
  p = setTagValue(p, "Message", "Arranque correcto");
  assert.equal(p.tags.find((t) => t.name === "Message").value, "Arranque correcto");
  p = setTagValue(p, "Message", "");
  assert.equal(p.tags.find((t) => t.name === "Message").value, "");
  assert.throws(() => setTagValue(p, "Message", 4), /STRING/);
  assert.throws(() => setTagValue(p, "Message", "a".repeat(MAX_STRING_LENGTH + 1)), /STRING/);
});

test("numeric options include INT; STRING options exist only in EQU/NEQ", () => {
  const tags = fixture().tags;
  assert.ok(numericTagOptions(tags).some((t) => t.name === "Counter16"));
  assert.ok(!numericTagOptions(tags).some((t) => t.name === "ModeA"));
  assert.equal(comparisonTagOptions(tags, "EQU").find((t) => t.name === "ModeA").type, "STRING");
  assert.equal(comparisonTagOptions(tags, "NEQ").find((t) => t.name === "ModeB").type, "STRING");
  assert.equal(comparisonTagOptions(tags, "LES").some((t) => t.name === "ModeA"), false);
});

test("parse quoted STRING literals and preserve precise casing and escaped quotes", () => {
  const tags = fixture().tags;
  assert.deepEqual(parseComparisonOperand('"LISTO"', tags, "EQU"),
    { ok: true, operand: literal("LISTO") });
  assert.deepEqual(parseComparisonOperand('""', tags, "EQU"),
    { ok: true, operand: literal("") });
  assert.deepEqual(parseComparisonOperand('"Dijo \\"OK\\""', tags, "NEQ"),
    { ok: true, operand: literal('Dijo "OK"') });
  assert.deepEqual(parseComparisonOperand("modea", tags, "EQU"),
    { ok: true, operand: tag("ModeA") });
  assert.equal(numericOperandLabel(literal('Dijo "OK"')), '"Dijo \\"OK\\""');
  assert.equal(parseComparisonOperand('"texto"', tags, "GRT").ok, false);
  assert.equal(parseComparisonOperand('"sin cerrar', tags, "EQU").ok, false);
  assert.equal(parseComparisonOperand("NoExiste", tags, "EQU").ok, false);
});

test("EQU accepts STRING equality case-sensitively (tag-tag and literal-tag)", () => {
  let p = configured("EQU", tag("ModeA"), tag("ModeB"));
  p = setTagValue(p, "ModeA", "ACTIVO");
  p = setTagValue(p, "ModeB", "ACTIVO");
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(evaluateSeriesScan(p).instructionFlow.cmp.condition, true);
  assert.equal(motor(evaluateSeriesScan(p).project), true);
  p = setTagValue(p, "ModeB", "activo");
  assert.equal(motor(evaluateSeriesScan(p).project), false);
  p = configured("EQU", tag("ModeA"), literal("LISTO"));
  p = setTagValue(p, "ModeA", "LISTO");
  assert.equal(motor(evaluateSeriesScan(p).project), true);
});

test("NEQ accepts two strings or a quoted literal and remains case-sensitive", () => {
  let p = configured("NEQ", literal("LISTO"), tag("ModeB"));
  p = setTagValue(p, "ModeB", "PAUSA");
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(motor(evaluateSeriesScan(p).project), true);
  p = setTagValue(p, "ModeB", "LISTO");
  assert.equal(motor(evaluateSeriesScan(p).project), false);
  assert.equal(compareValues("NEQ", "", "x"), true);
});

test("EQU supports INT-INT and INT-DINT numeric equality; LES supports INT", () => {
  let p = configured("EQU", tag("Counter16"), tag("Setpoint32"));
  p = setTagValue(p, "Counter16", -120);
  p = setTagValue(p, "Setpoint32", -120);
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(motor(evaluateSeriesScan(p).project), true);
  p = configured("LES", tag("Counter16"), literal(0));
  p = setTagValue(p, "Counter16", -120);
  assert.equal(buildPracticeProject(p).success, true);
  assert.equal(motor(evaluateSeriesScan(p).project), true);
});

test("Build rejects STRING mixed with numbers and numeric-only operators reject STRING", () => {
  const p = configured("EQU", tag("ModeA"), literal(1));
  assert.equal(buildPracticeProject(p).success, false);
  assert.ok(buildPracticeProject(p).diagnostics.some((d) => d.code === "INCOMPATIBLE_COMPARE_TYPES"));
  assert.ok(validateComparisonPair(p.tags, "EQU", tag("ModeA"), literal(3)));
  assert.throws(() => evaluateSeriesScan(p), /STRING/);
  assert.throws(() => setComparisonOperand(fixture("GRT"), "cmp", "A", tag("ModeA")), /DINT\/REAL/);
  assert.throws(() => setComparisonOperand(fixture("GEQ"), "cmp", "A", literal("LISTO")), /numérico/);
  assert.throws(() => compareValues("GRT", "a", "b"), /STRING/);
});

test("updating STRING values does not require a rebuild; rename preserves references", () => {
  let p = configured("EQU", tag("ModeA"), tag("ModeB"));
  const signature = getPracticeBuildSignature(p);
  p = setTagValue(p, "ModeA", "REPOSO");
  p = setTagValue(p, "ModeB", "REPOSO");
  assert.equal(getPracticeBuildSignature(p), signature);
  assert.equal(motor(evaluateSeriesScan(p).project), true);
  p = editTag(p, "ModeA", { name: "ModeActual" });
  assert.equal(p.rungs[0].instructions[0].compareA.tag, "ModeActual");
  assert.equal(buildPracticeProject(p).success, true);
  assert.throws(() => deleteTag(p, "ModeActual"), /utilizado/);
  assert.throws(() => editTag(p, "ModeActual", { type: "INT" }), /utilizado/);
});
