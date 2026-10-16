import { useState } from "react";
import { Box, GitBranch, Info, Pause, Play, RotateCcw } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { SortSceneInfoDialog } from "./SortSceneInfoDialog";
import {
  canAddSortBox, hasSortTags, readSortBool, readSortCount,
  SORT_GATE_POSITION, SORT_SCANNER_POSITION, SORT_EXIT_SENSOR_POSITION,
  type SortBoxType, type SortState,
} from "../../plc/sortSceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  state: SortState;
  setupError: string | null;
  onInputChange: (name: "Sort_StartPB" | "Sort_StopPB", pressed: boolean) => void;
  onAddBox: (kind: SortBoxType) => void;
  onReset: () => void;
  onPrepareTags: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
}

function Pilot({ label, active, color }: { label: string; active: boolean; color: "green" | "amber" | "blue" }) {
  const lit = {
    green: "border-emerald-200 bg-emerald-400 shadow-[0_0_10px_#34d399]",
    amber: "border-amber-200 bg-amber-400 shadow-[0_0_10px_#fbbf24]",
    blue: "border-sky-200 bg-sky-400 shadow-[0_0_10px_#38bdf8]",
  };
  return (
    <div role="status" aria-label={label + ": " + (active ? "activo" : "inactivo")}
      className="flex items-center gap-2 rounded border border-slate-700 bg-[#101e2c] px-2.5 py-2">
      <span aria-hidden="true" className={"size-4 shrink-0 rounded-full border-2 " +
        (active ? lit[color] : "border-slate-600 bg-slate-800")}/>
      <span className="text-[11px] font-medium text-slate-200">{label}</span>
    </div>
  );
}

/** Top-down schematic for the branching conveyor; all box motion is simulated
 * by the pure sorting model using Sort_Motor and Sort_Divert PLC outputs. */
