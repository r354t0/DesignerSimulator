import test from "node:test";
import assert from "node:assert/strict";
import { createTag, initialPracticeProject, setTagValue } from "../src/plc/practiceDocument.ts";
import {
  getAssignableTimerPresetTags, parseTimerPresetInput,
} from "../src/plc/timerPresetInput.ts";

function tags() {
  let project = initialPracticeProject();
  project = createTag(project, "Delay_ms", "Consigna temporizador", "DINT");
  project = createTag(project, "Negative_ms", "Consigna inválida", "DINT");
  project = createTag(project, "RealValue", "No es DINT", "REAL");
  project = setTagValue(project, "Delay_ms", 350);
  project = setTagValue(project, "Negative_ms", -15);
  return project.tags;
}

test("PRE entry accepts a nonnegative integer literal including 0 and maximum DINT", () => {
  assert.deepEqual(parseTimerPresetInput(" 1250 ", tags()), {
    ok: true, preset: { mode: "literal", value: 1250 },
  });
  assert.deepEqual(parseTimerPresetInput("0", tags()), {
    ok: true, preset: { mode: "literal", value: 0 },
  });
  assert.deepEqual(parseTimerPresetInput("2147483647", tags()), {
    ok: true, preset: { mode: "literal", value: 2147483647 },
  });
});

test("PRE entry resolves DINTs by name, case-insensitively while preserving tag spelling", () => {
  assert.deepEqual(parseTimerPresetInput("delay_MS", tags()), {
    ok: true, preset: { mode: "tag", tag: "Delay_ms" },
  });
});

test("PRE entry rejects negative, fractional, overflowing and missing values", () => {
  for (const value of ["", " ", "-1", "1.5", "2147483648", "Unknown"]) {
    assert.equal(parseTimerPresetInput(value, tags()).ok, false, value);
  }
});

test("PRE entry prevents selection of non-DINT or DINT with invalid current preset", () => {
  const available = getAssignableTimerPresetTags(tags()).map((tag) => tag.name);
  assert.deepEqual(available, ["Delay_ms"]);
  assert.equal(parseTimerPresetInput("Start_PB", tags()).ok, false);
  assert.equal(parseTimerPresetInput("RealValue", tags()).ok, false);
  assert.equal(parseTimerPresetInput("Negative_ms", tags()).ok, false);
});
