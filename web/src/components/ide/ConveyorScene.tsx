import { useState } from "react";
import { Boxes, CircleAlert, CircleHelp, Gauge, Pause, Play, RotateCcw, ScanLine } from "lucide-react";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { ScadaLedGroup } from "./ScadaLedGroup";
import { ConveyorSceneInfoDialog } from "./ConveyorSceneInfoDialog";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import {
  CONVEYOR_SENSOR_TAG, CONVEYOR_SENSOR_POSITION,
  CONVEYOR_BELT_LENGTH_PX, CONVEYOR_BOX_WIDTH_PX,
  canAddConveyorItem, hasConveyorTags, readConveyorBool, readConveyorCount,
  type ConveyorState,
} from "../../plc/conveyorSceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  scene: ConveyorState;
  onInputChange: (name: "PB_Start" | "PB_Stop" | "PB_Reset", value: boolean) => void;
  onAddItem: () => void;
  onResetScene: () => void;
  onPrepareTags: () => void;
  onOpenTags: () => void;
  setupError: string | null;
  onLoadExample: () => void;
  onResetExample: () => void;
}

function PilotLed({ label, lit, tone }: {
  label: string;
  lit: boolean;
  tone: "green" | "red" | "amber";
}) {
  const colors = {
    green: lit ? "border-emerald-200 bg-emerald-400 shadow-[0_0_12px_3px_#34d3997a]" : "border-emerald-950 bg-emerald-950/40",
    red: lit ? "border-red-200 bg-red-500 shadow-[0_0_12px_3px_#ef44447a]" : "border-red-950 bg-red-950/40",
    amber: lit ? "border-amber-200 bg-amber-400 shadow-[0_0_12px_3px_#fbbf247a]" : "border-amber-950 bg-amber-950/40",
  };
  return (
    <div role="status" aria-label={label + ": " + (lit ? "encendido" : "apagado")}
      className="flex min-w-0 items-center gap-2 rounded border border-slate-700 bg-[#0e1b27] px-2.5 py-2">
      <span aria-hidden="true" className={"size-4 shrink-0 rounded-full border-2 " + colors[tone]}/>
      <span className="text-[11px] font-medium text-slate-200">{label}</span>
    </div>
  );
}

