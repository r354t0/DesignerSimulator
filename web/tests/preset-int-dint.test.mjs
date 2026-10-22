import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createTag, initialPracticeProject, insertInstruction,
  setInstructionPreset, setTagValue, editTag, deleteTag,
} from "../src/plc/practiceDocument.ts";
import { buildPracticeProject, getPracticeBuildSignature } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { getAssignablePresetTags, parsePresetInput } from "../src/plc/timerPresetInput.ts";

function fixture(kind) {
  let p=initialPracticeProject();
  const timer=["TON","TOF","RTO"].includes(kind);
  p=createTag(p, "PresetInt", "Consigna INT", "INT");
  p=createTag(p, "PresetDint", "Consigna DINT", "DINT");
  p=createTag(p, "CounterSigned", "Consigna negativa INT", "INT");
  p=createTag(p, "PresetReal", "No permitido", "REAL");
  p=createTag(p, timer?"Timer_1":"Counter_1", "Estructura", timer?"TIMER":"COUNTER");
  p=setTagValue(p,"PresetInt",timer?150:3);
  p=setTagValue(p,"PresetDint",timer?320:4);
  p=setTagValue(p,"CounterSigned",-2);
  p=insertInstruction(p,"rung-1",0,{id:"contact",kind:"XIC",tag:"Start_PB"});
  p=insertInstruction(p,"rung-1",1,{
    id:"block",kind,tag:timer?"Timer_1":"Counter_1",
  });
  return p;
}
const get=(p,kind)=>p.tags.find(t=>t.name===(
  ["TON","TOF","RTO"].includes(kind)?"Timer_1":"Counter_1")).value;

test("PRE selector lists INT and DINT, including signed counter PRE",()=>{
  const p=fixture("TON");
  assert.deepEqual(
    getAssignablePresetTags(p.tags,"timer").map(t=>t.name),
    ["PresetInt","PresetDint"],
  );
  assert.deepEqual(
    getAssignablePresetTags(p.tags,"counter").map(t=>t.name),
    ["PresetInt","PresetDint","CounterSigned"],
  );
  for(const name of ["PresetInt","PresetDint"]) {
    assert.deepEqual(parsePresetInput(name.toLowerCase(),p.tags,"timer"),
      {ok:true,preset:{mode:"tag",tag:name}});
    assert.deepEqual(parsePresetInput(name,p.tags,"counter"),
      {ok:true,preset:{mode:"tag",tag:name}});
  }
  assert.deepEqual(parsePresetInput("CounterSigned",p.tags,"counter"),
    {ok:true,preset:{mode:"tag",tag:"CounterSigned"}});
  for(const invalid of ["PresetReal","Start_PB","NotFound"])
    assert.equal(parsePresetInput(invalid,p.tags,"timer").ok,false);
  assert.equal(parsePresetInput("CounterSigned",p.tags,"timer").ok,false);
});

for(const kind of ["TON","TOF","RTO","CTU","CTD"]){
  test(kind+" Build accepts INT/DINT PRE and reads updated values on each scan",()=>{
    const timer=["TON","TOF","RTO"].includes(kind);
    let p=fixture(kind);
    for(const name of ["PresetInt","PresetDint"]) {
      const configured=setInstructionPreset(p,"block",{mode:"tag",tag:name});
      assert.equal(buildPracticeProject(configured).success,true,kind+" / "+name);
      const signature=getPracticeBuildSignature(configured);
      let powered=setTagValue(configured,"Start_PB",true);
      let frame=evaluateSeriesScan(powered,timer?100:0).project;
      assert.equal(get(frame,kind).PRE,name==="PresetInt"
        ? (timer?150:3) : (timer?320:4));
      const newValue=timer?480:6;
      frame=setTagValue(frame,name,newValue);
      assert.equal(getPracticeBuildSignature(frame),signature);
      frame=evaluateSeriesScan(frame,timer?100:0).project;
      assert.equal(get(frame,kind).PRE,newValue,
        kind+" did not refresh changed "+name);
    }
  });
}

test("invalid types are blocked, timer INT values cannot become negative",()=>{
  let timer=fixture("TON");
  assert.throws(()=>setInstructionPreset(timer,"block",{mode:"tag",tag:"PresetReal"}),/INT.*DINT/);
  assert.throws(()=>setInstructionPreset(timer,"block",{mode:"tag",tag:"Start_PB"}),/INT.*DINT/);
  timer=setInstructionPreset(timer,"block",{mode:"tag",tag:"PresetInt"});
  assert.throws(()=>setTagValue(timer,"PresetInt",-1),/PRE/);
  assert.throws(()=>deleteTag(timer,"PresetInt"),/utilizado/);
  assert.throws(()=>editTag(timer,"PresetInt",{type:"REAL"}),/utilizado/);
  timer=editTag(timer,"PresetInt",{name:"NewTimerInt"});
  assert.equal(timer.rungs[0].instructions[1].preset.tag,"NewTimerInt");
  assert.equal(buildPracticeProject(timer).success,true);
  const manual={...timer,tags:timer.tags.map(t=>t.name==="NewTimerInt"
    ? {...t,value:-2}:t)};
  assert.ok(buildPracticeProject(manual).diagnostics.some(d=>d.code==="INVALID_TIMER_PRESET"));
});
test("signed INT counter PRE supports negative values and updates DN",()=>{
  let p=fixture("CTU");
  p=setInstructionPreset(p,"block",{mode:"tag",tag:"CounterSigned"});
  assert.equal(buildPracticeProject(p).success,true);
  p=evaluateSeriesScan(setTagValue(p,"Start_PB",true)).project;
  assert.equal(get(p,"CTU").PRE,-2);
  assert.equal(get(p,"CTU").DN,true);
  p=setTagValue(p,"CounterSigned",2);
  p=evaluateSeriesScan(p).project;
  assert.equal(get(p,"CTU").PRE,2);
  assert.equal(get(p,"CTU").DN,false);
});
test("inline PRE editor advertises INT/DINT and keeps native PRE option",()=>{
  const ui=readFileSync(new URL("../src/components/ide/TimerPresetEditor.tsx",import.meta.url),"utf8");
  const editor=readFileSync(new URL("../src/components/ide/PracticeEditor.tsx",import.meta.url),"utf8");
  assert.match(ui,/Variables INT y DINT disponibles/);
  assert.match(ui,/getAssignablePresetTags\(tags, kind\)/);
  assert.match(ui,/onSave\(undefined\)/);
  assert.match(editor,/Clic para escribir PRE o seleccionar una variable INT o DINT/);
});
