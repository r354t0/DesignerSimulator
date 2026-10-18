import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, insertIntoIndependentOrUpper, addParallelContact,
  setTagValue, type EditableKind, type PracticeProject, type TagType,
} from "./practiceDocument.ts";

export const TRAFFIC_TIMERS: Readonly<Record<string, number>> = {
  TMR_NS_Green: 5000, TMR_NS_Yellow: 1800, TMR_AllRed1: 900,
  TMR_EW_Green: 5000, TMR_EW_Yellow: 1800, TMR_AllRed2: 900,
  TMR_Pedestrian: 3000,
};
export const TRAFFIC_PHASES = [
  "ST_NS_GreenPhase", "ST_NS_YellowPhase", "ST_AllRed1Phase", "ST_EW_GreenPhase",
  "ST_EW_YellowPhase", "ST_AllRed2Phase", "ST_PedestrianPhase",
] as const;
export type TrafficDirection = "NS" | "EW";
export const TRAFFIC_TAGS: readonly {
  name: string; type: TagType; direction: "Entrada" | "Salida" | "Interna"; description: string;
}[] = [
  { name:"PB_Start",type:"BOOL",direction:"Entrada",description:"Pulsador START" },
  { name:"PB_Stop",type:"BOOL",direction:"Entrada",description:"Pulsador STOP" },
  { name:"PB_Reset",type:"BOOL",direction:"Entrada",description:"RESET contadores" },
  { name:"PB_Pedestrian",type:"BOOL",direction:"Entrada",description:"Solicitud peatonal" },
  { name:"DI_NSWaiting",type:"BOOL",direction:"Entrada",description:"Vehículos esperando N-S" },
  { name:"DI_EWWaiting",type:"BOOL",direction:"Entrada",description:"Vehículos esperando E-O" },
  { name:"DI_NSExit",type:"BOOL",direction:"Entrada",description:"Paso vehículo N-S" },
  { name:"DI_EWExit",type:"BOOL",direction:"Entrada",description:"Paso vehículo E-O" },
  ...(["NS","EW"] as const).flatMap(axis =>
    (["Green","Yellow","Red"] as const).map(light => ({
      name:"DO_"+axis+"_"+light+"Light",type:"BOOL" as TagType,
      direction:"Salida" as const,description:axis+" · "+light,
    }))),
  { name:"DO_PedestrianWalk",type:"BOOL",direction:"Salida",description:"Paso peatonal" },
  { name:"ST_RunEnable",type:"BOOL",direction:"Interna",description:"Ciclo automático" },
  { name:"ST_PedPending",type:"BOOL",direction:"Interna",description:"Petición pendiente" },
  { name:"ALM_PhaseConflict",type:"BOOL",direction:"Interna",description:"Conflicto de fases" },
  ...TRAFFIC_PHASES.map((name,index)=>({
    name,type:"BOOL" as TagType,direction:"Interna" as const,
    description:["Verde N-S","Amarillo N-S","Rojo seguridad 1",
      "Verde E-O","Amarillo E-O","Rojo seguridad 2","Paso peatonal"][index],
  })),
  ...["ST_ToNSYellow","ST_ToAllRed1","ST_ToEWGreen","ST_ToEWYellow","ST_ToAllRed2","ST_ToPedestrian","ST_ToNSGreen"].map(name=>({
    name,type:"BOOL" as TagType,direction:"Interna" as const,description:"Transición "+name.slice(3),
  })),
  ...Object.keys(TRAFFIC_TIMERS).map(name=>({
    name,type:"TIMER" as TagType,direction:"Interna" as const,description:"Tiempo "+name.slice(4),
  })),
  { name:"CNT_NS_Vehicles",type:"COUNTER",direction:"Interna",description:"Vehículos N-S" },
  { name:"CNT_EW_Vehicles",type:"COUNTER",direction:"Interna",description:"Vehículos E-O" },
];

