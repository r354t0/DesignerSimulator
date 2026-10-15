import { isOutputKind, type PracticeProject, type PracticeInstruction } from "./practiceDocument.ts";
import type { SeriesScan } from "./practiceRuntime.ts";
import type { ScanMode } from "./practiceScanCycle.ts";

export type MonitorSelection =
  | { kind: "instruction"; instructionId: string }
  | { kind: "branch"; rungId: string; branchId: string }
  | { kind: "rung"; rungId: string }
  | null;

export interface MonitorField {
  label: string;
  value: string;
  /** Value compared to last evaluated scan. */
  changed?: boolean;
}

export interface OnlineMonitorReadout {
  label: string;
  location: string;
  status: "energized" | "blocked" | "paused" | "unavailable" | "pending";
  fields: MonitorField[];
  explanation: string;
  pendingInputs: number;
}

const BOOL = (value: boolean) => value ? "1 (TRUE)" : "0 (FALSE)";
const POW = (value: boolean) => value ? "Energizado" : "Sin energía";

function getSelectedInstruction(project: PracticeProject, id: string) {
  for (let index = 0; index < project.rungs.length; index++) {
    const rung = project.rungs[index];
    const main = rung.instructions.find((item) => item.id === id);
    if (main) return { instruction: main, rung, index, branchId: undefined as string | undefined };
    for (const branch of rung.parallelBranches ?? []) {
      const instruction = branch.instructions.find((item) => item.id === id);
      if (instruction) return { instruction, rung, index, branchId: branch.id };
    }
  }
  return null;
}

function tagValue(project: PracticeProject, name: string): boolean | undefined {
  const tag = project.tags.find((item) => item.name === name);
  return tag?.type === "BOOL" && typeof tag.value === "boolean" ? tag.value : undefined;
}

/** Inputs that have been edited but not read by another scan. OTE outputs are excluded. */
export function getPendingScanInputs(project: PracticeProject, frame: SeriesScan | null): string[] {
  if (!frame) return [];
  const outputs = new Set(project.rungs.flatMap((rung) => [
    ...rung.instructions.filter((item) => isOutputKind(item.kind) || item.kind === "ONS"),
    ...(rung.parallelBranches ?? []).flatMap((branch) =>
      branch.instructions.filter((item) => item.kind === "ONS")),
  ].map((item) => item.tag)));
  return project.tags.filter((tag) =>
    tag.type === "BOOL" && !outputs.has(tag.name) &&
    tagValue(project, tag.name) !== tagValue(frame.project, tag.name))
    .map((tag) => tag.name);
}

function baseReadout(
  label: string, location: string, mode: ScanMode, frame: SeriesScan | null,
  pendingInputs: number,
): OnlineMonitorReadout {
  const available = mode !== "stopped" && Boolean(frame);
  return {
    label, location, fields: [], pendingInputs,
    status: !available ? "unavailable" : mode === "paused" ? "paused" : "blocked",
    explanation: !available
      ? "Inicia RUN y selecciona una instrucción o rama para consultar el último scan."
      : mode === "paused"
        ? "Valores congelados en el último scan. Usa SCAN o RUN para actualizarlos."
        : "Se muestran los valores del último scan completado.",
  };
}

