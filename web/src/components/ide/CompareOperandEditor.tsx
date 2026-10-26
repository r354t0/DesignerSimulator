import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  comparisonTagOptions, numericOperandLabel, parseComparisonOperand,
} from "../../plc/practiceCompare";
import { isMathKind, type ComparisonOperand, type PracticeTag, type CompareKind, type MathKind } from "../../plc/practiceDocument";

export interface CompareOperandAnchor {
  left: number;
  top: number;
  bottom: number;
}

/**
 * Inline two-source compare editing. Numeric literals and variables share the
 * same text field, just like the already-validated PRE editor.
 */
export function CompareOperandEditor({
  kind, side, operand, tags, anchor, onSave, onClose,
}: {
  kind: CompareKind | MathKind;
  side: "A" | "B";
  operand?: ComparisonOperand;
  tags: readonly PracticeTag[];
  anchor: CompareOperandAnchor;
  onSave: (source: ComparisonOperand) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(operand ? numericOperandLabel(operand) : "");
  const [error, setError] = useState("");
  const [index, setIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const effectiveKind: CompareKind = isMathKind(kind) ? "GRT" : kind;
  const options = useMemo(() => comparisonTagOptions(tags, effectiveKind), [tags, effectiveKind]);
  const search = !draft.trimStart().startsWith('"') && /[A-Za-z_]/.test(draft);
  const visible = search
    ? options.filter((row) => row.name.toLowerCase().includes(draft.trim().toLowerCase()))
    : options;

  const apply = (text: string): boolean => {
    const parsed = parseComparisonOperand(text, tags, effectiveKind);
    if (!parsed.ok) {
      setError(parsed.message);
      input.current?.focus();
      return false;
    }
    onSave(parsed.operand);
    return true;
  };
  const finish = () => {
    if (!dirty) { onClose(); return; }
    apply(draft);
  };

  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      finish();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  });

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" && visible.length) {
      event.preventDefault();
      setIndex((n) => n === null ? 0 : (n + 1) % visible.length);
    } else if (event.key === "ArrowUp" && visible.length) {
      event.preventDefault();
      setIndex((n) => n === null ? visible.length - 1 : (n - 1 + visible.length) % visible.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = index === null ? null : visible[index];
      apply(selected ? selected.name : draft);
    }
  };
  const width = Math.min(345, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const expectedHeight = 315;
  const top = anchor.bottom + expectedHeight + 6 > window.innerHeight
    ? Math.max(8, anchor.top - expectedHeight - 6) : anchor.bottom + 6;

  return createPortal(
    <div ref={panel} role="dialog" aria-label={"Editar " + kind + " Source " + side}
      onKeyDown={keyDown}
      style={{ position: "fixed", top, left, width, zIndex: 1400 }}
      className="rounded-md border border-sky-400 bg-white p-3 text-slate-900 shadow-2xl">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="compare-operand-field" className="text-xs font-semibold">
          {kind} · Source {side}
        </label>
        <button type="button" onClick={onClose}
          aria-label="Cerrar editor de comparación sin guardar"
          title="Cerrar sin guardar (Esc)"
          className="flex size-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-500">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <input ref={input} id="compare-operand-field" type="text"
        role="combobox" aria-label={"Source " + side + ": número o variable"}
        aria-expanded={true} aria-autocomplete="list" autoComplete="off"
        spellCheck={false} value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
          setIndex(null);
          setError("");
        }}
        placeholder={kind === "EQU" || kind === "NEQ"
          ? 'Número, tag o texto entre comillas: "LISTO"'
          : "Número o variable INT/DINT/REAL"}
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"/>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
        <strong>{kind === "EQU" || kind === "NEQ"
          ? "Variables numéricas y STRING" : "Variables numéricas disponibles"}</strong>
        <span>{visible.length}</span>
      </div>
      <div className="mt-1 max-h-[166px] overflow-y-auto rounded border border-slate-200"
        role="listbox" aria-label={"Seleccionar variable Source " + side}>
        {visible.length ? visible.map((row, i) => (
          <button key={row.name} type="button" role="option"
            aria-selected={operand?.mode === "tag" && operand.tag === row.name}
            title={row.description || row.name}
            className={"flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs " +
              (index === i ? "bg-sky-100" : "hover:bg-sky-50")}
            onMouseEnter={() => setIndex(i)}
            onClick={() => apply(row.name)}>
            <span className="min-w-0 truncate font-mono">{row.name}</span>
            <span className="max-w-[115px] shrink-0 truncate font-mono text-slate-500">
              {typeof row.value === "string" ? JSON.stringify(row.value) : row.value}
            </span>
          </button>
        )) : (
          <p className="p-3 text-xs text-slate-500">
            {options.length ? "No hay variables que coincidan." : "No hay variables numéricas. Puedes escribir un número."}
          </p>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        INT/DINT/REAL, PRE/ACC{kind === "EQU" || kind === "NEQ"
          ? ', STRING o texto entre comillas dobles' : ''} · Enter o clic fuera: guardar · Esc/X: cancelar.
      </p>
    </div>, document.body,
  );
}
