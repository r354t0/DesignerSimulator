import {
  createRung, createTag, initialPracticeProject, insertInstruction,
  createIndependentParallelBranch, insertIntoIndependentOrUpper, addParallelContact,
  setTagValue, type EditableKind, type PracticeProject, type TagType,
} from "./practiceDocument.ts";

export const TRAFFIC_TIMERS: Readonly<Record<string, number>> = {
  Tr_TNSGreen: 5000, Tr_TNSYellow: 1800, Tr_TAllRed1: 900,
  Tr_TEWGreen: 5000, Tr_TEWYellow: 1800, Tr_TAllRed2: 900,
  Tr_TWalk: 3000,
};
export const TRAFFIC_PHASES = [
  "Tr_NSPhase", "Tr_NSYPhase", "Tr_Red1Phase", "Tr_EWPhase",
  "Tr_EWYPhase", "Tr_Red2Phase", "Tr_WalkPhase",
] as const;
export type TrafficDirection = "NS" | "EW";
export const TRAFFIC_TAGS: readonly {
  name: string; type: TagType; direction: "Entrada" | "Salida" | "Interna"; description: string;
}[] = [
  { name:"Tr_StartPB",type:"BOOL",direction:"Entrada",description:"Pulsador START" },
  { name:"Tr_StopPB",type:"BOOL",direction:"Entrada",description:"Pulsador STOP" },
  { name:"Tr_ResetPB",type:"BOOL",direction:"Entrada",description:"RESET contadores" },
  { name:"Tr_PedPB",type:"BOOL",direction:"Entrada",description:"Solicitud peatonal" },
  { name:"Tr_NSWaiting",type:"BOOL",direction:"Entrada",description:"Vehículos esperando N-S" },
  { name:"Tr_EWWaiting",type:"BOOL",direction:"Entrada",description:"Vehículos esperando E-O" },
  { name:"Tr_NSExit",type:"BOOL",direction:"Entrada",description:"Paso vehículo N-S" },
  { name:"Tr_EWExit",type:"BOOL",direction:"Entrada",description:"Paso vehículo E-O" },
  ...(["NS","EW"] as const).flatMap(axis =>
    (["Green","Yellow","Red"] as const).map(light => ({
      name:"Tr_"+axis+"_"+light,type:"BOOL" as TagType,
      direction:"Salida" as const,description:axis+" · "+light,
    }))),
  { name:"Tr_Walk",type:"BOOL",direction:"Salida",description:"Paso peatonal" },
  { name:"Tr_Run",type:"BOOL",direction:"Interna",description:"Ciclo automático" },
  { name:"Tr_PedPending",type:"BOOL",direction:"Interna",description:"Petición pendiente" },
  { name:"Tr_Fault",type:"BOOL",direction:"Interna",description:"Conflicto de fases" },
  ...TRAFFIC_PHASES.map((name,index)=>({
    name,type:"BOOL" as TagType,direction:"Interna" as const,
    description:["Verde N-S","Amarillo N-S","Rojo seguridad 1",
      "Verde E-O","Amarillo E-O","Rojo seguridad 2","Paso peatonal"][index],
  })),
  ...["Tr_ToNSY","Tr_ToR1","Tr_ToEW","Tr_ToEWY","Tr_ToR2","Tr_ToPed","Tr_ToNS"].map(name=>({
    name,type:"BOOL" as TagType,direction:"Interna" as const,description:"Transición "+name.slice(5),
  })),
  ...Object.keys(TRAFFIC_TIMERS).map(name=>({
    name,type:"TIMER" as TagType,direction:"Interna" as const,description:"Tiempo "+name.slice(4),
  })),
  { name:"Tr_CountNS",type:"COUNTER",direction:"Interna",description:"Vehículos N-S" },
  { name:"Tr_CountEW",type:"COUNTER",direction:"Interna",description:"Vehículos E-O" },
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
  for(const tag of ["Tr_CountNS","Tr_CountEW"]) p=setTagValue(p,tag,9999,"PRE");
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
  or("rung-1",[x("Tr_StartPB")],[x("Tr_Run")],
    [n("Tr_StopPB"),n("Tr_Fault")],o("OTE","Tr_Run"));
  rung("tr-ped-request",[x("Tr_PedPB"),x("Tr_Run"),o("OTL","Tr_PedPending")]);
  // Initial state and the return from EW all-red / pedestrian phase.
  or("tr-start-ns",
    [x("Tr_Run"),...TRAFFIC_PHASES.map(n)],
    [x("Tr_ToNS")],[],o("OTL","Tr_NSPhase"));

  const transitions=[
    ["NS","Tr_NSPhase","Tr_TNSGreen","Tr_ToNSY","Tr_NSYPhase"],
    ["NSY","Tr_NSYPhase","Tr_TNSYellow","Tr_ToR1","Tr_Red1Phase"],
    ["R1","Tr_Red1Phase","Tr_TAllRed1","Tr_ToEW","Tr_EWPhase"],
    ["EW","Tr_EWPhase","Tr_TEWGreen","Tr_ToEWY","Tr_EWYPhase"],
    ["EWY","Tr_EWYPhase","Tr_TEWYellow","Tr_ToR2","Tr_Red2Phase"],
  ] as const;
  for(const [id,from,timer,to,next] of transitions) {
    rung("tr-timer-"+id,[x(from),x("Tr_Run"),o("TON",timer)]);
    rung("tr-transition-"+id,[x(from),x(timer+".DN"),x("Tr_Run"),
      n("Tr_Fault"),o("OTE",to)]);
    or("tr-leave-"+id,[x(to)],[n("Tr_Run")],[],o("OTU",from));
    rung("tr-enter-"+id,[x(to),o("OTL",next)]);
  }
  rung("tr-timer-R2",[x("Tr_Red2Phase"),x("Tr_Run"),o("TON","Tr_TAllRed2")]);
  rung("tr-timer-ped",[x("Tr_WalkPhase"),x("Tr_Run"),o("TON","Tr_TWalk")]);
  // Pedestrian branch is entered ONLY after EW amber + all-red clearance.
  rung("tr-to-ped",[x("Tr_Red2Phase"),x("Tr_TAllRed2.DN"),
    x("Tr_PedPending"),x("Tr_Run"),o("OTE","Tr_ToPed")]);
  // Return to NS either when no pedestrian is pending, OR walk time elapsed.
  or("tr-to-ns",[x("Tr_Red2Phase"),x("Tr_TAllRed2.DN"),n("Tr_PedPending")],
    [x("Tr_WalkPhase"),x("Tr_TWalk.DN")],
    [x("Tr_Run")],o("OTE","Tr_ToNS"));
  or("tr-leave-R2",[x("Tr_ToPed")],[x("Tr_ToNS")],
    [],o("OTU","Tr_Red2Phase"));
  // Stop cleanup is handled by the subsequent stop-cleanup rung.
  rung("tr-enter-ped",[x("Tr_ToPed"),o("OTL","Tr_WalkPhase")]);
  or("tr-end-ped",[x("Tr_ToNS")],[n("Tr_Run")],[],o("OTU","Tr_WalkPhase"));
  or("tr-clear-request",[x("Tr_ToPed")],[n("Tr_Run")],
    [],o("OTU","Tr_PedPending"));

  // If the PLC Run latch drops, clear Red2 phase too.
  rung("tr-stop-red2",[n("Tr_Run"),o("OTU","Tr_Red2Phase")]);
  // More than one active vehicle direction indicates an invalid control state.
  or("tr-conflict",[x("Tr_NSPhase"),x("Tr_EWPhase")],
    [x("Tr_NSYPhase"),x("Tr_EWYPhase")],[],o("OTL","Tr_Fault"));
  rung("tr-reset-fault",[x("Tr_ResetPB"),n("Tr_Run"),o("OTU","Tr_Fault")]);

  rung("tr-ns-green",[x("Tr_Run"),x("Tr_NSPhase"),n("Tr_Fault"),
    n("Tr_EWPhase"),n("Tr_WalkPhase"),o("OTE","Tr_NS_Green")]);
  rung("tr-ns-yellow",[x("Tr_Run"),x("Tr_NSYPhase"),n("Tr_Fault"),
    n("Tr_EWYPhase"),n("Tr_WalkPhase"),o("OTE","Tr_NS_Yellow")]);
  rung("tr-ew-green",[x("Tr_Run"),x("Tr_EWPhase"),n("Tr_Fault"),
    n("Tr_NSPhase"),n("Tr_WalkPhase"),o("OTE","Tr_EW_Green")]);
  rung("tr-ew-yellow",[x("Tr_Run"),x("Tr_EWYPhase"),n("Tr_Fault"),
    n("Tr_NSYPhase"),n("Tr_WalkPhase"),o("OTE","Tr_EW_Yellow")]);
  rung("tr-ns-red",[n("Tr_NS_Green"),n("Tr_NS_Yellow"),o("OTE","Tr_NS_Red")]);
  rung("tr-ew-red",[n("Tr_EW_Green"),n("Tr_EW_Yellow"),o("OTE","Tr_EW_Red")]);
  rung("tr-walk-lamp",[x("Tr_Run"),x("Tr_WalkPhase"),n("Tr_Fault"),
    n("Tr_NS_Green"),n("Tr_EW_Green"),o("OTE","Tr_Walk")]);
  rung("tr-count-ns",[x("Tr_NSExit"),o("CTU","Tr_CountNS")]);
  rung("tr-count-ew",[x("Tr_EWExit"),o("CTU","Tr_CountEW")]);
  rung("tr-reset-ns",[x("Tr_ResetPB"),n("Tr_Run"),o("RES","Tr_CountNS")]);
  rung("tr-reset-ew",[x("Tr_ResetPB"),n("Tr_Run"),o("RES","Tr_CountEW")]);
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
