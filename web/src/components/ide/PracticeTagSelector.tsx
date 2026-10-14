import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { filterPracticeTags } from "../../plc/practiceTagSearch";
import type { PracticeTag } from "../../plc/practiceDocument";

export type TagSelectorMode = "suggestions" | "dialog";

export interface TagSelectorState {
  instructionId: string;
  kind: string;
  currentTag: string;
  mode: TagSelectorMode;
  anchor: { left: number; top: number; bottom: number };
}

interface Props {
  tags: readonly PracticeTag[];
  selector: TagSelectorState;
  onSelect: (tag: string) => void;
  onClose: () => void;
}

export function PracticeTagSelector({ tags, selector, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => filterPracticeTags(tags, query), [tags, query]);
  const suggestions = selector.mode === "suggestions";
  const shown = suggestions ? results.slice(0, 8) : results;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [selector.instructionId, selector.mode]);

  // The quick list closes on outside clicks; leave source tag buttons outside
  // this test so a second click can still complete the double-click gesture.
  useEffect(() => {
    if (!suggestions) return;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-practice-tag-label]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [onClose, suggestions]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        shown.length === 0 ? 0 :
        event.key === "ArrowDown" ? (current + 1) % shown.length : (current - 1 + shown.length) % shown.length);
    }
    if (event.key === "Enter" && shown.length) {
      event.preventDefault();
      onSelect(shown[Math.min(activeIndex, shown.length - 1)].name);
    }
  };

  const searchField = (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        aria-label="Buscar tag existente"
        type="search"
        placeholder="Buscar por nombre o descripción…"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
        className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
    </div>
  );

  const tableRows = (
    <div className={suggestions ? "max-h-[250px] overflow-y-auto" : "max-h-[340px] overflow-y-auto"}>
      {shown.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-slate-500">No se encontraron tags BOOL.</p>
      ) : (
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              {!suggestions && <th className="px-3 py-2 font-semibold">Tipo</th>}
              <th className="px-3 py-2 font-semibold">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((tag, index) => (
              <tr key={tag.name}>
                <td colSpan={suggestions ? 2 : 3} className="p-0">
                  <button
                    type="button"
                    aria-label={"Asignar tag " + tag.name}
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelect(tag.name)}
                    className={
                      "grid w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left hover:bg-sky-50 " +
                      (suggestions ? "grid-cols-[minmax(105px,0.8fr)_minmax(100px,1.2fr)]" :
                        "grid-cols-[minmax(130px,1fr)_62px_minmax(170px,1.5fr)]") +
                      (index === activeIndex ? " bg-sky-50" : " bg-white")
                    }
                  >
                    <span className="flex min-w-0 items-center gap-1 font-mono font-medium text-slate-900">
                      <span className="truncate">{tag.name}</span>
                      {tag.name === selector.currentTag && <Check size={12} className="shrink-0 text-emerald-700" />}
                    </span>
                    {!suggestions && <span className="text-slate-500">BOOL</span>}
                    <span className="min-w-0 truncate text-slate-500" title={tag.description}>{tag.description || "—"}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  if (suggestions) {
    const width = 340;
    const left = Math.min(Math.max(8, selector.anchor.left - 80), Math.max(8, window.innerWidth - width - 8));
    const top = selector.anchor.bottom + 10 + 305 > window.innerHeight
      ? Math.max(8, selector.anchor.top - 305)
      : selector.anchor.bottom + 10;
    return createPortal(
      <div ref={panelRef} role="dialog" aria-label={"Buscar variable para " + selector.kind}
        onKeyDown={handleKeyDown}
        style={{ position: "fixed", left, top, width, zIndex: 1100 }}
        className="rounded-md border border-slate-300 bg-white p-2 text-slate-900 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <strong className="text-xs">Asignar variable · {selector.kind}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar búsqueda" className="rounded p-1 hover:bg-slate-100">
            <X size={14} />
          </button>
        </div>
        {searchField}
        <div className="mt-2 rounded border border-slate-200">{tableRows}</div>
        <p className="pt-2 text-[10px] text-slate-500">Escribe para filtrar · ↑ ↓ seleccionar · Enter asignar · Esc cerrar</p>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true"
        aria-label={"Seleccionar variable para " + selector.kind}
        onKeyDown={handleKeyDown}
        className="flex max-h-[85vh] w-full max-w-[700px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-[#f4f6f8] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Seleccionar variable · {selector.kind}</h3>
            <p className="mt-1 text-xs text-slate-500">Tags de PracticeRoutine · Tipo BOOL · Actual: {selector.currentTag || "Sin asignar"}</p>
          </div>
          <button type="button" aria-label="Cerrar selector de tags" onClick={onClose}
            className="rounded p-2 text-slate-500 hover:bg-slate-200"><X size={17}/></button>
        </header>
        <div className="min-h-0 p-4">
          {searchField}
          <div className="mt-3 overflow-hidden rounded border border-slate-200">{tableRows}</div>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-[11px] text-slate-500">{results.length} coincidencia(s) · Doble clic en etiqueta para abrir esta ventana</span>
          <button type="button" onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">Cancelar</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
