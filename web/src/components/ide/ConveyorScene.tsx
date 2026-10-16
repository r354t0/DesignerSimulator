import { Activity, Boxes, CircleAlert, Gauge, Pause, Play, RotateCcw } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import {
  CONVEYOR_COUNT_TAG, CONVEYOR_SENSOR_TAG, CONVEYOR_SENSOR_POSITION,
  hasConveyorTags, readConveyorBool, readConveyorCount,
  type ConveyorState,
} from "../../plc/conveyorSceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  scene: ConveyorState;
  onInputChange: (name: "Start_PB" | "Stop_PB", value: boolean) => void;
  onAddItem: () => void;
  onResetScene: () => void;
  onPrepareTags: () => void;
  onLoadExample: () => void;
}

/** Inputs come from user controls; only PracticeRoutine evaluates motor/CTU outputs. */
export function ConveyorScene({
  project, mode, scene, onInputChange, onAddItem, onResetScene,
  onPrepareTags, onLoadExample,
}: Props) {
  const running = mode === "running";
  const motorOn = running && readConveyorBool(project, "Motor_Run");
  const start = readConveyorBool(project, "Start_PB");
  const stop = readConveyorBool(project, "Stop_PB");
  const sensor = readConveyorBool(project, CONVEYOR_SENSOR_TAG);
  const count = readConveyorCount(project);
  const wired = hasConveyorTags(project);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#111c27] text-slate-100"
      aria-label="Escena de faja transportadora conectada a PracticeRoutine">
      <header className="shrink-0 border-b border-slate-700/70 bg-[#1a2632] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Escena 01 · Faja transportadora</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Entradas físicas simuladas → Controller Tags → PracticeRoutine → Motor_Run
            </p>
          </div>
          <span className={"inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] " +
            (mode === "running"
              ? "border-emerald-700 bg-emerald-950 text-emerald-300"
              : mode === "paused"
                ? "border-amber-700 bg-amber-950 text-amber-300"
                : "border-slate-600 bg-slate-800 text-slate-300")}>
            <Activity size={12}/> {mode === "running" ? "PracticeRoutine RUN" :
              mode === "paused" ? "PracticeRoutine PAUSE" : "PracticeRoutine STOP"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-lg border border-slate-700 bg-[#172634] px-3 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 font-semibold text-slate-200">
              <Boxes size={16} className="text-sky-400"/> Línea de transporte
            </span>
            <span className={motorOn ? "text-emerald-400" : "text-slate-400"}>
              Motor_Run = {Number(motorOn)} · {motorOn ? "EN MARCHA" : "DETENIDA"}
            </span>
          </div>

          <div className="relative h-36 overflow-hidden rounded-md border border-slate-600 bg-[#0f1b26]"
            role="img" aria-label={"Faja con " + scene.items.length +
              " cajas, motor " + (motorOn ? "encendido" : "apagado") +
              ", sensor " + (sensor ? "activo" : "inactivo")}>
            <div className="absolute inset-x-0 top-[49px] h-[66px] rounded-sm border-y-4 border-slate-500 bg-[#2d4051]">
              <div className="absolute inset-x-0 top-1/2 h-px bg-slate-500/50"/>
              <div className="absolute inset-0 flex items-center justify-around opacity-40">
                {Array.from({ length: 10 }, (_, index) =>
                  <span key={index} className="h-5 w-px bg-slate-300"/>)}
              </div>
            </div>
            <div className="absolute left-0 right-0 top-[114px] h-2 border-t border-slate-600 bg-[#283543]"/>
            <div className={"absolute top-6 bottom-3 z-10 w-[3px] " +
              (sensor ? "bg-amber-300 shadow-[0_0_15px_3px_#fbbf24]" : "bg-sky-400/80")}
              style={{ left: (CONVEYOR_SENSOR_POSITION * 100) + "%" }}/>
            <div className="absolute left-3 top-2 text-[10px] text-slate-400">ENTRADA</div>
            <div className="absolute right-3 top-2 text-[10px] text-slate-400">SALIDA</div>
            <span className="absolute z-20 top-[11px] rounded bg-[#152334] px-1 text-[10px] text-sky-300"
              style={{ left: "calc(" + (CONVEYOR_SENSOR_POSITION * 100) + "% + 6px)" }}>
              PE-01
            </span>
            {scene.items.map((item) => (
              <div key={item.id}
                className="absolute z-20 top-[56px] flex h-12 w-[48px] -translate-x-1/2 items-center justify-center rounded border-2 border-amber-500 bg-[#b57b3c] text-xs font-bold text-[#291b11] shadow-md"
                style={{ left: (item.position * 100) + "%" }}
                aria-hidden="true">
                <span className="border-b border-amber-900/50">#{item.id}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onAddItem}
              disabled={scene.items.length >= 8 || scene.items.some(item => item.position < 0.14)}
              className="rounded bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40">
              + Añadir caja
            </button>
            <button type="button" onClick={onResetScene}
              className="flex items-center gap-1 rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-700">
              <RotateCcw size={13}/> Vaciar faja
            </button>
            <span className="ml-auto text-xs text-slate-400">Cajas despachadas: {scene.passed}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-[#172634] p-3">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Gauge size={15}/> Tablero de mando
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" aria-pressed={start}
                onClick={() => onInputChange("Start_PB", !start)}
                className={"flex h-16 w-20 flex-col items-center justify-center gap-0.5 rounded-md border-2 text-xs font-bold " +
                  (start ? "border-emerald-300 bg-emerald-600 text-white" : "border-emerald-700 bg-emerald-950 text-emerald-300")}>
                <Play size={18}/> START {start ? "1" : "0"}
              </button>
              <button type="button" aria-pressed={stop}
                onClick={() => onInputChange("Stop_PB", !stop)}
                className={"flex h-16 w-20 flex-col items-center justify-center gap-0.5 rounded-md border-2 text-xs font-bold " +
                  (stop ? "border-red-300 bg-red-600 text-white" : "border-red-700 bg-red-950 text-red-300")}>
                <Pause size={18}/> STOP {stop ? "1" : "0"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Pulsadores tipo interruptor para que ningún pulso se pierda entre scans.
              Haz clic nuevamente para volver a 0.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-[#172634] p-3">
            <div className="mb-3 text-xs font-semibold">Señales de la escena</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-mono text-slate-400">Motor_Run</span>
                <span className={motorOn ? "text-emerald-400" : "text-slate-400"}>
                  {Number(motorOn)} · {motorOn ? "RUN" : "OFF"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-mono text-slate-400">{CONVEYOR_SENSOR_TAG}</span>
                <span className={sensor ? "text-amber-300" : "text-slate-400"}>
                  {wired ? Number(sensor) : "Sin tag"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-mono text-slate-400">{CONVEYOR_COUNT_TAG}.ACC</span>
                <span className="font-mono text-sky-300">{count ?? "Sin tag"}</span>
              </div>
            </div>
          </div>
        </div>

        {!wired && (
          <div className="rounded-md border border-amber-600/60 bg-amber-950/30 p-3 text-xs">
            <p className="flex items-center gap-2 font-semibold text-amber-300">
              <CircleAlert size={16}/> Faltan los tags de la faja
            </p>
            <p className="mt-1 text-slate-300">
              Agrega CV_BoxSensor (BOOL) y CV_Count (COUNTER) sin modificar tus rungs.
            </p>
            <button type="button" onClick={onPrepareTags}
              className="mt-2 rounded border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/40">
              Preparar tags de la escena
            </button>
          </div>
        )}
        <div className="rounded-md border border-slate-600/70 bg-[#172634] p-3 text-xs">
          <p className="font-semibold text-slate-200">Ladder recomendado para practicar</p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Rung 0: Start_PB → OTL Motor_Run
          </p>
          <p className="font-mono text-[11px] text-slate-400">
            Rung 1: Stop_PB → OTU Motor_Run
          </p>
          <p className="font-mono text-[11px] text-slate-400">
            Rung 2: CV_BoxSensor → CTU CV_Count (PRE=5)
          </p>
          <button type="button" onClick={onLoadExample}
            className="mt-2 rounded border border-sky-600 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-950">
            Cargar plantilla Ladder (reemplaza PracticeRoutine)
          </button>
          <p className="mt-2 text-[11px] text-slate-400">
            Build y RUN se inician desde PracticeRoutine. Sin RUN, las cajas permanecen quietas.
            Esta escena nunca controla hardware físico. Vaciar faja no reinicia el contador PLC.
          </p>
        </div>
      </div>
    </section>
  );
}
