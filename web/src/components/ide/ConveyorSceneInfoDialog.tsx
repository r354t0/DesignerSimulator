import { SceneTagTable } from "./SceneTagTable";
import { RecommendedSolutionPanel } from "./RecommendedSolutionPanel";
import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import {
  CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS,
} from "../../plc/conveyorSceneModel";

interface Props {
  open: boolean;
  project: PracticeProject;
  onClose: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
  onResetExample: () => void;
}

/** Native modal dialog stays outside the scene's document flow and scroll area. */
export function ConveyorSceneInfoDialog({
  open, project, onClose, onOpenTags, onLoadExample, onResetExample,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} aria-labelledby="conveyor-scene-info-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="w-[min(900px,94vw)] max-h-[85vh] overflow-y-auto rounded-xl border border-slate-600 bg-[#142331] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
      style={{ margin: "auto" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-600 bg-[#1b2d3d] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Info size={19} className="shrink-0 text-sky-400" aria-hidden="true"/>
          <div>
            <h2 id="conveyor-scene-info-title" className="text-sm font-semibold">
              Información de la escena · Faja transportadora
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Objetivo de programación y señales disponibles
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar información de la escena"
          title="Cerrar (Esc)"
          className="flex size-8 shrink-0 items-center justify-center rounded border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">
          <X size={18}/>
        </button>
      </div>

      <div className="space-y-5 p-4">
        <section aria-labelledby="conveyor-scene-goal-title"
          className="rounded-lg border border-sky-800/80 bg-[#173249] p-3">
          <h3 id="conveyor-scene-goal-title" className="mb-2 flex items-center gap-2 text-xs font-semibold text-sky-200">
            <BookOpen size={15} aria-hidden="true"/> Objetivo del ejercicio
          </h3>
          <p className="text-xs leading-relaxed text-slate-200">
            Programa en MainRoutine el arranque y enclavamiento de marcha con ramas OR
            (START o DO_Motor), protegido por una solicitud de parada.
            Cuenta las cajas mediante CTU al cruzar PE-01, situado en la
            descarga. Al completar un lote de cinco cajas, detén la faja
            únicamente después de que la quinta salga por completo.
            STOP debe detener la marcha sin borrar el conteo y RESET LOTE
            debe reiniciar el contador solo con el sensor libre.
            Verifica la lógica con Build, RUN y los pilotos de la escena.
          </p>
        </section>

        <section aria-labelledby="conveyor-scene-tags-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="conveyor-scene-tags-title" className="text-xs font-semibold text-slate-100">
                Mapa E/S · Tags vinculados a la simulación
              </h3>
              <p className="mt-1 text-[11px] text-slate-400">
                Los tags se registran automáticamente. Usa estos nombres exactos en el Ladder.
              </p>
            </div>
            <button type="button" onClick={() => { onClose(); onOpenTags(); }}
              className="rounded border border-sky-600 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-950">
              Abrir Controller Tags
            </button>
          </div>
          <SceneTagTable specs={CONVEYOR_TAGS} project={project}/>
          <p className="mt-2 text-[11px] text-slate-400">
            Solo se registran entradas y salidas vinculadas al SCADA.
            El contador y la lógica interna se muestran en la solución recomendada.
          </p>
        </section>

        <RecommendedSolutionPanel
          project={project} specs={CONVEYOR_TEMPLATE_TAGS}
          onImplement={() => { onClose(); onLoadExample(); }}
          onReset={() => { onClose(); onResetExample(); }}>
          <div className="space-y-1 font-mono text-[11px] text-slate-300">
  <p>R0: OR (PB_Start | DO_Motor), XIO ST_StopRequest → OTE DO_Motor</p>
  <p>R1: OR (PB_Stop | CNT_Boxes.DN + XIO DI_BoxSensor) → OTE ST_StopRequest</p>
  <p>R2: DI_BoxSensor → CTU CNT_Boxes (PRE=5)</p>
  <p>R3: XIO DI_BoxSensor + PB_Reset → RES CNT_Boxes</p>
</div>
        </RecommendedSolutionPanel>
      </div>

      <div className="sticky bottom-0 flex justify-end border-t border-slate-600 bg-[#1b2d3d] px-4 py-2.5">
        <button type="button" onClick={onClose}
          className="rounded bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">
          Cerrar
        </button>
      </div>
    </dialog>
  );
}
