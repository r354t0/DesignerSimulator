import { useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, Box, CircleHelp, Factory, Gauge,
  GitBranch, Pause, Play, RotateCcw, ScanLine,
} from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { SortProcessGraphic } from "./SortProcessGraphic";
import { SortSceneInfoDialog } from "./SortSceneInfoDialog";
import {
  canAddSortBox, hasSortTags, readSortBool, readSortCount, SORT_BATCH_SIZE,
  type SortBoxType, type SortState,
} from "../../plc/sortSceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  state: SortState;
  setupError: string | null;
  onInputChange: (
    name: "Sort_StartPB" | "Sort_StopPB" | "Sort_ResetPB", pressed: boolean,
  ) => void;
  onAddBox: (kind: SortBoxType) => void;
  onReset: () => void;
  onPrepareTags: () => void;
  onOpenTags: () => void;
  onLoadExample: () => void;
}

function Pilot({ label, active, color }: {
  label: string; active: boolean; color: "green" | "amber" | "blue";
}) {
  const lit = {
    green: "border-emerald-200 bg-emerald-400 shadow-[0_0_11px_#34d39988]",
    amber: "border-amber-200 bg-amber-400 shadow-[0_0_11px_#fbbf2488]",
    blue: "border-sky-200 bg-sky-400 shadow-[0_0_11px_#38bdf888]",
  };
  return (
    <div role="status" aria-label={label + ": " + (active ? "activo" : "inactivo")}
      className="flex min-w-0 items-center gap-2.5 rounded-md border border-[#314658] bg-[#0e1c28] px-3 py-2.5">
      <span aria-hidden="true" className={"inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[#475e70] bg-[#1a2f40]"}>
        <span className={"size-3.5 rounded-full border " +
          (active ? lit[color] : "border-[#405466] bg-[#253747]")}/>
      </span>
      <span className="min-w-0 text-[10px] font-semibold tracking-wide text-slate-200">
        {label}
      </span>
    </div>
  );
}

