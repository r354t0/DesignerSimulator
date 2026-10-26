import { useEffect, useMemo } from "react";
import { GitBranch, X, ArrowUpRight } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { findTagReferences, type TagReference } from "../../plc/practiceCrossReference";

interface Props {
  tag: string;
  project: PracticeProject;
  onClose: () => void;
  onNavigate: (reference: TagReference) => void;
}

/** Studio-inspired, read-only xref driven by the actual MainRoutine, not by
 * stale compiler output. Works for unbuilt and currently running programs. */
export function CrossReferencePanel({ tag, project, onClose, onNavigate }: Props) {
  const references = useMemo(() => findTagReferences(project, tag), [project, tag]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[14000] flex items-center justify-center bg-slate-950/65 p-4"
      onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={"Cross Reference de " + tag}
        className="flex max-h-[min(75vh,600px)] w-[min(750px,96vw)] flex-col overflow-hidden rounded-lg border border-slate-400 bg-[#f1f3f5] text-slate-900 shadow-2xl">
        <header className="flex items-center gap-2 border-b border-slate-300 bg-white px-4 py-3">
          <GitBranch size={18} className="text-blue-700"/>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Cross Reference</h2>
            <p className="truncate font-mono text-xs text-blue-800">{tag}</p>
          </div>
          <button type="button" aria-label="Cerrar Cross Reference" onClick={onClose}
            className="rounded p-1 hover:bg-slate-200"><X size={18}/></button>
        </header>
        <p className="border-b border-slate-200 px-4 py-2 text-[11px] text-slate-600">
          {references.length} referencia(s) en MainRoutine. Selecciona una para ir a su rung.
          {tag.includes(".") ? " Búsqueda del miembro exacto." :
            " Incluye sus miembros estructurados (por ejemplo, .DN y .TT)."}
        </p>
        <div className="min-h-0 overflow-y-auto">
          {references.length === 0 ? (
            <p className="p-5 text-sm text-slate-600">La variable no se utiliza todavía en ningún rung.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-200">
                <tr>
                  {["Rung","Instrucción","Operando","Uso","Ubicación"].map(label =>
                    <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {references.map((ref, i) => (
                  <tr key={ref.instructionId+"-"+ref.usage+"-"+i} className="hover:bg-sky-50">
                    <td colSpan={5} className="p-0">
                      <button type="button" onClick={() => onNavigate(ref)}
                        aria-label={"Ir al rung "+ref.rungIndex+" instrucción "+ref.instructionKind}
                        className="grid w-full grid-cols-[70px_100px_minmax(130px,1fr)_110px_100px] items-center gap-0 text-left hover:text-blue-800">
                        <span className="flex items-center gap-1 px-3 py-2 font-semibold">
                          {ref.rungIndex}<ArrowUpRight size={12}/>
                        </span>
                        <span className="px-3 py-2 font-mono">{ref.instructionKind}</span>
                        <span className="truncate px-3 py-2 font-mono" title={ref.operand}>{ref.operand}</span>
                        <span className="px-3 py-2">{ref.usage}</span>
                        <span className="px-3 py-2">{ref.lane === "parallel" ? "Rama OR" : "Principal"}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="flex justify-end border-t border-slate-300 bg-white p-2.5">
          <button type="button" onClick={onClose}
            className="rounded border border-slate-400 px-4 py-1.5 text-xs hover:bg-slate-100">Cerrar</button>
        </footer>
      </section>
    </div>
  );
}
