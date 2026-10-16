import { useState } from "react";
import { Boxes, CircleAlert, Gauge, Info, Pause, Play, RotateCcw } from "lucide-react";
import { ConveyorSceneInfoDialog } from "./ConveyorSceneInfoDialog";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import {
  CONVEYOR_SENSOR_TAG, CONVEYOR_SENSOR_POSITION,
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
  onOpenTags: () => void;
  setupError: string | null;
  onLoadExample: () => void;
}

/** Inputs come from user controls; only PracticeRoutine evaluates motor/CTU outputs. */
export function ConveyorScene({
  project, mode, scene, onInputChange, onAddItem, onResetScene,
  onPrepareTags, onOpenTags, setupError, onLoadExample,
}: Props) {
  const running = mode === "running";
  const motorOn = running && readConveyorBool(project, "Motor_Run");
  const start = readConveyorBool(project, "Start_PB");
  const stop = readConveyorBool(project, "Stop_PB");
  const sensor = readConveyorBool(project, CONVEYOR_SENSOR_TAG);
  const count = readConveyorCount(project);
  const wired = hasConveyorTags(project);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#111c27] text-slate-100"
      aria-label="Escena de faja transportadora conectada a MainRoutine">


      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-lg border border-slate-700 bg-[#172634] px-3 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-semibold text-slate-200">
              <Boxes size={16} className="text-sky-400"/> Línea de transporte
            </span>
            <div className="ml-auto flex items-center gap-3">
              <span className={motorOn ? "font-medium text-emerald-400" : "text-slate-400"}>
                Motor_Run = {Number(motorOn)} · {motorOn ? "EN MARCHA" : "DETENIDA"}
              </span>
              <button type="button" aria-haspopup="dialog" aria-expanded={infoOpen}
                aria-label="Información de la escena"
                title="Objetivo del ejercicio y mapa E/S"
                onClick={() => setInfoOpen(true)}
                className="inline-flex size-7 items-center justify-center rounded border border-slate-600 text-slate-300 hover:border-sky-600 hover:bg-slate-700 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-500">
                <Info size={15} aria-hidden="true"/>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-600 bg-[#0f1b26]"
            role="img" aria-label={"Vista lateral de faja transportadora con " +
              scene.items.length + " cajas, motor " +
              (motorOn ? "encendido y girando" : "detenido") +
              ", sensor PE-01 " + (sensor ? "activo" : "inactivo")}>
            <svg viewBox="0 0 760 260" className="block h-auto w-full min-w-[580px]"
              xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="conveyor-belt-side" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#475e70"/>
                  <stop offset="100%" stopColor="#293d50"/>
                </linearGradient>
              </defs>
              {/* Mechanical support structure, entirely fixed to the ground. */}
              <path d="M72 237 H712" stroke="#405367" strokeWidth="5" strokeLinecap="round"/>
              <g fill="#45596a" stroke="#8293a3" strokeWidth="2">
                <path d="M136 153 L121 235 H137 L160 153 Z"/>
                <path d="M514 153 L533 235 H549 L539 153 Z"/>
                <path d="M122 205 H541 V214 H122 Z" fill="#34495b"/>
              </g>
              {/* Roller housing and continuous belt, viewed from the side. */}
              <rect x="82" y="109" width="507" height="52" rx="26"
                fill="#162838" stroke="#64788a" strokeWidth="3"/>
              <rect x="83" y="111" width="505" height="48" rx="24"
                fill="url(#conveyor-belt-side)"/>
              <path d="M108 113 H563" stroke="#91a6b7" strokeWidth="8"
                strokeLinecap="round"/>
              <path d="M109 114 H562" stroke="#1d2935" strokeWidth="4"
                strokeDasharray="18 18" className="conveyor-belt-motion"
                style={{ animationPlayState: motorOn ? "running" : "paused" }}/>
              <path d="M109 157 H562" stroke="#8b9aa8" strokeWidth="4"
                strokeDasharray="18 18" className="conveyor-belt-motion"
                style={{ animationPlayState: motorOn ? "running" : "paused" }}/>
              {[109, 230, 351, 472, 563].map((center) => (
                <g key={center}>
                  <circle cx={center} cy="134" r="15" fill="#192d3b" stroke="#8599a9" strokeWidth="2"/>
                  <g className="conveyor-motor-spin"
                    style={{ transformOrigin: center + "px 134px",
                      animationPlayState: motorOn ? "running" : "paused" }}>
                    <path d={"M" + (center-11) + " 134 H" + (center+11) +
                      " M" + center + " 123 V145"} stroke="#9dadb9" strokeWidth="2.5"/>
                    <path d={"M" + (center-8) + " 126 L" + (center+8) + " 142" +
                      " M" + (center+8) + " 126 L" + (center-8) + " 142"}
                      stroke="#748c9f" strokeWidth="1.4"/>
                  </g>
                  <circle cx={center} cy="134" r="4" fill="#9eafbe"/>
                </g>
              ))}
              {/* Conveyor boxes sit on the belt; positions use the actual scene physics. */}
              {scene.items.map((item) => (
                <g key={item.id} transform={"translate(" + (82 + item.position * 505) + " 0)"}>
                  <rect x="-22" y="67" width="44" height="40" rx="2"
                    fill="#bb813f" stroke="#f3bc6c" strokeWidth="2"/>
                  <path d="M-22 78 H22 M0 67 V107" stroke="#8a562a"
                    strokeWidth="1.5" strokeOpacity=".6"/>
                  <text x="0" y="94" textAnchor="middle" fontSize="11"
                    fontFamily="monospace" fontWeight="700" fill="#241a13">
                    {item.id}
                  </text>
                </g>
              ))}
              {/* One optoelectronic sensor and its optical beam. */}
              <g transform={"translate(" + (82 + CONVEYOR_SENSOR_POSITION * 505) + " 0)"}>
                <rect x="-8" y="43" width="16" height="15" rx="3"
                  fill={sensor ? "#fbbf24" : "#38bdf8"}
                  stroke="#bfdbfe" strokeWidth="1.3"/>
                <path d="M0 58 V108" stroke={sensor ? "#fbbf24" : "#38bdf8"}
                  strokeWidth="2" strokeDasharray="4 4"
                  opacity={sensor ? "0.95" : "0.55"}/>
                <text x="13" y="54" fontSize="11" fill="#a8cbe3">PE-01</text>
              </g>
              {/* Gearmotor / drive pulley: rotational motion is tied to Motor_Run. */}
              <path d="M562 143 L624 196 M576 143 L638 196"
                stroke="#9aabb9" strokeWidth="3" fill="none"/>
              <circle cx="569" cy="137" r="20" fill="#334858"
                stroke="#8da3b5" strokeWidth="3"/>
              <g className="conveyor-motor-spin"
                style={{ transformOrigin: "569px 137px",
                  animationPlayState: motorOn ? "running" : "paused" }}>
                <path d="M554 137 H584 M569 122 V152 M558 126 L580 148 M580 126 L558 148"
                  stroke="#b4c2cc" strokeWidth="3"/>
              </g>
              <circle cx="569" cy="137" r="5" fill="#d0dce6"/>
              <rect x="625" y="176" width="78" height="61" rx="11"
                fill={motorOn ? "#27554d" : "#405568"}
                stroke={motorOn ? "#34d399" : "#96a7b5"} strokeWidth="2.5"/>
              <rect x="612" y="194" width="16" height="24" rx="4"
                fill="#33495a" stroke="#99aebb" strokeWidth="2"/>
              <g className="conveyor-motor-spin"
                style={{ transformOrigin: "664px 206px",
                  animationPlayState: motorOn ? "running" : "paused" }}>
                <circle cx="664" cy="206" r="19" fill="#1b303b"
                  stroke={motorOn ? "#34d399" : "#97a9b7"} strokeWidth="2"/>
                <path d="M647 206 H681 M664 189 V223 M652 194 L676 218 M676 194 L652 218"
                  stroke="#a6bac8" strokeWidth="3"/>
              </g>
              <circle cx="664" cy="206" r="4" fill="#d5e4ed"/>
              <text x="663" y="250" fontSize="10" textAnchor="middle"
                fill={motorOn ? "#6ee7b7" : "#94a3b8"}>
                MOTOR {motorOn ? "RUN" : "OFF"}
              </text>
            </svg>
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
              {setupError ?? "No están disponibles todas las señales esperadas. Revisa sus tipos y nombres en Controller Tags."}
            </p>
            <button type="button" onClick={onPrepareTags}
              className="mt-2 rounded border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/40">
              Reintentar registro de tags
            </button>
          </div>
        )}
      </div>
      <ConveyorSceneInfoDialog open={infoOpen} project={project}
        onClose={() => setInfoOpen(false)}
        onOpenTags={onOpenTags} onLoadExample={onLoadExample}/>
    </section>
  );
}
