import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import {
  initialPracticeProject, createRung, insertInstruction, createParallelBranch,
  addParallelContact, createTag, editTag, changeInstructionTag,
} from "../src/plc/practiceDocument.ts";

const xic = (id, tag = "Start_PB") => ({ id, kind: "XIC", tag });
const xio = (id, tag = "Stop_PB") => ({ id, kind: "XIO", tag });
const ote = (id, tag = "Motor_Run") => ({ id, kind: "OTE", tag });
const codes = (build) => build.diagnostics.map((d) => d.code);

test("a complete AND rung builds successfully without warnings", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("a"));
  project = insertInstruction(project, "rung-1", 1, xio("b"));
  project = insertInstruction(project, "rung-1", 2, ote("out"));
  const build = buildPracticeProject(project);
  assert.deepEqual(build, { success: true, errors: 0, warnings: 0, checkedRungs: 1, diagnostics: [] });
});

test("unassigned operands block Build and link to affected instruction", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("contact", ""));
  project = insertInstruction(project, "rung-1", 1, ote("out", ""));
  const result = buildPracticeProject(project);
  assert.equal(result.success, false);
  assert.equal(result.errors, 2);
  assert.equal(result.diagnostics.find((d) => d.instructionId === "contact")?.code, "MISSING_TAG");
  assert.equal(result.diagnostics.find((d) => d.instructionId === "out")?.rungId, "rung-1");
});

test("a missing or incompatible tag is an error, not an implicit declaration", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("input"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  project = createTag(project, "Counter", "Batch number", "DINT");
  // Bypass document editing checks to emulate corrupted imported projects:
  const broken = {
    ...project,
    rungs: project.rungs.map((rung) => ({
      ...rung,
      instructions: rung.instructions.map((item) => item.id === "input"
        ? { ...item, tag: "NotDeclared" }
        : { ...item, tag: "Counter" }),
    })),
  };
  const report = buildPracticeProject(broken);
  assert.deepEqual(codes(report), ["UNKNOWN_TAG", "INCOMPATIBLE_TAG"]);
  assert.equal(report.success, false);
});

test("empty OR is an error even when an otherwise complete rung exists", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("start"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  project = createParallelBranch(project, "rung-1", "start");
  const branchId = project.rungs[0].parallelBranches[0].id;
  let report = buildPracticeProject(project);
  assert.equal(report.success, false);
  assert.ok(codes(report).includes("EMPTY_OR_BRANCH"));
  assert.equal(report.diagnostics.find((d) => d.code === "EMPTY_OR_BRANCH")?.branchId, branchId);
  project = addParallelContact(project, "rung-1", "start", xio("or-contact"), 0, branchId);
  report = buildPracticeProject(project);
  assert.equal(report.success, true);
});

test("multiple OR lanes with serial contacts pass Build", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("a"));
  project = insertInstruction(project, "rung-1", 1, ote("motor"));
  project = createParallelBranch(project, "rung-1", "a");
  project = createParallelBranch(project, "rung-1", "a");
  const [b1, b2] = project.rungs[0].parallelBranches;
  project = addParallelContact(project, "rung-1", "a", xic("b1"), 0, b1.id);
  project = addParallelContact(project, "rung-1", "a", xio("b2"), 0, b2.id);
  assert.equal(buildPracticeProject(project).success, true);
});

test("empty rungs and missing OTE give warnings; no executable rung is a blocking error", () => {
  let project = initialPracticeProject();
  let report = buildPracticeProject(project);
  assert.ok(codes(report).includes("EMPTY_RUNG"));
  assert.ok(codes(report).includes("NO_EXECUTABLE_RUNG"));
  assert.equal(report.success, false);
  project = insertInstruction(project, "rung-1", 0, xic("only"));
  report = buildPracticeProject(project);
  assert.ok(codes(report).includes("NO_OUTPUT"));
  assert.ok(codes(report).includes("NO_EXECUTABLE_RUNG"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  project = createRung(project, "rung-2");
  report = buildPracticeProject(project);
  assert.equal(report.success, true, "Warnings must not block valid ladder");
  assert.equal(report.warnings, 1);
  assert.equal(report.diagnostics[0].rungIndex, 1);
});

test("an OTE without contacts is valid with an explicit warning", () => {
  const project = insertInstruction(initialPracticeProject(), "rung-1", 0, ote("out"));
  const report = buildPracticeProject(project);
  assert.equal(report.errors, 0);
  assert.deepEqual(codes(report), ["UNCONDITIONAL_OUTPUT"]);
});

test("duplicate OTE writers warn and parallel OTEs in the same rung are valid", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("c1"));
  project = insertInstruction(project, "rung-1", 1, ote("out1"));
  project = createRung(project, "rung-2");
  project = insertInstruction(project, "rung-2", 0, xio("c2"));
  project = insertInstruction(project, "rung-2", 1, ote("out2"));
  const warning = buildPracticeProject(project);
  assert.equal(warning.success, true);
  assert.deepEqual(codes(warning), ["DUPLICATE_OUTPUT"]);

  const malformed = { ...project, rungs: project.rungs.map((rung) =>
    rung.id === "rung-2" ? { ...rung, instructions: [
      ...rung.instructions, ote("extra", "Lamp_Run"),
    ] } : rung) };
  assert.equal(buildPracticeProject(malformed).success, true);
});

test("constant output and illegally placed OTE fail verification", () => {
  let project = initialPracticeProject();
  project = editTag(project, "Motor_Run", { constant: true });
  project = insertInstruction(project, "rung-1", 0, xic("c"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  let report = buildPracticeProject(project);
  assert.ok(codes(report).includes("CONSTANT_OUTPUT"));
  assert.equal(report.success, false);

  const bad = { ...project, rungs: [{
    ...project.rungs[0],
    instructions: [ote("out"), xic("c")],
  }] };
  report = buildPracticeProject(bad);
  assert.ok(codes(report).includes("COIL_NOT_LAST"));
});

test("invalid branch anchors, duplicate instruction IDs and unsupported opcodes fail", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("start"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  project = createParallelBranch(project, "rung-1", "start");
  const malformed = {
    ...project,
    rungs: [{
      ...project.rungs[0],
      parallelBranches: [{
        ...project.rungs[0].parallelBranches[0],
        anchorId: "missing-anchor",
        instructions: [ { id: "start", kind: "XIC", tag: "Stop_PB" },
          { id: "unsupported", kind: "EQU", tag: "Start_PB" } ],
      }],
    }],
  };
  const report = buildPracticeProject(malformed);
  for (const code of ["INVALID_BRANCH_ANCHOR", "DUPLICATE_INSTRUCTION", "UNSUPPORTED_INSTRUCTION"]) {
    assert.ok(codes(report).includes(code), code);
  }
});

test("verifier is pure and deterministic, preserving all tag values", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("start"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  const before = structuredClone(project);
  assert.deepEqual(buildPracticeProject(project), buildPracticeProject(project));
  assert.deepEqual(project, before);
});

test("renamed tags resolve in Build without stale references", () => {
  let project = initialPracticeProject();
  project = insertInstruction(project, "rung-1", 0, xic("start"));
  project = insertInstruction(project, "rung-1", 1, ote("out"));
  project = editTag(project, "Start_PB", { name: "PB_Start" });
  project = changeInstructionTag(project, "start", "PB_Start");
  assert.equal(buildPracticeProject(project).success, true);
});