function Metric({ label, value, unit, tone = "neutral", icon }: {
  label: string; value: number | string; unit?: string;
  tone?: "neutral" | "blue" | "amber" | "red" | "green";
  icon: ReactNode;
}) {
  const colors = {
    neutral: "text-slate-100",
    blue: "text-sky-300",
    amber: "text-amber-300",
    red: "text-rose-300",
    green: "text-emerald-300",
  };
  return (
    <div className="sort-kpi flex min-w-0 flex-col justify-between gap-2 rounded-lg border border-[#314557] bg-[#142532] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[.09em] text-slate-400">
          {label}
        </span>
        <span className="shrink-0 text-[#7c9db1]" aria-hidden="true">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={"font-mono text-[23px] font-bold leading-none tabular-nums " + colors[tone]}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

/** PLC-controlled SCADA. No simulation state or process commands are faked by the UI. */
export function SortScene({
  project, mode, state, setupError, onInputChange, onAddBox, onReset,
  onPrepareTags, onOpenTags, onLoadExample,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const running = mode === "running";
  const motor = running && readSortBool(project, "Sort_Motor");
  const divert = running && readSortBool(project, "Sort_Divert");
  const start = readSortBool(project, "Sort_StartPB");
  const stop = readSortBool(project, "Sort_StopPB");
  const detection = readSortBool(project, "Sort_TypeB");
  const resetAvailable = project.tags.some(
    tag => tag.name === "Sort_ResetPB" && tag.type === "BOOL");
  const reset = resetAvailable && readSortBool(project, "Sort_ResetPB");
  const lotComplete = resetAvailable && project.tags.some(tag =>
    tag.name === "Sort_CountTotal" && tag.type === "COUNTER" &&
    typeof tag.value === "object" && tag.value.DN === true);
  const validTags = hasSortTags(project);

  const countA = readSortCount(project, "Sort_CountA");
  const countB = readSortCount(project, "Sort_CountB");
  const countTotal = resetAvailable ? readSortCount(project, "Sort_CountTotal") : null;
  const batches = resetAvailable ? readSortCount(project, "Sort_Batches") : null;
  const configuredPreset = project.tags.find(tag => tag.name === "Sort_CountTotal");
  const batchTarget = configuredPreset?.type === "COUNTER" &&
    typeof configuredPreset.value === "object" &&
    typeof configuredPreset.value.PRE === "number" &&
    configuredPreset.value.PRE > 0 ? configuredPreset.value.PRE : SORT_BATCH_SIZE;
  const progress = countTotal === null ? 0
    : Math.max(0, Math.min(100, countTotal / batchTarget * 100));

  const plcLabel = mode === "running" ? "PLC · RUN"
    : mode === "paused" ? "PLC · PAUSE" : "PLC · STOP";
  const processLabel = lotComplete && state.lineClear ? "LOTE TERMINADO"
    : motor && state.items.length ? "CLASIFICANDO"
    : motor ? "EN MARCHA" : "DETENIDA";
  const canFeed = canAddSortBox(state);

  return (
    <section aria-label="SCADA · Clasificación de cajas"
      className="sort-scada-shell flex h-full min-h-0 flex-col overflow-y-auto text-slate-100">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        {/* Process header: compact, real status only. */}
        <header className="sort-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#344c5e] px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#335d76] bg-[#14344a] text-sky-300">
              <Factory size={21} aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-sky-300">
                SCADA · ESTACIÓN CL-02
              </div>
              <h2 className="truncate text-sm font-bold tracking-tight text-slate-100">
                Clasificación de cajas
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
            <span className={"rounded border px-2.5 py-1.5 text-[10px] font-semibold tracking-wide " +
              (motor ? "border-[#356b66] bg-[#173d3b] text-emerald-300" :
                "border-[#425565] bg-[#202f3e] text-slate-300")}>
              {processLabel}
            </span>
            <button type="button" aria-haspopup="dialog" aria-expanded={infoOpen}
              onClick={() => setInfoOpen(true)} aria-label="Información del clasificador"
              title="Objetivo del ejercicio y mapa de entradas/salidas"
              className="inline-flex items-center gap-1.5 rounded border border-[#456276] bg-[#1a3549] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:border-sky-400 hover:bg-[#24475f] focus-visible:outline-2 focus-visible:outline-sky-400">
              <CircleHelp size={14} aria-hidden="true"/> Objetivo y mapa E/S
            </button>
          </div>
        </header>

        {/* Numeric KPIs read exclusively from PLC COUNTER tags and physical errors. */}
        <div className="grid gap-2" style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
        }}>
          <Metric label="Salida A" value={countA ?? "—"} unit="cajas" tone="blue"
            icon={<Box size={16}/>}/>
          <Metric label="Salida B" value={countB ?? "—"} unit="cajas" tone="amber"
            icon={<Box size={16}/>}/>
          {resetAvailable && (
            <>
              <Metric label="Total del lote" value={countTotal ?? "—"}
                unit={"/ " + batchTarget} tone="blue" icon={<Gauge size={16}/>}/>
              <Metric label="Lotes terminados" value={batches ?? "—"}
                tone="green" icon={<GitBranch size={16}/>}/>
            </>
          )}
          <Metric label="Desvíos erróneos" value={state.errors}
            tone={state.errors > 0 ? "red" : "neutral"}
            icon={<AlertTriangle size={16}/>}/>
        </div>

        {/* Wide process graphic remains the focal point, with a real flow diagram. */}
        <section className="sort-panel rounded-lg border border-[#344c5e] p-3"
          aria-labelledby="sort-process-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ScanLine size={16} className="text-sky-300" aria-hidden="true"/>
              <h3 id="sort-process-title" className="text-xs font-semibold text-slate-100">
                Vista de proceso
              </h3>
              <span className="rounded bg-[#213c50] px-2 py-0.5 font-mono text-[10px] text-slate-300">
                TRANSPORTADOR · DV-01
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className={"size-2 rounded-full " +
                (motor ? "bg-emerald-400" : "bg-slate-500")}/>
              Motor {motor ? "activado" : "detenido"}
            </span>
          </div>
          <SortProcessGraphic state={state} motor={motor}
            divert={divert} detection={detection}/>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400"
              aria-label="Leyenda de tipos de caja">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-sky-400"/> Caja A
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-amber-400"/> Caja B
              </span>
              <span className="text-slate-500">En tránsito: {state.items.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onAddBox("A")} disabled={!canFeed}
                title={!canFeed ? "Entrada ocupada; espera a que avance la caja anterior" : "Generar caja tipo A"}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/60 bg-sky-900/65 px-3 py-2 text-xs font-bold text-sky-100 transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-400">
                <Box size={14} aria-hidden="true"/> Caja A <ArrowRight size={12} aria-hidden="true"/>
              </button>
              <button type="button" onClick={() => onAddBox("B")} disabled={!canFeed}
                title={!canFeed ? "Entrada ocupada; espera a que avance la caja anterior" : "Generar caja tipo B"}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-600/65 bg-amber-900/65 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-400">
                <Box size={14} aria-hidden="true"/> Caja B <ArrowRight size={12} aria-hidden="true"/>
              </button>
              <button type="button" onClick={onReset}
                title="Vaciar líneas simuladas y reiniciar el estado físico; no reinicia los contadores PLC"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#435b6e] bg-[#223748] px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400">
                <RotateCcw size={13} aria-hidden="true"/> Vaciar líneas
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-3" style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 290px), 1fr))",
        }}>
          <section className="sort-panel rounded-lg border border-[#344c5e] p-3"
            aria-labelledby="sort-control-title">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="sort-control-title" className="text-xs font-semibold">Tablero de mando</h3>
              <span className="text-[10px] text-slate-400">Pulsadores momentáneos</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <MomentaryPushButton name="START" tone="start" pressed={start}
                onChange={(v) => onInputChange("Sort_StartPB", v)}
                icon={<Play size={18} aria-hidden="true"/>}>START</MomentaryPushButton>
              <MomentaryPushButton name="STOP" tone="stop" pressed={stop}
                onChange={(v) => onInputChange("Sort_StopPB", v)}
                icon={<Pause size={18} aria-hidden="true"/>}>STOP</MomentaryPushButton>
              {resetAvailable && (
                <MomentaryPushButton name="RESET LOTE" tone="drain" pressed={reset}
                  onChange={(v) => onInputChange("Sort_ResetPB", v)}
                  icon={<RotateCcw size={18} aria-hidden="true"/>}>RESET</MomentaryPushButton>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#334a5e] pt-2.5 text-[10px]">
              <span className="text-slate-400">ESTADO DEL ACCIONAMIENTO</span>
              <span className={motor ? "font-bold text-emerald-300" : "font-bold text-slate-300"}>
                M-01 {motor ? "MARCHA" : "PARADO"}
              </span>
            </div>
          </section>
          <section className="sort-panel rounded-lg border border-[#344c5e] p-3"
            aria-labelledby="sort-signals-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 id="sort-signals-title" className="text-xs font-semibold">
                Pilotos LED y producción
              </h3>
              <span className="font-mono text-[10px] text-slate-400">ESTADOS EN VIVO</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Pilot label="MOTOR" active={motor} color="green"/>
              <Pilot label="DESVIADOR B" active={divert} color="amber"/>
              <Pilot label="TIPO B" active={detection} color="blue"/>
              <Pilot label="SALIDA A" active={state.sensorExitA} color="green"/>
              <Pilot label="SALIDA B" active={state.sensorExitB} color="amber"/>
              {resetAvailable && (
                <>
                  <Pilot label="LOTE COMPLETO" active={lotComplete} color="amber"/>
                  <Pilot label="LÍNEAS LIBRES" active={state.lineClear} color="green"/>
                </>
              )}
            </div>
            {resetAvailable && (
              <div className="mt-3 border-t border-[#334a5e] pt-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Progreso del lote
                  </span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-sky-300">
                    {readSortCount(project, "Sort_CountTotal") ?? "—"} / {batchTarget}
                  </span>
                </div>
                <div role="progressbar" aria-label="Cajas del lote" aria-valuemin={0}
                  aria-valuemax={batchTarget} aria-valuenow={Math.min(batchTarget, countTotal ?? 0)}
                  className="h-2 overflow-hidden rounded-full bg-[#0d1e2c]">
                  <div className="sort-progress-fill h-full rounded-full bg-sky-500"
                    style={{ width: progress + "%" }}/>
                </div>
                <div className="mt-2 text-[10px] text-slate-400">
                  Lotes terminados: <span className="font-mono font-semibold text-emerald-300">
                    {readSortCount(project, "Sort_Batches") ?? "—"}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        {!validTags && (
          <div role="alert" className="rounded-md border border-amber-600/70 bg-amber-950/35 p-3 text-xs">
            <p className="font-semibold text-amber-300">No están listos los tags del clasificador</p>
            <p className="mt-1 text-slate-300">
              {setupError ?? "Revisa sus nombres y tipos en Controller Tags."}
            </p>
            <button type="button" onClick={onPrepareTags}
              className="mt-2 rounded border border-amber-600 px-3 py-1.5 font-semibold text-amber-200 hover:bg-amber-900/40">
              Reintentar registro
            </button>
          </div>
        )}
      </div>
      <SortSceneInfoDialog open={infoOpen} project={project}
        onClose={() => setInfoOpen(false)}
        onOpenTags={onOpenTags} onLoadExample={onLoadExample}/>
    </section>
  );
}
