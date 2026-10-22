import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialPracticeProject, createTag, createRung, insertInstruction, deleteTag,
  setInstructionPreset,
} from "../src/plc/practiceDocument.ts";
import { findTagReferences, matchesTagReference } from "../src/plc/practiceCrossReference.ts";
import { createTankExampleProject } from "../src/plc/tankSceneModel.ts";
import { createIndependentParallelBranch, addParallelContact } from "../src/plc/practiceDocument.ts";

const view=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Cross Reference locates all uses of a tag and its structured members",()=>{
  const project=createTankExampleProject();
  const base=findTagReferences(project,"TMR_Mixing");
  const done=findTagReferences(project,"TMR_Mixing.DN");
  assert.ok(base.length>=2);
  assert.ok(done.length>=1);
  assert.ok(done.every(x=>x.operand==="TMR_Mixing.DN"));
  assert.ok(base.some(x=>x.instructionKind==="TON"));
  assert.ok(base.some(x=>x.instructionKind==="XIC"||x.instructionKind==="XIO"));
  assert.deepEqual(findTagReferences(project,"NoExiste"),[]);
  assert.equal(matchesTagReference("TMR_Mixing","TMR_Mixing.DN"),true);
  assert.equal(matchesTagReference("TMR_Mixing.DN","TMR_Mixing.TT"),false);
});

test("Cross Reference identifies OR branches and DINT-based timer presets",()=>{
  let p=initialPracticeProject();
  p=createTag(p,"TEST_Bool","Booleano","BOOL");
  p=createTag(p,"TEST_Pre","Consigna","DINT");
  p=createTag(p,"TEST_Timer","Temporizador","TIMER");
  p=createRung(p,"cross-branch");
  p=insertInstruction(p,"cross-branch",0,{id:"cross-out",kind:"OTE",tag:"TEST_Bool"});
  p=createIndependentParallelBranch(p,"cross-branch");
  const junction=p.rungs.find(r=>r.id==="cross-branch").instructions.find(i=>i.kind==="OR_JUNCTION").id;
  p=addParallelContact(p,"cross-branch",junction,
    {id:"cross-contact",kind:"XIC",tag:"TEST_Bool"});
  const branches=findTagReferences(p,"TEST_Bool");
  assert.ok(branches.some(x=>x.lane==="parallel"&&x.instructionId==="cross-contact"));
  assert.ok(branches.some(x=>x.lane==="main"&&x.instructionId==="cross-out"));
  p=createRung(p,"cross-pre");
  p=insertInstruction(p,"cross-pre",0,{id:"cross-ton",kind:"TON",tag:"TEST_Timer"});
  p=setInstructionPreset(p,"cross-ton",{mode:"tag",tag:"TEST_Pre"});
  const presets=findTagReferences(p,"TEST_Pre");
  assert.deepEqual(presets.map(x=>x.usage),["PRE"]);
  assert.equal(presets[0].rungId,"cross-pre");
});

test("Delete is confirmed and cannot remove a tag used in any rung",()=>{
  const p=createTankExampleProject();
  assert.throws(()=>deleteTag(p,"TMR_Mixing"),/utilizado en Ladder/);
  const candidate=createTag(p,"TEMP_Aux","Tag sin referencias","BOOL");
  const next=deleteTag(candidate,"TEMP_Aux");
  assert.equal(next.tags.some(t=>t.name==="TEMP_Aux"),false);
  assert.equal(candidate.tags.some(t=>t.name==="TEMP_Aux"),true);
});

test("context menus provide Cross Reference and Controller Tags supports Supr",()=>{
  const controller=view("../src/components/ide/ControllerTags.tsx");
  const editor=view("../src/components/ide/PracticeEditor.tsx");
  const app=view("../src/App.tsx");
  const cross=view("../src/components/ide/CrossReferencePanel.tsx");
  assert.match(controller,/onContextMenu=\{event => openTagContext/);
  assert.match(controller,/handleTagTableKeyDown/);
  assert.match(controller,/event\.key !== "Delete"/);
  assert.match(controller,/deleteSelectedTag\(selectedTag\)/);
  assert.match(controller,/window\.confirm\("¿Eliminar el tag "/);
  assert.match(controller,/onCrossReference\(contextMenu\.tag\)/);
  assert.match(editor,/onCrossReference\(currentBitMenuTarget\.tagName\)/);
  assert.match(editor,/navigateToReference/);
  assert.match(app,/CrossReferencePanel/);
  assert.match(cross,/findTagReferences\(project, tag\)/);
  assert.match(cross,/onNavigate\(ref\)/);
});

test("SCADA preserves original dark background and contrast in all four scenes",()=>{
  const css=view("../src/workspace.css");
  assert.match(css,/\.sort-scada-shell \{\s*background:[\s\S]*?#0b1823;/);
  assert.match(css,/\.sort-panel \{\s*background: linear-gradient\(145deg, #192c3b 0%, #12212e 100%\)/);
  assert.doesNotMatch(css,/Neutral light HMI palette|\.sort-scada-shell\s*\{\s*background: #c0c0c0/);
  for(const name of ["Conveyor","Sort","Tank","Traffic"]){
    const scene=view("../src/components/ide/"+name+"Scene.tsx");
    assert.match(scene,/sort-scada-shell scada-control-shell/);
    assert.match(scene,/sort-panel/);
  }
});
