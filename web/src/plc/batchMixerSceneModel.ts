import {
  createTag, createRung, insertInstruction, createParallelBranch,
  setInstructionPreset,
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
  { name: "DI_HighLevel", type: "BOOL", direction: "Entrada", description: "Sensor alto: TRUE solo cuando el líquido lo cubre (100%)" },
  { name: "DI_LowLevel", type: "BOOL", direction: "Entrada", description: "Sensor inferior: TRUE mientras está mojado; FALSE con tanque vacío (0%)" },
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
];
export const BATCH_INTERNAL_TAGS: readonly BatchTagSpec[] = [
  ...["ST_RunEnable","ST_Filling","ST_Full","ST_Mixing","ST_Draining",
      "ST_ToMix","ST_ToDrain","ST_ToDone","ST_BatchDone"]
    .map(name => ({ name, type: "BOOL" as TagType,
      direction: "Interna" as const, description: "Secuencia interna · " + name.slice(3) })),
  { name: "CNT_Volume", type: "COUNTER", direction: "Interna", description: "Volumen neto: CTU entrada / CTD salida" },
  { name: "TMR_Mix8s", type: "TIMER", direction: "Interna", description: "Mezclado de 8 s, retentivo para pausa" },
  { name: "TMR_Mixing", type: "TIMER", direction: "Interna", description: "TON de 8000 ms para la fase de mezcla del ejercicio 2" },
  { name: "TMR_PostTemp4s", type: "TIMER", direction: "Interna", description: "Mezcla 4 s después del termostato" },
  { name: "CNT_Product1", type: "COUNTER", direction: "Interna", description: "Pulsos de P1 para porcentaje de mezcla" },
  { name: "ST_P1PulseTarget", type: "INT", direction: "Interna",
    description: "Objetivo P1 en pulsos: INT_RatioP1 × 10 (0,1 % por pulso)" },
  { name: "INT_PresetP1", type: "INT", direction: "Interna",
    description: "Pulsos para producto 1: INT_RatioP1 × 10" },
  { name: "ST_BatchComplete", type: "BOOL", direction: "Interna",
    description: "Pulso de lote terminado al vaciar el tanque" },
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
      "Al llegar a 900 pulsos (90 %) se apaga P1 y se enciende FULL",
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
      "Mixer continúa 4 s, luego P3 drena hasta que DI_LowLevel se desactiva (tanque vacío)",
      "Otro START permite ejecutar un nuevo lote"] },
  { id: 5, title: "Lotes múltiples B",
    source: "Lab 02 · Ejercicio 2",
    description: "Ejecuta lotes programados desde la interfaz numérica.",
    criteria: ["Selector B habilita la producción de varios lotes",
      "INT_BatchTarget define el número de lotes (1–99)",
      "INT_RatioP1 define el porcentaje del producto 1 (0–100)",
      "El SCADA muestra CNT_Lotes.ACC como número de lotes completados",
      "Al cumplir el objetivo, las bombas y el mezclador se detienen"] },
];

const additional: Record<BatchExercise, readonly string[]> = {
  1: ["ST_RunEnable","ST_Filling","ST_Full","CNT_Volume"],
  2: ["ST_RunEnable","ST_Filling","ST_Full","ST_Draining",
      "CNT_Volume","TMR_Mixing"],
  3: ["ST_RunEnable","ST_Filling","ST_Full","ST_Draining",
      "CNT_Volume","TMR_Mixing"],
  4: ["ST_RunEnable","ST_Filling","ST_Full","ST_Draining",
      "CNT_Volume","INT_PresetP1","TMR_Mixing"],
  5: ["ST_RunEnable","ST_Filling","ST_Full","ST_Draining",
      "ST_BatchComplete","CNT_Volume","INT_PresetP1","TMR_Mixing","CNT_Lotes"],
};
export function batchSolutionTags(exercise: BatchExercise): BatchTagSpec[] {
  return BATCH_INTERNAL_TAGS.filter(tag => additional[exercise].includes(tag.name));
}
/** The information table for Lab 01 mirrors the tags that actually occur
 * in the recommended rungs (including SCADA I/O and internal declarations).
 * Timer/counter member references are listed under their parent tag. */
