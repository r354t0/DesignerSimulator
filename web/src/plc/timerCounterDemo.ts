import type { DemoValues } from "./demoModel";

/**
 * A deterministic, fixed-program simulator for the five example rungs only.
 * This is NOT a general Ladder executor or a physical controller connection.
 * Time values are milliseconds; timers are not retentive in this demo.
 */
export type DemoBlockKind = "TON" | "TOF" | "TONOFF" | "CTU" | "CTD";
export type DemoBit = "EN" | "TT" | "DN" | "CU" | "CD" | "OV" | "UN";
export type DemoPhase = "idle" | "on-delay" | "on" | "off-delay";
export interface DemoBlockState {
  pre: number;
  acc: number;
  offPre: number;
  en: boolean;
  tt: boolean;
  dn: boolean;
  cu: boolean;
  cd: boolean;
  ov: boolean;
  un: boolean;
  priorInput: boolean;
  phase: DemoPhase;
}
export type DemoBlockRuntime = Record<DemoBlockKind, DemoBlockState>;

export const DEMO_BLOCKS: ReadonlyArray<{
  kind: DemoBlockKind;
  tag: string;
  contact: keyof DemoValues;
  description: string;
  bits: readonly DemoBit[];
}> = [
  { kind: "TON", tag: "TMR_StartDelay", contact: "PB_Start", description: "Retardo a la conexión", bits: ["EN", "TT", "DN"] },
  { kind: "TOF", tag: "TMR_StopDelay", contact: "DO_Motor", description: "Retardo a la desconexión", bits: ["EN", "TT", "DN"] },
  { kind: "TONOFF", tag: "TMR_DualDelay", contact: "DI_AutoMode", description: "Retardo ON/OFF · personalizado", bits: ["EN", "TT", "DN"] },
  { kind: "CTU", tag: "CNT_BoxesUp", contact: "PB_Start", description: "Contador ascendente", bits: ["CU", "DN", "OV"] },
  { kind: "CTD", tag: "CNT_BoxesDown", contact: "PB_Stop", description: "Contador descendente", bits: ["CD", "DN", "UN"] },
];

function blank(pre: number, acc = 0): DemoBlockState {
  return {
    pre, acc, offPre: 0, en: false, tt: false, dn: false,
    cu: false, cd: false, ov: false, un: false,
    priorInput: false, phase: "idle",
  };
}

export function initialDemoBlocks(): DemoBlockRuntime {
  // CTD is deliberately loaded by the demo with ACC=PRE; a Logix CTD
  // instruction does not automatically preload its ACC.
  return {
    TON: blank(5000),
    TOF: blank(2500, 2500), // Logix-like prescan: DN=0 and ACC=PRE
    TONOFF: { ...blank(1800), offPre: 2200 },
    CTU: blank(10),
    CTD: { ...blank(8, 8), dn: true },
  };
}

const DINT_MAX = 2147483647;
const DINT_MIN = -2147483648;

function stepTon(s: DemoBlockState, input: boolean, dt: number): DemoBlockState {
  if (!input) return { ...s, acc: 0, en: false, tt: false, dn: false, priorInput: false };
  const acc = Math.min(s.pre, s.acc + dt);
  return { ...s, acc, en: true, tt: acc < s.pre, dn: acc >= s.pre, priorInput: true };
}

function stepTof(s: DemoBlockState, input: boolean, dt: number): DemoBlockState {
  if (input) return { ...s, acc: 0, en: true, tt: false, dn: true, priorInput: true };
  if (!s.dn) return { ...s, en: false, tt: false, priorInput: false };
  const acc = Math.min(s.pre, s.acc + dt);
  return { ...s, acc, en: false, tt: acc < s.pre, dn: acc < s.pre, priorInput: false };
}

function stepTonoff(s: DemoBlockState, input: boolean, dt: number): DemoBlockState {
  if (input) {
    if (s.phase === "on" || s.phase === "off-delay") {
      return { ...s, acc: s.pre, en: true, tt: false, dn: true, phase: "on", priorInput: true };
    }
    const acc = Math.min(s.pre, s.acc + dt);
    const done = acc >= s.pre;
    return { ...s, acc, en: true, tt: !done, dn: done, phase: done ? "on" : "on-delay", priorInput: true };
  }
  if (s.phase === "on" || s.phase === "off-delay") {
    // The falling edge starts an independent off-delay.
    const acc = Math.min(s.offPre, (s.phase === "on" ? 0 : s.acc) + (s.phase === "on" ? 0 : dt));
    const done = acc >= s.offPre;
    return { ...s, acc, en: false, tt: !done, dn: !done, phase: done ? "idle" : "off-delay", priorInput: false };
  }
  return { ...s, acc: 0, en: false, tt: false, dn: false, phase: "idle", priorInput: false };
}

function stepCtu(s: DemoBlockState, input: boolean): DemoBlockState {
  const rise = input && !s.priorInput;
  let acc = s.acc;
  let ov = s.ov;
  if (rise) {
    if (acc === DINT_MAX) { acc = DINT_MIN; ov = true; }
    else acc += 1;
  }
  return { ...s, acc, en: false, tt: false, cu: input, dn: acc >= s.pre, ov, priorInput: input };
}

function stepCtd(s: DemoBlockState, input: boolean): DemoBlockState {
  const rise = input && !s.priorInput;
  let acc = s.acc;
  let un = s.un;
  if (rise) {
    if (acc === DINT_MIN) { acc = DINT_MAX; un = true; }
    else acc -= 1;
  }
  // In Logix, CTD.DN follows ACC >= PRE (not "ACC reached zero").
  return { ...s, acc, en: false, tt: false, cd: input, dn: acc >= s.pre, un, priorInput: input };
}

export function stepDemoBlocks(
  previous: DemoBlockRuntime,
  values: DemoValues,
  elapsedMs: number,
): DemoBlockRuntime {
  const dt = Math.max(0, Math.min(elapsedMs, 250));
  return {
    TON: stepTon(previous.TON, values.PB_Start, dt),
    TOF: stepTof(previous.TOF, values.DO_Motor, dt),
    TONOFF: stepTonoff(previous.TONOFF, values.DI_AutoMode, dt),
    CTU: stepCtu(previous.CTU, values.PB_Start),
    CTD: stepCtd(previous.CTD, values.PB_Stop),
  };
}

export function resetDemoCounters(previous: DemoBlockRuntime): DemoBlockRuntime {
  const fresh = initialDemoBlocks();
  return {
    ...previous,
    CTU: { ...fresh.CTU, priorInput: previous.CTU.priorInput, cu: previous.CTU.cu },
    CTD: { ...fresh.CTD, priorInput: previous.CTD.priorInput, cd: previous.CTD.cd },
  };
}
