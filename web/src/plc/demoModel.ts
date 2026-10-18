export type InputTag = "PB_Start" | "PB_Stop" | "ST_AutoMode";
export type DemoInputs = Record<InputTag, boolean>;
export type DemoOutputs = {
  DO_Motor: boolean;
  ST_StopPermissive: boolean;
  DO_RunLamp: boolean;
};
export type DemoValues = DemoInputs & DemoOutputs;

export const initialDemoInputs: DemoInputs = {
  PB_Start: false,
  PB_Stop: false,
  ST_AutoMode: true,
};

export const demoTagMetadata: {
  name: keyof DemoValues;
  type: "BOOL";
  access: "input" | "output";
  description: string;
}[] = [
  { name: "PB_Start", type: "BOOL", access: "input", description: "Pulsador de arranque (simulación)" },
  { name: "PB_Stop", type: "BOOL", access: "input", description: "Pulsador de parada (simulación)" },
  { name: "ST_AutoMode", type: "BOOL", access: "input", description: "Selector de modo automático" },
  { name: "DO_Motor", type: "BOOL", access: "output", description: "Salida enclavada del motor" },
  { name: "ST_StopPermissive", type: "BOOL", access: "output", description: "Permisivo de parada" },
  { name: "DO_RunLamp", type: "BOOL", access: "output", description: "Indicador de marcha automática" },
];

/**
 * Demonstration ONLY. Models the three fixed example rungs for visual monitoring.
 * This is not a general-purpose Logix PLC execution engine.
 */
export function evaluateDemo(inputs: DemoInputs, motorLatched: boolean): DemoValues {
  return {
    ...inputs,
    DO_Motor: motorLatched,
    ST_StopPermissive: !inputs.PB_Stop,
    DO_RunLamp: motorLatched && inputs.ST_AutoMode,
  };
}
