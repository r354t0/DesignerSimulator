import {
  addParallelContact, createIndependentParallelBranch, createParallelBranch,
  createRung, createTag, insertInstruction, insertIntoIndependentOrUpper,
  setRungComment, setTagValue,
  type PracticeInstruction, type PracticeProject,
} from "./practiceDocument.ts";
import {createGearPhase3Project} from "./gearSprayP03Program.ts";

/**
 * P04-P07 integrated CCW port.
 *
 * - One Ladder rung per original boolean equation, including self-holds.
 * - Native TIMER.DN/ACC and COUNTER.DN/ACC (no separate DONE BOOL tags).
 * - P05 AFI: an always-false EQU(0,1) contact at the start of its rung.
 * - P06 counter CTD uses its original LOAD terminal.
 * - P07 ANY_TO_* time conversions replaced by direct .ACC operands.
 *
 * P03 and the field I/O mappings remain in their existing positions.
 * This is a virtual FAT model, NOT a certified field control program.
 */
export const GEAR_REMAINING_TAGS=[
  // P04
  ["ST_LubePress_1000","BOOL","P04 presión sobre 1000"],
  ["ST_LubePress_800","BOOL","P04 presión bajo 800"],
  ["ST_Pump_Sol_Rly","BOOL","P04 enclavamiento solenoide bomba"],
  ["DO_Pump_Sol","BOOL","P04 salida de bomba"],
  // P05
  ["ST_AirAlarm_Rly","BOOL","P05 condición de falta de aire"],
  ["TMR_AirFail","TIMER","P05 TON fallo aire 5 s"],
  ["TMR_LoFlo","TIMER","P05 TON ausencia de pulsos"],
  ["TMR_LubePress_Lo","TIMER","P05 TON presión baja 10 s"],
  ["TMR_LubePress_Hi","TIMER","P05 TON presión alta 300 ms (AFI)"],
  ["ST_Level_Rly","BOOL","P05 nivel bajo retenido"],
  ["ST_Level_Latch","BOOL","P05 retención confirmación nivel"],
  ["ST_Level_Fail","BOOL","P05 falla nivel bajo"],
  ["TMR_SecCnt","TIMER","P05 reloj 1 s sirena"],
  ["DO_Alarm_Out","BOOL","P05 salida alarma sonora"],
  ["ST_Siren_Accept","BOOL","P05 acuse sirena"],
  ["ALM_AirFail_Rly","BOOL","P05 prioridad falta aire"],
  ["ALM_LoFlo_Rly","BOOL","P05 prioridad falta flujo"],
  ["ALM_LoPress_Rly","BOOL","P05 prioridad presión baja"],
  ["ALM_HiPress_Rly","BOOL","P05 prioridad presión alta"],
  ["ALM_LoLevel_Rly","BOOL","P05 prioridad nivel bajo"],
  // P06
  ["TMR_OneMinCnt","TIMER","P06 reloj un minuto"],
  ["CNT_Hour24","COUNTER","P06 contador 1440 minutos"],
  ["CTN_MaintMode","COUNTER","P06 contador 3 mantenimientos"],
  ["ST_Maint_Cnt_Trip","BOOL","P06 límite mantenimientos"],
  ["Maint_Duration_ms","DINT","P06 duración mantenimiento (ms)"],
  ["TMR_Maint","TIMER","P06 límite tiempo mantenimiento"],
  ["ST_LS_Healthy_Rly","BOOL","P06 habilitación salud sistema"],
  ["CNT_Shutdown_Rst","BOOL","P06 LOAD contador descendente"],
  ["CNT_Shutdown","COUNTER","P06 contador descendente 20 minutos"],
  ["WARN_PreShutdown","BOOL","P06 aviso 5 minutos remanentes"],
  // P07
  ["NextCycle_Show","DINT","P07 ms hasta siguiente ciclo"],
  ["FloAlrm_Remain","REAL","P07 ms restantes alarma caudal"],
  ["Maint_Duration_Remain_ms","DINT","P07 mantenimiento pendiente ms"],
  ["Maint_Duration_Remain_Min","DINT","P07 mantenimiento pendiente min"],
  ["Shutdown_Time_Remaining","DINT","P07 tiempo restante de parada"],
  ["AirPress_NOT","BOOL","P07 inversión estado de aire"],
  ["Fault_Code","DINT","P07 código de falla principal 0–5"],
] as const;

