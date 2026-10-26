import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createTag, initialPracticeProject, insertInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import {
  mathDestinationOptions, setMathSource, setMathDestination, convertMathResult,
} from "../src/plc/practiceMath.ts";
import { numericTagOptions } from "../src/plc/practiceCompare.ts";
import { getTagPickerRows } from "../src/plc/practiceTagPicker.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const names = rows => rows.map(t => t.name);
const tag = name => ({mode:"tag",tag:name});
function createMath(kind) {
  let p=initialPracticeProject();
  for(const [name,type,value] of [
    ["SourceInt","INT",18], ["SecondInt","INT",3],
    ["SourceDint","DINT",7], ["SecondDint","DINT",2],
    ["DestInt","INT",0], ["DestDint","DINT",0],
    ["ConstantDest","DINT",0],
  ]) {
    p=createTag(p,name,"Tipo "+type,type);
    p=setTagValue(p,name,value);
  }
  p=insertInstruction(p,"rung-1",0,{id:"enable",kind:"XIC",tag:"Start_PB"});
  p=insertInstruction(p,"rung-1",1,{id:"math",kind,tag:""});
  p=setTagValue(p,"Start_PB",true);
  return p;
}

for(const kind of ["MOV","ADD","SUB","MUL","DIV"]){
  const scenarios=[
    ["INT a DINT","SourceInt",null,"DestDint",
      kind==="MOV" ? 18 : {ADD:20,SUB:16,MUL:36,DIV:9}[kind]],
    ["DINT a INT","SourceDint",null,"DestInt",
      kind==="MOV" ? 7 : {ADD:9,SUB:5,MUL:14,DIV:3}[kind]],
    ["DINT con DINT a INT","SourceDint","SecondDint","DestInt",
      {ADD:9,SUB:5,MUL:14,DIV:3}[kind]],
    ["INT con DINT a DINT","SourceInt","SecondDint","DestDint",
      {ADD:20,SUB:16,MUL:36,DIV:9}[kind]],
    ["DINT con INT a INT","SourceDint","SecondInt","DestInt",
      {ADD:10,SUB:4,MUL:21,DIV:2}[kind]],
  ];
  for(const [description,a,b,dest,expected] of scenarios){
    if(kind==="MOV" && b) continue;
    test(kind+" permite "+description+" con selector mixto y ejecución",()=>{
      let p=createMath(kind);
      p=setMathSource(p,"math","A",tag(a));
      if(kind!=="MOV" && b)p=setMathSource(p,"math","B",tag(b));
      else if(kind!=="MOV")p=setMathSource(p,"math","B",tag("SecondDint"));
      const options=getTagPickerRows(p.tags,kind,"")
        .filter(row=>row.selectable);
      assert.ok(options.some(row=>row.name==="DestInt"&&row.type==="INT"));
      assert.ok(options.some(row=>row.name==="DestDint"&&row.type==="DINT"));
      assert.ok(names(mathDestinationOptions(p.tags)).includes(dest));
      // Assigning Dest must not alter or restrict either configured source.
      p=setMathDestination(p,"math",dest);
      const math=p.rungs[0].instructions.at(-1);
      assert.equal(math.tag,dest);
      assert.deepEqual(math.compareA,tag(a));
      assert.equal(buildPracticeProject(p).success,true,
        JSON.stringify(buildPracticeProject(p).diagnostics));
      const result=evaluateSeriesScan(p).project.tags.find(t=>t.name===dest).value;
      assert.equal(result,expected);
    });
  }
}
test("INT Dest accepts two DINTs only while the result fits 16 bits",()=>{
  let p=createMath("ADD");
  p=setMathSource(p,"math","A",tag("SourceDint"));
  p=setMathSource(p,"math","B",tag("SecondDint"));
  p=setMathDestination(p,"math","DestInt");
  p=setTagValue(p,"SourceDint",20000);
  p=setTagValue(p,"SecondDint",12000);
  assert.equal(evaluateSeriesScan(p).project.tags.find(t=>t.name==="DestInt").value,32000);
  p=setTagValue(p,"SecondDint",20000);
  let scan=evaluateSeriesScan(p);
  assert.equal(scan.project.tags.find(t=>t.name==="DestInt").value,0,
    "invalid out-of-range value is not written to INT");
  assert.equal(scan.instructionFlow.math.condition,false);
  p=setMathDestination(p,"math","DestDint");
  assert.equal(evaluateSeriesScan(p).project.tags.find(t=>t.name==="DestDint").value,40000);
  assert.equal(convertMathResult({type:"INT"},40000),null);
});
test("destination and source choices are independent, excluding BOOL/STRING",()=>{
  let p=createMath("MUL");
  const mixed=numericTagOptions(p.tags);
  assert.ok(mixed.some(t=>t.name==="SourceInt"));
  assert.ok(mixed.some(t=>t.name==="SourceDint"));
  for(const kind of ["MOV","ADD","SUB","MUL","DIV"]){
    const available=getTagPickerRows(p.tags,kind,"").filter(t=>t.selectable);
    assert.ok(available.some(t=>t.type==="INT"));
    assert.ok(available.some(t=>t.type==="DINT"));
    assert.ok(!available.some(t=>t.type==="BOOL"||t.type==="STRING"));
  }
  assert.throws(()=>setMathDestination(p,"math","Start_PB"),/Dest/);
});
test("UI exposes Dest INT/DINT independently of the sources",()=>{
  const selector=readFileSync(new URL("../src/components/ide/PracticeTagSelector.tsx",import.meta.url),"utf8");
  const editor=readFileSync(new URL("../src/components/ide/PracticeEditor.tsx",import.meta.url),"utf8");
  const picker=readFileSync(new URL("../src/plc/practiceTagPicker.ts",import.meta.url),"utf8");
  assert.match(selector,/Dest matemático · INT \/ DINT \/ REAL/);
  assert.match(selector,/row\.type/);
  assert.match(editor,/setMathDestination\(project, tagSelector\.instructionId, tag\)/);
  assert.match(editor,/setMathDestination\(project, tagSelector\.instructionId, draft\.trim\(\)\)/);
  assert.match(picker,/mathDestinationOptions\(tags\)/);
});
