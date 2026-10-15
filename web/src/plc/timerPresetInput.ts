import {
  isValidTimerPreset, MAX_TIMER_PRESET,
  type PracticeTag, type TimerPresetSource,
} from "./practiceDocument.ts";

/** Only DINTs with a valid millisecond value can drive a timer PRE. */
export function getAssignableTimerPresetTags(tags: readonly PracticeTag[]): PracticeTag[] {
  return tags.filter((tag) =>
    tag.type === "DINT" &&
    typeof tag.value === "number" &&
    isValidTimerPreset(tag.value));
}

export type ParsedTimerPreset =
  | { ok: true; preset: TimerPresetSource }
  | { ok: false; message: string };

/** A PRE operand is either a whole-millisecond literal or an existing DINT tag. */
export function parseTimerPresetInput(raw: string, tags: readonly PracticeTag[]): ParsedTimerPreset {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Escribe un tiempo en ms o el nombre de una variable DINT." };

  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    const number = Number(value);
    return isValidTimerPreset(number)
      ? { ok: true, preset: { mode: "literal", value: number } }
      : { ok: false, message: "PRE debe ser un entero de 0 a " + MAX_TIMER_PRESET + " ms." };
  }

  const tag = tags.find((item) => item.name.toLowerCase() === value.toLowerCase());
  if (!tag) return { ok: false, message: "No existe la variable «" + value + "». Selecciona un DINT de la lista." };
  if (tag.type !== "DINT") return { ok: false, message: "PRE solo admite variables DINT." };
  if (typeof tag.value !== "number" || !isValidTimerPreset(tag.value)) {
    return { ok: false, message: "El DINT debe contener un entero de 0 a " + MAX_TIMER_PRESET + " ms." };
  }
  return { ok: true, preset: { mode: "tag", tag: tag.name } };
}
