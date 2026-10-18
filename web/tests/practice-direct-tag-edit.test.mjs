import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialTankProject, createTankExampleProject } from "../src/plc/tankSceneModel.ts";
import {
  changeInstructionTag, findInstruction,
  createRung, insertInstruction,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const source=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Studio-style direct edit changes only TIMER.TT to TIMER.DN on a XIC contact",()=>{
  let p=createTankExampleProject();
  p=createRung(p,"inline-test");
  p=insertInstruction(p,"inline-test",0,{id:"edit-me",kind:"XIC",tag:"TMR_Mixing.TT"});
  p=insertInstruction(p,"inline-test",1,{id:"out",kind:"OTE",tag:"DO_Mixer"});
  const before=p.rungs.find(r=>r.id==="inline-test");
  const updated=changeInstructionTag(p,"edit-me","TMR_Mixing.DN");
  assert.equal(findInstruction(updated,"edit-me").instruction.tag,"TMR_Mixing.DN");
  assert.equal(findInstruction(p,"edit-me").instruction.tag,"TMR_Mixing.TT",
    "the original immutable project must not change");
  assert.deepEqual(updated.rungs.find(r=>r.id==="inline-test").instructions
    .filter(i=>i.id==="out"),before.instructions.filter(i=>i.id==="out"));
  assert.equal(buildPracticeProject(updated).success,true);
});

test("invalid direct edits are rejected without changing assigned Ladder operands",()=>{
  const p=createTankExampleProject();
  const contact=p.rungs.flatMap(r=>r.instructions).find(i=>i.kind==="XIC"&&i.tag==="TMR_StartDelay.DN");
  assert.ok(contact);
  for(const invalid of ["TMR_StartDelay.TN","TMR_StartDelay.ACC","TMR_StartDelay","NoExistingTag.DN","TMR_StartDelay.DN.X"]) {
    assert.throws(()=>changeInstructionTag(p,contact.id,invalid));
    assert.equal(findInstruction(p,contact.id).instruction.tag,"TMR_StartDelay.DN");
  }
  // The same editing rules apply to OR branch contacts.
  const branch=p.rungs.flatMap(r=>r.parallelBranches??[])
    .flatMap(b=>b.instructions).find(i=>i.kind==="XIC");
  assert.ok(branch);
  const replacement=changeInstructionTag(p,branch.id,"ST_ToMix");
  assert.equal(findInstruction(replacement,branch.id).instruction.tag,"ST_ToMix");
  assert.equal(findInstruction(p,branch.id).instruction.tag,branch.tag);
});

test("single click edits assigned text; unassigned operands keep the quick picker",()=>{
  const editor=source("../src/components/ide/PracticeEditor.tsx");
  const picker=source("../src/components/ide/PracticeTagSelector.tsx");
  assert.match(editor,/item\.tag \? "edit" : "suggestions"/);
  assert.match(editor,/onDoubleClick=\{\(event\) => openTagSelector\(event, item\.id, "dialog"\)\}/);
  assert.match(editor,/onEdit=\{editSelectedTag\}/);
  assert.match(editor,/onBrowse=\{\(\) => setTagSelector/);
  assert.match(picker,/type TagSelectorMode = "suggestions" \| "dialog" \| "edit"/);
  assert.match(picker,/const \[draft, setDraft\] = useState\(selector\.currentTag\)/);
  assert.match(picker,/aria-label="Editar texto del tag existente"/);
  assert.match(picker,/setSelectionRange\(end, end\)/);
  assert.match(picker,/if \(event\.key === "Enter"\)/);
  assert.match(picker,/if \(event\.key === "Escape"\)/);
  assert.match(picker,/aria-label="Explorar variables disponibles"/);
  assert.match(picker,/role="alert"/);
});
