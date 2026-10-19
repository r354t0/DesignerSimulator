import {
  addParallelContact, createIndependentParallelBranch, createRung, createTag,
  insertInstruction, insertIntoIndependentOrUpper,
  type EditableKind, type PracticeInstruction, type PracticeProject,
} from "./practiceDocument.ts";
import {initialGearSprayProject} from "./gearSpraySceneModel.ts";

/** Phase 3A: editable native Ladder migration of P01 and P02.
 * No state machine, cycles, alarm latches, P03-P07 or vendor-specific UDFB yet.
 * Names and P01/P02 boolean conditions based on the supplied CCW export.
 * P01 output mappings are evaluated AFTER mode rungs to avoid adding
 * artificial app-level output writes.
 */
export const GEAR_PHASE3A_TAGS=[
  ["AirPressure_In_Scaled","REAL","P01: presión aire escalada"],
  ["LubePressure_In_Scaled","REAL","P01: presión lubricante escalada"],
  ["AirPress_In","BOOL","P01: presión de aire superior a 40"],
  ["LubePress_Hi","BOOL","P01: presión lubricante superior a 1500"],
  ["LubePress_Lo","BOOL","P01: presión lubricante inferior a 400 durante marcha"],
  ["Run_Rly","BOOL","P01: relé de habilitación desde P02"],
  ["DI_Mill_Run","BOOL","P01: estado externo de molino en marcha"],
  ["PDB","BOOL","P01: pulso físico de dosificador"],
  ["PDB_RisingTrig","BOOL","P01: flanco positivo del dosificador"],
  ["Low_Level","BOOL","P01: nivel bajo de lubricante"],
  ["ST_Auto_Mode","BOOL","P02: selección modo AUTO"],
  ["ST_Man_Mode","BOOL","P02: selección modo MANUAL"],
  ["ST_Maint_Mode","BOOL","P02: selección modo mantenimiento"],
  ["ST_Run_Rly","BOOL","P02: habilitación general"],
  ["ST_Auto_Selected","BOOL","P02: condición modo automático"],
  ["DO_LS_Running_Output","BOOL","P02: indicación de marcha"],
  ["P02_Auto_Request","BOOL","P02: solicitud o retención de AUTO"],
  ["P02_Auto_Allowed","BOOL","P02: interbloqueo de AUTO"],
  ["P02_Manual_Request","BOOL","P02: solicitud o retención de MANUAL"],
  ["P02_Maint_Request","BOOL","P02: solicitud o retención de mantenimiento"],
  ["P02_Run_By_Mill","BOOL","P02: marcha AUTO/mantenimiento con molino"],
  ["P02_Maint_During_Run","BOOL","P02: mantenimiento con molino en marcha"],
  ["Pump_Sol","BOOL","P01: señal interna de bomba (P04 pendiente)"],
  ["Air_Sol","BOOL","P01: señal interna de atomización (P03 pendiente)"],
  ["Lubecon_Sol","BOOL","P01: señal interna de lubricante (P03 pendiente)"],
  ["Alarm_Out","BOOL","P01: señal interna alarma (P05 pendiente)"],
  ["LS_Healthy","BOOL","P01: indicación saludable (P05 pendiente)"],
  ["LS_Running_Output","BOOL","P01: estado de lubricación en marcha"],
] as const;

type Spec=Pick<PracticeInstruction,"kind"|"tag"|"compareA"|"compareB">;
const x=(tag:string):Spec=>({kind:"XIC",tag});
const nx=(tag:string):Spec=>({kind:"XIO",tag});
const o=(tag:string):Spec=>({kind:"OTE",tag});
const reg=(kind:"LES"|"GRT",tag:string,threshold:number):Spec=>({
  kind,tag:"",compareA:{mode:"tag",tag},compareB:{mode:"literal",value:threshold},
});
const mov=(from:string,to:string):Spec=>({
  kind:"MOV",tag:to,compareA:{mode:"tag",tag:from},
});
const MAX_OUT=3 as const;

