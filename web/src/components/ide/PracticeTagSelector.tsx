import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X, ChevronDown, ChevronRight } from "lucide-react";
import { getTagPickerRows } from "../../plc/practiceTagPicker";
import { isMathKind, type PracticeTag, type EditableKind } from "../../plc/practiceDocument";

export type TagSelectorMode = "suggestions" | "dialog" | "edit";

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
  /** Return a validation error or null after an accepted inline edit. */
  onEdit: (tag: string) => string | null;
  onBrowse: () => void;
  onClose: () => void;
}

export function PracticeTagSelector({ tags, selector, onSelect, onClose, onEdit, onBrowse }: Props) {
  const [query, setQuery] = useState("");
  // Direct editing keeps the existing operand verbatim, not a selected search query.
  const [draft, setDraft] = useState(selector.currentTag);
  const [editError, setEditError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedTimers, setExpandedTimers] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keyboardNavigation = useRef(false);
  const rows = useMemo(() =>
    getTagPickerRows(tags, selector.kind as EditableKind, query, expandedTimers),
    [tags, selector.kind, query, expandedTimers]);
  const mathDestination = isMathKind(selector.kind as EditableKind);
  const suggestions = selector.mode === "suggestions";
  const editing = selector.mode === "edit";
  // Show every compatible tag in both selector modes. The quick popup stays
  // compact through a scrollable viewport rather than silently hiding rows.
  const shown = rows;
  const selectable = shown.filter((row) => row.selectable);
  const toggleExpanded = (name: string) => {
    setExpandedTimers((previous) => previous.includes(name)
      ? previous.filter((item) => item !== name) : [...previous, name]);
    setActiveIndex(0);
  };

  // Arrow navigation must also reach entries beyond the visible popup height.
  // Do not reposition the list on ordinary mouse hover.
  useEffect(() => {
    if (!keyboardNavigation.current) return;
    keyboardNavigation.current = false;
    scrollRef.current?.querySelector<HTMLElement>(
      '[data-tag-picker-active="true"]',
    )?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, shown]);

  useEffect(() => {
    inputRef.current?.focus();
    if (selector.mode === "edit") {
      const end = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(end, end);
    } else {
      inputRef.current?.select();
    }
    const currentRoot = selector.currentTag.split(".")[0];
    if (selector.currentTag.includes(".")) {
      setExpandedTimers((prev) => prev.includes(currentRoot) ? prev : [...prev, currentRoot]);
    }
  }, [selector.instructionId, selector.mode, selector.currentTag]);

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

  const commitEdit = () => {
    if (draft.trim() === selector.currentTag) { onClose(); return; }
    const message = onEdit(draft.trim());
    if (message) {
      setEditError(message);
      inputRef.current?.focus();
      return;
    }
    onClose();
  };

  // Direct edits behave like Studio: Enter confirms, Escape discards and
  // clicking away confirms only a valid declared BOOL / structured member.
  useEffect(() => {
    if (!editing) return;
    const commitOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      commitEdit();
    };
    document.addEventListener("pointerdown", commitOutside);
    return () => document.removeEventListener("pointerdown", commitOutside);
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      keyboardNavigation.current = true;
      setActiveIndex((current) =>
        selectable.length === 0 ? 0 :
        event.key === "ArrowDown" ? (current + 1) % selectable.length : (current - 1 + selectable.length) % selectable.length);
    }
    if (event.key === "Enter" && selectable.length) {
      event.preventDefault();
      onSelect(selectable[Math.min(activeIndex, selectable.length - 1)].name);
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
    <div ref={scrollRef}
      className={suggestions ? "max-h-[250px] overflow-y-auto" : "max-h-[340px] overflow-y-auto"}>
      {shown.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-slate-500">No se encontraron variables compatibles.</p>
      ) : (
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const selectableIndex = selectable.findIndex((item) => item.name === row.name);
              const isActive = selectableIndex === activeIndex && row.selectable;
              return (
                <tr key={row.name}>
                  <td colSpan={3} className="p-0">
                    <button type="button"
                      aria-label={(row.expandable ? (row.expanded ? "Contraer " : "Expandir ") : "Asignar tag ") + row.name}
                      aria-selected={isActive}
                      data-tag-picker-active={isActive ? "true" : undefined}
                      aria-expanded={row.expandable ? row.expanded : undefined}
                      disabled={!row.selectable && !row.expandable}
                      onMouseEnter={() => { if (selectableIndex >= 0) setActiveIndex(selectableIndex); }}
                      onClick={() => row.expandable ? toggleExpanded(row.name) : row.selectable && onSelect(row.name)}
                      className={
                        "grid w-full items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-left " +
                        (suggestions ? "grid-cols-[minmax(105px,1fr)_52px_minmax(90px,1.2fr)]" :
                          "grid-cols-[minmax(130px,1fr)_62px_minmax(170px,1.5fr)]") +
                        (isActive ? " bg-sky-50" : row.depth ? " bg-[#f7f9fb]" : " bg-white") +
                        (row.selectable || row.expandable ? " hover:bg-sky-50" : " cursor-default text-slate-400")
                      }
                    >
                      <span className={"flex min-w-0 items-center gap-1 font-mono " +
                        (row.selectable ? "font-medium text-slate-900" : "text-slate-600")}
                        style={{ paddingLeft: row.depth * 15 }}>
                        {row.expandable ? row.expanded
                          ? <ChevronDown size={13} className="shrink-0"/>
                          : <ChevronRight size={13} className="shrink-0"/>
                          : row.depth ? <span className="w-[13px] shrink-0"/> : null}
                        <span className="truncate">{row.depth ? row.name.split(".").at(-1) : row.name}</span>
                        {row.name === selector.currentTag && <Check size={12} className="shrink-0 text-emerald-700" />}
                      </span>
                      <span className="text-slate-600">{row.type}</span>
                      <span className="min-w-0 truncate text-slate-500" title={row.description}>
                        {row.description || "—"}{!row.selectable && !row.expandable ? " · Solo lectura" : ""}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  if (editing) {
    const width = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(selector.anchor.left - 25,
      window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(selector.anchor.bottom + 5,
      window.innerHeight - 110));
    return createPortal(
      <div ref={panelRef} role="dialog"
        aria-label={"Editar variable de " + selector.kind}
        style={{position: "fixed", left, top, width, zIndex: 1200}}
        className="rounded-md border border-sky-500 bg-white p-2 text-slate-900 shadow-xl"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") { event.preventDefault(); commitEdit(); }
          if (event.key === "Escape") { event.preventDefault(); onClose(); }
          if (event.key === "ArrowDown" && event.altKey) {
            event.preventDefault(); onBrowse();
          }
        }}>
        <div className="mb-1.5 text-[11px] font-semibold text-slate-700">
          {mathDestination ? "Editar Dest · INT / DINT / REAL" : "Editar operando · " + selector.kind}
        </div>
        <div className="flex gap-1.5">
          <input ref={inputRef} type="text" spellCheck={false}
            aria-label="Editar texto del tag existente"
            value={draft}
            onChange={(event) => {setDraft(event.target.value); setEditError("");}}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 font-mono text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300"
          />
          <button type="button" onClick={commitEdit}
            aria-label="Guardar operando editado"
            className="rounded border border-sky-600 bg-sky-700 px-2.5 text-xs font-semibold text-white hover:bg-sky-600">
            <Check size={15}/>
          </button>
          <button type="button" onClick={onBrowse}
            aria-label="Explorar variables disponibles"
            title="Seleccionar otra variable de la lista"
            className="rounded border border-slate-300 px-2.5 text-slate-700 hover:bg-slate-100">
            <Search size={15}/>
          </button>
        </div>
        {editError && <p role="alert" className="mt-1.5 text-[11px] text-red-700">{editError}</p>}
        <p className="mt-1.5 text-[10px] text-slate-500">
          Edita solo los caracteres necesarios · Enter guardar · Esc cancelar
        </p>
      </div>,document.body,
    );
  }

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
          <strong className="text-xs">{mathDestination ? "Dest matemático · INT / DINT / REAL" :
            "Asignar variable · " + selector.kind}</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar búsqueda" className="rounded p-1 hover:bg-slate-100">
            <X size={14} />
          </button>
        </div>
        {searchField}
        <div className="mt-2 rounded border border-slate-200">{tableRows}</div>
        <p className="pt-2 text-[10px] text-slate-500">
          {mathDestination
            ? "Dest puede ser INT, DINT o REAL aunque Source A/B tengan otro tipo."
            : selectable.length + " variable(s) compatible(s)"} · Desplázate para ver todas · ↑ ↓ seleccionar · Enter asignar · Esc cerrar
        </p>
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
            <p className="mt-1 text-xs text-slate-500">
              {mathDestination ? "Destino INT/DINT/REAL independiente de Source A y B" :
                "Tags compatibles de PracticeRoutine"} · Actual: {selector.currentTag || "Sin asignar"}
            </p>
          </div>
          <button type="button" aria-label="Cerrar selector de tags" onClick={onClose}
            className="rounded p-2 text-slate-500 hover:bg-slate-200"><X size={17}/></button>
        </header>
        <div className="min-h-0 p-4">
          {searchField}
          <div className="mt-3 overflow-hidden rounded border border-slate-200">{tableRows}</div>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-[11px] text-slate-500">{rows.filter((item) => item.selectable).length} coincidencia(s) · Doble clic en etiqueta para abrir esta ventana</span>
          <button type="button" onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">Cancelar</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