type Spec=Pick<PracticeInstruction,"kind"|"tag"> &
  Partial<Pick<PracticeInstruction,"compareA"|"compareB"|"preset"|"loadTag">>;
const x=(tag:string):Spec=>({kind:"XIC",tag});
const n=(tag:string):Spec=>({kind:"XIO",tag});
const o=(tag:string):Spec=>({kind:"OTE",tag});
const num=(value:number):NonNullable<PracticeInstruction["compareA"]>=>({
  mode:"literal",value,
});
const ref=(tag:string):NonNullable<PracticeInstruction["compareA"]>=>({
  mode:"tag",tag,
});
const cmp=(kind:"LES"|"LEQ"|"GRT"|"GEQ"|"EQU"|"NEQ",
  a:string|number,b:string|number):Spec=>({
    kind,tag:"",compareA:typeof a==="number"?num(a):ref(a),
    compareB:typeof b==="number"?num(b):ref(b),
  });
const math=(kind:"MOV"|"ADD"|"SUB"|"MUL"|"DIV",
  a:string|number,b:string|number|undefined,dest:string):Spec=>({
    kind,tag:dest,compareA:typeof a==="number"?num(a):ref(a),
    ...(kind==="MOV"?{}:{compareB:typeof b==="number"?num(b!):ref(b as string)}),
  });
const ton=(tag:string,pre:string|number):Spec=>({
  kind:"TON",tag,preset:typeof pre==="number"?
    {mode:"literal",value:pre}:{mode:"tag",tag:pre},
});
const ctu=(tag:string,pre:number):Spec=>({
  kind:"CTU",tag,preset:{mode:"literal",value:pre},
});
const ctd=(tag:string,pre:number,load:string):Spec=>({
  kind:"CTD",tag,preset:{mode:"literal",value:pre},loadTag:load,
});
const res=(tag:string):Spec=>({kind:"RES",tag});
type Group={or:Spec[][]}|Spec;