/** Inputs come from operator controls; MainRoutine alone evaluates outputs. */
export function ConveyorScene({
  project, mode, scene, onInputChange, onAddItem, onResetScene,
  onPrepareTags, onOpenTags, setupError, onLoadExample, onResetExample,
}: Props) {
  const running = mode === "running";
  const motorOn = running && readConveyorBool(project, "DO_Motor");
  const start = readConveyorBool(project, "PB_Start");
  const stop = readConveyorBool(project, "PB_Stop");
  const resetAvailable = project.tags.some(tag =>
    tag.name === "PB_Reset" && tag.type === "BOOL");
  const reset = resetAvailable && readConveyorBool(project, "PB_Reset");
  const batchDone = project.tags.some(tag => tag.name === "ST_StopRequest") &&
    project.tags.some(tag => tag.name === "CNT_Boxes" && tag.type === "COUNTER" &&
      typeof tag.value === "object" && tag.value.DN === true);
  const sensor = readConveyorBool(project, CONVEYOR_SENSOR_TAG);
  const count = readConveyorCount(project);
  const wired = hasConveyorTags(project);
  const [infoOpen, setInfoOpen] = useState(false);
  const plcLabel = mode === "running" ? "PLC · RUN"
    : mode === "paused" ? "PLC · PAUSE" : "PLC · STOP";

  return (
    <section className="sort-scada-shell scada-control-shell flex h-full min-h-0 flex-col overflow-y-auto text-slate-100"
      aria-label="Escena de faja transportadora conectada a MainRoutine">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <header className="sort-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#344c5e] px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#335d76] bg-[#14344a] text-sky-300">
              <Boxes size={21} aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-sky-300">
                SCADA · ESTACIÓN CV-01
              </div>
              <h2 className="truncate text-sm font-bold tracking-tight text-slate-100">
                Faja transportadora
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className={"inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-bold tracking-wide " +
              (running ? "border-emerald-800 bg-emerald-950/45 text-emerald-300" :
                mode === "paused" ? "border-amber-700 bg-amber-950/40 text-amber-300" :
                  "border-slate-600 bg-slate-800 text-slate-300")}>
              <span aria-hidden="true" className={"size-1.5 rounded-full " +
                (running ? "bg-emerald-400" : mode === "paused" ? "bg-amber-400" : "bg-slate-400")}/>
              {plcLabel}
            </span>
            <button type="button" aria-haspopup="dialog" aria-expanded={infoOpen}
              aria-label="Información de la escena"
              title="Objetivo del ejercicio y mapa de entradas/salidas"
              onClick={() => setInfoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded border border-[#456276] bg-[#1a3549] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:border-sky-400 hover:bg-[#24475f] focus-visible:outline-2 focus-visible:outline-sky-400">
              <CircleHelp size={14} aria-hidden="true"/> Objetivo y mapa E/S
            </button>
          </div>
        </header>

        <div className="scada-scene-workspace">
        <section className="sort-panel scada-process-panel rounded-lg border border-[#344c5e] p-3"
          aria-labelledby="conveyor-process-title">
          <div className="mb-3 flex items-center gap-2">
            <ScanLine size={16} className="text-sky-300" aria-hidden="true"/>
            <h3 id="conveyor-process-title" className="text-xs font-semibold text-slate-100">
              Vista de proceso
            </h3>
          </div>
          <div className="scada-process-canvas overflow-x-auto rounded-md border border-[#7d8992] bg-[#ffffff]"
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
              <rect width="760" height="260" fill="#ffffff"/>
              {/* Move the conveyor to the right to make room for the drive motor on the left. */}
              <g transform="translate(100 0)">
              {/* Mechanical support structure, entirely fixed to the ground. */}
              <path d="M-70 237 H625" stroke="#405367" strokeWidth="5" strokeLinecap="round"/>
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
                <g key={item.id} transform={"translate(" + (82 + item.position * CONVEYOR_BELT_LENGTH_PX) + " 0)"}>
                  <rect x={-CONVEYOR_BOX_WIDTH_PX / 2} y="67"
                    width={CONVEYOR_BOX_WIDTH_PX} height="40" rx="2"
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
              <g transform={"translate(" + (82 + CONVEYOR_SENSOR_POSITION * CONVEYOR_BELT_LENGTH_PX) + " 0)"}>
                <rect x="-8" y="43" width="16" height="15" rx="3"
                  fill={sensor ? "#fbbf24" : "#38bdf8"}
                  stroke="#bfdbfe" strokeWidth="1.3"/>
                <path d="M0 58 V108" stroke={sensor ? "#fbbf24" : "#38bdf8"}
                  strokeWidth="2" strokeDasharray="4 4"
                  opacity={sensor ? "0.95" : "0.55"}/>
                <text x="13" y="54" fontSize="11" fill="#183c51" fontWeight="700">PE-01</text>
              </g>
              </g>
              {/* Left-side gearmotor, output pulley and coupler. */}
              <path d="M129 187 L191 145 M141 200 L206 155"
                stroke="#9aabb9" strokeWidth="3" fill="none"/>
              <circle cx="209" cy="134" r="20" fill="#334858"
                stroke="#8da3b5" strokeWidth="3"/>
              <g className="conveyor-motor-spin"
                style={{ transformOrigin: "209px 134px",
                  animationPlayState: motorOn ? "running" : "paused" }}>
                <path d="M194 134 H224 M209 119 V149 M198 123 L220 145 M220 123 L198 145"
                  stroke="#b4c2cc" strokeWidth="3"/>
              </g>
              <circle cx="209" cy="134" r="5" fill="#d0dce6"/>
              <rect x="47" y="175" width="83" height="62" rx="11"
                fill={motorOn ? "#27554d" : "#405568"}
                stroke={motorOn ? "#34d399" : "#96a7b5"} strokeWidth="2.5"/>
              <rect x="128" y="193" width="15" height="25" rx="4"
                fill="#33495a" stroke="#99aebb" strokeWidth="2"/>
              <g className="conveyor-motor-spin"
                style={{ transformOrigin: "89px 206px",
                  animationPlayState: motorOn ? "running" : "paused" }}>
                <circle cx="89" cy="206" r="19" fill="#1b303b"
                  stroke={motorOn ? "#34d399" : "#97a9b7"} strokeWidth="2"/>
                <path d="M72 206 H106 M89 189 V223 M77 194 L101 218 M101 194 L77 218"
                  stroke="#a6bac8" strokeWidth="3"/>
              </g>
              <circle cx="89" cy="206" r="4" fill="#d5e4ed"/>
              <text x="89" y="250" fontSize="10" textAnchor="middle"
                fill={motorOn ? "#047857" : "#334155"} fontWeight="700">
                MOTOR {motorOn ? "RUN" : "OFF"}
              </text>
            </svg>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onAddItem}
              disabled={!canAddConveyorItem(scene)}
              className="rounded bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40">
              + Añadir caja
            </button>
            <button type="button" onClick={onResetScene}
              className="flex items-center gap-1 rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-700">
              <RotateCcw size={13}/> Vaciar faja
            </button>
            <span className="ml-auto text-xs text-slate-400">Cajas despachadas: {scene.passed}</span>
          </div>
        </section>

        <aside className="scada-scene-sidebar" aria-label="Controles e indicadores del SCADA">
          <div className="scada-dashboard-grid grid gap-3">
          <section className="sort-panel rounded-lg border border-[#344c5e] p-2.5"
            aria-label="Tablero de mando">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
              <Gauge size={14} aria-hidden="true"/> Tablero de mando
            </div>
            <div className="scada-command-buttons grid max-w-[210px] grid-cols-2 gap-2">
              <MomentaryPushButton compact name="START" tone="start" pressed={start}
                onChange={(pressed) => onInputChange("PB_Start", pressed)}
                icon={<Play size={15} aria-hidden="true"/>}>START</MomentaryPushButton>
              <MomentaryPushButton compact name="STOP" tone="stop" pressed={stop}
                onChange={(pressed) => onInputChange("PB_Stop", pressed)}
                icon={<Pause size={15} aria-hidden="true"/>}>STOP</MomentaryPushButton>
              {resetAvailable && (
                <MomentaryPushButton compact name="RESET LOTE" tone="drain" pressed={reset}
                  onChange={(pressed) => onInputChange("PB_Reset", pressed)}
                  icon={<RotateCcw size={15} aria-hidden="true"/>}>RESET</MomentaryPushButton>
              )}
            </div>
          </section>
          <section className="sort-panel scada-led-panel min-w-0 rounded-lg border border-[#344c5e] p-3"
            aria-label="Pilotos LED">
            <div className="mb-2 text-xs font-semibold text-slate-200">Pilotos LED</div>
            <div className="space-y-3">
              <ScadaLedGroup kind="status">
                <PilotLed label="EN MARCHA" lit={motorOn} tone="green"/>
                <PilotLed label="DETENIDA" lit={!motorOn} tone="red"/>
                {resetAvailable && (
                  <PilotLed label="LOTE COMPLETO" lit={batchDone} tone="amber"/>
                )}
              </ScadaLedGroup>
              <ScadaLedGroup kind="inputs">
                <PilotLed label="PB START" lit={start} tone="amber"/>
                <PilotLed label="PB STOP" lit={stop} tone="amber"/>
                {resetAvailable && (
                  <PilotLed label="PB RESET" lit={reset} tone="amber"/>
                )}
                <PilotLed label="PE-01 · CAJA" lit={sensor} tone="amber"/>
              </ScadaLedGroup>
              <ScadaLedGroup kind="outputs">
                <PilotLed label="MOTOR" lit={motorOn} tone="green"/>
              </ScadaLedGroup>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-700 pt-2 text-[11px]">
              <span className="text-slate-400">Cajas detectadas</span>
              <output aria-label="Conteo de cajas CNT_Boxes.ACC"
                className="font-mono text-sm font-bold tabular-nums text-sky-200">
                {count ?? "—"}
              </output>
            </div>
          </section>
          </div>
        </aside>
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
        onOpenTags={onOpenTags} onLoadExample={onLoadExample} onResetExample={onResetExample}/>
    </section>
  );
}
