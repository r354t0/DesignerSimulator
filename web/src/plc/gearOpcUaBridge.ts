import {
  GEAR_FIELD_INPUTS, GEAR_FIELD_OUTPUTS,
  GEAR_HMI_PUSHBUTTONS, GEAR_HMI_SETPOINTS,
} from "./gearSpraySceneModel.ts";

/** Explicit JSON/WebSocket contract between browser and the local OPC UA client.
 * NodeIds are configured exclusively in the local gateway, never in the browser.
 */
export type GearControllerSource="virtual"|"opcua";
export type GearOpcValue=boolean|number;
export const GEAR_OPC_INPUT_TAGS=[
  ...GEAR_FIELD_INPUTS.map(x=>x.name),
  ...GEAR_HMI_PUSHBUTTONS.map(x=>x.name),
  ...GEAR_HMI_SETPOINTS.map(x=>x.name),
] as readonly string[];
export const GEAR_OPC_OUTPUT_TAGS=GEAR_FIELD_OUTPUTS.map(x=>x.name);
export const GEAR_OPC_ANALOG_TAGS=GEAR_FIELD_INPUTS
  .filter(x=>x.type==="REAL").map(x=>x.name);
export type GearOpcStatus={
  connected:boolean; writable:boolean; lastUpdate:number;
  detail:string; mappedInputs:number; mappedOutputs:number;
};
export const initialGearOpcStatus=():GearOpcStatus=>({
  connected:false,writable:false,lastUpdate:0,detail:"Desconectado",
  mappedInputs:0,mappedOutputs:0,
});
export type GearOpcSnapshot={
  type:"snapshot";outputs:Record<string,GearOpcValue>;quality:"Good";ts:number;
};
export function validGearOpcOutputSnapshot(data:unknown):data is GearOpcSnapshot{
  if(!data||typeof data!=="object")return false;
  const x=data as Record<string,unknown>;
  if(x.type!=="snapshot"||x.quality!=="Good"||
    typeof x.ts!=="number"||!Number.isFinite(x.ts)||
    !x.outputs||typeof x.outputs!=="object")return false;
  const values=x.outputs as Record<string,unknown>;
  return GEAR_OPC_OUTPUT_TAGS.every(name=>typeof values[name]==="boolean");
}
export function validGearOpcInput(tag:string,value:unknown):value is GearOpcValue{
  const spec=[...GEAR_FIELD_INPUTS,...GEAR_HMI_PUSHBUTTONS,
    ...GEAR_HMI_SETPOINTS].find(x=>x.name===tag);
  if(!spec)return false;
  if(spec.type==="BOOL")return typeof value==="boolean";
  if(typeof value!=="number"||!Number.isFinite(value)||value<0)return false;
  if(spec.type==="DINT")return Number.isSafeInteger(value)&&value<=2147483647;
  return value<=1e9;
}
export const GEAR_OPC_DEFAULT_SOCKET="ws://127.0.0.1:8765";
