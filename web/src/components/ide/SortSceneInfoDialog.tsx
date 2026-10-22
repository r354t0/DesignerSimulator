import { SceneTagTable } from "./SceneTagTable";
import { RecommendedSolutionPanel } from "./RecommendedSolutionPanel";
import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import {
  SORT_TAGS, SORT_TEMPLATE_TAGS, SORT_BATCH_SIZE,
} from "../../plc/sortSceneModel";

interface Props {
  open: boolean;
  project: PracticeProject;
  onClose: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
  onResetExample: () => void;
}
export function SortSceneInfoDialog({ open, project, onClose, onOpenTags, onLoadExample, onResetExample }: Props) {
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
          <SceneTagTable specs={SORT_TAGS} project={project}/>
        </section>
        <RecommendedSolutionPanel
          project={project} specs={SORT_TEMPLATE_TAGS}
          onImplement={() => { onClose(); onLoadExample(); }}
          onReset={() => { onClose(); onResetExample(); }}>
          <div className="space-y-1 font-mono text-[11px] text-slate-300">
  <p>R0: (PB_Start OR DO_Motor), XIO ST_StopRequest → OTE DO_Motor</p>
  <p>R1: (PB_Stop OR CNT_BatchBoxes.DN + DI_LineClear) → ST_StopRequest</p>
  <p>R2: DO_Motor + DI_TypeB → DO_Diverter</p>
  <p>R3–R6: CTU CNT_ExitA, CNT_ExitB, CNT_BatchBoxes, CNT_Lotes</p>
  <p>R7–R9: DI_LineClear + PB_Reset → RES contadores del lote</p>
</div>
        </RecommendedSolutionPanel>
      </div>
      <div className="sticky bottom-0 flex justify-end border-t border-slate-600 bg-[#1b2d3d] px-4 py-2.5">
        <button type="button" onClick={onClose}
          className="rounded bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">Cerrar</button>
      </div>
    </dialog>
  );
}
