import {
  isValidCounterPreset, isValidTimerPreset, MAX_TIMER_PRESET, MIN_COUNTER_PRESET,
  type PracticeTag, type TimerPresetSource,
} from "./practiceDocument.ts";

export type PresetOperandKind = "timer" | "counter";

const presetIsValid = (value: number, kind: PresetOperandKind) =>
  kind === "counter" ? isValidCounterPreset(value) : isValidTimerPreset(value);

/** Filter existing DINTs compatible with the instruction's PRE domain. */
export function getAssignablePresetTags(
  tags: readonly PracticeTag[], kind: PresetOperandKind = "timer",
): PracticeTag[] {
  return tags.filter((tag) =>
    tag.type === "DINT" && typeof tag.value === "number" &&
    presetIsValid(tag.value, kind));
}

export type ParsedTimerPreset =
  | { ok: true; preset: TimerPresetSource }
  | { ok: false; message: string };

/** A PRE operand can be a typed DINT literal or an existing DINT tag. */
export function parsePresetInput(
  raw: string, tags: readonly PracticeTag[], kind: PresetOperandKind = "timer",
): ParsedTimerPreset {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Escribe un valor PRE o una variable DINT." };

  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    return presetIsValid(numeric, kind)
      ? { ok: true, preset: { mode: "literal", value: numeric } }
      : { ok: false, message: kind === "counter"
        ? "PRE debe ser un DINT entero de " + MIN_COUNTER_PRESET + " a " + MAX_TIMER_PRESET + " pulsos."
        : "PRE debe ser un entero de 0 a " + MAX_TIMER_PRESET + " ms." };
  }
  const tag = tags.find((item) => item.name.toLowerCase() === value.toLowerCase());
  if (!tag) return { ok: false, message: "No existe la variable «" + value + "». Selecciona un DINT de la lista." };
  if (tag.type !== "DINT") return { ok: false, message: "PRE solo admite variables DINT." };
  if (typeof tag.value !== "number" || !presetIsValid(tag.value, kind)) {
    return { ok: false, message: kind === "counter"
      ? "La variable DINT debe contener un entero de 32 bits."
      : "El DINT debe contener un entero de 0 a " + MAX_TIMER_PRESET + " ms." };
  }
  return { ok: true, preset: { mode: "tag", tag: tag.name } };
}

/** Backward-compatible timer-specific helpers. */
export const getAssignableTimerPresetTags = (tags: readonly PracticeTag[]) =>
  getAssignablePresetTags(tags, "timer");
export const parseTimerPresetInput = (raw: string, tags: readonly PracticeTag[]) =>
  parsePresetInput(raw, tags, "timer");
