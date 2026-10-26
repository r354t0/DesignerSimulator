import { Activity, Settings2 } from "lucide-react";
import type { DemoInputs, DemoValues, InputTag } from "../../plc/demoModel";

interface Props {
  online: boolean;
  values: DemoValues;
  inputs: DemoInputs;
  onTagChange: (tag: InputTag, value: boolean) => void;
}

export function SimulationScene({ online, values, inputs, onTagChange }: Props) {
  const motorOn = online && values.DO_Motor;
  return (
    <section className="flex h-full min-h-0 flex-col bg-[#121b24]">
      <div className="shrink-0 border-b border-slate-700/70 bg-[#1a2631] px-4 py-2">
        <h2 className="text-xs font-semibold">Escena 01 · Arranque de motor</h2>
        <p className="mt-0.5 text-[11px] text-slate-400">Ensayo visual de rungs fijos · No es una conexión PLC</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-600/80 bg-[#1c2935] p-5 shadow-inner">
          <div className="mb-6 flex items-center justify-between text-[11px] text-slate-400">
            <span>Panel de control</span>
            <span className="flex items-center gap-1">
              <Activity size={13} /> {online ? "Monitor DEMO" : "Offline"}
            </span>
          </div>
          <div className="flex items-center justify-evenly gap-4">
            <button
              type="button"
              onClick={() => onTagChange("PB_Start", !inputs.PB_Start)}
              aria-pressed={inputs.PB_Start}
              title="Alternar PB_Start; vuelva a pulsar para liberar"
              className="flex flex-col items-center gap-2"
            >
              <span className={inputs.PB_Start
                ? "flex size-14 items-center justify-center rounded-full border-4 border-emerald-700 bg-emerald-500 text-lg font-bold text-white shadow-sm"
                : "flex size-14 items-center justify-center rounded-full border-4 border-emerald-950 bg-emerald-700/60 text-lg font-bold text-white shadow-sm"}>
                I
              </span>
              <span className="text-[11px] text-slate-300">START</span>
            </button>
            <button
              type="button"
              onClick={() => onTagChange("PB_Stop", !inputs.PB_Stop)}
              aria-pressed={inputs.PB_Stop}
              title="Alternar PB_Stop; vuelva a pulsar para liberar"
              className="flex flex-col items-center gap-2"
            >
              <span className={inputs.PB_Stop
                ? "flex size-14 items-center justify-center rounded-full border-4 border-red-600 bg-red-500 text-lg font-bold text-white shadow-sm"
                : "flex size-14 items-center justify-center rounded-full border-4 border-red-950 bg-red-700/70 text-lg font-bold text-white shadow-sm"}>
                O
              </span>
              <span className="text-[11px] text-slate-300">STOP</span>
            </button>
            <div className="flex flex-col items-center gap-2">
              <span className={motorOn
                ? "flex size-14 items-center justify-center rounded-full border border-emerald-400 bg-emerald-900 text-emerald-300"
                : "flex size-14 items-center justify-center rounded-full border border-slate-500 bg-slate-700 text-slate-300"}>
                <Settings2 size={29} />
              </span>
              <span className="text-[11px] text-slate-300">MOTOR</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between rounded bg-[#111a22] px-3 py-2 text-xs">
            <span className="text-slate-400">DO_Motor</span>
            <span className={motorOn ? "font-mono font-semibold text-emerald-400" : "font-mono text-slate-300"}>
              {motorOn ? "1 · RUN" : "0 · OFF"}
            </span>
          </div>
        </div>
        <p className="mt-4 max-w-xs text-center text-[11px] leading-relaxed text-slate-400">
          Para probar el resaltado verde, active «DEMO · REM RUN» en la barra superior y utilice START/STOP.
          Esta escena comparte los valores de prueba con el editor Ladder.
        </p>
      </div>
    </section>
  );
}
