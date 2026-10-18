import {
  createTag, createRung, insertInstruction, createParallelBranch,
  addParallelContact, setTagValue, initialPracticeProject,
  type PracticeProject, type PracticeInstruction, type TagType,
} from "./practiceDocument.ts";

export type BatchExercise = 1 | 2 | 3 | 4 | 5;
export type BatchMode = "A" | "B" | "C";
export interface BatchTagSpec {
  name: string;
  type: TagType;
  direction: "Entrada" | "Salida" | "Interna";
  description: string;
}
export const BATCH_IO_TAGS: readonly BatchTagSpec[] = [
  { name: "PB_Start", type: "BOOL", direction: "Entrada", description: "Pulsador momentáneo START" },
  { name: "PB_Stop", type: "BOOL", direction: "Entrada", description: "Pulsador momentáneo STOP" },
  { name: "PB_Enter", type: "BOOL", direction: "Entrada", description: "Confirmación de parámetros desde HMI" },
  { name: "DI_ModeA", type: "BOOL", direction: "Entrada", description: "Selector A, lote único" },
  { name: "DI_ModeB", type: "BOOL", direction: "Entrada", description: "Selector B, múltiples lotes" },
  { name: "DI_ModeC", type: "BOOL", direction: "Entrada", description: "Selector C, reserva / espera" },
  { name: "DI_Flowmeter1", type: "BOOL", direction: "Entrada", description: "Pulsos línea de producto 1" },
  { name: "DI_Flowmeter2", type: "BOOL", direction: "Entrada", description: "Pulsos línea de producto 2" },
  { name: "DI_Flowmeter3", type: "BOOL", direction: "Entrada", description: "Pulsos de descarga" },
  { name: "DI_HighLevel", type: "BOOL", direction: "Entrada", description: "Nivel alto, 100% del tanque" },
  { name: "DI_LowLevel", type: "BOOL", direction: "Entrada", description: "Nivel bajo, tanque vacío" },
  { name: "DI_Thermostat", type: "BOOL", direction: "Entrada",
    description: "Termostato digital: temperatura física >= INT_TempSP" },
  { name: "INT_TempSP", type: "INT", direction: "Entrada", description: "Consigna de temperatura (°C, entero)" },
  { name: "INT_RatioP1", type: "INT", direction: "Entrada", description: "Porcentaje producto 1 (0–100)" },
  { name: "INT_BatchTarget", type: "INT", direction: "Entrada", description: "Cantidad de lotes objetivo (1–99)" },
  { name: "DO_Pump1", type: "BOOL", direction: "Salida", description: "Bomba producto 1" },
  { name: "DO_Pump2", type: "BOOL", direction: "Salida", description: "Bomba producto 2" },
  { name: "DO_Pump3", type: "BOOL", direction: "Salida", description: "Bomba de drenaje" },
  { name: "DO_Mixer", type: "BOOL", direction: "Salida", description: "Agitador" },
  { name: "DO_Heater", type: "BOOL", direction: "Salida", description: "Resistencia de calentamiento" },
  { name: "DO_RunLamp", type: "BOOL", direction: "Salida", description: "Piloto RUN" },
  { name: "DO_IdleLamp", type: "BOOL", direction: "Salida", description: "Piloto IDLE" },
  { name: "DO_FullLamp", type: "BOOL", direction: "Salida", description: "Piloto FULL" },
  { name: "INT_DisplayValue", type: "INT", direction: "Salida", description: "Indicador decimal nativo del HMI" },
];
export const BATCH_INTERNAL_TAGS: readonly BatchTagSpec[] = [
  ...["ST_RunEnable","ST_Filling","ST_Full","ST_Mixing","ST_Draining",
      "ST_ToMix","ST_ToDrain","ST_ToDone","ST_BatchDone"]
    .map(name => ({ name, type: "BOOL" as TagType,
      direction: "Interna" as const, description: "Secuencia interna · " + name.slice(3) })),
  { name: "CNT_Volume", type: "COUNTER", direction: "Interna", description: "Volumen neto: CTU entrada / CTD salida" },
  { name: "TMR_Mix8s", type: "TIMER", direction: "Interna", description: "Mezclado de 8 s, retentivo para pausa" },
  { name: "TMR_PostTemp4s", type: "TIMER", direction: "Interna", description: "Mezcla 4 s después del termostato" },
  { name: "CNT_Product1", type: "COUNTER", direction: "Interna", description: "Pulsos de P1 para porcentaje de mezcla" },
  { name: "CNT_Lotes", type: "COUNTER", direction: "Interna", description: "Lotes terminados" },
];
export const BATCH_EXERCISES: readonly {
  id: BatchExercise;
  title: string;
  source: string;
  description: string;
  criteria: readonly string[];
}[] = [
  { id: 1, title: "Llenado con contador",
    source: "Lab 01 · Ejercicio 1",
    description: "Bomba P1 con pulsos de Flowmeter 1 y parada al 90%.",
    criteria: ["START energiza P1 y CTU cuenta los pulsos de FM1",
      "Al llegar a 90 pulsos se apaga P1 y se enciende FULL",
      "STOP detiene inmediatamente el llenado"] },
  { id: 2, title: "Mezclado y vaciado",
    source: "Lab 01 · Ejercicio 2",
    description: "Amplía el llenado con mezclado de 8 s y drenaje P3.",
    criteria: ["Después del llenado, Mixer gira durante 8 segundos",
      "P3 descarga y CTD descuenta los pulsos de FM3 hasta cero",
      "START permite comenzar otro lote tras vaciar el tanque"] },
  { id: 3, title: "Operación continua",
    source: "Lab 01 · Ejercicio 3",
    description: "La secuencia llena, mezcla y drena repetidamente.",
    criteria: ["La secuencia se repite automáticamente después del arranque",
      "RUN se ilumina si hay una bomba o mezclador activo; STOP activa IDLE",
      "START reanuda en la etapa donde se detuvo el proceso"] },
  { id: 4, title: "Lote único A",
    source: "Lab 02 · Ejercicio 1",
    description: "Dos productos con proporción ajustable, calentamiento y un solo lote.",
    criteria: ["Selector A permite iniciar un lote, detenerlo y reanudarlo",
      "P1 aporta INT_RatioP1% y P2 aporta el resto hasta DI_HighLevel",
      "FULL se activa; Heater y Mixer trabajan hasta DI_Thermostat",
      "Mixer continúa 4 s, luego P3 drena hasta DI_LowLevel",
      "Otro START permite ejecutar un nuevo lote"] },
  { id: 5, title: "Lotes múltiples B",
    source: "Lab 02 · Ejercicio 2",
    description: "Ejecuta lotes programados desde la interfaz numérica.",
    criteria: ["Selector B habilita la producción de varios lotes",
      "INT_BatchTarget define el número de lotes (1–99)",
      "INT_RatioP1 define el porcentaje del producto 1 (0–100)",
      "CNT_Lotes se muestra en el display INT_DisplayValue",
      "Al cumplir el objetivo, las bombas y el mezclador se detienen"] },
];

