import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, createTag, insertInstruction, createRung,
  editTag, deleteTag, setTagValue, isOutputKind,
} from "../src/plc/practiceDocument.ts";
import {
  evaluateMath, convertMathResult, setMathSource, setMathDestination,
  mathDestinationOptions, validateMathDestination,
} from "../src/plc/practiceMath.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { getTagPickerRows } from "../src/plc/practiceTagPicker.ts";
import { getWrappedRungLayout } from "../src/plc/ladderWrappedLayout.ts";
import { getPaletteCategory } from "../src/plc/instructionPalette.ts";
import { isEditableKind } from "../src/plc/ladderDragDrop.ts";

const literal = (value) => ({ mode: "literal", value });
const tag = (name) => ({ mode: "tag", tag: name });
const value = (p, name) => p.tags.find((x) => x.name === name).value;
function fixture(kind = "ADD", destination = "Result", b = literal(2)) {
  let p = initialPracticeProject();
  p = createTag(p, "NumA", "", "INT");
  p = createTag(p, "NumB", "", "DINT");
  p = createTag(p, destination, "", "REAL");
  p = createTag(p, "IntResult", "", "INT");
  p = insertInstruction(p, "rung-1", 0, { id: "input", kind: "XIC", tag: "Start_PB" });
  p = insertInstruction(p, "rung-1", 1, { id: "math", kind, tag: "" });
  p = setMathDestination(p, "math", destination);
  p = setMathSource(p, "math", "A", literal(6));
  if (kind !== "MOV") p = setMathSource(p, "math", "B", b);
  return p;
}
const scan = p => evaluateSeriesScan(p).project;
test("five numeric operations are implemented as output instructions", () => {
  for (const kind of ["MOV", "ADD", "SUB", "MUL", "DIV"]) {
    assert.equal(isOutputKind(kind), true);
    assert.equal(isEditableKind(kind), true);
  }
  assert.deepEqual(getPaletteCategory("compute-math").tools.filter(t=>t.editable).map(t=>t.id),
    ["ADD","SUB","MUL","DIV"]);
  assert.deepEqual(getPaletteCategory("move-logical").tools.filter(t=>t.editable).map(t=>t.id), ["MOV"]);
});
test("MOV writes numeric source into Dest on true power, holds when disabled", () => {
  let p=fixture("MOV");
  assert.equal(buildPracticeProject(p).success,true);
  p=setTagValue(p,"Result",999);
  assert.equal(value(scan(p),"Result"),999);
  p=setTagValue(p,"Start_PB",true);
  assert.equal(value(scan(p),"Result"),6);
  assert.equal(evaluateSeriesScan(p).instructionFlow.math.powerOut,true);
});
test("ADD SUB MUL DIV evaluate with REAL results and correct signs", () => {
  for (const [kind,expected] of [["ADD",8],["SUB",4],["MUL",12],["DIV",3]]) {
    let p=fixture(kind);
    p=setTagValue(p,"Start_PB",true);
    assert.equal(buildPracticeProject(p).success,true,kind);
    assert.equal(value(scan(p),"Result"),expected,kind);
  }
});
test("source DINT/INT tags are read dynamically and updated scan by scan", () => {
  let p=fixture("MUL");
  p=setMathSource(p,"math","A",tag("NumA"));
  p=setMathSource(p,"math","B",tag("NumB"));
  p=setTagValue(p,"Start_PB",true);
  const signature=getPracticeBuildSignature(p);
  p=setTagValue(p,"NumA",-4);
  p=setTagValue(p,"NumB",5);
  assert.equal(getPracticeBuildSignature(p),signature);
  assert.equal(value(scan(p),"Result"),-20);
  p=setTagValue(p,"NumB",2);
  assert.equal(value(scan(p),"Result"),-8);
});
test("numeric destinations support REAL, INT, DINT; STRING/BOOL/constant forbidden", () => {
  const p=fixture("MOV");
  const opts=getTagPickerRows(p.tags,"MOV","").filter(x=>x.selectable).map(x=>x.name);
  assert.ok(opts.includes("NumA")&&opts.includes("NumB")&&opts.includes("IntResult"));
  assert.ok(!opts.includes("Start_PB"));
  assert.ok(mathDestinationOptions(p.tags).some(x=>x.name==="NumA"));
  assert.ok(validateMathDestination(p.tags,"Motor_Run"));
  assert.throws(()=>setMathDestination(p,"math","Motor_Run"),/Dest/);
  assert.throws(()=>setMathSource(p,"math","B",literal(1)),/MOV/);
  assert.throws(()=>setMathSource(p,"input","A",literal(1)),/MOV/);
});
test("integer Dest truncates toward zero and does not wrap out of bounds", () => {
  let p=fixture("DIV");
  p=setMathDestination(p,"math","IntResult");
  p=setTagValue(p,"Start_PB",true);
  assert.equal(value(scan(p),"IntResult"),3);
  p=setMathSource(p,"math","A",literal(-7));
  assert.equal(value(scan(p),"IntResult"),-3);
  p=setMathSource(p,"math","A",literal(900000));
  p=setTagValue(p,"IntResult",7);
  const frame=evaluateSeriesScan(p);
  assert.equal(frame.instructionFlow.math.value,false);
  assert.equal(value(frame.project,"IntResult"),7);
  assert.equal(convertMathResult({type:"DINT"},2147483648),null);
  assert.equal(convertMathResult({type:"REAL"},3.5),Math.fround(3.5));
});
test("DIV literal zero blocks Build, dynamic zero preserves destination", () => {
  let p=fixture("DIV", "Result", literal(0));
  assert.ok(buildPracticeProject(p).diagnostics.some(x=>x.code==="DIVISION_BY_ZERO"));
  p=setMathSource(p,"math","B",tag("NumB"));
  p=setTagValue(p,"Start_PB",true);
  p=setTagValue(p,"Result",17);
  let frame=evaluateSeriesScan(p);
  assert.equal(frame.instructionFlow.math.condition,false);
  assert.equal(value(frame.project,"Result"),17);
  p=setTagValue(p,"NumB",3);
  assert.equal(value(scan(p),"Result"),2);
  assert.equal(evaluateMath("DIV",6,0),null);
});
test("Build rejects missing Source, Dest and constant destination", () => {
  const p=fixture("ADD");
  const missing={...p,rungs:p.rungs.map(r=>({...r,instructions:r.instructions.map(i=>
    i.id==="math"?{...i,tag:"",compareA:undefined}:i)}))};
  const diag=buildPracticeProject(missing).diagnostics;
  assert.ok(diag.some(x=>x.code==="INVALID_MATH_DEST"));
  assert.ok(diag.some(x=>x.code==="INVALID_MATH_OPERAND"));
  let c=editTag(p,"Result",{constant:true});
  assert.ok(buildPracticeProject(c).diagnostics.some(x=>x.code==="INVALID_MATH_DEST"));
  assert.ok(validateMathDestination(c.tags,"Result"));
});
test("math source names survive renames; destination and source protect against deletion", () => {
  let p=fixture("ADD");
  p=setMathSource(p,"math","A",tag("NumA"));
  p=editTag(p,"NumA",{name:"Input16"});
  assert.equal(p.rungs[0].instructions[1].compareA.tag,"Input16");
  p=editTag(p,"Result",{name:"SumResult"});
  assert.equal(p.rungs[0].instructions[1].tag,"SumResult");
  assert.equal(buildPracticeProject(p).success,true);
  assert.throws(()=>deleteTag(p,"Input16"),/utilizado/);
  assert.throws(()=>deleteTag(p,"SumResult"),/utilizado/);
});
test("sequential math rungs and compare observe earlier numeric writes in same scan", () => {
  let p=fixture("MOV");
  p=createRung(p,"rung-2");
  p=insertInstruction(p,"rung-2",0,{id:"compare",kind:"EQU",tag:"",
    compareA:tag("Result"),compareB:literal(6)});
  p=insertInstruction(p,"rung-2",1,{id:"coil",kind:"OTE",tag:"Motor_Run"});
  p=setTagValue(p,"Start_PB",true);
  assert.equal(buildPracticeProject(p).success,true);
  const frame=evaluateSeriesScan(p);
  assert.equal(frame.instructionFlow.compare.condition,true);
  assert.equal(value(frame.project,"Motor_Run"),true);
});
test("math block last row has enough room for Source, Dest and OR output lanes", () => {
  for(const kind of ["MOV","ADD","DIV"]) {
    const p=fixture(kind);
    const layout=getWrappedRungLayout(p.rungs[0],760);
    assert.ok(layout.height>=layout.outputYs.at(-1)+(kind==="MOV"?46:61)+15,kind);
  }
});