function instructionReadout(
  instruction: PracticeInstruction,
  frame: SeriesScan | null, project: PracticeProject,
  mode: ScanMode, rungIndex: number, branchId: string | undefined, pendingInputs: string[],
): OnlineMonitorReadout {
  const result = baseReadout(
    instruction.kind + " · " + (instruction.tag || "??"),
    "Rung " + rungIndex + (branchId ? " · Rama OR" : " · Línea principal"),
    mode, frame, pendingInputs.length,
  );
  const flow = frame?.instructionFlow[instruction.id];
  if (!flow || mode === "stopped") return result;

  const sourceValue = tagValue(project, instruction.tag);
  const sampledValue = tagValue(frame!.project, instruction.tag);
  const isPending = pendingInputs.includes(instruction.tag) && sourceValue !== sampledValue;

  if (isOutputKind(instruction.kind)) {
    result.fields = [
      { label: "Entrada de energía", value: POW(flow.powerIn) },
      { label: instruction.kind === "OTE" ? "Valor de salida" : "Valor retenido",
        value: BOOL(flow.value) },
    ];
    result.status = mode === "paused" ? "paused" : flow.powerOut ? "energized" : "blocked";
    return result;
  }
  if (instruction.kind === "ONS") {
    result.fields = [
      { label: "Memoria antes", value: BOOL(flow.value) },
      { label: "Energía entrada", value: POW(flow.powerIn) },
      { label: "Pulso de un scan", value: flow.powerOut ? "ACTIVO" : "INACTIVO" },
      { label: "Memoria después", value: BOOL(Boolean(tagValue(frame!.project, instruction.tag))) },
    ];
    result.status = mode === "paused" ? "paused" : flow.powerOut ? "energized" : "blocked";
    result.explanation = mode === "paused"
      ? "ONS congelado en el último scan; RUN o SCAN evalúa el próximo flanco."
      : "ONS conduce durante un único scan al pasar su entrada de 0 a 1.";
    return result;
  }
  const condition = instruction.kind === "XIC" ? flow.value : !flow.value;
  result.fields = [
    { label: "Bit leído en scan", value: BOOL(flow.value) },
    { label: "Condición", value: condition ? "Cumple" : "No cumple" },
    { label: "Energía entrada", value: POW(flow.powerIn) },
    { label: "Energía salida", value: POW(flow.powerOut) },
  ];
  if (isPending) {
    result.fields.push({ label: "Entrada pendiente", value: BOOL(sourceValue!), changed: true });
    result.explanation = "El bit cambió después del último scan. Se aplicará al pulsar SCAN o reanudar RUN.";
  }
  result.status = mode === "paused" ? "paused" : flow.powerOut ? "energized" : "blocked";
  return result;
}

/** Pure, snapshot-based Online inspector. Never recomputes Ladder to fabricate live flow. */
export function getOnlineMonitorReadout(
  project: PracticeProject,
  frame: SeriesScan | null,
  mode: ScanMode,
  selection: MonitorSelection,
): OnlineMonitorReadout | null {
  if (!selection) return null;
  const pendingInputs = getPendingScanInputs(project, frame);
  if (selection.kind === "instruction") {
    const found = getSelectedInstruction(project, selection.instructionId);
    return found
      ? instructionReadout(found.instruction, frame, project, mode, found.index,
        found.branchId, pendingInputs) : null;
  }
  const index = project.rungs.findIndex((rung) => rung.id === selection.rungId);
  if (index < 0) return null;
  const rung = project.rungs[index];
  if (selection.kind === "rung") {
    const readout = baseReadout("Rung " + index, "Línea completa", mode, frame, pendingInputs.length);
    if (frame && mode !== "stopped" && Object.hasOwn(frame.rungPower, rung.id)) {
      const powered = frame.rungPower[rung.id];
      readout.fields = [
        { label: "Resultado rung", value: POW(powered) },
        { label: "Salidas OTE/OTL/OTU", value: String(rung.instructions.filter((item) => isOutputKind(item.kind)).length) },
      ];
      readout.status = mode === "paused" ? "paused" : powered ? "energized" : "blocked";
    }
    return readout;
  }
  const branch = rung.parallelBranches?.find((item) => item.id === selection.branchId);
  const emptyOutputIndex = rung.emptyOutputBranches?.indexOf(selection.branchId) ?? -1;
  if (!branch && emptyOutputIndex < 0) return null;
  const readout = baseReadout(
    branch ? "Rama OR · " + (branch.instructions.length + " contacto(s)") : "Rama de salida vacía",
    "Rung " + index,
    mode, frame, pendingInputs.length,
  );
  if (!branch) {
    readout.explanation = "Inserta una bobina OTE para completar esta rama de salida.";
    return readout;
  }
  if (frame && mode !== "stopped" &&
      Object.hasOwn(frame.branchPower, branch.id)) {
    const powered = frame.branchPower[branch.id];
    readout.fields = [
      { label: "Energía entrada", value: POW(frame.branchInput[branch.id]) },
      { label: "Energía salida", value: POW(powered) },
      { label: "Contactos en serie", value: String(branch.instructions.length) },
    ];
    readout.status = mode === "paused" ? "paused" : powered ? "energized" : "blocked";
  }
  return readout;
}