export function readTrafficBool(project: PracticeProject, name: string): boolean {
  const tag=project.tags.find(t=>t.name===name);
  return tag?.type==="BOOL" && tag.value===true;
}
export function readTrafficCount(project: PracticeProject, name: string): number {
  const tag=project.tags.find(t=>t.name===name);
  return tag?.type==="COUNTER" && typeof tag.value==="object" &&
    typeof tag.value.ACC==="number" ? tag.value.ACC : 0;
}
export function prepareTrafficTags(project: PracticeProject): PracticeProject {
  for(const spec of TRAFFIC_TAGS) {
    const tag=project.tags.find(t=>t.name.toLowerCase()===spec.name.toLowerCase());
    if(tag && (tag.name!==spec.name || tag.type!==spec.type))
      throw Error("Tag incompatible con semáforos: "+spec.name+" ("+spec.type+").");
  }
  let result=project;
  for(const spec of TRAFFIC_TAGS) {
    const tag=result.tags.find(t=>t.name===spec.name);
    if(!tag) result=createTag(result,spec.name,spec.description,spec.type);
    else if(!tag.description.trim()) result={...result,
      tags:result.tags.map(t=>t.name===spec.name?{...t,description:spec.description}:t)};
  }
  return result;
}
export function initialTrafficProject(): PracticeProject {
  return prepareTrafficTags({...initialPracticeProject(),tags:[]});
}