export function createGearCompleteProject():PracticeProject {
  let p=createGearPhase3Project();
  for(const [name,type,description] of GEAR_REMAINING_TAGS)
    p=createTag(p,name,description,type);

  // Standard values for self-contained FAT; editable HMI presets after load.
  // CCW's original site-specific values remain to be confirmed at SAT.
  for(const [name,value] of [
    ["TMR_Freq_SP",60000],["CNT_LubeFlo_SP",5],
    ["TMR_LubeFlo_SP",10000],["Maint_Duration_Min",30],
  ] as const)
    p=setTagValue(p,name,value);

  // Final physical output aliases in P01: DO_* is produced by the actual
  // corresponding routine, without moving the output mapping rung.
  const maps=new Map([
    ["gear3a-p01-output-0",["Pump_Sol","DO_Pump_Sol"]],
    ["gear3a-p01-output-3",["Alarm_Out","DO_Alarm_Out"]],
    ["gear3a-p01-output-4",["LS_Healthy","DO_LS_Healthy"]],
  ]);
  p={...p,rungs:p.rungs.map(r=>{
    const alias=maps.get(r.id);
    if(!alias)return r;
    return {...r,instructions:r.instructions.map(i=>
      i.kind==="XIC"&&i.tag===alias[0]?{...i,tag:alias[1]}:i)};
  })};

  // Previously unimplemented command names are no longer needed.
  const unusedAliases=new Set(["Pump_Sol","Alarm_Out","LS_Healthy","Lubecon_Sol"]);
  p={...p,tags:p.tags.filter(t=>!unusedAliases.has(t.name))};

  let seq=0;
  function add(program:string,rung:number,terms:Spec[],comment?:string){
    const id="gear-"+program+"-r"+String(rung).padStart(2,"0");
    p=createRung(p,id);
    for(let i=0;i<terms.length;i++)
      p=insertInstruction(p,id,i,{id:"gear-full-"+(++seq),...terms[i]});
    if(comment)p=setRungComment(p,id,comment);
    return id;
  }
  /** Each boolean expression, including self-holding OR contacts, is placed
   * in a single executable rung. Parallel lanes join after the upper lane.
   * Multiple serial OR groups are evaluated as their true LAD topology.
   */
  function logic(program:string,rung:number,
    path:Group[],out:Spec,comment?:string){
    const id=add(program,rung,[out],comment);
    for(const item of path){
      if(!("or" in item)){
        const r=p.rungs.find(r=>r.id===id)!;
        const at=r.instructions.filter(i=>i.kind!==out.kind).length;
        p=insertInstruction(p,id,at,{id:"gear-full-"+(++seq),...item});
        continue;
      }
      if(item.or.length<2||item.or.some(lane=>!lane.length))
        throw Error("OR vacío: "+id);
      p=createIndependentParallelBranch(p,id);
      const anchor=p.rungs.find(r=>r.id===id)!.instructions
        .findLast(i=>i.kind==="OR_JUNCTION")?.id;
      if(!anchor)throw Error("OR sin unión: "+id);
      for(const c of item.or[0])
        p=insertIntoIndependentOrUpper(p,id,anchor,{
          id:"gear-full-"+(++seq),...c,
        });
      for(let lane=1;lane<item.or.length;lane++){
        if(lane>1)p=createParallelBranch(p,id,anchor);
        const target=p.rungs.find(r=>r.id===id)!.parallelBranches!
          .filter(b=>b.anchorId===anchor)[lane-1];
        if(!target)throw Error("Rama ausente "+lane+" "+id);
        for(const c of item.or[lane])
          p=addParallelContact(p,id,anchor,{
            id:"gear-full-"+(++seq),...c,
          },Number.MAX_SAFE_INTEGER,target.id);
      }
      const end=p.rungs.find(r=>r.id===id)!.parallelBranches!
        .find(b=>b.anchorId===anchor)!.endId;
      if(!end)throw Error("Extremo OR inexistente "+id);
      p={...p,rungs:p.rungs.map(r=>r.id!==id?r:{
        ...r,parallelBranches:r.parallelBranches?.map(b=>
          b.anchorId===anchor?{...b,endId:end}:b),
      })};
    }
    return id;
  }

  // -------------------- P04: 4 original CCW rungs --------------------
  logic("p04",1,[x("ST_Run_Rly"),x("ST_Pump_Rly"),
    n("TMR_LubePress_Hi.DN"),
    cmp("GRT","LubePressure_In_Scaled",1000)],
    o("ST_LubePress_1000"),"P04 — PUMP PRESSURE CONTROL | Inicio");
  logic("p04",2,[x("ST_Run_Rly"),x("ST_Pump_Rly"),
    n("TMR_LubePress_Hi.DN"),
    cmp("LES","LubePressure_In_Scaled",800)],o("ST_LubePress_800"));
  logic("p04",3,[x("ST_Run_Rly"),
    {or:[[x("ST_LubePress_800")],[x("ST_Pump_Sol_Rly")]]},
    n("ST_LubePress_1000")],o("ST_Pump_Sol_Rly"));
  logic("p04",4,[x("ST_Run_Rly"),x("ST_Pump_Rly"),
    x("ST_Pump_Sol_Rly")],o("DO_Pump_Sol"));

  // -------------------- P05: 18 source rungs --------------------------
  logic("p05",1,[x("ST_Run_Rly"),
    {or:[[x("ST_Airsol_Rly")],[x("ST_AirAlarm_Rly")]]},
    n("AirPress_In")],o("ST_AirAlarm_Rly"),
    "P05 — ALARMS | Inicio condiciones y sirena");
  logic("p05",2,[x("ST_Run_Rly"),
    {or:[[x("ST_AirAlarm_Rly")],
      [x("TMR_AirFail.DN"),n("PB_Reset")]]}],
    ton("TMR_AirFail",5000));
  // R3 ANY_TO_TIME removed: original preset TMR_LubeFlo_SP in milliseconds.
  logic("p05",4,[x("ST_Run_Rly"),
    {or:[[x("ST_Cycle_Rly"),n("CTN_Lubeflo.DN")],
      [x("TMR_LoFlo.DN"),n("PB_Reset")]]}],
    ton("TMR_LoFlo","TMR_LubeFlo_SP"),
    "P05 R3 (conversión TIME) sustituida por PRE nativo");
  logic("p05",5,[x("ST_Run_Rly"),
    {or:[[x("LubePress_Lo"),x("ST_Cycle_Rly")],
      [x("TMR_LubePress_Lo.DN"),n("PB_Reset")]]}],
    ton("TMR_LubePress_Lo",10000));
  // AFI original: a constant FALSE comparison (0 == 1) is not bypassable.
  logic("p05",6,[cmp("EQU",0,1),x("ST_Run_Rly"),
    {or:[[x("LubePress_Hi")],
      [x("TMR_LubePress_Hi.DN"),n("PB_Reset")]]}],
    ton("TMR_LubePress_Hi",300),
    "AFI original: EQU 0,1 mantiene esta falla deshabilitada");
  logic("p05",7,[x("ST_Run_Rly"),
    {or:[[x("Low_Level")],[x("ST_Level_Rly")]]},
    n("PB_Reset")],o("ST_Level_Rly"));
  logic("p05",8,[x("ST_Run_Rly"),
    {or:[[x("ST_Level_Rly")],[x("PB_Reset")],
      [x("ST_Level_Latch")]]},n("Low_Level")],o("ST_Level_Latch"));
  logic("p05",9,[x("ST_Run_Rly"),x("ST_Level_Rly"),
    n("ST_Level_Latch"),n("PB_Reset")],o("ST_Level_Fail"));
  logic("p05",10,[x("ST_Run_Rly"),
    {or:[[x("TMR_AirFail.DN")],[x("TMR_LoFlo.DN")],
      [x("TMR_LubePress_Lo.DN")],[x("TMR_LubePress_Hi.DN")]]}],
    o("ST_General_Trip_Rly"));
  logic("p05",11,[n("TMR_SecCnt.DN")],ton("TMR_SecCnt",1000));
  logic("p05",12,[x("ST_Run_Rly"),
    {or:[
      [x("ST_General_Trip_Rly"),n("ST_Siren_Accept")],
      [x("ST_Level_Rly"),n("ST_Siren_Accept")],
      [x("TMR_SecCnt.DN"),x("WARN_PreShutdown")],
    ]}],o("DO_Alarm_Out"));
  logic("p05",13,[x("ST_Run_Rly"),
    {or:[
      [x("PB_Reset"),x("ST_General_Trip_Rly")],
      [x("PB_Reset"),x("ST_Level_Rly")],
      [x("ST_Siren_Accept"),x("ST_General_Trip_Rly")],
      [x("ST_Siren_Accept"),x("ST_Level_Rly")],
    ]}],o("ST_Siren_Accept"));

  const alarmPriority=[
    {r:14,source:"TMR_AirFail.DN",dest:"ALM_AirFail_Rly"},
    {r:15,source:"TMR_LoFlo.DN",dest:"ALM_LoFlo_Rly"},
    {r:16,source:"TMR_LubePress_Lo.DN",dest:"ALM_LoPress_Rly"},
    {r:17,source:"TMR_LubePress_Hi.DN",dest:"ALM_HiPress_Rly"},
    {r:18,source:"ST_Level_Fail",dest:"ALM_LoLevel_Rly"},
  ] as const;
  for(const a of alarmPriority){
    const others=alarmPriority.filter(b=>b.source!==a.source);
    logic("p05",a.r,[x("ST_Run_Rly"),x(a.source),
      {or:[others.map(z=>n(z.source)),[x(a.dest)]]}],o(a.dest));
  }

  // -------------------- P06: 12 source rungs --------------------------
  // The original Maintance_Duration helper executes before the P06 timers.
  add("p06",0,[math("MUL","Maint_Duration_Min",60000,
    "Maint_Duration_ms")],
    "P06 — duración mantenimiento: minutos a ms (programa auxiliar CCW)");
  logic("p06",1,[x("ST_Run_Rly"),n("TMR_OneMinCnt.DN")],
    ton("TMR_OneMinCnt",60000),
    "P06 — SHUTDOWN / MAINTENANCE | Inicio");
  logic("p06",2,[x("ST_Run_Rly"),x("TMR_OneMinCnt.DN")],
    ctu("CNT_Hour24",1440));
  logic("p06",3,[{or:[[n("DI_Mill_Run")],[x("CNT_Hour24.DN")]]}],
    res("CNT_Hour24"));
  logic("p06",4,[x("ST_Run_Rly"),x("ST_Maint_Mode")],
    ctu("CTN_MaintMode",3));
  logic("p06",5,[{or:[
    [x("ST_Run_Rly"),x("CNT_Hour24.DN")],
    [n("DI_Mill_Run")],
  ]}],res("CTN_MaintMode"));
  logic("p06",6,[x("ST_Run_Rly"),x("CTN_MaintMode.DN")],
    o("ST_Maint_Cnt_Trip"));
  logic("p06",7,[x("DI_Mill_Run"),x("ST_Maint_Mode")],
    ton("TMR_Maint","Maint_Duration_ms"));
  logic("p06",8,[
    {or:[[x("ST_LS_Healthy_Rly")],[n("DI_Mill_Run")],[n("ST_Cycle_Rly")]]},
    n("TMR_LubePress_Lo.DN"),n("ALM_HiPress_Rly"),
    n("TMR_AirFail.DN"),n("TMR_LoFlo.DN"),
  ],o("CNT_Shutdown_Rst"));
  logic("p06",9,[
    x("DI_Mill_Run"),x("TMR_OneMinCnt.DN"),
    {or:[[x("ST_Cycle_Rly")],[x("TMR_AirFail.DN")],
      [x("ALM_HiPress_Rly")],[x("ALM_LoPress_Rly")]]},
    x("ST_LS_Healthy_Rly"),
  ],ctd("CNT_Shutdown",20,"CNT_Shutdown_Rst"));
  logic("p06",10,[x("ST_Run_Rly"),
    cmp("LEQ","CNT_Shutdown.ACC",5)],o("WARN_PreShutdown"));
  logic("p06",11,[
    {or:[[x("ST_Auto_Selected")],[x("ST_Maint_Mode")]]},
    n("TMR_Maint.DN"),n("CNT_Shutdown.DN"),n("ST_Maint_Cnt_Trip"),
  ],o("ST_LS_Healthy_Rly"));
  logic("p06",12,[x("ST_LS_Healthy_Rly")],o("DO_LS_Healthy"));

  // -------------------- P07: native HMI/diagnostic equations -----------
  // Conversion-only rungs P07 R1/R3/R5 are omitted; TIME ET is TIMER.ACC
  // and CTD CV is COUNTER.ACC in the native runtime.
  logic("p07",2,[x("Run_Rly")],
    math("SUB","TMR_Freq_SP","TMR_Freq.ACC","NextCycle_Show"),
    "P07 — HMI / DIAGNOSTICS | Inicio, timer ACC nativo");
  logic("p07",4,[x("Run_Rly")],
    math("SUB","TMR_LubeFlo_SP","TMR_LoFlo.ACC","FloAlrm_Remain"));
  // The two original arithmetic operators run in order on this SAME rung.
  const hmiR6=add("p07",6,[
    x("Run_Rly"),x("ST_Maint_Mode"),
    math("SUB","Maint_Duration_ms","TMR_Maint.ACC",
      "Maint_Duration_Remain_ms"),
    math("DIV","Maint_Duration_Remain_ms",60000,
      "Maint_Duration_Remain_Min"),
  ]);
  void hmiR6;
  logic("p07",7,[x("Run_Rly")],
    math("MOV","CNT_Shutdown.ACC",undefined,"Shutdown_Time_Remaining"));
  logic("p07",8,[n("AirPress_In")],o("AirPress_NOT"));
  const codePriority=[
    ["ALM_AirFail_Rly",1],["ALM_LoFlo_Rly",2],
    ["ALM_LoPress_Rly",3],["ALM_HiPress_Rly",4],
    ["ALM_LoLevel_Rly",5],
  ] as const;
  logic("p07",9,[
    {or:codePriority.map(([name])=>[n(name)])},
  ],math("MOV",0,undefined,"Fault_Code"));
  for(let i=0;i<codePriority.length;i++){
    const [name,code]=codePriority[i];
    logic("p07",i+10,[x(name)],
      math("MOV",code,undefined,"Fault_Code"));
  }
  return p;
}
