import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { TANK_TAGS, readTankBool, readTankLevel } from "../../plc/tankSceneModel";

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
            Programa en MainRoutine un llenado automático: START solicita el
            funcionamiento de la bomba y la apertura de la válvula de entrada;
            STOP detiene ambos equipos. Al alcanzar el 90 % de nivel alto,
            debe detenerse el llenado y permanecer detenido hasta una nueva
            orden válida. El pulsador DRENAR abre momentáneamente la válvula
            de salida. Observa los sensores de nivel bajo (15 %) y alto (90 %),
            y el transmisor de nivel REAL para practicar comparaciones.
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
            Nivel en porcentaje de capacidad. Los sensores y el transmisor son
            entradas físicas simuladas; la bomba y las válvulas solo obedecen
            a las salidas calculadas por MainRoutine.
          </p>
        </section>

        <section className="rounded border border-slate-700 bg-[#1a2b3b] p-3">
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-sky-300">
              Orientación Ladder (opcional)
            </summary>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
              <p>StartPB AND NOT HighLS → OTL RunCmd</p>
              <p>StopPB → OTU RunCmd</p>
              <p>HighLS → OTU RunCmd</p>
              <p>RunCmd → OTE Pump; RunCmd → OTE InletValve</p>
              <p>DrainPB → OTE DrainValve</p>
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