const additional: Record<BatchExercise, readonly string[]> = {
  1: ["ST_RunEnable","ST_Filling","ST_Full","CNT_Volume"],
  2: ["ST_RunEnable","ST_Filling","ST_Full","ST_Mixing","ST_Draining",
      "ST_ToMix","ST_ToDrain","ST_ToDone","ST_BatchDone","CNT_Volume","TMR_Mix8s"],
  3: ["ST_RunEnable","ST_Filling","ST_Full","ST_Mixing","ST_Draining",
      "ST_ToMix","ST_ToDrain","ST_ToDone","CNT_Volume","TMR_Mix8s"],
  4: ["ST_RunEnable","ST_Filling","ST_Full","ST_Mixing","ST_Draining",
      "ST_ToMix","ST_ToDrain","ST_ToDone","ST_BatchDone",
      "CNT_Product1","TMR_PostTemp4s"],
  5: ["ST_RunEnable","ST_Filling","ST_Full","ST_Mixing","ST_Draining",
      "ST_ToMix","ST_ToDrain","ST_ToDone","ST_BatchDone",
      "CNT_Product1","CNT_Lotes","TMR_PostTemp4s"],
};
export function batchSolutionTags(exercise: BatchExercise): BatchTagSpec[] {
  return BATCH_INTERNAL_TAGS.filter(tag => additional[exercise].includes(tag.name));
}
export function prepareBatchTags(project: PracticeProject): PracticeProject {
  // Install only physical SCADA-facing tags. Never secretly add solution tags.
  let result=project;
  for(const spec of BATCH_IO_TAGS) {
    const old=result.tags.find(tag=>tag.name.toLowerCase()===spec.name.toLowerCase());
    if(old && (old.name!==spec.name || old.type!==spec.type))
      throw new Error("Tag incompatible para Batch Mixer: "+spec.name);
    if(!old) result=createTag(result,spec.name,spec.description,spec.type);
  }
  return result;
}
export function initialBatchProject(): PracticeProject {
  let p=prepareBatchTags({...initialPracticeProject(),tags:[]});
  for (const [name,value] of [
    ["DI_ModeA",true],["DI_LowLevel",true],["INT_TempSP",32],
    ["INT_RatioP1",40],["INT_BatchTarget",3],
  ] as const) p=setTagValue(p,name,value);
  return p;
}
export function batchBool(project: PracticeProject, name: string): boolean {
  const tag=project.tags.find(t=>t.name===name);
  return tag?.type==="BOOL" && tag.value===true;
}
export function batchInt(project: PracticeProject, name: string): number {
  const tag=project.tags.find(t=>t.name===name);
  return tag?.type==="INT" && typeof tag.value==="number" ? tag.value : 0;
}
export function batchCounter(project: PracticeProject, name: string): number {
  const t=project.tags.find(tag=>tag.name===name);
  return t?.type==="COUNTER" && typeof t.value==="object" &&
    typeof t.value.ACC==="number" ? t.value.ACC : 0;
}

