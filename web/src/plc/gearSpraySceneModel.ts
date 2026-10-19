import {
  createTag, initialPracticeProject, setTagValue,
  type PracticeProject, type TagType,
} from "./practiceDocument.ts";

/** Phase 1 of the CCW Gear Spray scene.
 * These are ONLY physical I/O and HMI-operated values, never fabricated
 * internal states or a substitute for P01–P07 / FB_GearSpray_Sequence.
 * Original _310_ field names are deliberately preserved for future mapping.
 */
export interface GearTagSpec {
  name: string;
  type: TagType;
  direction: "Entrada" | "Salida" | "HMI";
  description: string;
}

export const GEAR_FIELD_INPUTS: readonly GearTagSpec[] = [
  {name:"_310_PI_2561",type:"REAL",direction:"Entrada",
    description:"AI presión de aire (valor bruto CCW, unidades por verificar)"},
  {name:"_310_PI_2560",type:"REAL",direction:"Entrada",
    description:"AI presión de lubricante (valor bruto CCW, unidades por verificar)"},
  {name:"_310_PLC104_YI_MillRun",type:"BOOL",direction:"Entrada",
    description:"DI confirmación externa de molino en marcha"},
  {name:"_310_SQS_2561",type:"BOOL",direction:"Entrada",
    description:"DI pulso físico de dosificador, P01 mapea a DI_PDB_2"},
  {name:"_310_LSL",type:"BOOL",direction:"Entrada",
    description:"DI sensor de nivel bajo (polaridad pendiente de confirmar)"},
];

export const GEAR_FIELD_OUTPUTS: readonly GearTagSpec[] = [
  {name:"_310_SV_2560",type:"BOOL",direction:"Salida",
    description:"DO solenoide de aire de bomba neumática"},
  {name:"_310_SV_2563",type:"BOOL",direction:"Salida",
    description:"DO solenoide de aire de atomización"},
  {name:"_310_SV_2561",type:"BOOL",direction:"Salida",
    description:"DO solenoide de grasa hacia dosificador"},
  {name:"_310_UY_2560",type:"BOOL",direction:"Salida",
    description:"DO alarma audible"},
  {name:"_310_YI_SystemHealthy",type:"BOOL",direction:"Salida",
    description:"DO indicación de sistema saludable"},
  {name:"_310_YI_LubricationSystemRunning",type:"BOOL",direction:"Salida",
    description:"DO indicación de lubricación en marcha"},
];

export const GEAR_HMI_PUSHBUTTONS: readonly GearTagSpec[] = [
  {name:"PB_Auto",type:"BOOL",direction:"HMI",description:"Seleccionar modo AUTO"},
  {name:"PB_Manual",type:"BOOL",direction:"HMI",description:"Seleccionar modo MANUAL"},
  {name:"PB_Maint",type:"BOOL",direction:"HMI",description:"Modo mantenimiento / servicio"},
  {name:"PB_Extra",type:"BOOL",direction:"HMI",description:"Solicitar pulso adicional de lubricación"},
  {name:"PB_Reset",type:"BOOL",direction:"HMI",description:"Reset de fallas"},
  {name:"PB_Lubpress_Release",type:"BOOL",direction:"HMI",
    description:"Liberación momentánea de presión de lubricante"},
];

export const GEAR_HMI_SETPOINTS: readonly GearTagSpec[] = [
  {name:"TMR_Freq_SP",type:"DINT",direction:"HMI",
    description:"Frecuencia entre lubricaciones: valor del proyecto CCW"},
  {name:"CNT_LubeFlo_SP",type:"DINT",direction:"HMI",
    description:"Cantidad de pulsos de dosificador por lubricación"},
  {name:"TMR_LubeFlo_SP",type:"DINT",direction:"HMI",
    description:"Tiempo máximo de pulsos de lubricación"},
  {name:"Maint_Duration_Min",type:"DINT",direction:"HMI",
    description:"Duración del permiso de mantenimiento, minutos"},
];

export const GEAR_SCADA_TAGS: readonly GearTagSpec[] = [
  ...GEAR_FIELD_INPUTS, ...GEAR_FIELD_OUTPUTS,
  ...GEAR_HMI_PUSHBUTTONS, ...GEAR_HMI_SETPOINTS,
];

export type GearPushButton = typeof GEAR_HMI_PUSHBUTTONS[number]["name"];
export type GearAnalogInput = "_310_PI_2561" | "_310_PI_2560";
export type GearDigitalInput =
  "_310_PLC104_YI_MillRun" | "_310_SQS_2561" | "_310_LSL";
export type GearSetpoint =
  "TMR_Freq_SP" | "CNT_LubeFlo_SP" | "TMR_LubeFlo_SP" | "Maint_Duration_Min";

export function gearBool(project:PracticeProject,name:string):boolean {
  const tag=project.tags.find(tag=>tag.name===name);
  return tag?.type==="BOOL"&&tag.value===true;
}
export function gearNumber(project:PracticeProject,name:string):number {
  const tag=project.tags.find(tag=>tag.name===name);
  return tag&&["INT","DINT","REAL"].includes(tag.type)&&
    typeof tag.value==="number" ? tag.value : 0;
}

export function initialGearSprayProject():PracticeProject {
  let project={...initialPracticeProject(),tags:[]};
  for(const tag of GEAR_SCADA_TAGS)
    project=createTag(project,tag.name,tag.description,tag.type);
  return project;
}

/** Safe idempotent registration. Re-entering this scene must never reset the
 * programmer's customized Ladder, tag descriptions or runtime tag values. */
export function prepareGearSprayTags(project:PracticeProject):PracticeProject {
  let next=project;
  for(const tag of GEAR_SCADA_TAGS){
    const existing=next.tags.find(item=>item.name===tag.name);
    if(!existing) next=createTag(next,tag.name,tag.description,tag.type);
    else if(existing.type!==tag.type)
      throw new Error("Gear Spray: "+tag.name+" debe ser "+tag.type+
        " (actualmente "+existing.type+").");
  }
  return next;
}

/** Only a physical input or operator setpoint can be injected from the SCADA.
 * Output and internal tags are calculated strictly by the PLC program.
 */
export function writeGearScadaInput(
  project:PracticeProject,name:string,value:boolean|number,
):PracticeProject {
  const spec=[...GEAR_FIELD_INPUTS,...GEAR_HMI_PUSHBUTTONS,
    ...GEAR_HMI_SETPOINTS].find(item=>item.name===name);
  if(!spec)throw new Error("Gear Spray: salida o tag no editable: "+name);
  if(spec.type==="BOOL"&&typeof value!=="boolean")
    throw new Error("Gear Spray: entrada BOOL requerida: "+name);
  if(spec.type==="REAL"&&
     (typeof value!=="number"||!Number.isFinite(value)||value<0))
    throw new Error("Gear Spray: presión debe ser un número no negativo");
  if(spec.type==="DINT"&&
     (typeof value!=="number"||!Number.isSafeInteger(value)||
      value<0||value>2147483647))
    throw new Error("Gear Spray: consigna DINT fuera de rango");
  return setTagValue(project,name,value);
}
