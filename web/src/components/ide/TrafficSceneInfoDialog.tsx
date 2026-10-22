import { SceneTagTable } from "./SceneTagTable";
import { RecommendedSolutionPanel } from "./RecommendedSolutionPanel";
import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { TRAFFIC_IO_TAGS, TRAFFIC_SOLUTION_TAGS } from "../../plc/trafficSceneModel";

interface Props {
  open:boolean;
  project:PracticeProject;
  onClose:()=>void;
  onOpenTags:()=>void;
  onLoadExample:()=>void;
  onResetExample:()=>void;
}
export function TrafficSceneInfoDialog({open,project,onClose,onOpenTags,onLoadExample,onResetExample}:Props) {
  const dialogRef=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const d=dialogRef.current;
    if(!d)return;
    if(open&&!d.open)d.showModal();
    if(!open&&d.open)d.close();
  },[open]);
  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="traffic-info-title"
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      className="w-[min(980px,95vw)] max-h-[85vh] overflow-y-auto rounded-xl border border-slate-600 bg-[#142331] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
      style={{margin:"auto"}}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-600 bg-[#1b2d3d] px-4 py-3">
        <div>
          <h2 id="traffic-info-title" className="flex items-center gap-2 text-sm font-semibold">
            <Info size={17} className="text-sky-400"/> Intersección semaforizada · Información
          </h2>
          <span className="text-[11px] text-slate-400">Objetivo, secuencia y mapa de señales</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar información"
          className="rounded border border-slate-600 p-1.5 hover:bg-slate-700"><X size={18}/></button>
      </header>
      <div className="space-y-4 p-4 text-xs">
        <section className="rounded-lg border border-sky-800 bg-[#173249] p-3">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-sky-200">
            <BookOpen size={15}/> Objetivo del ejercicio
          </h3>
          <p className="leading-relaxed text-slate-200">
            Programa dos avenidas con verdes alternados, amarillos, intervalos de rojo
            en ambas direcciones y cruce peatonal a demanda. Cada cambio de fase
            utiliza OTE de transición, OTU de la fase anterior y OTL de la siguiente.
            En ningún momento pueden estar activas simultáneamente las luces verdes
            de ambos sentidos ni una luz verde vehicular durante el paso peatonal.
            Usa ramas OR, temporizadores TON y contadores CTU activados por los
            sensores de salida de los vehículos. El SCADA no decide las fases:
            únicamente transmite entradas y obedece las salidas de MainRoutine.
          </p>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold">Mapa E/S · Semáforos</h3>
            <button type="button" onClick={()=>{onClose();onOpenTags();}}
              className="rounded border border-sky-600 px-2.5 py-1.5 text-sky-300 hover:bg-sky-950">
              Abrir Controller Tags
            </button>
          </div>
          <SceneTagTable specs={TRAFFIC_IO_TAGS} project={project}/>
        </section>
        <RecommendedSolutionPanel
          project={project} specs={TRAFFIC_SOLUTION_TAGS}
          onImplement={() => { onClose(); onLoadExample(); }}
          onReset={() => { onClose(); onResetExample(); }}>
          <div className="space-y-2 text-[11px] text-slate-300">
  <p>Secuencia N-S verde/amarillo → ambos rojos → E-O verde/amarillo → ambos rojos.</p>
  <p>Solicitud peatonal retenida con ST_PedPending y habilitada solo en rojo de seguridad.</p>
  <p>Los timers TMR_ controlan las fases, CNT_ registra vehículos y ALM_PhaseConflict bloquea fases incompatibles.</p>
  <p>Comprueba STOP, PAUSE, exclusión de verdes y tiempo de seguridad.</p>
</div>
        </RecommendedSolutionPanel>
      </div>
      <footer className="sticky bottom-0 flex justify-end border-t border-slate-600 bg-[#1b2d3d] px-4 py-2.5">
        <button type="button" onClick={onClose}
          className="rounded bg-sky-700 px-4 py-1.5 text-xs font-semibold hover:bg-sky-600">Cerrar</button>
      </footer>
    </dialog>
  );
}
