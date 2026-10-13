export type InputTag = "Start_PB" | "Stop_PB" | "Auto_Mode";
export type DemoInputs = Record<InputTag, boolean>;
export type DemoOutputs = {
  Motor_Run: boolean;
  Stop_OK: boolean;
  Lamp_Run: boolean;
};
export type DemoValues = DemoInputs & DemoOutputs;

export const initialDemoInputs: DemoInputs = {
  Start_PB: false,
  Stop_PB: false,
  Auto_Mode: true,
};

export const demoTagMetadata: {
  name: keyof DemoValues;
  type: "BOOL";
  access: "input" | "output";
  description: string;
}[] = [
  { name: "Start_PB", type: "BOOL", access: "input", description: "Pulsador de arranque (simulación)" },
  { name: "Stop_PB", type: "BOOL", access: "input", description: "Pulsador de parada (simulación)" },
  { name: "Auto_Mode", type: "BOOL", access: "input", description: "Selector de modo automático" },
  { name: "Motor_Run", type: "BOOL", access: "output", description: "Salida enclavada del motor" },
  { name: "Stop_OK", type: "BOOL", access: "output", description: "Permisivo de parada" },
  { name: "Lamp_Run", type: "BOOL", access: "output", description: "Indicador de marcha automática" },
];

/**
 * Demonstration ONLY. Models the three fixed example rungs for visual monitoring.
 * This is not a general-purpose Logix PLC execution engine.
 */
export function evaluateDemo(inputs: DemoInputs, motorLatched: boolean): DemoValues {
  return {
    ...inputs,
    Motor_Run: motorLatched,
    Stop_OK: !inputs.Stop_PB,
    Lamp_Run: motorLatched && inputs.Auto_Mode,
  };
}