/** Explicit training solution: all decisions, phases, lamps and counts are Ladder-driven. */
export function createTrafficExampleProject(): PracticeProject {
  let p=initialTrafficProject();
  for(const [name,pre] of Object.entries(TRAFFIC_TIMERS)) p=setTagValue(p,name,pre,"PRE");
  for(const tag of ["CNT_NS_Vehicles","CNT_EW_Vehicles"]) p=setTagValue(p,tag,9999,"PRE");
  type S={kind:EditableKind;tag:string};
  const x=(tag:string):S=>({kind:"XIC",tag});
  const n=(tag:string):S=>({kind:"XIO",tag});
  const o=(kind:"OTE"|"OTL"|"OTU"|"TON"|"CTU"|"RES",tag:string):S=>({kind,tag});
  let serial=0;
  function rung(id:string, ins:S[]) {
    if(id!=="rung-1") p=createRung(p,id);
    ins.forEach((i,k)=>{p=insertInstruction(p,id,k,{...i,id:"tr-"+(++serial)});});
  }
  function or(id:string, upper:S[],lower:S[],after:S[],coil:S) {
    rung(id,[coil]);
    p=createIndependentParallelBranch(p,id);
    const anchor=p.rungs.find(r=>r.id===id)!.instructions.find(i=>i.kind==="OR_JUNCTION")!.id;
    for(const spec of upper)
      p=insertIntoIndependentOrUpper(p,id,anchor,{...spec,id:"tr-"+(++serial)});
    for(const spec of lower)
      p=addParallelContact(p,id,anchor,{...spec,id:"tr-"+(++serial)});
    const position=p.rungs.find(r=>r.id===id)!.instructions.filter(i=>i.kind!=="OTE"&&
      i.kind!=="OTL"&&i.kind!=="OTU"&&i.kind!=="TON"&&i.kind!=="CTU"&&i.kind!=="RES").length;
    after.forEach((spec,k)=>{p=insertInstruction(p,id,position+k,{...spec,id:"tr-"+(++serial)});});
  }
  // Self-holding run, while STOP/Fault inhibit new and existing phases.
  or("rung-1",[x("PB_Start")],[x("ST_RunEnable")],
    [n("PB_Stop"),n("ALM_PhaseConflict")],o("OTE","ST_RunEnable"));
  rung("tr-ped-request",[x("PB_Pedestrian"),x("ST_RunEnable"),o("OTL","ST_PedPending")]);
  // Initial state and the return from EW all-red / pedestrian phase.
  or("tr-start-ns",
    [x("ST_RunEnable"),...TRAFFIC_PHASES.map(n)],
    [x("ST_ToNSGreen")],[],o("OTL","ST_NS_GreenPhase"));

  const transitions=[
    ["NS","ST_NS_GreenPhase","TMR_NS_Green","ST_ToNSYellow","ST_NS_YellowPhase"],
    ["NSY","ST_NS_YellowPhase","TMR_NS_Yellow","ST_ToAllRed1","ST_AllRed1Phase"],
    ["R1","ST_AllRed1Phase","TMR_AllRed1","ST_ToEWGreen","ST_EW_GreenPhase"],
    ["EW","ST_EW_GreenPhase","TMR_EW_Green","ST_ToEWYellow","ST_EW_YellowPhase"],
    ["EWY","ST_EW_YellowPhase","TMR_EW_Yellow","ST_ToAllRed2","ST_AllRed2Phase"],
  ] as const;
  for(const [id,from,timer,to,next] of transitions) {
    rung("tr-timer-"+id,[x(from),x("ST_RunEnable"),o("TON",timer)]);
    rung("tr-transition-"+id,[x(from),x(timer+".DN"),x("ST_RunEnable"),
      n("ALM_PhaseConflict"),o("OTE",to)]);
    or("tr-leave-"+id,[x(to)],[n("ST_RunEnable")],[],o("OTU",from));
    rung("tr-enter-"+id,[x(to),o("OTL",next)]);
  }
  rung("tr-timer-R2",[x("ST_AllRed2Phase"),x("ST_RunEnable"),o("TON","TMR_AllRed2")]);
  rung("tr-timer-ped",[x("ST_PedestrianPhase"),x("ST_RunEnable"),o("TON","TMR_Pedestrian")]);
  // Pedestrian branch is entered ONLY after EW amber + all-red clearance.
  rung("tr-to-ped",[x("ST_AllRed2Phase"),x("TMR_AllRed2.DN"),
    x("ST_PedPending"),x("ST_RunEnable"),o("OTE","ST_ToPedestrian")]);
  // Return to NS either when no pedestrian is pending, OR walk time elapsed.
  or("tr-to-ns",[x("ST_AllRed2Phase"),x("TMR_AllRed2.DN"),n("ST_PedPending")],
    [x("ST_PedestrianPhase"),x("TMR_Pedestrian.DN")],
    [x("ST_RunEnable")],o("OTE","ST_ToNSGreen"));
  or("tr-leave-R2",[x("ST_ToPedestrian")],[x("ST_ToNSGreen")],
    [],o("OTU","ST_AllRed2Phase"));
  // Stop cleanup is handled by the subsequent stop-cleanup rung.
  rung("tr-enter-ped",[x("ST_ToPedestrian"),o("OTL","ST_PedestrianPhase")]);
  or("tr-end-ped",[x("ST_ToNSGreen")],[n("ST_RunEnable")],[],o("OTU","ST_PedestrianPhase"));
  or("tr-clear-request",[x("ST_ToPedestrian")],[n("ST_RunEnable")],
    [],o("OTU","ST_PedPending"));

  // If the PLC Run latch drops, clear Red2 phase too.
  rung("tr-stop-red2",[n("ST_RunEnable"),o("OTU","ST_AllRed2Phase")]);
  // More than one active vehicle direction indicates an invalid control state.
  or("tr-conflict",[x("ST_NS_GreenPhase"),x("ST_EW_GreenPhase")],
    [x("ST_NS_YellowPhase"),x("ST_EW_YellowPhase")],[],o("OTL","ALM_PhaseConflict"));
  rung("tr-reset-fault",[x("PB_Reset"),n("ST_RunEnable"),o("OTU","ALM_PhaseConflict")]);

  rung("tr-ns-green",[x("ST_RunEnable"),x("ST_NS_GreenPhase"),n("ALM_PhaseConflict"),
    n("ST_EW_GreenPhase"),n("ST_PedestrianPhase"),o("OTE","DO_NS_GreenLight")]);
  rung("tr-ns-yellow",[x("ST_RunEnable"),x("ST_NS_YellowPhase"),n("ALM_PhaseConflict"),
    n("ST_EW_YellowPhase"),n("ST_PedestrianPhase"),o("OTE","DO_NS_YellowLight")]);
  rung("tr-ew-green",[x("ST_RunEnable"),x("ST_EW_GreenPhase"),n("ALM_PhaseConflict"),
    n("ST_NS_GreenPhase"),n("ST_PedestrianPhase"),o("OTE","DO_EW_GreenLight")]);
  rung("tr-ew-yellow",[x("ST_RunEnable"),x("ST_EW_YellowPhase"),n("ALM_PhaseConflict"),
    n("ST_NS_YellowPhase"),n("ST_PedestrianPhase"),o("OTE","DO_EW_YellowLight")]);
  rung("tr-ns-red",[n("DO_NS_GreenLight"),n("DO_NS_YellowLight"),o("OTE","DO_NS_RedLight")]);
  rung("tr-ew-red",[n("DO_EW_GreenLight"),n("DO_EW_YellowLight"),o("OTE","DO_EW_RedLight")]);
  rung("tr-walk-lamp",[x("ST_RunEnable"),x("ST_PedestrianPhase"),n("ALM_PhaseConflict"),
    n("DO_NS_GreenLight"),n("DO_EW_GreenLight"),o("OTE","DO_PedestrianWalk")]);
  rung("tr-count-ns",[x("DI_NSExit"),o("CTU","CNT_NS_Vehicles")]);
  rung("tr-count-ew",[x("DI_EWExit"),o("CTU","CNT_EW_Vehicles")]);
  rung("tr-reset-ns",[x("PB_Reset"),n("ST_RunEnable"),o("RES","CNT_NS_Vehicles")]);
  rung("tr-reset-ew",[x("PB_Reset"),n("ST_RunEnable"),o("RES","CNT_EW_Vehicles")]);
  return p;
}

