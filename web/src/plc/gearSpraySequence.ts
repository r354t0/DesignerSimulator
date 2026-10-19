/** Port of CCW FB_GearSpray_Sequence ST behavior.
 * One deterministic step corresponds to ONE execution of the P03 rung-5
 * function block. It does not own timers, sensors or PLC outputs.
 *
 * Source: FB_GearSpray_Sequence.pdf (current state-machine version).
 * State 0 inactive, 10 waiting, 20 lubricating, 30 purging, 90 blocked.
 */
export type GearCycleStateCode = 0|10|20|30|90;

export interface GearSequenceInputs {
  run:boolean;          // i_Run: ST_Run_Rly
  healthy:boolean;      // i_Healthy: DO_LS_Healthy
  manual:boolean;       // i_Manual: ST_Man_Mode
  freqDone:boolean;     // i_FreqDone: TMR_Freq.DN
  startupDone:boolean;  // i_StartUpDone: TMR_Startup_Cycle.DN
  extraPulse:boolean;   // i_ExtraPulse: PB_Extra (rung)
  flowDone:boolean;     // i_FlowDone: CTN_Lubeflo.DN
  purgeActive:boolean;  // i_PurgeActive: TMR_Purge.DN
  resetPulse:boolean;   // i_ResetPulse: PB_Reset
  tripActive:boolean;   // i_TripActive: ST_General_Trip_Rly
}
export interface GearSequenceState {
  state:GearCycleStateCode;
  blockLatched:boolean; // internal BlockLatched
  recoveryHold:boolean; // internal RecoveryHold
}
export interface GearSequenceOutput {
  cycleRun:boolean;     // o_CycleRun: ST_Cycle_Rly
  state:GearCycleStateCode; // o_State: SM_Cycle_State
  blocked:boolean;      // o_Blocked: SM_Cycle_Blocked (state 90)
  rearmHold:boolean;    // o_RearmHold: SM_Cycle_RearmHold
  permissive:boolean;
  request:boolean;
}

export function initialGearSequenceState():GearSequenceState {
  return {state:0,blockLatched:false,recoveryHold:false};
}

export function evaluateGearSequence(
  previous:GearSequenceState,input:GearSequenceInputs,
):{memory:GearSequenceState;output:GearSequenceOutput} {
  const permissive=input.run&&(input.healthy||input.manual);
  const request=input.freqDone||!input.startupDone||input.extraPulse;
  let blockLatched=previous.blockLatched;
  let recoveryHold=previous.recoveryHold;
  // In the unified P01–P07 Ladder, P03 executes before P06 writes
  // DO_LS_Healthy. On the FIRST rising RUN scan the previous-mode
  // DO_LS_Healthy can still be FALSE even though all safety permissives
  // will be TRUE once P06 evaluates later in that very scan.
  // Defer ONLY the missing-health latch for that one initial scan.
  // No lubrication output is enabled while permissive is FALSE.
  // An actual trip remains immediate, and persistent unhealthy status
  // blocks on the next scan. A previously latched fault still needs RESET.
  const firstRunScan=input.run&&previous.state===0&&!previous.blockLatched;
  const pendingHealthy=firstRunScan&&!input.healthy&&!input.manual&&
    !input.tripActive;
  if(input.tripActive||(input.run&&!permissive&&!pendingHealthy)){
    blockLatched=true;
    recoveryHold=true;
  }else if(blockLatched&&input.resetPulse&&input.run&&permissive&&!input.tripActive){
    blockLatched=false;
    recoveryHold=true;
  }
  let state=previous.state;
  if(!input.run){
    state=0;
  }else if(blockLatched){
    state=90;
  }else {
    switch(state){
      case 0:
        state=10;
        break;
      case 10:
        if(recoveryHold){
          if(input.startupDone&&!input.freqDone&&!input.extraPulse&&
            !input.purgeActive&&!input.flowDone)
            recoveryHold=false;
        }else if(request&&!input.flowDone)state=20;
        break;
      case 20:
        if(input.flowDone)state=30;
        break;
      case 30:
        if(!input.purgeActive)state=10;
        break;
      case 90:
        if(input.resetPulse)state=10;
        break;
      default:
        state=0;
    }
  }
  const memory:GearSequenceState={state,blockLatched,recoveryHold};
  return {memory,output:{
    cycleRun:state===20&&permissive&&!blockLatched&&!input.flowDone,
    state,
    blocked:state===90,
    rearmHold:recoveryHold,
    permissive,request,
  }};
}
