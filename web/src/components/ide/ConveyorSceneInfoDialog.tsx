import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import {
  CONVEYOR_TAGS, CONVEYOR_TEMPLATE_TAGS, readConveyorBool, readConveyorCount,
} from "../../plc/conveyorSceneModel";

interface Props {
  open: boolean;
  project: PracticeProject;
  onClose: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
}

/** Native modal dialog stays outside the scene's document flow and scroll area. */
export function ConveyorSceneInfoDialog({
  open, project, onClose, onOpenTags, onLoadExample,
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
          <div className="overflow-x-auto rounded-md border border-slate-700">
            <table className="w-full min-w-[570px] table-auto text-left text-[11px]">
              <thead className="bg-[#203449] text-slate-300">
                <tr>
                  <th scope="col" className="px-2.5 py-2 font-semibold">Tag</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">Tipo</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">Función</th>
                  <th scope="col" className="px-2.5 py-2 font-semibold">Descripción</th>
                  <th scope="col" className="px-2.5 py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {[...CONVEYOR_TAGS, ...CONVEYOR_TEMPLATE_TAGS.filter(spec =>
                  project.tags.some(tag => tag.name === spec.name))].map((spec) => {
                  const linked = project.tags.find((tag) => tag.name === spec.name);
                  const valid = linked?.type === spec.type;
                  const value = valid
                    ? spec.type === "COUNTER" ? readConveyorCount(project)
                      : readConveyorBool(project, spec.name) ? 1 : 0
                    : null;
                  return (
                    <tr key={spec.name} className="hover:bg-slate-700/20">
                      <th scope="row" className="px-2.5 py-2 font-mono font-semibold text-sky-200">
                        {spec.name}
                      </th>
                      <td className="px-2.5 py-2 font-mono text-slate-300">{spec.type}</td>
                      <td className="px-2.5 py-2 text-slate-300">{spec.direction}</td>
                      <td className="px-2.5 py-2 text-slate-300">
                        {valid && linked ? linked.description || spec.description : spec.description}
                      </td>
                      <td className={"px-2.5 py-2 text-right font-mono " +
                        (valid ? "text-emerald-300" : "text-amber-300")}>
                        {valid ? value : "Revisar"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Entradas: botones y sensor de presencia · Salida: orden de marcha del motor ·
            Interna: contador CTU; se muestra el valor ACC.
          </p>
        </section>

        <section className="rounded-md border border-slate-700 bg-[#1a2b3b] p-3 text-xs">
          <details className="group">
            <summary className="cursor-pointer font-semibold text-sky-300">
              Ver orientación para desarrollar el Ladder (opcional)
            </summary>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
              <p>Rung 0: OR (PB_Start | DO_Motor) + XIO ST_StopRequest → OTE DO_Motor</p>
              <p>Rung 1: OR (PB_Stop | CNT_Boxes.DN + XIO DI_BoxSensor) → OTE ST_StopRequest</p>
              <p>Rung 2: DI_BoxSensor → CTU CNT_Boxes (PRE=5)</p>
              <p>Rung 3: XIO DI_BoxSensor + PB_Reset → RES CNT_Boxes</p>
              <p className="pt-2 font-sans text-slate-400">
                PE-01 está en la boca de descarga. Tras cinco detecciones,
                la faja se detiene cuando la última caja sale por completo
                y deja libre el sensor.
                RESET LOTE solo opera con el sensor libre; después pulsa START
                para comenzar otro lote. STOP detiene sin perder el conteo.
              </p>
            </div>
          </details>
          <button type="button" onClick={() => { onClose(); onLoadExample(); }}
            className="mt-3 rounded border border-sky-600 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-950">
            Cargar plantilla Ladder (reemplaza MainRoutine)
          </button>
          <p className="mt-2 text-[11px] text-slate-400">
            La plantilla avanzada requiere confirmación y añade PB_Reset y
            ST_StopRequest. Registrar los cinco tags básicos no agrega rungs ni activa salidas.
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
