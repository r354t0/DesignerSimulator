import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, createRung, createTag, insertInstruction,
  createIndependentParallelBranch, addParallelContact,
  insertIntoIndependentOrUpper, moveInstruction, moveToIndependentOrUpper,
  findInstruction, setTagValue,
} from "../src/plc/practiceDocument.ts";
import { getWrappedRungLayout, findWrappedLadderDropTarget } from "../src/plc/ladderWrappedLayout.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const lit=(n)=>({mode:"literal",value:n});
const c=(id,kind="XIC",tag="Start_PB")=>({id,kind,tag});
function setupOr() {
  let p=initialPracticeProject();
  p=insertInstruction(p,"rung-1",0,c("preceding"));
  p=insertInstruction(p,"rung-1",1,c("output","OTE","Motor_Run"));
  p=createIndependentParallelBranch(p,"rung-1","preceding");
  const node=p.rungs[0].instructions.find(i=>i.kind==="OR_JUNCTION");
  const branch=p.rungs[0].parallelBranches[0];
  p=addParallelContact(p,"rung-1",node.id,c("lower","XIC","Auto_Mode"),0,branch.id);
  return {p,node,branch};
}

test("OR has a real, wide, main upper drop slot rather than a contact-only junction",()=>{
  const {p,node}=setupOr();
  const layout=getWrappedRungLayout(p.rungs[0],760);
  const group=layout.groups.find(g=>g.anchorId===node.id);
  assert.ok(group);
  assert.ok(group.right-group.x>80,"space to right of OR junction is present");
  const upper=findWrappedLadderDropTarget(p,"rung-1","XIC",
    group.x+42,group.mainY,760);
  assert.equal(upper?.lane,"upper");
  assert.equal(upper.anchorId,node.id);
  const continuation=findWrappedLadderDropTarget(p,"rung-1","XIC",
    group.right+17,group.mainY,760);
  assert.equal(continuation?.lane,"main");
  assert.equal(continuation?.position,2);
});
test("upper OR accepts new XIC/XIO and comparisons from palette/drop",()=>{
  let {p,node}=setupOr();
  p=insertIntoIndependentOrUpper(p,"rung-1",node.id,c("upper"));
  p=insertIntoIndependentOrUpper(p,"rung-1",node.id,{
    id:"eq",kind:"EQU",tag:"",compareA:lit(12),compareB:lit(12),
  });
  assert.equal(p.rungs[0].parallelBranches[0].endId,"eq");
  assert.equal(buildPracticeProject(p).success,true);
  assert.deepEqual(p.rungs[0].instructions.map(i=>i.id),
    ["preceding",node.id,"upper","eq","output"]);
  p=insertInstruction(p,"rung-1",4,c("following","XIO","Stop_PB"));
  assert.equal(p.rungs[0].parallelBranches[0].endId,"eq",
    "ordinary insertion after OR must stay outside it");
});
test("drag main contact from another rung to OR upper, preserving ID and BOOL tag",()=>{
  let {p,node}=setupOr();
  p=createRung(p,"rung-2");
  p=insertInstruction(p,"rung-2",0,c("movable","XIO","Stop_PB"));
  p=moveToIndependentOrUpper(p,"movable","rung-1",node.id);
  assert.equal(p.rungs[0].parallelBranches[0].endId,"movable");
  assert.equal(findInstruction(p,"movable").rungId,"rung-1");
  assert.equal(findInstruction(p,"movable").instruction.tag,"Stop_PB");
  assert.equal(p.rungs[1].instructions.length,0);
  assert.equal(buildPracticeProject(p).success,true);
});
test("comparisons can move to OR upper without losing configured sources",()=>{
  let {p,node}=setupOr();
  p=createRung(p,"rung-2");
  const complex={id:"comparison",kind:"EQU",tag:"",
    compareA:{mode:"tag",tag:"NumberValue"},compareB:lit(7)};
  p=createTag(p,"NumberValue","","DINT");
  p=insertInstruction(p,"rung-2",0,complex);
  p=moveToIndependentOrUpper(p,"comparison","rung-1",node.id);
  assert.deepEqual(findInstruction(p,"comparison").instruction,complex);
  assert.equal(p.rungs[0].parallelBranches[0].endId,"comparison");
});
test("move all comparator, timer, counter, move and math blocks between rungs intact",()=>{
  const instructions=[
    {id:"equ",kind:"EQU",tag:"",compareA:lit(1),compareB:lit(2)},
    {id:"neq",kind:"NEQ",tag:"",compareA:lit(2),compareB:lit(3)},
    {id:"ton",kind:"TON",tag:"TimerOne",preset:{mode:"literal",value:2500}},
    {id:"tof",kind:"TOF",tag:"TimerTwo",preset:{mode:"literal",value:1250}},
    {id:"rto",kind:"RTO",tag:"TimerThree",preset:{mode:"literal",value:3600}},
    {id:"ctu",kind:"CTU",tag:"CountOne",preset:{mode:"literal",value:12}},
    {id:"ctd",kind:"CTD",tag:"CountTwo",preset:{mode:"literal",value:18}},
    {id:"mov",kind:"MOV",tag:"Result",compareA:lit(25)},
    {id:"add",kind:"ADD",tag:"Result",compareA:lit(5),compareB:lit(2)},
    {id:"sub",kind:"SUB",tag:"Result",compareA:lit(5),compareB:lit(2)},
    {id:"mul",kind:"MUL",tag:"Result",compareA:lit(5),compareB:lit(2)},
    {id:"div",kind:"DIV",tag:"Result",compareA:lit(6),compareB:lit(2)},
  ];
  for(const item of instructions) {
    let p=initialPracticeProject();
    for(const t of ["TimerOne","TimerTwo","TimerThree"])p=createTag(p,t,"","TIMER");
    for(const t of ["CountOne","CountTwo"])p=createTag(p,t,"","COUNTER");
    p=createTag(p,"Result","","DINT");
    p=insertInstruction(p,"rung-1",0,item);
    p=createRung(p,"rung-2");
    const moved=moveInstruction(p,item.id,"rung-2",0);
    assert.deepEqual(findInstruction(moved,item.id)?.instruction,item,
      item.kind+" operands lost during cross-rung move");
    assert.equal(moved.rungs[0].instructions.length,0,item.kind);
    assert.equal(moved.rungs[1].instructions.length,1,item.kind);
  }
});
test("move two structured output blocks within a rung to reorder them",()=>{
  let p=initialPracticeProject();
  p=createTag(p,"Result","","DINT");
  p=createTag(p,"CountOne","","COUNTER");
  const first={id:"calc",kind:"ADD",tag:"Result",compareA:lit(8),compareB:lit(9)};
  const second={id:"counter",kind:"CTU",tag:"CountOne",preset:{mode:"literal",value:10}};
  p=insertInstruction(p,"rung-1",0,first);
  p=insertInstruction(p,"rung-1",1,second);
  const layout=getWrappedRungLayout(p.rungs[0],760);
  const target=findWrappedLadderDropTarget(p,"rung-1","ADD",
    layout.coilX,layout.outputYs[1],760,"calc");
  assert.equal(target?.lane,"main");
  assert.ok(target.position>=1);
  p=moveInstruction(p,"calc","rung-1",2);
  assert.deepEqual(p.rungs[0].instructions.map(i=>i.id),["counter","calc"]);
  assert.deepEqual(findInstruction(p,"calc").instruction,first);
});
test("moving an independent upper instruction away updates its OR reunion",()=>{
  let {p,node}=setupOr();
  p=insertIntoIndependentOrUpper(p,"rung-1",node.id,c("up1"));
  p=insertIntoIndependentOrUpper(p,"rung-1",node.id,c("up2"));
  p=createRung(p,"rung-2");
  p=moveInstruction(p,"up2","rung-2",0);
  assert.equal(p.rungs[0].parallelBranches[0].endId,"up1");
  assert.equal(buildPracticeProject(p).success,true);
  p=moveInstruction(p,"up1","rung-2",0);
  assert.equal(p.rungs[0].parallelBranches[0].endId,undefined);
  assert.equal(buildPracticeProject(p).success,true);
});
test("photoelectric OR output execution respects upper contacts and right-hand series",()=>{
  let {p,node}=setupOr();
  p=insertIntoIndependentOrUpper(p,"rung-1",node.id,c("top","XIC","Lamp_Run"));
  p=insertInstruction(p,"rung-1",3,c("post","XIO","Stop_PB"));
  p=setTagValue(p,"Start_PB",true);
  p=setTagValue(p,"Auto_Mode",true);
  p=setTagValue(p,"Stop_PB",false);
  const scan=evaluateSeriesScan(p);
  assert.equal(scan.project.tags.find(t=>t.name==="Motor_Run").value,true);
  p=setTagValue(p,"Stop_PB",true);
  assert.equal(evaluateSeriesScan(p).project.tags.find(t=>t.name==="Motor_Run").value,false);
});
