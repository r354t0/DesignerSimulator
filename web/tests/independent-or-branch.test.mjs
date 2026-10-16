import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPracticeProject, insertInstruction, createIndependentParallelBranch,
  createParallelBranch, addParallelContact, insertIntoIndependentOrUpper,
  removeInstruction, removeParallelBranch, setTagValue, findInstruction,
  OR_JUNCTION_KIND, getPaletteInsertionTarget,
} from "../src/plc/practiceDocument.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { getWrappedRungLayout, findWrappedLadderDropTarget } from "../src/plc/ladderWrappedLayout.ts";

const xic=(id,tag="Start_PB")=>({id,kind:"XIC",tag});
const xio=(id,tag="Stop_PB")=>({id,kind:"XIO",tag});
const output=(id)=>({id,kind:"OTE",tag:"Motor_Run"});
function base(){
 let p=initialPracticeProject();
 p=insertInstruction(p,"rung-1",0,xic("condition"));
 p=insertInstruction(p,"rung-1",1,output("motor"));
 return p;
}
function branchData(project){
 const rung=project.rungs[0],branch=rung.parallelBranches.at(-1);
 return {rung,branch,node:rung.instructions.find(i=>i.id===branch.anchorId)};
}
test("new OR after selected instruction is a separate selectable junction, not a dependency",()=>{
 let p=createIndependentParallelBranch(base(),"rung-1","condition");
 const {rung,branch,node}=branchData(p);
 assert.equal(node.kind,OR_JUNCTION_KIND);
 assert.notEqual(node.id,"condition");
 assert.deepEqual(rung.instructions.map(i=>i.kind),["XIC",OR_JUNCTION_KIND,"OTE"]);
 assert.equal(branch.anchorId,node.id);
 assert.equal(branch.instructions.length,0);
 assert.ok(buildPracticeProject(p).diagnostics.some(d=>d.code==="EMPTY_OR_BRANCH"));
 p=addParallelContact(p,"rung-1",node.id,xio("bypass","Auto_Mode"),0,branch.id);
 assert.equal(buildPracticeProject(p).success,true);
 p=removeInstruction(p,"condition");
 assert.ok(findInstruction(p,node.id),"unrelated original contact can be deleted");
 assert.equal(p.rungs[0].parallelBranches[0].instructions[0].id,"bypass");
 assert.equal(buildPracticeProject(p).success,true);
});
test("a rung with only an output can create a new independent OR immediately before it",()=>{
 let p=initialPracticeProject();
 p=insertInstruction(p,"rung-1",0,output("motor"));
 p=createIndependentParallelBranch(p,"rung-1");
 assert.deepEqual(p.rungs[0].instructions.map(i=>i.kind),[OR_JUNCTION_KIND,"OTE"]);
 assert.equal(p.rungs[0].parallelBranches.length,1);
});
test("a single lower branch never shorts the rung through its empty upper wire",()=>{
 let p=createIndependentParallelBranch(base(),"rung-1","condition");
 const {node,branch}=branchData(p);
 p=addParallelContact(p,"rung-1",node.id,xic("lower","Auto_Mode"),0,branch.id);
 p=setTagValue(p,"Start_PB",true);
 p=setTagValue(p,"Auto_Mode",false);
 assert.equal(buildPracticeProject(p).success,true);
 let scan=evaluateSeriesScan(p);
 assert.equal(scan.instructionFlow[node.id].powerOut,false);
 assert.equal(scan.branchPower[branch.id],false);
 assert.equal(scan.project.tags.find(x=>x.name==="Motor_Run").value,false);
 p=setTagValue(p,"Auto_Mode",true);
 scan=evaluateSeriesScan(p);
 assert.equal(scan.branchPower[branch.id],true);
 assert.equal(scan.project.tags.find(x=>x.name==="Motor_Run").value,true);
});
test("upper lane and lower OR join, followed by independent right-hand series contact",()=>{
 let p=createIndependentParallelBranch(base(),"rung-1","condition");
 const {node,branch}=branchData(p);
 p=addParallelContact(p,"rung-1",node.id,xic("lower","Auto_Mode"),0,branch.id);
 p=insertIntoIndependentOrUpper(p,"rung-1",node.id,xic("upper","Lamp_Run"));
 assert.equal(p.rungs[0].parallelBranches[0].endId,"upper");
 const afterPosition=p.rungs[0].instructions.findIndex(i=>i.id==="upper")+1;
 p=insertInstruction(p,"rung-1",afterPosition,xio("permit","Stop_PB"));
 assert.deepEqual(p.rungs[0].instructions.map(i=>i.id),
   ["condition",node.id,"upper","permit","motor"]);
 assert.equal(p.rungs[0].parallelBranches[0].endId,"upper",
   "ordinary insertion after the OR must NOT become part of the upper path");
 assert.equal(buildPracticeProject(p).success,true);
 p=setTagValue(p,"Start_PB",true);
 p=setTagValue(p,"Auto_Mode",true);
 p=setTagValue(p,"Stop_PB",true);
 assert.equal(evaluateSeriesScan(p).rungPower["rung-1"],false,
   "downstream AND contact can block both OR paths");
 p=setTagValue(p,"Stop_PB",false);
 assert.equal(evaluateSeriesScan(p).rungPower["rung-1"],true);
});
test("selected OR group can be continued by main-line insertion and drop after its join",()=>{
 let p=createIndependentParallelBranch(base(),"rung-1","condition");
 const {node,branch}=branchData(p);
 p=addParallelContact(p,"rung-1",node.id,xic("lower","Auto_Mode"),0,branch.id);
 const layout=getWrappedRungLayout(p.rungs[0],760);
 const group=layout.groups.find(g=>g.anchorId===node.id);
 assert.ok(group);
 const x=group.right+18;
 const target=findWrappedLadderDropTarget(p,"rung-1","XIO",x,group.mainY,760);
 assert.equal(target?.lane,"main");
 assert.ok(target.position>=2);
 assert.deepEqual(getPaletteInsertionTarget(p,null,"rung-1","XIC"),
   {rungId:"rung-1",position:2});
 p=insertInstruction(p,"rung-1",target.position,xio("after"));
 assert.equal(p.rungs[0].parallelBranches[0].endId,undefined);
 assert.ok(findInstruction(p,"after"));
});
test("deleting one OR lane removes its independent junction without removing neighboring contacts",()=>{
 let p=createIndependentParallelBranch(base(),"rung-1","condition");
 const {branch,node}=branchData(p);
 p=addParallelContact(p,"rung-1",node.id,xic("lower"),0,branch.id);
 p=removeParallelBranch(p,"rung-1",node.id,branch.id);
 assert.deepEqual(p.rungs[0].instructions.map(x=>x.id),["condition","motor"]);
 assert.equal(p.rungs[0].parallelBranches.length,0);
 assert.equal(buildPracticeProject(p).success,true);
});
test("existing anchored OR branches remain supported",()=>{
 let p=createParallelBranch(base(),"rung-1","condition");
 const branch=p.rungs[0].parallelBranches[0];
 p=addParallelContact(p,"rung-1","condition",xic("legacy"),0,branch.id);
 assert.equal(buildPracticeProject(p).success,true);
 p=insertInstruction(p,"rung-1",1,xic("legacy-upper"));
 assert.equal(p.rungs[0].parallelBranches[0].endId,"legacy-upper");
});
