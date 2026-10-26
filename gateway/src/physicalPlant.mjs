/** Independent Gear Spray HIL plant model for the local OPC UA process.
 * Node owns real-controller physics; browser visibility cannot throttle it.
 * This is a non-safety industrial FAT simulator, NOT a real-time controller.
 */
export const SQS_PERIOD_MS=500;
export const SQS_HIGH_MS=100;
const bound=(x,min,max)=>Math.max(min,Math.min(max,x));
const round1=x=>Math.round(x*10)/10;
const approach=(x,target,delta)=>x+bound(target-x,-delta,delta);
export const initialHilPhysical=()=>({
  enabled:false,airSupply:100,drumPercent:100,pressureDecayFactor:1,
  airPressure:0,lubePressure:0,doserPhaseMs:0,
  pulseHigh:false,pulseRemainingMs:0,totalPulses:0,
  airLoss:false,filterBlocked:false,doserBlocked:false,
});
const keys={
  enabled:"boolean",airSupply:"number",drumPercent:"number",
  pressureDecayFactor:"number",airLoss:"boolean",
  filterBlocked:"boolean",doserBlocked:"boolean",
};
export function validatePhysicalPatch(patch){
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||
     Object.keys(patch).length===0)throw Error("Configuración física vacía");
  const parsed={};
  for(const [key,value] of Object.entries(patch)){
    if(keys[key]!==typeof value||
      (typeof value==="number"&&!Number.isFinite(value)))
      throw Error("Parámetro físico no permitido: "+key);
    if(key==="airSupply"&&(value<0||value>148)||
       key==="drumPercent"&&(value<0||value>100)||
       key==="pressureDecayFactor"&&(value<0.25||value>4))
      throw Error("Valor físico fuera de rango: "+key);
    parsed[key]=value;
  }
  return parsed;
}
export function configureHilPhysical(current,patch){
  const fields=validatePhysicalPatch(patch);
  return {...current,...fields,
    ...(fields.enabled===false?
      {pulseHigh:false,pulseRemainingMs:0,doserPhaseMs:0}:{}),
  };
}
export function stepHilPhysical(state,outputs,elapsedMs){
  if(!state.enabled||!Number.isFinite(elapsedMs)||elapsedMs<=0)return state;
  // Limit long OS scheduler stalls: do not fabricate missed sensor edges.
  const ms=Math.min(200,elapsedMs);
  const airTarget=state.airLoss?0:state.airSupply;
  const airPressure=round1(bound(approach(state.airPressure,airTarget,
    80*(airTarget<state.airPressure?state.pressureDecayFactor:1)*ms/1000),
    0,148));
  const canPump=outputs.pumpSolenoid&&airPressure>40&&
    state.drumPercent>0&&!state.filterBlocked;
  const target=canPump?(outputs.lubricantSolenoid?820:1050):0;
  const lubePressure=round1(bound(approach(state.lubePressure,target,
    (target<state.lubePressure?190*state.pressureDecayFactor:
      canPump?300:190)*ms/1000),0,1480));
  const canDose=outputs.lubricantSolenoid&&state.drumPercent>0&&
    lubePressure>=400&&!state.filterBlocked&&!state.doserBlocked;
  const phase=canDose?state.doserPhaseMs+ms:0;
  const pulses=canDose?Math.floor(phase/SQS_PERIOD_MS):0;
  const doserPhaseMs=canDose?phase%SQS_PERIOD_MS:0;
  const pulseRemainingMs=pulses>0?Math.max(0,SQS_HIGH_MS-doserPhaseMs):
    Math.max(0,state.pulseRemainingMs-ms);
  return {...state,airPressure,lubePressure,doserPhaseMs,
    pulseRemainingMs,pulseHigh:pulseRemainingMs>0,
    totalPulses:state.totalPulses+pulses,
    drumPercent:round1(bound(state.drumPercent-pulses*0.2,0,100))};
}
export const sensorsFromHil=state=>({
  _310_PI_2561:state.airPressure,
  _310_PI_2560:state.lubePressure,
  _310_SQS_2561:state.pulseHigh,
  DI_PDB:state.pulseHigh,
  _310_LSL:state.drumPercent<=10,
});