export function batchSolutionUsedTags(exercise: BatchExercise): BatchTagSpec[] {
  const solution=createBatchSolution(exercise);
  const used=new Set<string>();
  const include=(operand?:string)=>{
    if(operand)used.add(operand.split(".")[0]);
  };
  for(const rung of solution.rungs){
    for(const item of [
      ...rung.instructions,
      ...(rung.parallelBranches??[]).flatMap(branch=>branch.instructions),
    ]){
      include(item.tag);
      if(item.compareA?.mode==="tag")include(item.compareA.tag);
      if(item.compareB?.mode==="tag")include(item.compareB.tag);
      if(item.preset?.mode==="tag")include(item.preset.tag);
    }
  }
  return [...BATCH_IO_TAGS,...BATCH_INTERNAL_TAGS]
    .filter(spec=>used.has(spec.name));
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
    ["DI_ModeA",true],["INT_TempSP",32],
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
const scaleP1=():Spec=>({
  kind:"MUL",tag:"INT_PresetP1",
  compareA:{mode:"tag",tag:"INT_RatioP1"},
  compareB:{mode:"literal",value:10},
});

/** Creates real, editable rungs using the same instruction set as the IDE. */
export function createBatchSolution(exercise: BatchExercise): PracticeProject {
  let p=initialBatchProject();
  if(exercise===5) {
    p=setTagValue(p,"DI_ModeA",false);
    p=setTagValue(p,"DI_ModeB",true);
  }
  for (const tag of batchSolutionTags(exercise))
    p=createTag(p,tag.name,tag.description,tag.type);
  if(exercise>=4) p=setTagValue(p,"INT_PresetP1",
    Math.min(1000,Math.max(0,batchInt(p,"INT_RatioP1")*10)));
  for(const tag of ["CNT_Volume","CNT_Lotes"]) {
    if(p.tags.some(t=>t.name===tag))
      p=setTagValue(p,tag,tag==="CNT_Volume"
        ? (exercise>=4?batchInt(p,"INT_PresetP1"):900)
        : batchInt(p,"INT_BatchTarget"),"PRE");
  }
  for(const [name,ms] of [["TMR_Mixing",exercise>=4?4000:8000]] as const) {
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
  // LAB 01 · Progressive reference solutions:
  // E1 = 6 rungs; E2 = the same 6 + 6 (TON, mixer, drain);
  // E3 = E2 with exactly two pilot rungs inserted after R0.
  // No hidden process states or extra output/display rungs.
  if (exercise===1 || exercise===2 || exercise===3) {
    // R0: (PB_Start OR ST_RunEnable) AND NOT PB_Stop -> ST_RunEnable.
    any("rung-1",[X("PB_Start"),X("ST_RunEnable")],
      [N("PB_Stop")],O("OTE","ST_RunEnable"));
    if(exercise===3){
      // R1: (PB_Stop OR DO_IdleLamp) AND NOT PB_Start -> IDLE.
      // The IDE output OTE seals in the idle pilot until START is pressed.
      any("bm-idle-lamp",[X("PB_Stop"),X("DO_IdleLamp")],
        [N("PB_Start")],O("OTE","DO_IdleLamp"));
      // R2: ST_RunEnable energizes the RUN pilot.
      rung("bm-run-lamp",[
        X("ST_RunEnable"),O("OTE","DO_RunLamp"),
      ]);
    }
    // E1/E2 R1; E3 R3: START with run permission latches filling.
    rung("bm-start-fill",[
      X("ST_RunEnable"),X("PB_Start"),O("OTL","ST_Filling"),
    ]);
    // R2: energize P1 while running and filling.
    rung("bm-p1",[
      X("ST_RunEnable"),X("ST_Filling"),O("OTE","DO_Pump1"),
    ]);
    // R3: count only flow pulses admitted during the filling stage.
    rung("bm-ctu-level",[
      X("ST_RunEnable"),X("ST_Filling"),X("DI_Flowmeter1"),
      O("CTU","CNT_Volume"),
    ]);
    // R4: once ACC >= 900, unlatch filling and latch FULL together.
    // Multiple outputs on one rung render as Studio-style parallel coils,
    // with the same energized series path for both.
    rung("bm-reach-90",[
      X("ST_RunEnable"),X("ST_Filling"),
      C("GEQ","CNT_Volume.ACC",900),
      O("OTU","ST_Filling"),O("OTL","ST_Full"),
    ]);
    // R5: the FULL pilot follows the latched bit with RUN permission.
    rung("bm-full-lamp",[
      X("ST_RunEnable"),X("ST_Full"),O("OTE","DO_FullLamp"),
    ]);
    if(exercise===2 || exercise===3){
      // E2 R6 / E3 R8: TON begins while FULL and RUN are TRUE.
      rung("bm-mixing-timer",[
        X("ST_RunEnable"),X("ST_Full"),O("TON","TMR_Mixing"),
      ]);
      // R7: mixer only runs while TON.TT indicates active timing.
      rung("bm-mixer",[
        X("ST_RunEnable"),X("ST_Full"),X("TMR_Mixing.TT"),
        O("OTE","DO_Mixer"),
      ]);
      // R8: TON.DN unlatches FULL and simultaneously latches drain.
      rung("bm-start-drain",[
        X("ST_RunEnable"),X("ST_Full"),X("TMR_Mixing.DN"),
        O("OTU","ST_Full"),O("OTL","ST_Draining"),
      ]);
      // R9: energize drain pump during the drain stage.
      rung("bm-drain-pump",[
        X("ST_RunEnable"),X("ST_Draining"),O("OTE","DO_Pump3"),
      ]);
      // R10: flowmeter FM3 decrements the SAME CNT_Volume counter.
      rung("bm-ctd-volume",[
        X("ST_RunEnable"),X("ST_Draining"),X("DI_Flowmeter3"),
        O("CTD","CNT_Volume"),
      ]);
      // R11: completed discharge unlatches draining at ACC <= 0.
      rung("bm-stop-drain",[
        X("ST_RunEnable"),X("ST_Draining"),
        C("LEQ","CNT_Volume.ACC",0),O("OTU","ST_Draining"),
      ]);
    }
    return p;
  }

  // LAB 02 · Exercises 4 (Mode A) and 5 (Mode A/B).
  // These are the screenshot rungs in their exact execution order.
  // E4: 16 rungs (0–15), E5: the same 16 with a B-mode start OR lane,
  //      an OTE batch-complete coil at R15, and a CTU at R16.
  any("rung-1",[X("PB_Start"),X("ST_RunEnable")],
    [N("PB_Stop")],O("OTE","ST_RunEnable"));
  any("bm-idle-lamp",[X("PB_Stop"),X("DO_IdleLamp")],
    [N("PB_Start")],O("OTE","DO_IdleLamp"));
  rung("bm-run-lamp",[
    X("ST_RunEnable"),O("OTE","DO_RunLamp"),
  ]);

  if(exercise===4) {
    // R3: A, single batch, requires explicit START.
    rung("bm-start-fill",[
      X("ST_RunEnable"),X("DI_ModeA"),X("PB_Start"),
      O("OTL","ST_Filling"),
    ]);
  } else {
    // R3: explicit START OR (Mode B AND batch-complete AND NOT lots.DN).
    rung("bm-start-fill",[
      X("ST_RunEnable"),X("PB_Start"),O("OTL","ST_Filling"),
    ]);
    const startRung=p.rungs.find(r=>r.id==="bm-start-fill")!;
    const anchor=startRung.instructions[1].id;
    p=createParallelBranch(p,"bm-start-fill",anchor);
    const branch=p.rungs.find(r=>r.id==="bm-start-fill")!.parallelBranches!.at(-1)!;
    for(const item of [X("DI_ModeB"),X("ST_BatchComplete"),
        N("CNT_Lotes.DN")]) {
      p=addParallelContact(p,"bm-start-fill",anchor,
        ins(item),undefined,branch.id);
    }
  }
  // R4: product 1 is energized until CTU.DN (its PRE is a live INT tag).
  rung("bm-p1",[
    X("ST_RunEnable"),X("ST_Filling"),N("CNT_Volume.DN"),
    O("OTE","DO_Pump1"),
  ]);
  // R5: numerical HMI percentage converted to flowmeter pulses.
  rung("bm-p1-pulse-target",[
    X("ST_RunEnable"),X("ST_Filling"),scaleP1(),
  ]);
  // R6: flowmeter 1 CTU using INT_PresetP1 as its dynamic PRE.
  rung("bm-ctu-level",[
    X("ST_RunEnable"),X("ST_Filling"),X("DI_Flowmeter1"),
    O("CTU","CNT_Volume"),
  ]);
  let ctu=p.rungs.find(r=>r.id==="bm-ctu-level")!.instructions.at(-1)!;
  p=setInstructionPreset(p,ctu.id,{mode:"tag",tag:"INT_PresetP1"});

  // R7: once P1 count.DN, P2 fills the rest until the HI digital probe.
  rung("bm-p2",[
    X("ST_RunEnable"),X("ST_Filling"),X("CNT_Volume.DN"),
    N("DI_HighLevel"),O("OTE","DO_Pump2"),
  ]);
  // R8: the high-level probe ends filling and latches FULL.
  rung("bm-reach-full",[
    X("ST_RunEnable"),X("ST_Filling"),X("DI_HighLevel"),
    O("OTU","ST_Filling"),O("OTL","ST_Full"),
  ]);
  // R9: FULL lamp.
  rung("bm-full-lamp",[
    X("ST_RunEnable"),X("ST_Full"),O("OTE","DO_FullLamp"),
  ]);
  // R10: heat while the digital thermostat remains FALSE.
  rung("bm-heater",[
    X("ST_RunEnable"),X("ST_Full"),N("DI_Thermostat"),
    O("OTE","DO_Heater"),
  ]);
  // R11: thermostat TRUE starts TON PRE 4000 milliseconds.
  rung("bm-mixing-timer",[
    X("ST_RunEnable"),X("ST_Full"),X("DI_Thermostat"),
    O("TON","TMR_Mixing"),
  ]);
  // R12: mixer works until timer DN; also mixes during heating.
  rung("bm-mixer",[
    X("ST_RunEnable"),X("ST_Full"),N("TMR_Mixing.DN"),
    O("OTE","DO_Mixer"),
  ]);
  // R13: after TON.DN unlatch FULL and latch draining together.
  rung("bm-start-drain",[
    X("ST_RunEnable"),X("ST_Full"),X("TMR_Mixing.DN"),
    O("OTU","ST_Full"),O("OTL","ST_Draining"),
  ]);
  // R14: pump 3 operates while the bottom wet-level probe is TRUE.
  rung("bm-drain-pump",[
    X("ST_RunEnable"),X("ST_Draining"),X("DI_LowLevel"),
    O("OTE","DO_Pump3"),
  ]);
  // R15: when the lower probe is dry, finish draining. E5 also
  // asserts a non-retentive completion pulse for the lot CTU and restart.
  rung("bm-stop-drain",[
    X("ST_RunEnable"),X("ST_Draining"),N("DI_LowLevel"),
    O("OTU","ST_Draining"),
    ...(exercise===5?[O("OTE","ST_BatchComplete")]:[]),
  ]);
  if(exercise===5) {
    // R16: counted rising edges of batch-complete, preset INT_BatchTarget.
    rung("bm-lot-counter",[
      X("ST_RunEnable"),X("DI_ModeB"),X("ST_BatchComplete"),
      O("CTU","CNT_Lotes"),
    ]);
    ctu=p.rungs.find(r=>r.id==="bm-lot-counter")!.instructions.at(-1)!;
    p=setInstructionPreset(p,ctu.id,{mode:"tag",tag:"INT_BatchTarget"});
  }
  return p;
}

/** Reset all physical status and auxiliary runtime memory without deleting
 * any Ladder instruction, tag declaration or operator-entered INT setpoint. */
export function resetBatchProgramState(project:PracticeProject):PracticeProject {
  return {...project,tags:project.tags.map(tag=>{
    if(tag.type==="BOOL"){
      if(tag.name.startsWith("DI_Mode"))return tag;
      return {...tag,value:false};
    }
    if(tag.type==="TIMER"&&typeof tag.value==="object")
      return {...tag,value:{...tag.value,ACC:0,EN:false,TT:false,DN:false}};
    if(tag.type==="COUNTER"&&typeof tag.value==="object")
      return {...tag,value:{...tag.value,ACC:0,CU:false,CD:false,DN:false,OV:false,UN:false}};
    return tag;
  })};
}

export interface BatchMixerState {
  level: number;
  temperature: number;
  pulseCarry: [number,number,number];
  /** Lifetime pulse totals for the digital flowmeter edge generator. */
  totalPulses: [number,number,number];
  /** Pulses of the current/most recently completed batch only. */
  batchPulses: [number,number,number];
}
/** Temperature of the incoming products and the empty vessel (°C). */
export const BATCH_AMBIENT_TEMPERATURE=20;
export const BATCH_MAX_TEMPERATURE=95;
export const initialBatchState=():BatchMixerState=>({
  level:0,temperature:BATCH_AMBIENT_TEMPERATURE,
  pulseCarry:[0,0,0],totalPulses:[0,0,0],batchPulses:[0,0,0],
});
/** The flowmeters emit 10 pulses per 1% of nominal tank capacity. */
export const BATCH_VOLUME_PER_PULSE_PERCENT=0.1;
export const BATCH_PULSES_PER_PERCENT=10;
export const BATCH_FULL_PULSES=1000;
export const BATCH_FILL_90_PULSES=900;
// Preserve the previous ~12.5s fill duration while providing 10x resolution.
export const BATCH_PULSES_PER_SECOND=80;
export function batchDigitalSensors(state: BatchMixerState,sp:number) {
  return {
    // TRUE means the low probe is touching liquid. At 0% it is dry.
    DI_LowLevel: state.level>0,
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
      // Quantize to 0.1% so High/Low level contacts never miss 100/0
      // because of binary floating-point rounding.
      level=Math.round(Math.max(0,Math.min(100,
        level+(i===2?-1:1)*BATCH_VOLUME_PER_PULSE_PERCENT))*10)/10;
      total[i]++;
    }
  }
  // Lifetime counts must never be reset here: App uses their differences
  // to generate rising-edge DI_Flowmeter pulses for CTU/CTD. Maintain a
  // separate display counter per batch, preserving the last completed mix
  // during drainage and resetting only with the next refill from an empty
  // vessel. Every nominal full batch contains at most 1000 inlet pulses.
  const deltaPulses:[number,number,number]=[
    total[0]-state.totalPulses[0],
    total[1]-state.totalPulses[1],
    total[2]-state.totalPulses[2],
  ];
  const hasPreviousBatch=state.batchPulses[0]+state.batchPulses[1]>0;
  const freshBatch=state.level===0 &&
    (deltaPulses[0]>0 || deltaPulses[1]>0) && hasPreviousBatch;
  const batchPulses:[number,number,number]=freshBatch
    ? [0,0,0] : [...state.batchPulses];
  for(let i=0;i<3;i++)batchPulses[i]+=deltaPulses[i];

  // Simplified thermal model: as hot liquid leaves, the displayed vessel
  // temperature cools progressively toward ambient with the remaining volume.
  // The vessel reaches ambient exactly at 0%, ready for a fresh batch.
  // This does not write PLC logic or introduce an analog temperature input.
  const drained=(total[2]-state.totalPulses[2])*BATCH_VOLUME_PER_PULSE_PERCENT;
  const incoming=((total[0]-state.totalPulses[0])+
    (total[1]-state.totalPulses[1]))*BATCH_VOLUME_PER_PULSE_PERCENT;
  const remaining=Math.max(0,state.level-drained);
  let temperature=state.temperature;
  if(drained>0&&state.level>0) {
    temperature=BATCH_AMBIENT_TEMPERATURE+
      (temperature-BATCH_AMBIENT_TEMPERATURE)*(remaining/state.level);
  }
  // Fresh products enter at ambient; mix them with any hot liquid remaining.
  // Simultaneous filling/draining in a custom Ladder also behaves predictably.
  if(incoming>0&&remaining+incoming>0) {
    temperature=BATCH_AMBIENT_TEMPERATURE+
      (temperature-BATCH_AMBIENT_TEMPERATURE)*(remaining/(remaining+incoming));
  }
  if(level<=0) {
    temperature=BATCH_AMBIENT_TEMPERATURE;
  } else if(outputs.heater&&!outputs.pump3) {
    temperature+=dt*4;
  }
  temperature=Math.max(BATCH_AMBIENT_TEMPERATURE,
    Math.min(BATCH_MAX_TEMPERATURE,temperature));
  return {...state,level,temperature,pulseCarry:carry,totalPulses:total,
    batchPulses};
}