export interface TrafficVehicle {
  id:number;
  axis:TrafficDirection;
  position:number; // normalized 0..1 of approach, intersection and exit
}
export interface TrafficState {
  vehicles:TrafficVehicle[];
  nextId:number;
  exitedNS:number;
  exitedEW:number;
}
export const initialTrafficState=():TrafficState=>({
  vehicles:[],nextId:1,exitedNS:0,exitedEW:0,
});
export function trafficWaiting(state:TrafficState,axis:TrafficDirection):boolean {
  return state.vehicles.some(v=>v.axis===axis && v.position<=0.38);
}
export function addTrafficVehicle(state:TrafficState,axis:TrafficDirection):TrafficState {
  if(state.vehicles.filter(v=>v.axis===axis).length>=7 ||
    state.vehicles.some(v=>v.axis===axis&&v.position<0.20)) return state;
  return {...state,nextId:state.nextId+1,vehicles:[
    ...state.vehicles,{id:state.nextId,axis,position:0.04},
  ]};
}
/** Physics never chooses a green signal; vehicles obey actual PLC output tags. */
export function stepTrafficState(state:TrafficState,greenNS:boolean,greenEW:boolean,
  walk:boolean,elapsedMs:number):TrafficState {
  if(!Number.isFinite(elapsedMs)||elapsedMs<=0||state.vehicles.length===0)return state;
  const dt=Math.min(elapsedMs,150)/1000;
  const vehicles:TrafficVehicle[]=[];
  let exitedNS=state.exitedNS,exitedEW=state.exitedEW;
  for(const v of state.vehicles) {
    const green=v.axis==="NS"?greenNS:greenEW;
    const danger=walk || (greenNS&&greenEW);
    const sameLane=state.vehicles.filter(other=>other.axis===v.axis && other.id!==v.id &&
      other.position>v.position && other.position-v.position<0.12).length>0;
    const halt=(!green||danger)&&v.position<0.39;
    const velocity=(!halt&&!sameLane)?0.25*dt:0;
    const newPosition=v.position<0.39 && halt?Math.min(v.position,0.35):
      Math.min(1.10,v.position+velocity);
    if(newPosition>=1) {
      if(v.axis==="NS")exitedNS++;else exitedEW++;
    }else vehicles.push({...v,position:newPosition});
  }
  return {...state,vehicles,exitedNS,exitedEW};
}
