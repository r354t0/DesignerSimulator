import { useState } from "react";
import { createPortal } from "react-dom";
import {
  isValidTimerPreset, MAX_TIMER_PRESET,
  type PracticeInstruction, type PracticeTag, type TimerPresetSource,
} from "../../plc/practiceDocument";

type Mode = "timer" | "literal" | "tag";

export function TimerPresetEditor({
  instruction, tags, onSave, onClose,
}: {
  instruction: PracticeInstruction;
  tags: readonly PracticeTag[];
  onSave: (value: TimerPresetSource | undefined) => void;
  onClose: () => void;
}) {
  const existing = instruction.preset;
  const [mode, setMode] = useState<Mode>(existing?.mode ?? "timer");
  const timer = tags.find((tag) => tag.name === instruction.tag);
  const timerPre = timer?.type === "TIMER" && typeof timer.value === "object"
    ? Number(timer.value.PRE) : 0;
  const [literal, setLiteral] = useState(String(
    existing?.mode === "literal" ? existing.value : timerPre));
  const dintTags = tags.filter((tag) => tag.type === "DINT");
  const [tagName, setTagName] = useState(existing?.mode === "tag" ? existing.tag : dintTags[0]?.name ?? "");
  const [error, setError] = useState("");

  const commit = () => {
    if (mode === "timer") { onSave(undefined); return; }
    if (mode === "literal") {
      const value = Number(literal.trim());
      if (!literal.trim() || !isValidTimerPreset(value)) {
        setError("Introduce un número entero de 0 a " + MAX_TIMER_PRESET + " milisegundos.");
        return;
      }
      onSave({ mode: "literal", value });
      return;
    }
    const reference = dintTags.find((tag) => tag.name === tagName);
    if (!reference || typeof reference.value !== "number" ||
      !isValidTimerPreset(reference.value)) {
      setError("Selecciona un DINT válido con valor no negativo.");
      return;
    }
    onSave({ mode: "tag", tag: reference.name });
  };

  return createPortal(
    <div className="fixed inset-0 z-[1350] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={"Editar PRE de " + instruction.kind}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onClose(); }
          if (event.key === "Enter") { event.preventDefault(); commit(); }
        }}
        className="w-full max-w-[430px] rounded-lg border border-slate-300 bg-white p-4 text-slate-900 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Configurar PRE · {instruction.kind}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar editor PRE"
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {instruction.tag || "??"} · Tiempo en milisegundos. Cambiar el origen del PRE
          durante RUN detiene la práctica y requiere Build.
        </p>
        <label className="mt-4 block text-xs font-medium" htmlFor="preset-source">Origen del PRE</label>
        <select id="preset-source" value={mode}
          onChange={(event) => { setMode(event.target.value as Mode); setError(""); }}
          className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm">
          <option value="timer">Miembro TIMER.PRE ({timerPre} ms)</option>
          <option value="literal">Número fijo (literal)</option>
          <option value="tag">Variable DINT</option>
        </select>
        {mode === "literal" && (
          <>
            <label className="mt-3 block text-xs font-medium" htmlFor="preset-value">PRE (ms)</label>
            <input id="preset-value" type="number" min="0" max={MAX_TIMER_PRESET} step="1"
              value={literal} onChange={(event) => setLiteral(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 font-mono text-sm" />
          </>
        )}
        {mode === "tag" && (
          <>
            <label className="mt-3 block text-xs font-medium" htmlFor="preset-tag">Tag DINT</label>
            <select id="preset-tag" value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm">
              {!dintTags.length && <option value="">No hay variables DINT</option>}
              {dintTags.map((tag) => <option key={tag.name} value={tag.name}>
                {tag.name} ({String(tag.value)} ms)
              </option>)}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              El simulador leerá el valor actual del DINT en cada scan.
            </p>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
            Cancelar
          </button>
          <button type="button" onClick={commit}
            className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800">
            Aplicar PRE
          </button>
        </div>
      </div>
    </div>, document.body,
  );
}
