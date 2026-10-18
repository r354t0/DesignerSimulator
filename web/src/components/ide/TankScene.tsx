import { useState } from "react";
import { AlertTriangle, Clock3, Droplets, Info, Pause, Play, RotateCcw, ScanLine, Cog } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { TankSceneInfoDialog } from "./TankSceneInfoDialog";
import {
  hasTankTags, readTankBool, TANK_BATCH_TARGET, TANK_TIMER_PRESETS, type TankState,
} from "../../plc/tankSceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  state: TankState;
  setupError: string | null;
  onInputChange: (
    name: "PB_Start" | "PB_Stop" | "PB_Drain" | "PB_Reset", pressed: boolean
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
  const pump = running && readTankBool(project, "DO_Pump");
  const inlet = running && readTankBool(project, "DO_InletValve");
  const drain = running && readTankBool(project, "DO_DrainValve");
  const mixer = running && readTankBool(project, "DO_Mixer");
  const alarm = readTankBool(project, "ALM_ProcessTimeout");
  const auto = running && readTankBool(project, "ST_RunEnable");
  const filling = auto && readTankBool(project, "ST_Filling");
  const mixing = auto && readTankBool(project, "ST_Mixing");
  const draining = auto && readTankBool(project, "ST_Draining");
  const batch = project.tags.find(t => t.name === "CNT_Batches");
  const batches = batch?.type === "COUNTER" && typeof batch.value === "object" &&
    typeof batch.value.ACC === "number" ? batch.value.ACC : 0;
  const complete = batches >= TANK_BATCH_TARGET;
  const phase = alarm ? "ALARMA" : complete ? "LOTE FINALIZADO" :
    filling ? "LLENANDO" : mixing ? "MEZCLANDO" : draining ? "DRENANDO" :
      auto ? "PREPARANDO" : "EN ESPERA";
  const timers = Object.entries(TANK_TIMER_PRESETS).map(([name, preset]) => {
    const tag = project.tags.find(t => t.name === name);
    const value = tag?.type === "TIMER" && typeof tag.value === "object"
      ? tag.value : null;
    return { name,
      preset: typeof value?.PRE === "number" ? value.PRE : preset,
      acc: typeof value?.ACC === "number" ? value.ACC : 0,
      done: value?.DN === true };
  });
  const low = readTankBool(project, "DI_LowLevel");
  const high = readTankBool(project, "DI_HighLevel");
  const level = Math.max(0, Math.min(100, state.levelPercent));
  const waterHeight = level * 1.72;
  const waterY = 236 - waterHeight;
  const wired = hasTankTags(project);

  return (
    <section aria-label="SCADA · Llenado, mezclado y vaciado de tanques"
      className="sort-scada-shell scada-control-shell flex h-full min-h-0 flex-col overflow-y-auto text-slate-100">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <header className="sort-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#344c5e] px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#335d76] bg-[#14344a] text-sky-300">
              <Droplets size={21} aria-hidden="true"/>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-sky-300">SCADA · ESTACIÓN TK-01</div>
              <h2 className="text-sm font-bold text-slate-100">Llenado y mezclado por lotes</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className={"rounded border px-2.5 py-1.5 text-[10px] font-bold " +
              (running ? "border-emerald-800 bg-emerald-950/45 text-emerald-300" :
                mode === "paused" ? "border-amber-700 bg-amber-950/40 text-amber-300" :
                  "border-slate-600 bg-slate-800 text-slate-300")}>
              PLC · {running ? "RUN" : mode === "paused" ? "PAUSE" : "STOP"}
            </span>
            <button type="button" aria-haspopup="dialog" aria-expanded={infoOpen}
              onClick={() => setInfoOpen(true)}
              aria-label="Información de llenado de tanques"
              className="inline-flex items-center gap-1.5 rounded border border-[#456276] bg-[#1a3549] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:border-sky-400 hover:bg-[#24475f]">
              <Info size={15} aria-hidden="true"/> Objetivo y mapa E/S
            </button>
          </div>
        </header>

        <section className="sort-panel rounded-lg border border-[#344c5e] p-3"
          aria-labelledby="tank-process-title">
          <div className="mb-3 flex items-center gap-2">
            <ScanLine size={16} className="text-sky-300" aria-hidden="true"/>
            <h3 id="tank-process-title" className="text-xs font-semibold">Vista de proceso</h3>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-600 bg-[#0f1d29]"
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
              {/* Mechanical mixer M-02, driven strictly by the PLC output. */}
              <rect x="379" y="12" width="50" height="27" rx="6"
                fill={mixer ? "#25584d" : "#405569"}
                stroke={mixer ? "#34d399" : "#8fa8b9"} strokeWidth="2"/>
              <text x="404" y="30" fontSize="10" fill="#e0f2fe"
                fontWeight="700" textAnchor="middle">M-02</text>
              <path d="M404 39 V184" stroke="#98b0bf" strokeWidth="5"/>
              <g className="conveyor-motor-spin"
                style={{ transformOrigin: "404px 184px",
                  animationPlayState: mixer ? "running" : "paused" }}>
                <path d="M371 184 H437 M377 176 L431 192 M377 192 L431 176"
                  fill="none" stroke={mixer ? "#6ee7b7" : "#a9c4d6"}
                  strokeWidth="6" strokeLinecap="round"/>
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
            <button type="button" onClick={onReset} disabled={running}
              title="Disponible solo con el PLC detenido"
              className="inline-flex items-center gap-1 rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
              <RotateCcw size={13}/> Reiniciar tanque
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#344c5e] bg-[#0d1d2b] p-3">
            <span className="text-[11px] font-semibold text-slate-300">SECUENCIA</span>
            <span role="status" className={"text-xs font-bold " +
              (alarm ? "text-red-400" : complete ? "text-emerald-300" : "text-sky-300")}>{phase}</span>
            <span className="font-mono text-xs text-slate-200">
              Lotes: {batches} / {TANK_BATCH_TARGET}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["LLENADO", "MEZCLADO", "VACIADO"] as const).map((label, index) => {
              const active = [filling, mixing, draining][index];
              return (
                <div key={label} className={"rounded border px-2 py-2 text-center text-[10px] font-semibold " +
                  (active ? "border-sky-500 bg-sky-950/60 text-sky-200" :
                    "border-[#344c5e] bg-[#102130] text-slate-500")}>
                  {label}
                </div>
              );
            })}
          </div>
        </section>

        <div className="scada-dashboard-grid grid gap-3">
          <section className="sort-panel rounded-lg border border-[#344c5e] p-2.5"
            aria-label="Tablero de mando">
            <h3 className="mb-2 text-[11px] font-semibold">Tablero de mando</h3>
            <div className="scada-command-buttons grid max-w-[210px] grid-cols-2 gap-2">
              <MomentaryPushButton compact name="START" tone="start"
                pressed={readTankBool(project, "PB_Start")}
                onChange={(pressed) => onInputChange("PB_Start", pressed)}
                icon={<Play size={15} aria-hidden="true"/>}>START</MomentaryPushButton>
              <MomentaryPushButton compact name="STOP" tone="stop"
                pressed={readTankBool(project, "PB_Stop")}
                onChange={(pressed) => onInputChange("PB_Stop", pressed)}
                icon={<Pause size={15} aria-hidden="true"/>}>STOP</MomentaryPushButton>
              <MomentaryPushButton compact name="DRENAR" tone="drain"
                pressed={readTankBool(project, "PB_Drain")}
                onChange={(pressed) => onInputChange("PB_Drain", pressed)}
                icon={<Droplets size={15} aria-hidden="true"/>}>DRENAR</MomentaryPushButton>
              <MomentaryPushButton compact name="RESET" tone="drain"
                pressed={readTankBool(project, "PB_Reset")}
                onChange={(pressed) => onInputChange("PB_Reset", pressed)}
                icon={<RotateCcw size={15} aria-hidden="true"/>}>RESET</MomentaryPushButton>
            </div>
          </section>
          <section className="sort-panel min-w-0 rounded-lg border border-[#344c5e] p-3"
            aria-label="Pilotos LED y nivel">
            <h3 className="mb-2 text-xs font-semibold">Pilotos LED y nivel</h3>
            <div className="scada-pilot-grid grid grid-cols-2 gap-2">
              <Pilot label="BOMBA" active={pump} tone="green"/>
              <Pilot label="VÁLVULA ENTRADA" active={inlet} tone="blue"/>
              <Pilot label="NIVEL BAJO" active={low} tone="amber"/>
              <Pilot label="NIVEL ALTO" active={high} tone="amber"/>
              <Pilot label="VÁLVULA DRENAJE" active={drain} tone="blue"/>
              <Pilot label="AGITADOR M-02" active={mixer} tone="green"/>
              <Pilot label="ALARMA" active={alarm} tone="amber"/>
              <Pilot label="LOTE TERMINADO" active={complete} tone="green"/>
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
          </section>
        </div>

        <div className="sort-panel rounded-lg border border-[#344c5e] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
            <span className="flex items-center gap-2"><Clock3 size={15} className="text-sky-300"/> Temporizadores TON</span>
            {alarm && <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={13}/> Tiempo excedido</span>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {timers.map(timer => (
              <div key={timer.name} className="rounded-md border border-[#344c5e] bg-[#0e1c28] p-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-slate-200">{timer.name}</span>
                  <span className={timer.done ? "text-emerald-300" : "text-slate-400"}>
                    DN {timer.done ? "1" : "0"}
                  </span>
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
                  <span>ACC {timer.acc} ms</span><span>PRE {timer.preset} ms</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#0b1722]">
                  <div className="sort-progress-fill h-full bg-sky-500"
                    style={{ width: Math.min(100,
                      timer.preset > 0 ? timer.acc / timer.preset * 100 : 0) + "%" }}/>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
            <Cog size={13}/> Motor, agitador y válvulas siguen únicamente las salidas Ladder.
          </div>
        </div>

        {!wired && (
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
