import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const editor = readFileSync(new URL("../src/components/ide/PracticeEditor.tsx", import.meta.url), "utf8");

test("independent OR is a structural wire, without a visible label or placeholder", () => {
  assert.ok(editor.includes("item.kind === OR_JUNCTION_KIND) return <g key={item.id} />"));
  assert.equal(editor.includes(">+ superior</text>"), false);
  assert.equal(editor.includes('fill="#1e40af">OR</text>'), false);
  assert.ok(editor.includes("contact.kind === OR_JUNCTION_KIND ? 0"),
    "the main conductor should not leave a gap for the hidden OR icon");
  assert.ok(editor.includes('title="Clic + instrucción: insertar en trayectoria superior del OR"'),
    "the interactive OR selection area remains present");
});

test("structured instructions keep a draggable header without visible grip dots", () => {
  assert.equal(editor.includes("<GripVertical size={15}"), false);
  assert.ok(editor.includes("data-ladder-drag-surface"));
  assert.ok(editor.includes("onDragStart={(event) => beginMove(event, item.id, item.kind)}"));
  assert.ok(editor.includes('className="absolute z-40 cursor-grab rounded border-0 bg-transparent'),
    "the drag surface must remain visually transparent");
});
