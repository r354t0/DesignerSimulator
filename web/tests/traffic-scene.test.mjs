import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRAFFIC_PHASES, TRAFFIC_TIMERS, TRAFFIC_TAGS,
  initialTrafficProject,createTrafficExampleProject,initialTrafficState,
  prepareTrafficTags,readTrafficBool,readTrafficCount,addTrafficVehicle,
  trafficWaiting,stepTrafficState,
} from "../src/plc/trafficSceneModel.ts";
import {buildPracticeProject} from "../src/plc/practiceBuild.ts";
import {initialPracticeScanState,startPracticeScans,tickPracticeScan,
  setScanPeriod,applyMomentaryBoolInput,applySceneSensorBoolInput,
  pausePracticeScans,stopPracticeScans} from "../src/plc/practiceScanCycle.ts";

const bool=(plc,name)=>readTrafficBool(plc.project,name);
const timer=(plc,name)=>plc.project.tags.find(t=>t.name===name).value;

function exclusive(plc) {
  assert.ok(TRAFFIC_PHASES.filter(t=>bool(plc,t)).length<=1,
    "There must be at most one traffic phase active");
  assert.equal(bool(plc,"Tr_NS_Green")&&bool(plc,"Tr_EW_Green"),false);
  assert.equal(bool(plc,"Tr_Walk")&&
    (bool(plc,"Tr_NS_Green")||bool(plc,"Tr_EW_Green")),false);
}
const pulse=(plc,tag)=>{
  plc=applySceneSensorBoolInput(plc,tag,true);
  return applySceneSensorBoolInput(plc,tag,false);
};
const press=(plc,tag)=>{
  plc=applyMomentaryBoolInput(plc,tag,true,true);
  return applyMomentaryBoolInput(plc,tag,false,true);
};

test("traffic scene gets its own empty MainRoutine and idempotent tag registration",()=>{
  const project=initialTrafficProject();
  assert.deepEqual(project.tags.map(t=>t.name),TRAFFIC_TAGS.map(t=>t.name));
  assert.equal(project.rungs.length,1);
  assert.equal(project.rungs[0].instructions.length,0);
  assert.strictEqual(prepareTrafficTags(project),project);
});

test("reference Ladder compiles with TON, CTU, multiple true OR groups and safe phase transfers",()=>{
  const p=createTrafficExampleProject();
  const built=buildPracticeProject(p);
  assert.equal(built.success,true,JSON.stringify(built.diagnostics));
  assert.equal(p.rungs.filter(r=>r.instructions.some(i=>i.kind==="TON")).length,7);
  assert.equal(p.rungs.filter(r=>r.instructions.some(i=>i.kind==="CTU")).length,2);
  assert.ok(p.rungs.filter(r=>r.instructions.some(i=>i.kind==="OR_JUNCTION")).length>=9);
  const join=p.rungs.find(r=>r.id==="tr-start-ns");
  assert.ok(join.parallelBranches.some(b=>b.instructions.some(i=>i.tag==="Tr_ToNS")));
  for(const [name,value] of Object.entries(TRAFFIC_TIMERS)){
    assert.equal(p.tags.find(t=>t.name===name).value.PRE,value);
  }
  for(const phase of ["NS","NSY","R1","EW","EWY"]) {
    const order=["tr-transition-"+phase,"tr-leave-"+phase,"tr-enter-"+phase]
      .map(id=>p.rungs.findIndex(r=>r.id===id));
    assert.ok(order[0]<order[1]&&order[1]<order[2]);
  }
});

test("cycle alternates both avenues with amber, all-red, and safe turn-around",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createTrafficExampleProject()),500));
  plc=press(plc,"Tr_StartPB");
  assert.equal(bool(plc,"Tr_NS_Green"),true);
  exclusive(plc);
  const phases=new Set();
  let ns=false,ny=false,red1=false,eg=false,ey=false,red2=false,loop=false;
  for(let i=0;i<66;i++){
    plc=tickPracticeScan(plc);
    exclusive(plc);
    for(const phase of TRAFFIC_PHASES)if(bool(plc,phase))phases.add(phase);
    ns ||= bool(plc,"Tr_NS_Green");
    ny ||= bool(plc,"Tr_NS_Yellow");
    red1 ||= bool(plc,"Tr_Red1Phase")&&bool(plc,"Tr_NS_Red")&&bool(plc,"Tr_EW_Red");
    eg ||= bool(plc,"Tr_EW_Green");
    ey ||= bool(plc,"Tr_EW_Yellow");
    red2 ||= bool(plc,"Tr_Red2Phase")&&bool(plc,"Tr_NS_Red")&&bool(plc,"Tr_EW_Red");
    loop ||= i>25&&eg===true&&bool(plc,"Tr_NS_Green");
  }
  assert.equal([ns,ny,red1,eg,ey,red2,loop].every(Boolean),true,
    "all phases and safe return must occur");
});

