/**
 * Studio 5000-inspired instruction catalog used by the visual palette.
 *
 * XIC, XIO, OTE, OTL, OTU and ONS are editable in PracticeRoutine.
 * Other entries remain discoverable but unavailable for insertion
 * until its document model, graphic and execution behavior have been built.
 */
export type PaletteCategoryId =
  | "favorites" | "add-on" | "alarms" | "bit" | "timer-counter"
  | "input-output" | "compare" | "move-logical" | "compute-math"
  | "file-misc" | "file-shift";

export interface PaletteTool {
  id: string;
  title: string;
  editable: boolean;
  previewOnly?: boolean;
}

export interface PaletteCategory {
  id: PaletteCategoryId;
  label: string;
  tools: readonly PaletteTool[];
}

const tool = (id: string, title: string, editable = false, previewOnly = false): PaletteTool =>
  ({ id, title, editable, previewOnly });

const xic = tool("XIC", "Examine If Closed · contacto normalmente abierto", true);
const xio = tool("XIO", "Examine If Open · contacto normalmente cerrado", true);
const ote = tool("OTE", "Output Energize · bobina de salida", true);
const otl = tool("OTL", "Output Latch · salida enclavada", true);
const otu = tool("OTU", "Output Unlatch · desenclavar salida", true);
const ons = tool("ONS", "One Shot · flanco único (requiere memoria BOOL)", true);
const osr = tool("OSR", "One Shot Rising · flanco ascendente");
const osf = tool("OSF", "One Shot Falling · flanco descendente");
const ton = tool("TON", "Timer On Delay · disponible solo en MainRoutine DEMO", false, true);
const tof = tool("TOF", "Timer Off Delay · disponible solo en MainRoutine DEMO", false, true);
const ctu = tool("CTU", "Count Up · disponible solo en MainRoutine DEMO", false, true);
const ctd = tool("CTD", "Count Down · disponible solo en MainRoutine DEMO", false, true);

export const PALETTE_CATEGORIES: readonly PaletteCategory[] = [
  { id: "favorites", label: "Favorites", tools: [
    xic, xio, ote, otl, otu, ons, osr, osf,
  ] },
  { id: "add-on", label: "Add-On", tools: [
    tool("AOI", "Add-On Instruction · instrucciones personalizadas"),
  ] },
  { id: "alarms", label: "Alarms", tools: [
    tool("ALMD", "Analog Alarm"), tool("ALMA", "Digital Alarm"),
  ] },
  { id: "bit", label: "Bit", tools: [
    xic, xio, ote, otl, otu, ons, osr, osf,
  ] },
  { id: "timer-counter", label: "Timer/Counter", tools: [
    ton, tof, tool("RTO", "Retentive Timer On"), ctu, ctd,
    tool("RES", "Reset timer/counter"),
  ] },
  { id: "input-output", label: "Input/Output", tools: [
    tool("MSG", "Message"), tool("GSV", "Get System Value"),
    tool("SSV", "Set System Value"), tool("IOT", "Immediate Output"),
  ] },
  { id: "compare", label: "Compare", tools: [
    tool("EQU", "Equal"), tool("NEQ", "Not Equal"), tool("LES", "Less Than"),
    tool("LEQ", "Less Than or Equal"), tool("GRT", "Greater Than"),
    tool("GEQ", "Greater Than or Equal"), tool("LIM", "Limit Test"),
  ] },
  { id: "move-logical", label: "Move/Logical", tools: [
    tool("MOV", "Move"), tool("MVM", "Masked Move"), tool("COP", "Copy"),
    tool("CPS", "Synchronous Copy"), tool("AND", "Bitwise AND"),
    tool("OR", "Bitwise OR"), tool("XOR", "Bitwise XOR"),
    tool("NOT", "Bitwise NOT"),
  ] },
  { id: "compute-math", label: "Compute/Math", tools: [
    tool("ADD", "Add"), tool("SUB", "Subtract"), tool("MUL", "Multiply"),
    tool("DIV", "Divide"), tool("MOD", "Modulo"), tool("CPT", "Compute"),
  ] },
  { id: "file-misc", label: "File/Misc.", tools: [
    tool("FLL", "File Fill"), tool("FSC", "File Search and Compare"),
    tool("SRT", "Sort"), tool("SIZE", "Array Size"),
  ] },
  { id: "file-shift", label: "File/Shift", tools: [
    tool("BSL", "Bit Shift Left"), tool("BSR", "Bit Shift Right"),
    tool("FFL", "FIFO Load"), tool("FFU", "FIFO Unload"),
  ] },
] as const;

export function getPaletteCategory(id: PaletteCategoryId): PaletteCategory {
  return PALETTE_CATEGORIES.find((category) => category.id === id) ?? PALETTE_CATEGORIES[0];
}

export function isImplementedPaletteInstruction(
  id: string,
): id is "XIC" | "XIO" | "OTE" | "OTL" | "OTU" | "ONS" {
  return ["XIC", "XIO", "OTE", "OTL", "OTU", "ONS"].includes(id);
}
