import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { TANK_TAGS, TANK_BATCH_TARGET, TANK_TIMER_PRESETS, readTankBool, readTankLevel } from "../../plc/tankSceneModel";

interface Props {
  open: boolean;
  project: PracticeProject;
  onClose: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
}
export function TankSceneInfoDialog({ open, project, onClose, onOpenTags, onLoadExample }: Props) {
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
            abre XV-01; tras {TANK_TIMER_PRESETS.Tank_TStart / 1000} s arranca
            P-01. Al alcanzar el 90 % se cierra la entrada y M-02 mezcla durante
            {TANK_TIMER_PRESETS.Tank_TMix / 1000} s. Después XV-02 drena hasta
            el nivel bajo de 15 %, se incrementa Tank_Batches y comienza el
            siguiente lote. Tras {TANK_BATCH_TARGET} lotes se detiene el ciclo.
            Los watchdogs TON de llenado ({TANK_TIMER_PRESETS.Tank_TFillMax / 1000} s)
            y vaciado ({TANK_TIMER_PRESETS.Tank_TDrainMax / 1000} s) disparan
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
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="w-full min-w-[620px] text-left text-[11px]">
              <thead className="bg-[#203449] text-slate-300">
                <tr>
                  {["Tag", "Tipo", "Función", "Descripción", "Valor"].map((name) =>
                    <th key={name} scope="col" className="px-2.5 py-2 font-semibold">{name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {TANK_TAGS.map((spec) => {
                  const tag = project.tags.find(item => item.name === spec.name);
                  const valid = tag?.type === spec.type;
                  const value = !valid ? "Revisar" : spec.type === "REAL"
                    ? (readTankLevel(project)?.toFixed(1) ?? "—") + " %"
                    : (spec.type === "TIMER" || spec.type === "COUNTER") &&
                        tag && typeof tag.value === "object"
                      ? String(tag.value.ACC ?? 0) + " / " + String(tag.value.PRE ?? 0)
                      : readTankBool(project, spec.name) ? "1" : "0";
                  return (
                    <tr key={spec.name} className="hover:bg-slate-700/20">
                      <th scope="row" className="px-2.5 py-2 font-mono font-semibold text-sky-200">
                        {spec.name}
                      </th>
                      <td className="px-2.5 py-2 font-mono">{spec.type}</td>
                      <td className="px-2.5 py-2">{spec.direction}</td>
                      <td className="px-2.5 py-2">{tag?.description || spec.description}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-emerald-300">{value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Los temporizadores muestran ACC / PRE en milisegundos y el contador
            muestra lotes ACC / PRE. Sensores y nivel son entradas simuladas;
            bomba, agitador y válvulas siguen las salidas calculadas por MainRoutine.
          </p>
        </section>

        <section className="rounded border border-slate-700 bg-[#1a2b3b] p-3">
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-sky-300">
              Orientación Ladder (opcional)
            </summary>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
              <p>R0: OR (Tank_StartPB | Tank_RunCmd), XIO StopPB/Alarm/Batches.DN → OTE RunCmd</p>
              <p>R1: RunCmd sin etapas activas → OTL FillStage</p>
              <p>R2–R4: FillStage → TON TStart, TON TFillMax; DrainStage → TON TDrainMax</p>
              <p>R5: OR (TFillMax.DN | TDrainMax.DN) → OTL Alarm</p>
              <p>R6–R7: ResetPB y XIO RunCmd → OTU Alarm; RES Batches</p>
              <p>R8–R9: FillStage → OTE InletValve; TStart.DN → OTE Pump</p>
              <p>R10–R13: HighLS → MixStage; TON TMix → Mixer</p>
              <p>R14–R16: TMix.DN → DrainStage; OR (DrainStage | DrainPB) → DrainValve</p>
              <p>R17–R18: DrainStage y LowLS → CTU Batches; finalizar DrainStage</p>
              <p className="pt-2 font-sans text-slate-400">
                STOP y alarmas cierran los actuadores. No se puede drenar
                manualmente durante el ciclo. Los rungs OR de fin de etapa
                desactivan las memorias cuando corresponde.
              </p>
            </div>
          </details>
          <button type="button" onClick={() => { onClose(); onLoadExample(); }}
            className="mt-3 rounded border border-sky-600 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-950">
            Cargar plantilla Ladder (reemplaza MainRoutine de esta escena)
          </button>
          <p className="mt-2 text-[11px] text-slate-400">
            La plantilla requiere confirmación. Cargar una escena nunca
            sustituye automáticamente tu programa.
          </p>
        </section>
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