export function SortScene({
  project, mode, state, setupError, onInputChange, onAddBox, onReset,
  onPrepareTags, onOpenTags, onLoadExample,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const motor = mode === "running" && readSortBool(project, "Sort_Motor");
  const divert = mode === "running" && readSortBool(project, "Sort_Divert");
  const start = readSortBool(project, "Sort_StartPB");
  const stop = readSortBool(project, "Sort_StopPB");
  const detection = readSortBool(project, "Sort_TypeB");
  const validTags = hasSortTags(project);
  const xAt = (position: number) => 78 + position * 550;
  const gateX = xAt(SORT_GATE_POSITION);

  return (
    <section aria-label="SCADA · Clasificación de cajas" className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#111c27] text-slate-100">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <div className="rounded-lg border border-slate-700 bg-[#172634] px-3 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200">
              <GitBranch size={16} className="text-sky-400"/> Línea de clasificación
            </span>
            <button type="button" aria-haspopup="dialog" aria-expanded={infoOpen}
              onClick={() => setInfoOpen(true)} aria-label="Información del clasificador"
              className="inline-flex items-center gap-1.5 rounded border border-slate-600 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:border-sky-600 hover:bg-slate-700">
              <Info size={15}/> Objetivo y mapa E/S
            </button>
          </div>
          <div className="overflow-x-auto rounded border border-slate-600 bg-[#101e2b]"
            role="img" aria-label={"Clasificador con " + state.items.length +
              " cajas, desviador " + (divert ? "a línea B" : "a línea A")}>
            <svg viewBox="0 0 760 320" className="block h-auto w-full min-w-[570px]" aria-hidden="true">
              {/* Main conveyor and two real exit routes. */}
              <path d={"M78 158 H" + gateX + " L480 85 H712"}
                fill="none" stroke="#62778b" strokeWidth="54" strokeLinejoin="round" strokeLinecap="round"/>
              <path d={"M" + gateX + " 158 L480 230 H712"}
                fill="none" stroke="#62778b" strokeWidth="54" strokeLinejoin="round" strokeLinecap="round"/>
              <path d={"M78 158 H" + gateX + " L480 85 H712"}
                fill="none" stroke="#2a4053" strokeWidth="45" strokeLinejoin="round" strokeLinecap="round"/>
              <path d={"M" + gateX + " 158 L480 230 H712"}
                fill="none" stroke="#2a4053" strokeWidth="45" strokeLinejoin="round" strokeLinecap="round"/>
              {/* Animated belt centerlines freeze with MainRoutine STOP/PAUSE. */}
              <path d={"M78 158 H" + gateX + " L480 85 H712"}
                className="conveyor-belt-motion" style={{ animationPlayState: motor ? "running" : "paused" }}
                fill="none" stroke="#839bae" strokeWidth="2.5" strokeDasharray="13 13"/>
              <path d={"M" + gateX + " 158 L480 230 H712"}
                className="conveyor-belt-motion" style={{ animationPlayState: motor ? "running" : "paused" }}
                fill="none" stroke="#839bae" strokeWidth="2.5" strokeDasharray="13 13"/>
              <g fontSize="12" fontWeight="600" fill="#c9d9e7">
                <text x="18" y="127">IN</text>
                <text x="672" y="48">SALIDA A</text>
                <text x="672" y="284">SALIDA B</text>
              </g>
              {/* Box-type scanner and diverter. */}
              <g transform={"translate(" + xAt(SORT_SCANNER_POSITION) + " 0)"}>
                <rect x="-8" y="117" width="16" height="14" rx="3"
                  fill={detection ? "#fbbf24" : "#38bdf8"} stroke="#c7e8ff"/>
                <path d="M0 131 V184" stroke={detection ? "#fbbf24" : "#38bdf8"}
                  strokeWidth="2" strokeDasharray="4 4"/>
                <text x="-24" y="105" fontSize="10" fill="#a9cfec">SE-B</text>
              </g>
              <g transform={"translate(" + gateX + " 158)"}>
                <circle r="23" fill="#172635" stroke="#b1c0cc" strokeWidth="3"/>
                <path d={divert ? "M-12 0 L16 17" : "M-12 0 L16 -17"}
                  stroke={divert ? "#fbbf24" : "#34d399"} strokeWidth="6" strokeLinecap="round"/>
                <text x="-15" y="48" fontSize="10" fill="#cbd5e1">DV-01</text>
              </g>
              {/* Two independent discharge sensors and their indication. */}
              {([["A",85,state.sensorExitA],["B",230,state.sensorExitB]] as const).map(([name,y,on])=>
                <g key={name} transform={"translate(" + xAt(SORT_EXIT_SENSOR_POSITION) + " " + y + ")"}>
                  <rect x="-7" y="-37" width="14" height="13" rx="2" fill={on ? "#fbbf24" : "#38bdf8"}/>
                  <path d="M0 -24 V24" stroke={on ? "#fbbf24" : "#38bdf8"}
                    strokeDasharray="4 4" strokeWidth="2"/>
                  <text x="12" y="-25" fontSize="9" fill="#a8cbe3">SE-{name}</text>
                </g>)}
              {/* SVG boxes are top view: A sky, B amber, with route determined by PLC. */}
              {state.items.map((item) => {
                const fraction = item.route === undefined ? 0 :
                  Math.max(0, Math.min(1, (item.position - SORT_GATE_POSITION) / 0.21));
                const y = 158 + (item.route === "B" ? 72 : -73) * fraction;
                return (
                  <g key={item.id} transform={"translate(" + xAt(item.position) + " " + y + ")"}>
                    <rect x="-19" y="-19" width="38" height="38" rx="3"
                      fill={item.kind === "A" ? "#3985a6" : "#c28c43"}
                      stroke={item.kind === "A" ? "#9ce5ff" : "#ffe1a1"}
                      strokeWidth="2"/>
                    <text x="0" y="-2" fontSize="12" textAnchor="middle"
                      fontWeight="700" fill="#111827">{item.kind}</text>
                    <text x="0" y="11" fontSize="10" textAnchor="middle"
                      fill="#111827">{item.id}</text>
                  </g>
                );
              })}
              <g fontSize="11" fontWeight="600" fill={motor ? "#6ee7b7" : "#94a3b8"}>
                <text x="24" y="302">MOTOR {motor ? "RUN" : "OFF"}</text>
              </g>
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onAddBox("A")} disabled={!canAddSortBox(state)}
              className="inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-40">
              <Box size={14}/> Caja A
            </button>
            <button type="button" onClick={() => onAddBox("B")} disabled={!canAddSortBox(state)}
              className="inline-flex items-center gap-1.5 rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
              <Box size={14}/> Caja B
            </button>
            <button type="button" onClick={onReset}
              className="inline-flex items-center gap-1 rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-700">
              <RotateCcw size={13}/> Vaciar líneas
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-[#172634] p-3">
            <h3 className="mb-3 text-xs font-semibold">Tablero de mando</h3>
            <div className="flex gap-3">
              <MomentaryPushButton name="START" tone="start" pressed={start}
                onChange={(v) => onInputChange("Sort_StartPB", v)}
                icon={<Play size={18}/>}>START</MomentaryPushButton>
              <MomentaryPushButton name="STOP" tone="stop" pressed={stop}
                onChange={(v) => onInputChange("Sort_StopPB", v)}
                icon={<Pause size={18}/>}>STOP</MomentaryPushButton>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-[#172634] p-3">
            <h3 className="mb-3 text-xs font-semibold">Pilotos LED y producción</h3>
            <div className="grid grid-cols-2 gap-2">
              <Pilot label="MOTOR" active={motor} color="green"/>
              <Pilot label="DESVIADOR B" active={divert} color="amber"/>
              <Pilot label="TIPO B" active={detection} color="blue"/>
              <Pilot label="SALIDA A" active={state.sensorExitA} color="green"/>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700 pt-2 text-center text-[11px]">
              <div><span className="text-slate-400">A</span>
                <div className="font-mono text-sm font-bold text-sky-300">{readSortCount(project,"Sort_CountA") ?? "—"}</div></div>
              <div><span className="text-slate-400">B</span>
                <div className="font-mono text-sm font-bold text-amber-300">{readSortCount(project,"Sort_CountB") ?? "—"}</div></div>
              <div><span className="text-slate-400">Desvíos erróneos</span>
                <div className="font-mono text-sm font-bold text-red-300">{state.errors}</div></div>
            </div>
          </div>
        </div>
        {!validTags && (
          <div className="rounded border border-amber-600 bg-amber-950/30 p-3 text-xs">
            <p className="font-semibold text-amber-300">No están listos los tags del clasificador</p>
            <p className="mt-1 text-slate-300">{setupError ?? "Revisa sus nombres y tipos en Controller Tags."}</p>
            <button type="button" onClick={onPrepareTags}
              className="mt-2 rounded border border-amber-600 px-3 py-1.5 text-amber-200">Reintentar registro</button>
          </div>
        )}
      </div>
      <SortSceneInfoDialog open={infoOpen} project={project}
        onClose={() => setInfoOpen(false)}
        onOpenTags={onOpenTags} onLoadExample={onLoadExample}/>
    </section>
  );
}