type Spec = Omit<PracticeInstruction,"id">;
const X=(tag:string):Spec=>({kind:"XIC",tag});
const N=(tag:string):Spec=>({kind:"XIO",tag});
const O=(kind:PracticeInstruction["kind"],tag:string):Spec=>({kind,tag});
const C=(kind:"GEQ"|"GRT"|"LES"|"LEQ"|"EQU",a:string,b:string|number):Spec=>({
  kind,tag:"",
  compareA:{mode:"tag",tag:a},
  compareB:typeof b==="number"?{mode:"literal",value:b}:{mode:"tag",tag:b},
});
const M=(dst:string,source:string):Spec=>({
  kind:"MOV",tag:dst,compareA:{mode:"tag",tag:source},
});

/** Creates real, editable rungs using the same instruction set as the IDE. */
export function createBatchSolution(exercise: BatchExercise): PracticeProject {
  let p=initialBatchProject();
  for (const tag of batchSolutionTags(exercise))
    p=createTag(p,tag.name,tag.description,tag.type);
  for(const tag of ["CNT_Volume","CNT_Product1","CNT_Lotes"]) {
    if(p.tags.some(t=>t.name===tag))
      p=setTagValue(p,tag,tag==="CNT_Volume"?90:tag==="CNT_Product1"?100:9999,"PRE");
  }
  for(const [name,ms] of [["TMR_Mix8s",8000],["TMR_PostTemp4s",4000]] as const) {
    if(p.tags.some(tag=>tag.name===name))p=setTagValue(p,name,ms,"PRE");
  }
  let serial=0;
  const ins=(a:Spec):PracticeInstruction=>({...a,id:"batch-"+exercise+"-"+(++serial)});
  const rung=(id:string,items:Spec[])=>{
    if(id!=="rung-1") p=createRung(p,id);
    items.forEach((i,k)=>{p=insertInstruction(p,id,k,ins(i));});
  };
  const any=(id:string,choices:Spec[],tail:Spec[],coil:Spec)=>{
    rung(id,[choices[0],...tail,coil]);
    const id0=p.rungs.find(r=>r.id===id)!.instructions[0].id;
    for(const choice of choices.slice(1)) {
      p=createParallelBranch(p,id,id0);
      const lane=p.rungs.find(r=>r.id===id)!.parallelBranches!.at(-1)!;
      p=addParallelContact(p,id,id0,ins(choice),undefined,lane.id);
    }
  };
  const advanced=exercise>=4;
  const continuous=exercise===3 || exercise===5;
  const endCondition=advanced?X("DI_HighLevel"):C("GEQ","CNT_Volume.ACC",90);
  const emptyCondition=advanced?X("DI_LowLevel"):C("LEQ","CNT_Volume.ACC",0);

  // Start/stop always affect actual outputs. Retained stage bits survive Stop.
  any("rung-1",[X("PB_Start"),X("ST_RunEnable")],
      [N("PB_Stop")],O("OTE","ST_RunEnable"));
  // A fresh START after a finished single batch clears the completion latch.
  if(!continuous&&exercise!==1)
    rung("bm-rearm",[X("PB_Start"),X("DI_LowLevel"),O("OTU","ST_BatchDone")]);
  const init=[X("PB_Start"),X("DI_LowLevel"),N("ST_Filling"),
    ...(exercise>=2?[N("ST_Mixing"),N("ST_Draining")]:[])];
  if(advanced) init.push(X(exercise===4?"DI_ModeA":"DI_ModeB"));
  if(exercise!==1) init.push(N("ST_BatchDone"));
  rung("bm-start-fill",[...init,O("OTL","ST_Filling")]);

  // Product line 1 is always counted from FM1 pulses; advanced percentage
  // is selected by comparing CNT_Product1.ACC to INT_RatioP1 (one pulse=1%).
  if(advanced) {
    rung("bm-p1",[X("ST_RunEnable"),X("ST_Filling"),N("DI_HighLevel"),
      C("LES","CNT_Product1.ACC","INT_RatioP1"),O("OTE","DO_Pump1")]);
    rung("bm-p2",[X("ST_RunEnable"),X("ST_Filling"),N("DI_HighLevel"),
      C("GEQ","CNT_Product1.ACC","INT_RatioP1"),O("OTE","DO_Pump2")]);
    rung("bm-ctu-p1",[X("DI_Flowmeter1"),O("CTU","CNT_Product1")]);
  }else{
    rung("bm-p1",[X("ST_RunEnable"),X("ST_Filling"),N("ST_Full"),O("OTE","DO_Pump1")]);
    rung("bm-ctu-level",[X("DI_Flowmeter1"),O("CTU","CNT_Volume")]);
  }

  if(exercise===1) {
    rung("bm-reach-90",[X("ST_Filling"),endCondition,O("OTL","ST_Full")]);
    rung("bm-stop-fill",[X("ST_Full"),O("OTU","ST_Filling")]);
    rung("bm-full-lamp",[X("ST_Full"),O("OTE","DO_FullLamp")]);
  }else{
    rung("bm-to-mix",[X("ST_Filling"),endCondition,O("OTE","ST_ToMix")]);
    rung("bm-leave-fill",[X("ST_ToMix"),O("OTU","ST_Filling")]);
    rung("bm-enter-mix",[X("ST_ToMix"),O("OTL","ST_Mixing")]);
    rung("bm-full-latch",[X("ST_ToMix"),O("OTL","ST_Full")]);
    rung("bm-full-lamp",[X("ST_Full"),O("OTE","DO_FullLamp")]);
    rung("bm-mixer",[X("ST_RunEnable"),X("ST_Mixing"),O("OTE","DO_Mixer")]);
    if(advanced) {
      // The thermostat is BOOL; actual temperature is private scene physics.
      rung("bm-heater",[X("ST_RunEnable"),X("ST_Mixing"),N("DI_Thermostat"),
        O("OTE","DO_Heater")]);
      rung("bm-timer",[X("ST_RunEnable"),X("ST_Mixing"),X("DI_Thermostat"),
        O("RTO","TMR_PostTemp4s")]);
      rung("bm-to-drain",[X("ST_Mixing"),X("TMR_PostTemp4s.DN"),
        O("OTE","ST_ToDrain")]);
    }else{
      rung("bm-timer",[X("ST_RunEnable"),X("ST_Mixing"),O("RTO","TMR_Mix8s")]);
      rung("bm-to-drain",[X("ST_Mixing"),X("TMR_Mix8s.DN"),
        O("OTE","ST_ToDrain")]);
    }
    rung("bm-leave-mix",[X("ST_ToDrain"),O("OTU","ST_Mixing")]);
    rung("bm-enter-drain",[X("ST_ToDrain"),O("OTL","ST_Draining")]);
    rung("bm-clear-full",[X("ST_ToDrain"),O("OTU","ST_Full")]);
    rung("bm-reset-mix",[X("ST_ToDrain"),
      O("RES",advanced?"TMR_PostTemp4s":"TMR_Mix8s")]);
    rung("bm-drain-pump",[X("ST_RunEnable"),X("ST_Draining"),O("OTE","DO_Pump3")]);
    if(!advanced)
      rung("bm-ctd-volume",[X("DI_Flowmeter3"),O("CTD","CNT_Volume")]);
    rung("bm-drained",[X("ST_Draining"),emptyCondition,O("OTE","ST_ToDone")]);

    // Single batch awaits a fresh Start. Continuous and B mode re-enter fill.
    if(exercise===5) {
      rung("bm-lot-counter",[X("ST_ToDone"),O("CTU","CNT_Lotes")]);
      rung("bm-next-fill",[X("ST_ToDone"),X("ST_RunEnable"),
        C("LES","CNT_Lotes.ACC","INT_BatchTarget"),O("OTL","ST_Filling")]);
      rung("bm-batch-complete",[X("ST_ToDone"),
        C("GEQ","CNT_Lotes.ACC","INT_BatchTarget"),O("OTL","ST_BatchDone")]);
      rung("bm-clear-p1",[X("ST_ToDone"),O("RES","CNT_Product1")]);
    }else if(exercise===3) {
      rung("bm-next-fill",[X("ST_ToDone"),X("ST_RunEnable"),O("OTL","ST_Filling")]);
    }else{
      rung("bm-batch-complete",[X("ST_ToDone"),O("OTL","ST_BatchDone")]);
      if(advanced)rung("bm-clear-p1",[X("ST_ToDone"),O("RES","CNT_Product1")]);
    }
    rung("bm-leave-drain",[X("ST_ToDone"),O("OTU","ST_Draining")]);
  }
  const runningOutputs=exercise===1?["DO_Pump1"]:exercise>=4?
    ["DO_Pump1","DO_Pump2","DO_Pump3","DO_Mixer"]:
    ["DO_Pump1","DO_Pump3","DO_Mixer"];
  any("bm-run-lamp",runningOutputs.map(X),[],O("OTE","DO_RunLamp"));
  rung("bm-idle-lamp",[N("ST_RunEnable"),O("OTE","DO_IdleLamp")]);
  rung("bm-display",[M("INT_DisplayValue",exercise===5?"CNT_Lotes.ACC":
    exercise>=4?"CNT_Product1.ACC":"CNT_Volume.ACC")]);
  return p;
}

