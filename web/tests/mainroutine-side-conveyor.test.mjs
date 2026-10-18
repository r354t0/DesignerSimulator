import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";
import { evaluateSeriesScan } from "../src/plc/practiceRuntime.ts";
import { setTagValue } from "../src/plc/practiceDocument.ts";
import {
  initialConveyorProject, prepareConveyorTags, CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS,
  createConveyorExampleProject, initialConveyorState, addConveyorItem,
  stepConveyor,
} from "../src/plc/conveyorSceneModel.ts";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const app = read("../src/App.tsx");
const organizer = read("../src/components/ide/ControllerOrganizer.tsx");
const tags = read("../src/components/ide/ControllerTags.tsx");
const editor = read("../src/components/ide/PracticeEditor.tsx");
const scene = read("../src/components/ide/ConveyorScene.tsx");
const css = read("../src/workspace.css");

test("initial controller has only the 5 conveyor-scene tags and one empty MainRoutine rung",()=>{
 const p=initialConveyorProject();
 assert.deepEqual(p.tags.map(tag=>tag.name),CONVEYOR_TAGS.map(tag=>tag.name));
 assert.equal(p.tags.length,5);
 assert.ok(!p.tags.some(t=>["ST_AutoMode","DO_RunLamp"].includes(t.name)));
 assert.equal(p.rungs.length,1);
 assert.equal(p.rungs[0].instructions.length,0);
 assert.equal(prepareConveyorTags(p),p,"no duplicate initial scene registration");
 for(const def of CONVEYOR_TAGS){
   const tag=p.tags.find(t=>t.name===def.name);
   assert.equal(tag.type,def.type);
   assert.equal(tag.description,def.description);
 }
});

test("MainRoutine is the real programmable Ladder, never the fixed motor demo",()=>{
 assert.match(app,/initialPracticeScanState\(initialConveyorProject\(\)\)/);
 assert.match(app,/id: "editor-mainroutine", name: "MainRoutine.LAD", component: "practice"/);
 assert.doesNotMatch(app,/id: "editor-practice"/);
 assert.doesNotMatch(app,/case "ladder":/);
 assert.match(app,/case "practice":/);
 assert.match(app,/<PracticeEditor/);
 assert.match(app,/setEditorView\("practice"\)/);
 assert.match(organizer,/onSelectView\("practice"\)/);
 assert.match(organizer,/MainRoutine.LAD/);
 assert.doesNotMatch(organizer,/PracticeRoutine.LAD/);
 assert.match(editor,/MainRoutine.LAD/);
 assert.doesNotMatch(editor,/PracticeRoutine.LAD/);
});

test("Controller Tags shows only the active scene scope",()=>{
 assert.match(app,/<ControllerTags activeScene=\{simulationTab\}/);
 assert.match(tags,/activeScene: "conveyor" \| "sorting" \| "tank" \| "traffic" \| "motor"/);
 assert.match(tags,/activeScene === "motor" \? "demo" : "practice"/);
 assert.doesNotMatch(tags,/setScope\(/);
 assert.match(tags,/MainRoutine · Faja transportadora/);
 assert.match(tags,/Motor · DEMO/);
});

test("motorized side profile visually includes 2D drive, pulleys, boxes and photoeye",()=>{
 assert.match(scene,/viewBox="0 0 760 260"/);
 assert.match(scene,/Vista lateral de faja transportadora/);
 assert.match(scene,/CONVEYOR_SENSOR_POSITION \* CONVEYOR_BELT_LENGTH_PX/);
 assert.match(scene,/scene\.items\.map/);
 assert.match(scene,/conveyor-motor-spin/);
 assert.match(scene,/conveyor-belt-motion/);
 assert.match(scene,/animationPlayState: motorOn \? "running" : "paused"/);
 assert.match(scene,/MOTOR \{motorOn \? "RUN" : "OFF"\}/);
 assert.match(css,/@keyframes conveyor-drive-rotation/);
 assert.match(css,/@keyframes conveyor-belt-travel/);
 assert.match(css,/\.conveyor-motor-spin/);
 assert.match(css,/\.conveyor-belt-motion/);
});

test("scene motor power is still calculated from Ladder, not animation timers",()=>{
 let p=createConveyorExampleProject();
 assert.equal(buildPracticeProject(p).success,true);
 p=setTagValue(p,"PB_Start",true);
 p=evaluateSeriesScan(p).project;
 assert.equal(p.tags.find(t=>t.name==="DO_Motor").value,true);
 let state=addConveyorItem(initialConveyorState());
 const moving=stepConveyor(state,true,50);
 assert.ok(moving.items[0].position>state.items[0].position);
 assert.equal(stepConveyor(moving,false,50),moving);
 p=setTagValue(p,"PB_Stop",true);
 p=evaluateSeriesScan(p).project;
 p=evaluateSeriesScan(p).project; // R0 observes R1's stop request on next scan.
 assert.equal(p.tags.find(t=>t.name==="DO_Motor").value,false);
});

test("conveyor template adds only its two advanced tags; no legacy demo variables",()=>{
 const p=createConveyorExampleProject();
 assert.deepEqual(p.tags.map(t=>t.name),[
  ...CONVEYOR_TAGS.map(t=>t.name), ...CONVEYOR_TEMPLATE_TAGS.map(t=>t.name),
 ]);
 assert.deepEqual(p.rungs.map(r=>r.instructions.map(i=>i.kind)),[
  ["OR_JUNCTION","XIC","XIO","OTE"],["OR_JUNCTION","XIC","OTE"],
  ["XIC","CTU"],["XIO","XIC","RES"]
 ]);
 assert.equal(p.tags.find(t=>t.name==="CNT_Boxes").value.PRE,5);
});
