import { useState } from "react";
import { Droplets, Info, Pause, Play, RotateCcw } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { TankSceneInfoDialog } from "./TankSceneInfoDialog";
import {
  hasTankTags, readTankBool, type TankState,
} from "../../plc/tankSceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  state: TankState;
  setupError: string | null;
  onInputChange: (
    name: "Tank_StartPB" | "Tank_StopPB" | "Tank_DrainPB", pressed: boolean
  ) => void;
  onReset: () => void;
  onPrepareTags: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
}

function Pilot({ label, active, tone }: {
  label: string; active: boolean; tone: "green" | "amber" | "blue";
}) {
  const on = {
    green: "border-emerald-200 bg-emerald-400 shadow-[0_0_12px_#34d399]",
    amber: "border-amber-200 bg-amber-400 shadow-[0_0_12px_#fbbf24]",
    blue: "border-sky-200 bg-sky-400 shadow-[0_0_12px_#38bdf8]",
  };
  return (
    <div role="status" aria-label={label + ": " + (active ? "encendido" : "apagado")}
      className="flex min-w-0 items-center gap-2 rounded border border-slate-700 bg-[#101e2c] px-2.5 py-2">
      <span aria-hidden="true" className={"size-4 shrink-0 rounded-full border-2 " +
        (active ? on[tone] : "border-slate-600 bg-slate-800")}/>
      <span className="text-[11px] font-medium text-slate-200">{label}</span>
    </div>
  );
}

