import test from "node:test";
import assert from "node:assert/strict";
import {
  CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS, createConveyorExampleProject,
} from "../src/plc/conveyorSceneModel.ts";
import {
  SORT_TAGS, SORT_TEMPLATE_TAGS, createSortExampleProject,
} from "../src/plc/sortSceneModel.ts";
import { TANK_TAGS, createTankExampleProject } from "../src/plc/tankSceneModel.ts";
import { TRAFFIC_TAGS, createTrafficExampleProject } from "../src/plc/trafficSceneModel.ts";
import { demoTagMetadata } from "../src/plc/demoModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const scenes=[
  ["Escena 01", [...CONVEYOR_TAGS, ...CONVEYOR_TEMPLATE_TAGS], createConveyorExampleProject],
  ["Escena 02", [...SORT_TAGS, ...SORT_TEMPLATE_TAGS], createSortExampleProject],
  ["Escena 03", TANK_TAGS, createTankExampleProject],
  ["Escena 04", TRAFFIC_TAGS, createTrafficExampleProject],
];

test("all four scenes use function-oriented industrial names and unique tags",()=>{
  for(const [scene,specs,build] of scenes) {
    const names=specs.map(t=>t.name);
    assert.equal(new Set(names).size,names.length,scene+" names must not collide");
    for(const tag of specs) {
      assert.match(tag.name,/^(PB|DO|DI|AI|TMR|CNT|ST|ALM)_[A-Za-z][A-Za-z0-9_]*$/,
        scene+": "+tag.name);
      if(tag.type==="TIMER")assert.match(tag.name,/^TMR_/,scene);
      else if(tag.type==="COUNTER")assert.match(tag.name,/^CNT_/,scene);
      else if(tag.direction==="Salida")assert.match(tag.name,/^DO_/,scene);
      else if(tag.direction==="Entrada" && tag.type==="REAL")
        assert.match(tag.name,/^AI_/,scene);
      else if(tag.direction==="Entrada")assert.match(tag.name,/^(PB_|DI_)/,scene);
      else if(tag.type==="BOOL" && tag.direction==="Interna")
        assert.match(tag.name,/^(ST_|ALM_)/,scene);
    }
    const project=build();
    const results=buildPracticeProject(project);
    assert.equal(results.success,true,scene+": "+JSON.stringify(results.diagnostics));
    for(const tag of specs)
      assert.ok(project.tags.some(t=>t.name===tag.name&&t.type===tag.type),
        scene+" missing "+tag.name);
  }
});

test("requested example names are available in their respective scenes",()=>{
  assert.ok(CONVEYOR_TAGS.some(t=>t.name==="PB_Start"));
  assert.ok(CONVEYOR_TAGS.some(t=>t.name==="DO_Motor"));
  assert.ok(SORT_TEMPLATE_TAGS.some(t=>t.name==="CNT_Lotes"));
  assert.ok(TANK_TAGS.some(t=>t.name==="CNT_Lotes"));
  assert.ok(TANK_TAGS.some(t=>t.name==="ST_RunEnable"));
  assert.ok(TANK_TAGS.some(t=>t.name==="ALM_ProcessTimeout"));
  assert.ok(TRAFFIC_TAGS.some(t=>t.name==="DO_NS_GreenLight"));
  assert.ok(TRAFFIC_TAGS.some(t=>t.name==="TMR_NS_Green"));
});

test("motor DEMO inputs and outputs follow PB/DI and DO convention",()=>{
  for(const tag of demoTagMetadata) {
    assert.match(tag.name,tag.access==="input"?/^(PB_|DI_)/:/^DO_/);
  }
});
