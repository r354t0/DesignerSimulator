import { SceneTagTable } from "./SceneTagTable";
import { RecommendedSolutionPanel } from "./RecommendedSolutionPanel";
import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { TANK_IO_TAGS, TANK_SOLUTION_TAGS, TANK_BATCH_TARGET, TANK_TIMER_PRESETS } from "../../plc/tankSceneModel";

interface Props {
  open: boolean;
  project: PracticeProject;
  onClose: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
  onResetExample: () => void;
}
export function TankSceneInfoDialog({ open, project, onClose, onOpenTags, onLoadExample, onResetExample }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} aria-labelledby="tank-info-title" onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="w-[min(940px,94vw)] max-h-[85vh] overflow-y-auto rounded-xl border border-slate-600 bg-[#142331] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
      style={{ margin: "auto" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-600 bg-[#1b2d3d] px-4 py-3">
        <div>
          <h2 id="tank-info-title" className="flex items-center gap-2 text-sm font-semibold">
            <Info size={18} className="text-sky-400" aria-hidden="true"/>
            Sistema de llenado de tanques · Información
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">Objetivo de programación y mapa E/S</p>
        </div>
        <button type="button" aria-label="Cerrar información del tanque" onClick={onClose}
          className="rounded border border-slate-600 p-1.5 hover:bg-slate-700">
          <X size={18}/>
        </button>
      </div>

      <div className="space-y-5 p-4">
        <section className="rounded-lg border border-sky-800/80 bg-[#173249] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-sky-200">
            <BookOpen size={15} aria-hidden="true"/> Objetivo del ejercicio
          </h3>
          <p className="text-xs leading-relaxed text-slate-200">
            Programa tres lotes automáticos con ramas OR, temporizadores TON y
            contador CTU. START enclava el ciclo (START OR RunCmd). Primero se
            abre XV-01; tras {TANK_TIMER_PRESETS.TMR_StartDelay / 1000} s arranca
            P-01. Al alcanzar el 90 % se cierra la entrada y M-02 mezcla durante
            {TANK_TIMER_PRESETS.TMR_Mixing / 1000} s. Después XV-02 drena hasta
            el nivel bajo de 15 %, se incrementa CNT_Lotes y comienza el
            siguiente lote. Tras {TANK_BATCH_TARGET} lotes se detiene el ciclo.
            Los watchdogs TON de llenado ({TANK_TIMER_PRESETS.TMR_FillTimeout / 1000} s)
            y vaciado ({TANK_TIMER_PRESETS.TMR_DrainTimeout / 1000} s) disparan
            una alarma enclavada. STOP detiene el proceso; RESET elimina la
            alarma y pone a cero el contador solo con el ciclo detenido.
            DRENAR permite vaciado manual únicamente fuera del automático,
            sin nivel bajo ni alarmas.
          </p>
        </section>

        <section aria-labelledby="tank-map-title">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="tank-map-title" className="text-xs font-semibold">
              Mapa E/S · Señales del tanque
            </h3>
            <button type="button" onClick={() => { onClose(); onOpenTags(); }}
              className="rounded border border-sky-600 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-950">
              Abrir Controller Tags
            </button>
          </div>
          <SceneTagTable specs={TANK_IO_TAGS} project={project}/>
          <p className="mt-2 text-[11px] text-slate-400">
            Entradas de sensores y pulsadores y salidas de actuadores.
            Los temporizadores, contadores y estados internos pertenecen a la solución.
          </p>
        </section>

        <RecommendedSolutionPanel
          project={project} specs={TANK_SOLUTION_TAGS}
          onImplement={() => { onClose(); onLoadExample(); }}
          onReset={() => { onClose(); onResetExample(); }}>
          <div className="space-y-1 font-mono text-[11px] text-slate-300">
  <p>Enclavamiento de ST_RunEnable mediante OR; temporizadores TON y contador CNT_Lotes.</p>
  <p>Llenado → mezclado → vaciado. Cada transición registra OTE, ejecuta OTU de la etapa anterior y OTL de la siguiente.</p>
  <p>TMR_FillTimeout y TMR_DrainTimeout generan ALM_ProcessTimeout.</p>
  <p>Al terminar el drenaje, ST_ToFill permite activar ST_Filling desde el rung 1 durante el scan siguiente.</p>
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
