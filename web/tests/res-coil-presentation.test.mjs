import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createTag, initialPracticeProject, insertInstruction, setTagValue,
  setInstructionPreset,
} from "../src/plc/practiceDocument.ts";
import { getWrappedRungLayout } from "../src/plc/ladderWrappedLayout.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { createConveyorExampleProject } from "../src/plc/conveyorSceneModel.ts";

const symbols = readFileSync(new URL("../src/components/ide/LadderSymbols.tsx",import.meta.url),"utf8");
const editor = readFileSync(new URL("../src/components/ide/PracticeEditor.tsx",import.meta.url),"utf8");
const layoutSource = readFileSync(new URL("../src/plc/ladderWrappedLayout.ts",import.meta.url),"utf8");

function resetRung(kind) {
  let p = initialPracticeProject();
  p = createTag(p, "Accumulator", "Elemento a reiniciar", kind);
  p = insertInstruction(p,"rung-1",0,{id:"enable",kind:"XIC",tag:"Start_PB"});
  p = insertInstruction(p,"rung-1",1,{id:"reset",kind:"RES",tag:"Accumulator"});
  return p;
}

test("RES palette is the literal '(RES)' inline between two wire segments, not a rectangle",()=>{
  assert.match(symbols,/kind === "RES" \? \(\s*<path d="M4 25H23 M69 25H88"/);
  assert.match(symbols,/\{kind === "RES" \? "\/RES\)"|kind === "RES" \? "\(RES\)"/);
  assert.match(symbols,/\{ id: "RES", label: "Reset Timer \/ Counter" \}/);
  const isBlock=symbols.match(/const isBlock = \[(.*?)\]\.includes\(kind\);/s)?.[1]??"";
  assert.doesNotMatch(isBlock,/"RES"/);
});

test("editable Ladder RES uses ResetCoil with centered (RES), a tag ABOVE and no PRE/ACC",()=>{
  const start=symbols.indexOf("export function ResetCoil({");
  const end=symbols.indexOf("Shared Ladder rail primitives",start);
  assert.ok(start>=0 && end>start);
  const symbol=symbols.slice(start,end);
  assert.match(symbol,/<text x=\{x\} y=\{y - 23\}/);
  assert.match(symbol,/\(RES\)/);
  assert.doesNotMatch(symbol,/\bPRE\b|\bACC\b|<rect x=\{x - 68\}/);
  assert.match(symbol,/selected && <SelectedInstructionFrame/);
  assert.match(symbol,/online && live/);
  assert.match(symbol,/<Wire x1=\{x - 24\}/);
  assert.match(symbol,/<Wire x1=\{x \+ 21\}/);
  assert.match(editor, /output\.kind === "RES" \? \(/);
  assert.match(editor, /<ResetCoil x=\{coilX\} y=\{coilRowY\}/);
  assert.match(editor, /comment=\{assignedTag\?\.description\}/);
  assert.match(editor, /labelWidth=\{96\}/);
  assert.match(editor, /isCounterKind\(output\.kind\) \? \(/);
  assert.match(editor, /\) : isTimerKind\(output\.kind\) \? \(/);
  assert.doesNotMatch(editor,/kind=\{output\.kind as "CTU" \| "CTD" \| "RES"\}/);
});

test("RES uses compact coil rung geometry for COUNTER and TIMER, not block clearance",()=>{
  let baseline=initialPracticeProject();
  baseline=insertInstruction(baseline,"rung-1",0,
    {id:"output",kind:"OTE",tag:"Motor_Run"});
  const base=getWrappedRungLayout(baseline.rungs[0],760);
  for(const type of ["COUNTER","TIMER"]){
    const res=resetRung(type);
    const rendered=getWrappedRungLayout(res.rungs[0],760);
    assert.equal(rendered.height,base.height,
      "RES must fit the standard compact rung height");
    assert.equal(rendered.outputYs[0],rendered.coilY);
    assert.equal(buildPracticeProject(res).success,true);
  }
  assert.match(layoutSource,/isTimerKind\(item\.kind\) && item\.kind !== "RES"/);
  assert.match(editor,/isTimerKind\(part\.kind\) && part\.kind !== "RES"/);
});

test("counter RES still clears ACC, DN and flags only on energized rung",()=>{
  let p=resetRung("COUNTER");
  p=setTagValue(p,"Accumulator",6,"PRE");
  p=setTagValue(p,"Accumulator",4,"ACC");
  p=setTagValue(p,"Accumulator",true,"CU");
  p=setTagValue(p,"Accumulator",true,"DN");
  const before=evaluateSeriesScan(p).project.tags.find(t=>t.name==="Accumulator").value;
  assert.equal(before.ACC,4);
  assert.equal(before.DN,true);
  p=setTagValue(p,"Start_PB",true);
  const after=evaluateSeriesScan(p).project.tags.find(t=>t.name==="Accumulator").value;
  assert.equal(after.ACC,0);
  assert.equal(after.CU,false);
  assert.equal(after.DN,false);
  assert.equal(after.PRE,6,"RES must not change the counter preset");
  assert.throws(()=>setInstructionPreset(p,"reset",{mode:"literal",value:5}),/Selecciona/);
});

test("timer RES still clears ACC, EN, TT and DN only with true rung",()=>{
  let p=resetRung("TIMER");
  p=setTagValue(p,"Accumulator",1200,"PRE");
  p=setTagValue(p,"Accumulator",600,"ACC");
  p=setTagValue(p,"Accumulator",true,"DN");
  p=setTagValue(p,"Accumulator",true,"TT");
  const before=evaluateSeriesScan(p).project.tags.find(t=>t.name==="Accumulator").value;
  assert.equal(before.ACC,600);
  p=setTagValue(p,"Start_PB",true);
  const after=evaluateSeriesScan(p).project.tags.find(t=>t.name==="Accumulator").value;
  assert.deepEqual(after,{PRE:1200,ACC:0,EN:false,TT:false,DN:false});
});

test("conveyor advanced template reset is same symbol and retains program behavior",()=>{
  const project=createConveyorExampleProject();
  const reset=project.rungs.find(r=>r.id==="cv-rung-reset").instructions.find(i=>i.kind==="RES");
  assert.equal(reset.tag,"CV_Count");
  assert.equal(buildPracticeProject(project).success,true);
});
