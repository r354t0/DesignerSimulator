/** Physical simulation of Gear Spray Scene 06.
 * The plant only reads real PLC output bits. It NEVER computes a CCW mode,
 * fault latch, state machine transition or output command.
 * All time is explicitly supplied in ms, independent from React rendering.
 */
export const GEAR_AIR_MAX=148;
export const GEAR_LUBE_MAX=1480;
export const GEAR_LOW_DRUM_PERCENT=10;
export const GEAR_PULSE_PERIOD_MS=500;
export const GEAR_PULSE_HIGH_MS=100;

export interface GearPhysicalState {
  enabled:boolean;
  airSupply:number;
  drumPercent:number;
  airPressure:number;
  lubePressure:number;
  doserPhaseMs:number;
  pulseHigh:boolean;
  totalPulses:number;
  airLoss:boolean;
  filterBlocked:boolean;
  doserBlocked:boolean;
}

export interface GearPhysicalOutputs {
  pumpSolenoid:boolean;   // _310_SV_2560
  lubricantSolenoid:boolean; // _310_SV_2561
  atomizationSolenoid:boolean; // _310_SV_2563, doesn't decide dosing
}

export function initialGearPhysicalState():GearPhysicalState {
  return {
    enabled:false, airSupply:100, drumPercent:100,
    airPressure:0, lubePressure:0, doserPhaseMs:0, pulseHigh:false,
    totalPulses:0, airLoss:false, filterBlocked:false, doserBlocked:false,
  };
}
const round1=(x:number)=>Math.round(x*10)/10;
const limit=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const approach=(v:number,target:number,limitDelta:number)=>
  v+limit(target-v,-limitDelta,limitDelta);

export function configureGearPhysical(
  state:GearPhysicalState,config:Partial<Pick<GearPhysicalState,
    "enabled"|"airSupply"|"drumPercent"|"airLoss"|"filterBlocked"|"doserBlocked">>,
):GearPhysicalState {
  return {...state,
    ...config,
    airSupply:round1(limit(config.airSupply??state.airSupply,0,GEAR_AIR_MAX)),
    drumPercent:round1(limit(config.drumPercent??state.drumPercent,0,100)),
  };
}

export function stepGearPhysical(
  state:GearPhysicalState,outputs:GearPhysicalOutputs,elapsedMs:number,
):GearPhysicalState {
  if(!state.enabled || !Number.isFinite(elapsedMs)||elapsedMs<=0)return state;
  const ms=Math.min(200,elapsedMs);
  const dt=ms/1000;
  const airTarget=state.airLoss?0:state.airSupply;
  const airPressure=round1(limit(
    approach(state.airPressure,airTarget,80*dt),0,GEAR_AIR_MAX));
  const canPump=outputs.pumpSolenoid && airPressure>40 &&
    state.drumPercent>0&&!state.filterBlocked;
  // Pump builds pressure downstream of the filter and the pressure tap is
  // upstream of SV-2561. Discharging through SV-2561 lowers equilibrium.
  const target=canPump?(outputs.lubricantSolenoid?820:1050):0;
  const lubePressure=round1(limit(
    approach(state.lubePressure,target,(canPump?300:190)*dt),0,GEAR_LUBE_MAX));
  // Dosification is physical flow, not a software-controlled cycle.
  const canDose=outputs.lubricantSolenoid &&
    state.drumPercent>0 && lubePressure>=400 && !state.filterBlocked &&
    !state.doserBlocked;
  let phase=canDose?state.doserPhaseMs+ms:0;
  const pulses=canDose?Math.floor(phase/GEAR_PULSE_PERIOD_MS):0;
  phase=canDose?phase%GEAR_PULSE_PERIOD_MS:0;
  const pulseHigh=canDose&&phase<GEAR_PULSE_HIGH_MS&&
    (pulses>0||state.totalPulses>0||state.doserPhaseMs>0);
  const drumPercent=round1(limit(state.drumPercent-pulses*0.2,0,100));
  return {...state,airPressure,lubePressure,
    doserPhaseMs:phase,pulseHigh,
    totalPulses:state.totalPulses+pulses,drumPercent};
}

/** Sensor identity is exact, no implicit bridge from DI_PDB_2 to DI_PDB. */
export function gearPhysicalSensors(state:GearPhysicalState) {
  return {
    _310_PI_2561:state.airPressure,
    _310_PI_2560:state.lubePressure,
    _310_SQS_2561:state.pulseHigh,
    // Assumption for phase 2: TRUE means the level is LOW.
    _310_LSL:state.drumPercent<=GEAR_LOW_DRUM_PERCENT,
  };
}

export function gearSprayIsActive(
  state:GearPhysicalState,outputs:GearPhysicalOutputs,
):boolean {
  return state.enabled&&outputs.atomizationSolenoid&&
    outputs.lubricantSolenoid&&state.airPressure>40 &&
    state.lubePressure>=400&&!state.doserBlocked;
}
