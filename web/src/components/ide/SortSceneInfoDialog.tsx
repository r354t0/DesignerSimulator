import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import {
  SORT_TAGS, SORT_TEMPLATE_TAGS, SORT_BATCH_SIZE, readSortBool, readSortCount,
} from "../../plc/sortSceneModel";

interface Props {
  open: boolean;
  project: PracticeProject;
  onClose: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
}
export function SortSceneInfoDialog({ open, project, onClose, onOpenTags, onLoadExample }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby="sort-info-title" onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="w-[min(900px,94vw)] max-h-[85vh] overflow-y-auto rounded-xl border border-slate-600 bg-[#142331] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
      style={{ margin: "auto" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-600 bg-[#1b2d3d] px-4 py-3">
        <div>
          <h2 id="sort-info-title" className="flex items-center gap-2 text-sm font-semibold">
            <Info size={18} className="text-sky-400"/> Clasificación de cajas · Información
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">Objetivo de programación y mapa E/S</p>
        </div>
        <button type="button" aria-label="Cerrar información del clasificador" onClick={onClose}
          className="rounded border border-slate-600 p-1.5 hover:bg-slate-700">
          <X size={18}/>
        </button>
      </div>
      <div className="space-y-5 p-4">
        <section className="rounded-lg border border-sky-800/80 bg-[#173249] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-sky-200">
            <BookOpen size={15}/> Objetivo del ejercicio
          </h3>
          <p className="text-xs leading-relaxed">
            Programa una línea de clasificación por lotes de {SORT_BATCH_SIZE} cajas.
            Utiliza ramas OR para el enclavamiento START/MOTOR, la parada por
            STOP o lote completo y el conteo combinado de ambas salidas.
            Clasifica las cajas A/B con el sensor óptico y el desviador;
            registra por separado las salidas A y B, el total del lote y los
            lotes terminados mediante CTU. Al completar seis cajas, mantén
            la marcha hasta vaciar ambas líneas y detén el motor.
            RESET LOTE debe borrar los tres contadores del lote, pero conservar
            el historial de lotes completados. Comprueba Build, RUN y los
            pilotos del SCADA.
          </p>
        </section>
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Mapa E/S · Señales del clasificador</h3>
            <button type="button" onClick={() => { onClose(); onOpenTags(); }}
              className="rounded border border-sky-600 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-950">
              Abrir Controller Tags
            </button>
          </div>
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="w-full min-w-[620px] text-left text-[11px]">
              <thead className="bg-[#203449] text-slate-300">
                <tr>
                  {["Tag", "Tipo", "Función", "Descripción", "Valor"].map((item) =>
                    <th key={item} scope="col" className="px-2.5 py-2 font-semibold">{item}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {[...SORT_TAGS, ...SORT_TEMPLATE_TAGS.filter(spec =>
                  project.tags.some(tag => tag.name === spec.name))].map((spec) => {
                  const actual = project.tags.find((item) => item.name === spec.name);
                  const valid = actual?.type === spec.type;
                  const value = !valid ? "Revisar" :
                    spec.type === "COUNTER" ? readSortCount(project, spec.name) :
                    readSortBool(project, spec.name) ? 1 : 0;
                  return (
                    <tr key={spec.name} className="hover:bg-slate-700/20">
                      <th scope="row" className="px-2.5 py-2 font-mono font-semibold text-sky-200">{spec.name}</th>
                      <td className="px-2.5 py-2 font-mono">{spec.type}</td>
                      <td className="px-2.5 py-2">{spec.direction}</td>
                      <td className="px-2.5 py-2">{actual?.description || spec.description}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-emerald-300">{value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded border border-slate-700 bg-[#1a2b3b] p-3">
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-sky-300">
              Orientación Ladder (opcional)
            </summary>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
              <p>R0: OR (PB_Start | DO_Motor) + XIO ST_StopRequest → OTE DO_Motor</p>
              <p>R1: OR (PB_Stop | CNT_BatchBoxes.DN + DI_LineClear) → OTE ST_StopRequest</p>
              <p>R2: DO_Motor + DI_TypeB → OTE DO_Diverter</p>
              <p>R3: DI_ExitA → CTU CNT_ExitA</p>
              <p>R4: DI_ExitB → CTU CNT_ExitB</p>
              <p>R5: OR (DI_ExitA | DI_ExitB) → CTU CNT_BatchBoxes (PRE=6)</p>
              <p>R6: CNT_BatchBoxes.DN + DI_LineClear → CTU CNT_Batches</p>
              <p>R7–R9: DI_LineClear + PB_Reset → RES CountA / CountB / CountTotal</p>
              <p className="pt-2 font-sans text-slate-400">
                La parada automática espera la descarga de todas las cajas.
                RESET LOTE funciona solo con ambas líneas vacías y no borra CNT_Batches.
              </p>
            </div>
          </details>
          <button type="button" onClick={() => { onClose(); onLoadExample(); }}
            className="mt-3 rounded border border-sky-600 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-950">
            Cargar plantilla Ladder (reemplaza MainRoutine de esta escena)
          </button>
          <p className="mt-2 text-[11px] text-slate-400">
            La plantilla avanzada requiere confirmación y añade cinco tags:
            RESET, líneas vacías, solicitud de parada y dos contadores.
            No modifica los programas de las otras escenas.
          </p>
        </section>
      </div>
      <div className="sticky bottom-0 flex justify-end border-t border-slate-600 bg-[#1b2d3d] px-4 py-2.5">
        <button type="button" onClick={onClose}
          className="rounded bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">Cerrar</button>
      </div>
    </dialog>
  );
}
