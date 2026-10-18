import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTagPickerRows } from "../src/plc/practiceTagPicker.ts";
import { initialTrafficProject } from "../src/plc/trafficSceneModel.ts";
import { initialTankProject } from "../src/plc/tankSceneModel.ts";

const selectorSource = readFileSync(
  new URL("../src/components/ide/PracticeTagSelector.tsx", import.meta.url), "utf8",
);

test("the quick Ladder tag selector never truncates suggestions at eight entries", () => {
  assert.match(selectorSource, /const shown = rows;/);
  assert.doesNotMatch(selectorSource, /rows\.slice\(0,\s*8\)/);
  assert.match(selectorSource, /max-h-\[250px\] overflow-y-auto/);
  assert.match(selectorSource, /Desplázate para ver todas/);
  assert.match(selectorSource, /data-tag-picker-active=/);
  assert.match(selectorSource, /scrollIntoView\(\{ block: "nearest" \}\)/);
});

test("large scene-4 tag list can be browsed without typing any search text", () => {
  const project = initialTrafficProject();
  for (const kind of ["XIC", "XIO", "OTE", "OTL", "OTU"]) {
    const rows = getTagPickerRows(project.tags, kind, "");
    const relevant = project.tags.filter(t => t.type === "BOOL");
    assert.ok(rows.length > 8, kind + " should have many options");
    assert.equal(rows.filter(row => row.selectable).length, relevant.length,
      kind + " must expose ALL BOOL tags without losing additional structured parents");
    assert.ok(rows.some(row => row.name === "Tr_EWWaiting" && row.selectable));
    assert.ok(rows.some(row => row.name === "Tr_Walk" && row.selectable));
  }
  assert.equal(getTagPickerRows(project.tags, "TON", "").length, 7);
  assert.equal(getTagPickerRows(project.tags, "CTU", "").length, 2);
});

test("timer members remain browsable and searching still filters compatible tags", () => {
  const project = initialTankProject();
  const collapsed = getTagPickerRows(project.tags, "XIC", "");
  assert.ok(collapsed.find(row => row.name === "Tank_TMix" && row.expandable));
  const expanded = getTagPickerRows(project.tags, "XIC", "", ["Tank_TMix"]);
  assert.ok(expanded.find(row => row.name === "Tank_TMix.DN" && row.selectable));
  assert.ok(expanded.find(row => row.name === "Tank_TMix.ACC" && !row.selectable));
  const searched = getTagPickerRows(project.tags, "XIC", "Tank_MixStage");
  assert.deepEqual(searched.map(row => row.name), ["Tank_MixStage"]);
});
