import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw } from "lucide-react";
import {
  getAssignableTimerPresetTags, parseTimerPresetInput,
} from "../../plc/timerPresetInput";
import type {
  PracticeInstruction, PracticeTag, TimerPresetSource,
} from "../../plc/practiceDocument";

export interface TimerPresetAnchor {
  left: number;
  top: number;
  bottom: number;
}

/**
 * Studio-style PRE operand editor: clicking the PRE value reveals a nearby,
 * immediately editable field and the available DINT tags, without a modal.
 */
export function TimerPresetEditor({
  instruction, tags, anchor, onSave, onClose,
}: {
  instruction: PracticeInstruction;
  tags: readonly PracticeTag[];
  anchor: TimerPresetAnchor;
  onSave: (value: TimerPresetSource | undefined) => void;
  onClose: () => void;
}) {
  const timer = tags.find((tag) => tag.name === instruction.tag);
  const timerPre = timer?.type === "TIMER" && typeof timer.value === "object"
    ? Number(timer.value.PRE) : 0;
  const initialValue = instruction.preset?.mode === "literal"
    ? String(instruction.preset.value)
    : instruction.preset?.mode === "tag" ? instruction.preset.tag : String(timerPre);
  const [draft, setDraft] = useState(initialValue);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dintTags = useMemo(() => getAssignableTimerPresetTags(tags), [tags]);
  const shown = searching
    ? dintTags.filter((tag) =>
      tag.name.toLowerCase().includes(draft.trim().toLowerCase()))
    : dintTags;

  const apply = (value: string) => {
    const result = parseTimerPresetInput(value, tags);
    if (!result.ok) {
      setError(result.message);
      inputRef.current?.focus();
      return false;
    }
    onSave(result.preset);
    return true;
  };

  const finish = () => {
    // Simply leaving the field should never convert TIMER.PRE into a fixed
    // number, nor rebuild an unchanged operand.
    if (!dirtyRef.current) { onClose(); return true; }
    return apply(draft);
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      finish();
    };
    document.addEventListener("pointerdown", onOutsidePointer);
    return () => document.removeEventListener("pointerdown", onOutsidePointer);
  });

  const chooseTag = (name: string) => {
    dirtyRef.current = true;
    setDraft(name);
    apply(name);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" && shown.length) {
      event.preventDefault();
      setActiveIndex((index) => index === null ? 0 : (index + 1) % shown.length);
    } else if (event.key === "ArrowUp" && shown.length) {
      event.preventDefault();
      setActiveIndex((index) => index === null ? shown.length - 1 : (index - 1 + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex !== null && shown[activeIndex]) {
        chooseTag(shown[activeIndex].name);
      } else {
        finish();
      }
    }
  };

  // Keep the menu next to the PRE row, but inside the browser viewport.
  const width = Math.min(340, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const estimatedHeight = 310;
  const top = anchor.bottom + estimatedHeight + 6 > window.innerHeight
    ? Math.max(8, anchor.top - estimatedHeight - 6)
    : anchor.bottom + 6;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={"Editar PRE de " + instruction.kind}
      onKeyDown={handleKeyDown}
      style={{ position: "fixed", left, top, width, zIndex: 1400 }}
      className="rounded-md border border-sky-400 bg-white p-3 text-slate-900 shadow-2xl"
    >
      <label htmlFor="timer-pre-inline-input" className="block text-xs font-semibold">
        PRE · {instruction.kind} · ms
      </label>
      <input
        id="timer-pre-inline-input"
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Valor PRE en milisegundos o variable DINT"
        aria-autocomplete="list"
        aria-expanded={true}
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          dirtyRef.current = true;
          setDraft(next);
          setSearching(/[a-z_]/i.test(next));
          setActiveIndex(null);
          setError("");
        }}
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
        <strong>Variables DINT disponibles</strong>
        <span>{shown.length}</span>
      </div>
      <div role="listbox" aria-label="Variables DINT para PRE"
        className="mt-1 max-h-[160px] overflow-y-auto rounded border border-slate-200">
        {shown.length ? shown.map((tag, index) => (
          <button
            key={tag.name}
            type="button"
            role="option"
            aria-selected={draft.toLowerCase() === tag.name.toLowerCase()}
            title={tag.description || tag.name}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => chooseTag(tag.name)}
            className={"flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs " +
              (activeIndex === index ? "bg-sky-100" : "hover:bg-sky-50")}
          >
            <span className="flex min-w-0 items-center gap-1 font-mono">
              <span className="truncate">{tag.name}</span>
              {instruction.preset?.mode === "tag" && instruction.preset.tag === tag.name &&
                <Check size={12} className="shrink-0 text-emerald-700" />}
            </span>
            <span className="shrink-0 text-slate-500">{String(tag.value)} ms</span>
          </button>
        )) : (
          <p className="p-3 text-xs text-slate-500">
            {dintTags.length ? "No hay DINT que coincidan." : "No hay DINT válidos. Puedes escribir un número."}
          </p>
        )}
      </div>
      <button type="button"
        onClick={() => onSave(undefined)}
        className="mt-2 flex items-center gap-1 text-xs text-sky-700 hover:underline">
        <RotateCcw size={12} /> Usar TIMER.PRE ({timerPre} ms)
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        Número o variable DINT · Enter o clic fuera: asignar · Esc: cancelar.
      </p>
    </div>, document.body,
  );
}
