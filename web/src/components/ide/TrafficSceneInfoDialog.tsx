import { useEffect, useRef } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { TRAFFIC_TAGS, TRAFFIC_TIMERS, readTrafficBool, readTrafficCount } from "../../plc/trafficSceneModel";

interface Props {
  open:boolean;
  project:PracticeProject;
  onClose:()=>void;
  onOpenTags:()=>void;
  onLoadExample:()=>void;
}
export function TrafficSceneInfoDialog({open,project,onClose,onOpenTags,onLoadExample}:Props) {
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
        <section className="rounded border border-slate-700 bg-[#182b3a] p-3">
          <h3 className="mb-2 font-semibold text-slate-100">Secuencia de referencia</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Verde N-S",TRAFFIC_TIMERS.TMR_NS_Green],
              ["Amarillo N-S",TRAFFIC_TIMERS.TMR_NS_Yellow],
              ["Ambos rojos",TRAFFIC_TIMERS.TMR_AllRed1],
              ["Verde E-O",TRAFFIC_TIMERS.TMR_EW_Green],
              ["Amarillo E-O",TRAFFIC_TIMERS.TMR_EW_Yellow],
              ["Ambos rojos",TRAFFIC_TIMERS.TMR_AllRed2],
              ["Peatonal (si se solicitó)",TRAFFIC_TIMERS.TMR_Pedestrian],
            ].map(([name,ms],i)=>(
              <div key={i} className="rounded border border-slate-600 bg-[#102130] p-2">
                <div>{name}</div><div className="mt-1 font-mono text-sky-300">{Number(ms)/1000} s</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-slate-400">
            La solicitud peatonal queda pendiente hasta el segundo rojo de seguridad.
            Si no existe solicitud, comienza el próximo ciclo N-S.
            Las entradas DI_NSWaiting y DI_EWWaiting permiten practicar extensiones adaptativas.
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
          <div className="max-h-64 overflow-auto rounded border border-slate-700">
            <table className="w-full min-w-[570px] text-left text-[11px]">
              <thead className="sticky top-0 bg-[#203449] text-slate-300">
                <tr>{["Tag","Tipo","Función","Descripción","Valor"].map(v=>
                  <th key={v} className="px-2 py-2">{v}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {TRAFFIC_TAGS.map(spec=>{
                  const tag=project.tags.find(t=>t.name===spec.name);
                  const value=tag?.type==="COUNTER" ? readTrafficCount(project,spec.name) :
                    tag?.type==="TIMER" && typeof tag.value==="object" ?
                      String(tag.value.ACC)+"/"+String(tag.value.PRE) :
                      tag?.type==="BOOL" ? Number(readTrafficBool(project,spec.name)) : "—";
                  return <tr key={spec.name} className="hover:bg-slate-700/20">
                    <td className="px-2 py-1.5 font-mono text-sky-200">{spec.name}</td>
                    <td className="px-2 py-1.5">{spec.type}</td>
                    <td className="px-2 py-1.5">{spec.direction}</td>
                    <td className="px-2 py-1.5">{tag?.description??spec.description}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-emerald-300">{value}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded border border-slate-700 bg-[#1a2b3b] p-3">
          <details>
            <summary className="cursor-pointer font-semibold text-sky-300">
              Orientación Ladder y pruebas FAT
            </summary>
            <p className="mt-2 leading-relaxed text-slate-300">
              Prueba START/STOP, cada transición del ciclo, amarillos y ambos rojos;
              comprueba la prioridad de la petición peatonal, que NS y EW nunca
              tengan GREEN simultáneamente, el conteo individual de vehículos
              y que PAUSE congele los temporizadores y el movimiento.
              Verifica que los estados retenidos se desactiven al pulsar STOP.
            </p>
          </details>
          <button type="button" onClick={()=>{onClose();onLoadExample();}}
            className="mt-3 rounded border border-sky-600 px-3 py-1.5 font-semibold text-sky-300 hover:bg-sky-950">
            Cargar plantilla Ladder (reemplaza MainRoutine de esta escena)
          </button>
          <p className="mt-2 text-[11px] text-slate-400">
            Solo se reemplaza la rutina y los tags de semáforos, previa confirmación.
          </p>
        </section>
      </div>
      <footer className="sticky bottom-0 flex justify-end border-t border-slate-600 bg-[#1b2d3d] px-4 py-2.5">
        <button type="button" onClick={onClose}
          className="rounded bg-sky-700 px-4 py-1.5 text-xs font-semibold hover:bg-sky-600">Cerrar</button>
      </footer>
    </dialog>
  );
}