/** Process-only SCADA view: no hidden auto-control or synthetic motor state. */
export function TankScene({
  project, mode, state, setupError, onInputChange,
  onReset, onPrepareTags, onOpenTags, onLoadExample,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const running = mode === "running";
  const pump = running && readTankBool(project, "Tank_Pump");
  const inlet = running && readTankBool(project, "Tank_InletValve");
  const drain = running && readTankBool(project, "Tank_DrainValve");
  const low = readTankBool(project, "Tank_LowLS");
  const high = readTankBool(project, "Tank_HighLS");
  const level = Math.max(0, Math.min(100, state.levelPercent));
  const waterHeight = level * 1.72;
  const waterY = 236 - waterHeight;
  const wired = hasTankTags(project);

  return (
    <section aria-label="SCADA · Llenado de tanques"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#111c27] text-slate-100">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-lg border border-slate-700 bg-[#172634] px-3 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Droplets size={16} className="text-sky-400"/> Tanque TK-01
            </span>
            <button type="button" aria-haspopup="dialog" aria-expanded={infoOpen}
              onClick={() => setInfoOpen(true)}
              aria-label="Información de llenado de tanques"
              className="inline-flex items-center gap-1.5 rounded border border-slate-600 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:border-sky-600 hover:bg-slate-700">
              <Info size={15} aria-hidden="true"/> Objetivo y mapa E/S
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-slate-600 bg-[#0f1d29]"
            role="img" aria-label={"TK-01 nivel " + level.toFixed(1) +
              " %, bomba " + (pump ? "encendida" : "apagada") +
              ", válvula de entrada " + (inlet ? "abierta" : "cerrada") +
              ", válvula de drenaje " + (drain ? "abierta" : "cerrada")}>
            <svg viewBox="0 0 760 290" className="block h-auto w-full min-w-[560px]"
              aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <clipPath id="tk01-water-clip"><rect x="298" y="65" width="213" height="171" rx="7"/></clipPath>
                <linearGradient id="tk01-water" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#37b8e7"/>
                  <stop offset="100%" stopColor="#125a9b"/>
                </linearGradient>
              </defs>
              {/* Equipment frame and tank. */}
              <path d="M48 253 H705" stroke="#334b5b" strokeWidth="5" strokeLinecap="round"/>
              <path d="M319 240 L310 254 H333 L338 240 M472 240 L467 254 H490 L495 240"
                stroke="#8298a7" strokeWidth="4" fill="none"/>
              <rect x="294" y="60" width="221" height="180" rx="11"
                fill="#172b39" stroke="#94a7b7" strokeWidth="5"/>
              <g clipPath="url(#tk01-water-clip)">
                <rect x="298" y={waterY} width="213" height={waterHeight}
                  fill="url(#tk01-water)" opacity="0.94"/>
                {waterHeight > 0 && (
                  <path d={"M298 " + waterY + " Q330 " + (waterY-3) + " 353 " + waterY +
                    " T410 " + waterY + " T470 " + waterY + " T520 " + waterY}
                    stroke="#9ae8ff" strokeWidth="2.3" fill="none"/>
                )}
              </g>
              <g fontSize="11" textAnchor="end" fill="#cbd5e1">
                <text x="280" y="77">100 %</text>
                <text x="280" y="91">90 %</text>
                <text x="280" y="214">15 %</text>
                <text x="280" y="238">0 %</text>
              </g>
              {[{level:90,y:81,active:high,name:"LSH"},
                 {level:15,y:210,active:low,name:"LSL"}].map((sensor) => (
                <g key={sensor.name}>
                  <path d={"M287 " + sensor.y + " H520"} stroke={sensor.active ? "#fbbf24" : "#6f8496"}
                    strokeWidth="1.5" strokeDasharray="5 4"/>
                  <circle cx="516" cy={sensor.y} r="6"
                    fill={sensor.active ? "#fbbf24" : "#253d4c"}
                    stroke="#9bb5c5" strokeWidth="2"/>
                  <text x="528" y={sensor.y+4} fontSize="11"
                    fill={sensor.active ? "#fbbf24" : "#b3c2cf"}>{sensor.name}</text>
                </g>
              ))}
              <g fontSize="11" textAnchor="middle" fill="#a8c3d5">
                <text x="403" y="48">TK-01</text>
              </g>
              <rect x="357" y="114" width="95" height="48" rx="6"
                fill="#0b2437" stroke="#557b99" strokeWidth="2"/>
              <text x="405" y="133" fontSize="10" fill="#a9c4d6" textAnchor="middle">NIVEL</text>
              <text x="405" y="152" fontSize="19" fontFamily="monospace"
                fontWeight="700" textAnchor="middle" fill="#8be4ff">{level.toFixed(1)} %</text>
              {/* Inlet piping, pump and motor on left. */}
              <path d="M73 175 H178 V94 H294" fill="none"
                stroke="#738b9a" strokeWidth="15" strokeLinejoin="round"/>
              <path d="M73 175 H178 V94 H294" fill="none"
                stroke="#253f50" strokeWidth="10" strokeLinejoin="round"/>
              <rect x="70" y="142" width="88" height="66" rx="10"
                fill={pump ? "#26564c" : "#425a6b"}
                stroke={pump ? "#34d399" : "#8c9fae"} strokeWidth="2.5"/>
              <g className="conveyor-motor-spin" style={{
                transformOrigin: "114px 175px",
                animationPlayState: pump ? "running" : "paused",
              }}>
                <circle cx="114" cy="175" r="21" fill="#1c3343" stroke="#a8bdc8" strokeWidth="2"/>
                <path d="M98 175 H130 M114 159 V191 M103 164 L125 186 M125 164 L103 186"
                  stroke="#9cc9db" strokeWidth="3"/>
              </g>
              <circle cx="114" cy="175" r="4" fill="#d6e9ef"/>
              <text x="114" y="228" fontSize="11" textAnchor="middle"
                fill={pump ? "#6ee7b7" : "#a1b3c2"}>P-01</text>

              {/* Inlet solenoid valve and flow — only when both outputs on. */}
              <g transform="translate(237 94)">
                <path d="M-19 -17 L0 0 L-19 17 Z M19 -17 L0 0 L19 17 Z"
                  fill={inlet ? "#215b50" : "#334f62"}
                  stroke={inlet ? "#34d399" : "#b2c5cf"} strokeWidth="2"/>
                <path d="M0 -17 V-32" stroke="#a7bdcc" strokeWidth="3"/>
                <rect x="-12" y="-47" width="24" height="15" rx="3"
                  fill={inlet ? "#34d399" : "#617788"}/>
              </g>
              {state.inletFlowing && (
                <path d="M181 94 H291" stroke="#7dd3fc" strokeWidth="3"
                  strokeDasharray="7 9" className="tank-flow-motion"/>
              )}
              <g fontSize="11" fill="#a8c3d5">
                <text x="214" y="40">XV-01</text>
                <text x="72" y="126">ENTRADA</text>
              </g>
              {/* Right discharge solenoid and line. */}
              <path d="M513 223 H677 V263" fill="none" stroke="#738b9a"
                strokeWidth="16" strokeLinejoin="round"/>
              <path d="M513 223 H677 V263" fill="none" stroke="#253f50"
                strokeWidth="10" strokeLinejoin="round"/>
              <g transform="translate(593 223)">
                <path d="M-17 -17 L0 0 L-17 17 Z M17 -17 L0 0 L17 17 Z"
                  fill={drain ? "#846225" : "#334f62"}
                  stroke={drain ? "#fbbf24" : "#b2c5cf"} strokeWidth="2"/>
                <path d="M0 -17 V-32" stroke="#a7bdcc" strokeWidth="3"/>
                <rect x="-12" y="-47" width="24" height="15" rx="3"
                  fill={drain ? "#fbbf24" : "#617788"}/>
              </g>
              {state.outletFlowing && (
                <path d="M516 223 H674 V260" stroke="#7dd3fc" strokeWidth="3"
                  strokeDasharray="7 9" className="tank-flow-motion"/>
              )}
              <g fontSize="11" fill="#a8c3d5">
                <text x="565" y="165">XV-02</text>
                <text x="642" y="278">SALIDA</text>
              </g>
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <span className="text-slate-400">Capacidad simulada: 1000 L</span>
            <button type="button" onClick={onReset}
              className="inline-flex items-center gap-1 rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-700">
              <RotateCcw size={13}/> Reiniciar tanque
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-[#172634] p-3">
            <h3 className="mb-3 text-xs font-semibold">Tablero de mando</h3>
            <div className="flex flex-wrap gap-3">
              <MomentaryPushButton name="START" tone="start"
                pressed={readTankBool(project, "Tank_StartPB")}
                onChange={(pressed) => onInputChange("Tank_StartPB", pressed)}
                icon={<Play size={18} aria-hidden="true"/>}>START</MomentaryPushButton>
              <MomentaryPushButton name="STOP" tone="stop"
                pressed={readTankBool(project, "Tank_StopPB")}
                onChange={(pressed) => onInputChange("Tank_StopPB", pressed)}
                icon={<Pause size={18} aria-hidden="true"/>}>STOP</MomentaryPushButton>
              <MomentaryPushButton name="DRENAR" tone="drain"
                pressed={readTankBool(project, "Tank_DrainPB")}
                onChange={(pressed) => onInputChange("Tank_DrainPB", pressed)}
                icon={<Droplets size={18} aria-hidden="true"/>}>DRENAR</MomentaryPushButton>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-[#172634] p-3">
            <h3 className="mb-3 text-xs font-semibold">Pilotos LED y nivel</h3>
            <div className="grid grid-cols-2 gap-2">
              <Pilot label="BOMBA" active={pump} tone="green"/>
              <Pilot label="VÁLVULA ENTRADA" active={inlet} tone="blue"/>
              <Pilot label="NIVEL BAJO" active={low} tone="amber"/>
              <Pilot label="NIVEL ALTO" active={high} tone="amber"/>
              <Pilot label="VÁLVULA DRENAJE" active={drain} tone="blue"/>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700 pt-2 text-center text-[11px]">
              <div><span className="text-slate-400">Nivel</span>
                <div className="font-mono text-sm font-bold text-sky-300">
                  {level.toFixed(1)} %
                </div></div>
              <div><span className="text-slate-400">Llenado</span>
                <div className="font-mono text-sm font-bold text-emerald-300">
                  {state.filledLiters.toFixed(0)} L
                </div></div>
              <div><span className="text-slate-400">Drenado</span>
                <div className="font-mono text-sm font-bold text-amber-300">
                  {state.drainedLiters.toFixed(0)} L
                </div></div>
            </div>
          </div>
        </div>

        {!hasTankTags(project) && (
          <div className="rounded border border-amber-600 bg-amber-950/30 p-3 text-xs">
            <p className="font-semibold text-amber-300">Faltan tags de la escena</p>
            <p className="mt-1 text-slate-300">
              {setupError ?? "Revisa sus nombres y tipos en Controller Tags."}
            </p>
            <button type="button" onClick={onPrepareTags}
              className="mt-2 rounded border border-amber-600 px-3 py-1.5 text-amber-200">
              Reintentar registro
            </button>
          </div>
        )}
      </div>
      <TankSceneInfoDialog open={infoOpen} project={project}
        onClose={() => setInfoOpen(false)}
        onOpenTags={onOpenTags} onLoadExample={onLoadExample}/>
    </section>
  );
}