export function createGearPhase3AProject():PracticeProject {
  let p=initialGearSprayProject();
  for(const [name,type,description] of GEAR_PHASE3A_TAGS){
    p=createTag(p,name,description,type);
  }
  let index=0;
  function make(id:string,items:Spec[]){
    if(id!=="rung-1")p=createRung(p,id);
    for(let k=0;k<items.length;k++)
      p=insertInstruction(p,id,k,{
        id:"gear3a-i-"+(++index),...items[k],
      });
  }
  function or(id:string,upper:Spec[],lower:Spec[],suffix:Spec[],coil:Spec){
    make(id,[coil]);
    p=createIndependentParallelBranch(p,id);
    const root=p.rungs.find(r=>r.id===id)?.instructions.find(i=>i.kind==="OR_JUNCTION")?.id;
    if(!root)throw new Error("No se pudo crear la unión OR "+id);
    for(const spec of upper)
      p=insertIntoIndependentOrUpper(p,id,root,{
        id:"gear3a-i-"+(++index),...spec,
      });
    for(const spec of lower)
      p=addParallelContact(p,id,root,{
        id:"gear3a-i-"+(++index),...spec,
      });
    for(const spec of suffix){
      const position=p.rungs.find(r=>r.id===id)!.instructions.filter(i=>
        !["OTE","OTL","OTU","TON","TOF","RTO","CTU","CTD","RES"].includes(i.kind)).length;
      p=insertInstruction(p,id,position,{
        id:"gear3a-i-"+(++index),...spec,
      });
    }
  }
  // P01 — physical input sampling and threshold aliases.
  make("rung-1",[mov("_310_PI_2561","AirPressure_In_Scaled")]);
  make("gear3a-p01-air",[
    reg("GRT","AirPressure_In_Scaled",40),o("AirPress_In")]);
  make("gear3a-p01-lube-copy",[
    mov("_310_PI_2560","LubePressure_In_Scaled")]);
  make("gear3a-p01-hi",[
    reg("GRT","LubePressure_In_Scaled",1500),o("LubePress_Hi")]);
  make("gear3a-p01-mill",[
    x("_310_PLC104_YI_MillRun"),o("DI_Mill_Run")]);
  make("gear3a-p01-pulse",[
    x("_310_SQS_2561"),o("PDB")]);
  make("gear3a-p01-di-pdb",[
    x("PDB"),o("DI_PDB")]);
  make("gear3a-p01-pulse-rise",[
    x("PDB"),{kind:"ONS",tag:"PDB_RisingTrig"},o("PDB_RisingTrig")]);
  make("gear3a-p01-level",[
    x("_310_LSL"),o("Low_Level")]);

  // P02 — original mode-manager expressions decomposed into explicit OR rungs.
  or("gear3a-p02-autoreq",
    [x("PB_Auto")],[x("ST_Auto_Mode")],[],o("P02_Auto_Request"));
  or("gear3a-p02-autoallowed",
    [nx("PB_Manual")],[x("DI_Mill_Run")],[],o("P02_Auto_Allowed"));
  make("gear3a-p02-auto",[
    x("P02_Auto_Request"),x("P02_Auto_Allowed"),nx("PB_Maint"),o("ST_Auto_Mode")]);
  or("gear3a-p02-manreq",
    [x("PB_Manual")],[x("ST_Man_Mode")],[],o("P02_Manual_Request"));
  make("gear3a-p02-manual",[
    x("P02_Manual_Request"),nx("PB_Auto"),nx("PB_Maint"),
    nx("DI_Mill_Run"),o("ST_Man_Mode")]);
  or("gear3a-p02-maintreq",
    [x("PB_Maint")],[x("ST_Maint_Mode")],[],o("P02_Maint_Request"));
  make("gear3a-p02-maint",[
    x("P02_Maint_Request"),nx("PB_Auto"),nx("PB_Manual"),
    x("DI_Mill_Run"),o("ST_Maint_Mode")]);
  or("gear3a-p02-millmode",
    [x("ST_Auto_Mode")],[x("ST_Maint_Mode")],
    [x("DI_Mill_Run")],o("P02_Run_By_Mill"));
  or("gear3a-p02-run",
    [x("P02_Run_By_Mill")],[x("ST_Man_Mode")],[],o("ST_Run_Rly"));
  make("gear3a-p02-running-output",[
    x("ST_Run_Rly"),o("DO_LS_Running_Output")]);
  make("gear3a-p02-maint-running",[
    x("ST_Maint_Mode"),x("DI_Mill_Run"),o("P02_Maint_During_Run")]);
  or("gear3a-p02-selected",
    [x("ST_Auto_Mode")],[x("P02_Maint_During_Run")],
    [nx("ST_Man_Mode")],o("ST_Auto_Selected"));

  // P01 post-mode mapping: run relay, low-pressure flag and output terminals.
  make("gear3a-p01-run",[
    x("ST_Run_Rly"),o("Run_Rly")]);
  make("gear3a-p01-low",[
    x("Run_Rly"),reg("LES","LubePressure_In_Scaled",400),o("LubePress_Lo")]);
  make("gear3a-p01-running-light",[
    x("DO_LS_Running_Output"),o("LS_Running_Output")]);
  const terminals=[
    ["Pump_Sol","_310_SV_2560"],
    ["Air_Sol","_310_SV_2563"],
    ["Lubecon_Sol","_310_SV_2561"],
    ["Alarm_Out","_310_UY_2560"],
    ["LS_Healthy","_310_YI_SystemHealthy"],
    ["LS_Running_Output","_310_YI_LubricationSystemRunning"],
  ] as const;
  for(let i=0;i<terminals.length;i++){
    make("gear3a-p01-output-"+i,[
      x(terminals[i][0]),o(terminals[i][1]),
    ]);
  }
  return p;
}
