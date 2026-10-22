import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS, initialConveyorProject,
  createConveyorExampleProject, prepareConveyorTags,
} from "../src/plc/conveyorSceneModel.ts";
import {
  SORT_TAGS, SORT_TEMPLATE_TAGS, initialSortProject,
  createSortExampleProject, prepareSortTags,
} from "../src/plc/sortSceneModel.ts";
import {
  TANK_IO_TAGS, TANK_SOLUTION_TAGS, initialTankProject,
  createTankExampleProject, prepareTankTags,
} from "../src/plc/tankSceneModel.ts";
import {
  TRAFFIC_IO_TAGS, TRAFFIC_SOLUTION_TAGS, initialTrafficProject,
  createTrafficExampleProject, prepareTrafficTags,
} from "../src/plc/trafficSceneModel.ts";
import { buildPracticeProject } from "../src/plc/practiceBuild.ts";

const source=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const cases=[
  ["Conveyor",initialConveyorProject,createConveyorExampleProject,prepareConveyorTags,
    CONVEYOR_TAGS,CONVEYOR_TEMPLATE_TAGS],
  ["Sort",initialSortProject,createSortExampleProject,prepareSortTags,
    SORT_TAGS,SORT_TEMPLATE_TAGS],
  ["Tank",initialTankProject,createTankExampleProject,prepareTankTags,
    TANK_IO_TAGS,TANK_SOLUTION_TAGS],
  ["Traffic",initialTrafficProject,createTrafficExampleProject,prepareTrafficTags,
    TRAFFIC_IO_TAGS,TRAFFIC_SOLUTION_TAGS],
];

for(const [scene,initial,solution,prepare,physical,auxiliary] of cases){
  test(scene+": enter scene creates only SCADA E/S, recommendation adds only auxiliary tags",()=>{
    const blank=initial();
    assert.equal(blank.rungs.length,1);
    assert.deepEqual(blank.rungs[0].instructions,[]);
    assert.deepEqual(blank.tags.map(tag=>tag.name),physical.map(tag=>tag.name));
    assert.ok(physical.every(tag=>tag.direction!=="Interna"));
    assert.ok(auxiliary.length>=2);
    assert.ok(auxiliary.every(tag=>tag.direction==="Interna"),
      "Physical buttons and sensors belong in scene E/S");
    assert.ok(auxiliary.every(tag=>!blank.tags.some(t=>t.name===tag.name)));
    assert.strictEqual(prepare(blank),blank);
    const recommended=solution();
    assert.deepEqual(recommended.tags.map(t=>t.name),
      [...physical,...auxiliary].map(t=>t.name));
    assert.equal(buildPracticeProject(recommended).success,true);
    assert.strictEqual(prepare(recommended),recommended,
      "Returning to a scene must not delete solution tags or custom Ladder");
    assert.equal(initial().rungs[0].instructions.length,0,
      "Clean practice is independent from recommended program");
    const info=source("../src/components/ide/"+scene+"SceneInfoDialog.tsx");
    assert.match(info,/SceneTagTable/);
    assert.match(info,/RecommendedSolutionPanel/);
    assert.match(info,/onResetExample/);
    assert.match(info,/onReset=\{\(\) => \{ onClose\(\); onResetExample\(\); \}\}/);
  });
}
test("recommended solution panel exposes separated tags and both actions",()=>{
  const panel=source("../src/components/ide/RecommendedSolutionPanel.tsx");
  assert.match(panel,/Solución Recomendada/);
  assert.match(panel,/Variables adicionales de la solución/);
  assert.match(panel,/Implementar Solución Recomendada/);
  assert.match(panel,/Reiniciar programación para practicar/);
  assert.match(panel,/SceneTagTable specs=\{specs\} project=\{project\} preview/);
});
test("App stores isolated pre-solution snapshots and confirms before restoring",()=>{
  const app=source("../src/App.tsx");
  for(const scene of ["conveyor","sorting","tank","traffic"]){
    assert.match(app,new RegExp("solutionSnapshots\\.current\\."+scene+
      " = scanRef\\.current\\.project"));
    assert.match(app,new RegExp('resetRecommendedSolution\\("'+scene+'"\\)'));
  }
  assert.match(app,/window\.confirm\(saved/);
  assert.match(app,/initialPracticeScanState\(saved \?\? initial\)/);
  assert.match(app,/delete solutionSnapshots\.current\[scene\]/);
  assert.match(app,/scanPeriodMs: state\.scanPeriodMs/);
});
