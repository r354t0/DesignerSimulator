import { useEffect,useRef,useState } from "react";
import { BookOpen, Info, X } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import {
  BATCH_EXERCISES,BATCH_IO_TAGS,batchSolutionTags,batchSolutionUsedTags,
  type BatchExercise,
} from "../../plc/batchMixerSceneModel";
import { SceneTagTable } from "./SceneTagTable";
interface Props {
  open:boolean;project:PracticeProject;
  selectedExercise:BatchExercise|null;
  onClose:()=>void;
  onOpenTags:()=>void;
  onLoadSolution:(exercise:BatchExercise)=>void;
  onResetSolution:()=>void;
}
export function BatchMixerSceneInfoDialog({open,project,selectedExercise,onClose,
  onOpenTags,onLoadSolution,onResetSolution}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const [exercise,setExercise]=useState<BatchExercise>(1);
  useEffect(()=>{
    if(!dialog.current)return;
    if(open&&!dialog.current.open)dialog.current.showModal();
    else if(!open&&dialog.current.open)dialog.current.close();
  },[open]);
  const current=BATCH_EXERCISES.find(item=>item.id===exercise)!;
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="batch-info-title"
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}
    className="w-[min(1050px,96vw)] max-h-[88vh] overflow-y-auto rounded-xl border border-slate-600 bg-[#142331] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
    style={{margin:"auto"}}>
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-600 bg-[#1b2d3d] p-4">
      <div>
        <h2 id="batch-info-title" className="flex items-center gap-2 text-sm font-semibold">
          <Info size={17} className="text-sky-300"/> Batch Mixer · Información y ejercicios
        </h2>
        <p className="mt-1 text-[11px] text-slate-400">
          Dos laboratorios, cinco soluciones progresivas e independientes
        </p>
      </div>
      <button type="button" aria-label="Cerrar información" onClick={onClose}
        className="rounded border border-slate-600 p-2 hover:bg-slate-700"><X size={17}/></button>
    </div>
    <div className="space-y-4 p-4 text-xs">
      <section className="rounded-lg border border-sky-800 bg-[#173249] p-3">
        <h3 className="mb-2 flex items-center gap-2 font-semibold text-sky-200">
          <BookOpen size={15}/> Objetivo del ejercicio
        </h3>
        <p className="leading-relaxed">Programar un proceso de mezclado por lotes utilizando
          bombas P1, P2 y P3, tres caudalímetros digitales, sensores de nivel, termostato,
          mezclador y calentador. El SCADA refleja las salidas del PLC y genera solamente
          las entradas físicas; la secuencia es siempre responsabilidad de MainRoutine.</p>
        <p className="mt-2 text-slate-300">Los valores que introduce el operador utilizan
          tags <strong>INT</strong> (consigna °C, proporción % y número de lotes).
          La temperatura física se simula internamente y el termostato entrega únicamente
          <strong> DI_Thermostat (BOOL)</strong> cuando se cumple la consigna. No se emplean
          decodificadores BCD ni una entrada analógica de temperatura.</p>
        <p className="mt-2 text-slate-300">
          Los sensores de nivel son de detección de líquido: <strong>TRUE (1)</strong>
          cuando el líquido alcanza su posición y <strong>FALSE (0)</strong> cuando
          están secos. HI-LEVEL detecta el llenado al 100 %; LO-LEVEL está ubicado
          en el fondo y se desactiva al vaciarse el tanque (0 %).
          La referencia porcentual del nivel se consulta en el indicador del SCADA.
        </p>
      </section>
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Mapa E/S · Variables del SCADA</h3>
          <button type="button" onClick={()=>{onClose();onOpenTags();}}
            className="rounded border border-sky-600 px-3 py-1.5 text-sky-200 hover:bg-sky-950">
            Abrir Controller Tags
          </button>
        </div>
        <SceneTagTable specs={BATCH_IO_TAGS} project={project}/>
      </section>
      <section className="rounded-lg border border-slate-700 bg-[#1a2b3b] p-3">
        <h3 className="mb-3 font-semibold text-sky-200">Ejercicios</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {BATCH_EXERCISES.map(item=><button key={item.id} type="button"
            onClick={()=>setExercise(item.id)}
            aria-pressed={exercise===item.id}
            className={"rounded border p-3 text-left transition-colors "+
              (exercise===item.id
                ?"border-sky-400 bg-[#1d4560] text-sky-100"
                :"border-slate-600 bg-[#102331] text-slate-300 hover:border-sky-700")}>
            <span className="text-[10px] text-slate-400">{item.source}</span>
            <div className="mt-1 font-semibold">Ejercicio {item.id}: {item.title}</div>
            <p className="mt-1 text-[11px]">{item.description}</p>
          </button>)}
        </div>
        <div className="mt-3 rounded border border-slate-600 bg-[#132739] p-3">
          <h4 className="mb-2 font-semibold">{current.source} · {current.title}</h4>
          <ul className="list-inside list-disc space-y-1.5 leading-relaxed text-slate-300">
            {current.criteria.map(item=><li key={item}>{item}</li>)}
          </ul>
          {exercise===1&&<p className="mt-2 text-[11px] text-slate-400">
            Equivalencia didáctica: cada pulso representa 0,1 % del volumen nominal;
            900 pulsos equivalen al 90 % y 1000 pulsos al tanque lleno.</p>}
          {exercise===4&&<p className="mt-2 text-[11px] text-slate-400">
            Modo A: un lote y nueva orden START después de vaciar. La relación
            se aplica al 100 % de capacidad: 1000 pulsos en total, 10 pulsos por cada 1 %.</p>}
          {exercise===5&&<p className="mt-2 text-[11px] text-slate-400">
            Modo B: el lote producido se visualiza como entero en INT_DisplayValue.</p>}
        </div>
      </section>
      <section aria-label="Solución Recomendada"
        className="rounded-lg border border-slate-700 bg-[#1a2b3b] p-3">
        <h3 className="mb-2 font-semibold text-sky-200">Solución Recomendada</h3>
        <p className="mb-2 text-slate-300">
          Cada botón carga una <strong>MainRoutine Ladder real y editable</strong> para el
          ejercicio seleccionado, incluyendo sus CTU/CTD, temporizadores, comparaciones,
          salidas e interbloqueos. Las variables adicionales solo se crean al implementarla.
        </p>
        <h4 className="mb-2 font-semibold">
          {exercise<=3?"Variables utilizadas en la solución":"Variables adicionales"} · Ejercicio {exercise}
        </h4>
        <SceneTagTable
          specs={exercise<=3
            ? batchSolutionUsedTags(exercise as 1|2|3) : batchSolutionTags(exercise)}
          project={project} preview/>
        {exercise<=3&&<p className="mt-1.5 text-[10px] text-slate-400">
          Solo aparecen los tags referenciados en los rungs de este ejercicio.
          Las E/S ya existen en el SCADA; las variables internas se crean al
          implementar la solución.
        </p>}
        <p className="mt-2 text-[11px] text-slate-400">
          {exercise===1?"FM1 incrementa CNT_Volume hasta 900 pulsos (90 %).":
            exercise===2?"FM1 incrementa y FM3 decrementa CNT_Volume. TON TMR_Mixing utiliza PRE = 8000 ms; su bit TT habilita el mezclador y DN inicia el drenaje.":
            exercise===3?"Utiliza los 12 rungs del ejercicio 2 y añade después del rung 0 dos rungs: IDLE enclavado con STOP / desactivado por START, y RUN controlado por ST_RunEnable.":
            exercise===3?"Cada pulso de FM1 y FM3 equivale a 0,1 % y CNT_Volume registra los pulsos netos.":
            "El termostato es una DI. El Ladder convierte INT_RatioP1 a pulsos mediante MUL × 10 y compara el resultado con CNT_Product1.ACC; la temperatura real pertenece a la física simulada."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={()=>{onClose();onLoadSolution(exercise);}}
            className="rounded border border-sky-500 bg-sky-900/50 px-3 py-2 font-semibold text-sky-100 hover:bg-sky-800">
            Implementar Solución Recomendada · Ejercicio {exercise}
          </button>
          <button type="button" onClick={()=>{onClose();onResetSolution();}}
            className="rounded border border-slate-500 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-700">
            Reiniciar programación para practicar
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          {selectedExercise
            ?"Solución cargada: ejercicio "+selectedExercise+". Se guarda tu programa anterior a la primera carga."
            :"Aún no se ha implementado ninguna solución en esta escena."}
          {" "}Ambas acciones piden confirmación; el reinicio recupera el programa anterior.
        </p>
      </section>
    </div>
    <footer className="sticky bottom-0 flex justify-end border-t border-slate-600 bg-[#1b2d3d] p-3">
      <button type="button" onClick={onClose}
        className="rounded bg-sky-700 px-4 py-1.5 font-semibold hover:bg-sky-600">Cerrar</button>
    </footer>
  </dialog>;
}