export interface BatchMixerState {
  level: number;
  temperature: number;
  pulseCarry: [number,number,number];
  totalPulses: [number,number,number];
}
export const initialBatchState=():BatchMixerState=>({
  level:0,temperature:20,pulseCarry:[0,0,0],totalPulses:[0,0,0],
});
export const BATCH_PULSES_PER_SECOND=8;
export function batchDigitalSensors(state: BatchMixerState,sp:number) {
  return {
    DI_LowLevel: state.level<=0,
    DI_HighLevel: state.level>=100,
    DI_Thermostat: state.temperature>=sp,
  };
}
/** Physical process only. No stage decisions or hidden automatic solutions. */
export function stepBatchPhysics(state:BatchMixerState,outputs:{
  pump1:boolean;pump2:boolean;pump3:boolean;heater:boolean;
},elapsedMs:number):BatchMixerState {
  if(!Number.isFinite(elapsedMs)||elapsedMs<=0)return state;
  const dt=Math.min(elapsedMs,150)/1000;
  const carry:[number,number,number]=[...state.pulseCarry];
  const total:[number,number,number]=[...state.totalPulses];
  let level=state.level;
  for(let i=0;i<3;i++) {
    const enabled=i===0?outputs.pump1:i===1?outputs.pump2:outputs.pump3;
    if(!enabled) {carry[i]=0;continue;}
    carry[i]+=BATCH_PULSES_PER_SECOND*dt;
    while(carry[i]>=1) {
      carry[i]-=1;
      if(i===2&&level<=0){carry[i]=0;break;}
      if(i!==2&&level>=100){carry[i]=0;break;}
      level=Math.max(0,Math.min(100,level+(i===2?-1:1)));
      total[i]++;
    }
  }
  const temperature=Math.max(20,Math.min(95,state.temperature+
    (outputs.heater&&level>0 ? dt*4 : 0)));
  return {...state,level,temperature,pulseCarry:carry,totalPulses:total};
}