test("pedestrian request is held through both avenues and served only in safe all-red",()=>{
  let plc=startPracticeScans(setScanPeriod(
    initialPracticeScanState(createTrafficExampleProject()),500));
  plc=press(plc,"Tr_StartPB");
  plc=press(plc,"Tr_PedPB");
  assert.equal(bool(plc,"Tr_PedPending"),true);
  let walkSeen=false;
  for(let i=0;i<55;i++){
    plc=tickPracticeScan(plc);exclusive(plc);
    if(bool(plc,"Tr_Walk")){
      walkSeen=true;
      assert.equal(bool(plc,"Tr_NS_Red"),true);
      assert.equal(bool(plc,"Tr_EW_Red"),true);
      assert.equal(bool(plc,"Tr_PedPending"),false);
      break;
    }
  }
  assert.equal(walkSeen,true,"walk request was not served");
  for(let i=0;i<8;i++){
    plc=tickPracticeScan(plc);exclusive(plc);
  }
  assert.equal(bool(plc,"Tr_Walk"),false);
  assert.equal(bool(plc,"Tr_NSPhase"),true);
});

test("vehicle physics queues on red, moves on PLC green and counts independent exit pulses",()=>{
  let st=initialTrafficState();
  st=addTrafficVehicle(st,"NS");
  st=addTrafficVehicle(st,"EW");
  assert.equal(trafficWaiting(st,"NS"),true);
  assert.equal(trafficWaiting(st,"EW"),true);
  for(let i=0;i<80;i++)st=stepTrafficState(st,false,false,false,50);
  assert.ok(st.vehicles.every(v=>v.position<=0.35),"red must hold vehicles");
  for(let i=0;i<90;i++)st=stepTrafficState(st,true,false,false,50);
  assert.equal(st.exitedNS,1);
  assert.equal(st.exitedEW,0);
  for(let i=0;i<90;i++)st=stepTrafficState(st,false,true,false,50);
  assert.equal(st.exitedEW,1);
  let plc=startPracticeScans(initialPracticeScanState(createTrafficExampleProject()));
  plc=pulse(plc,"Tr_NSExit");
  plc=pulse(plc,"Tr_EWExit");
  assert.equal(readTrafficCount(plc.project,"Tr_CountNS"),1);
  assert.equal(readTrafficCount(plc.project,"Tr_CountEW"),1);
});

test("STOP clears phases while PAUSE and STOP prevent hidden traffic movement",()=>{
  let plc=startPracticeScans(initialPracticeScanState(createTrafficExampleProject()));
  plc=press(plc,"Tr_StartPB");
  const before=timer(plc,"Tr_TNSGreen").ACC;
  plc=pausePracticeScans(plc);
  plc=tickPracticeScan(plc);
  assert.equal(timer(plc,"Tr_TNSGreen").ACC,before);
  plc=stopPracticeScans(plc);
  assert.equal(plc.mode,"stopped");
  const st=addTrafficVehicle(initialTrafficState(),"NS");
  const stopped=stepTrafficState(st,false,false,false,50);
  assert.ok(stopped.vehicles[0].position<0.39);
  // A stop command in RUN deenergizes all phase bits before the next cycle.
  plc=startPracticeScans(initialPracticeScanState(createTrafficExampleProject()));
  plc=press(plc,"Tr_StartPB");
  plc=press(plc,"Tr_StopPB");
  exclusive(plc);
  assert.equal(bool(plc,"Tr_Run"),false);
  assert.equal(TRAFFIC_PHASES.some(phase=>bool(plc,phase)),false);
});

test("scene 4 connects selector, separate project, SCADA and help dialog",()=>{
  const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  const view=readFileSync(new URL("../src/components/ide/TrafficScene.tsx",import.meta.url),"utf8");
  const help=readFileSync(new URL("../src/components/ide/TrafficSceneInfoDialog.tsx",import.meta.url),"utf8");
  assert.match(app,/<option value="traffic">Intersección semaforizada<\/option>/);
  assert.match(app,/traffic: initialPracticeScanState\(initialTrafficProject\(\)\)/);
  assert.match(app,/stepTrafficState\(previous,/);
  assert.match(app,/applySceneSensorBoolInput\(updated,tag,true\)/);
  assert.match(view,/Vista de proceso/);
  assert.match(view,/Tablero de mando/);
  assert.match(view,/Pilotos LED y tráfico/);
  assert.match(view,/MomentaryPushButton compact name="PEATÓN"/);
  assert.match(help,/Cargar plantilla Ladder/);
});
