import test from "node:test";
import assert from "node:assert/strict";
import {
  getInstructionSelectionFrame,
  LADDER_SELECTION_BLUE,
} from "../src/plc/ladderSelection.ts";

test("contact and coil selection use one compact frame inside a 104px cell", () => {
  const frame = getInstructionSelectionFrame(1, 96);
  assert.equal(frame.width, 100);
  assert.equal(frame.left, -50);
  assert.equal(frame.top, -55);
  assert.equal(frame.height, 69);
  assert.equal(frame.tagTop, -37);
  assert.equal(frame.tagHeight, 18);
  assert.ok(frame.tagLeft >= frame.left);
  assert.ok(frame.tagLeft + frame.tagWidth <= frame.left + frame.width);
  assert.match(LADDER_SELECTION_BLUE, /^#[0-9a-f]{6}$/i);
});

test("selected frame fits zero, one and two-line comments without overlapping next cell", () => {
  const blank = getInstructionSelectionFrame(0, 96);
  const single = getInstructionSelectionFrame(1, 96);
  const double = getInstructionSelectionFrame(2, 96);
  assert.equal(blank.top, -40);
  assert.ok(single.top < blank.top);
  assert.ok(double.top < single.top);
  assert.equal(blank.height + blank.top, 14);
  assert.equal(double.height + double.top, 14);
  for (const frame of [blank, single, double]) {
    assert.ok(frame.width < 104);
    assert.equal(frame.tagTop, -37);
    assert.equal(frame.tagWidth, frame.width - 2);
  }
});

test("selection width is bounded even with atypically small or large tag labels", () => {
  assert.equal(getInstructionSelectionFrame(1, 40).width, 72);
  assert.equal(getInstructionSelectionFrame(1, 200).width, 100);
  assert.equal(getInstructionSelectionFrame(-1).top, -40);
  assert.equal(getInstructionSelectionFrame(99).top, -64);
});
