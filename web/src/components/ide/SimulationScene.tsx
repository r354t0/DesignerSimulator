import { Activity, Settings2 } from "lucide-react";

export function SimulationScene() {
  return (
    <section className="flex h-full min-h-0 flex-col bg-[#121b24]">
      <div className="shrink-0 border-b border-slate-700/70 bg-[#1a2631] px-4 py-2">
        <h2 className="text-xs font-semibold">Escena 01 · Arranque de motor</h2>
        <p className="mt-0.5 text-[11px] text-slate-400">Representación gráfica · Sin conexión al motor PLC</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-600/80 bg-[#1c2935] p-5 shadow-inner">
          <div className="mb-6 flex items-center justify-between text-[11px] text-slate-400">
            <span>Panel de control</span><span className="flex items-center gap-1"><Activity size={13} /> Sin ejecución</span>
          </div>
          <div className="flex items-center justify-evenly gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="flex size-14 items-center justify-center rounded-full border-4 border-emerald-900 bg-emerald-700/60 text-lg font-bold shadow-sm">I</span>
              <span className="text-[11px] text-slate-300">START</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="flex size-14 items-center justify-center rounded-full border-4 border-red-950 bg-red-700/70 text-lg font-bold shadow-sm">O</span>
              <span className="text-[11px] text-slate-300">STOP</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="flex size-14 items-center justify-center rounded-full border border-slate-500 bg-slate-700 text-slate-300">
                <Settings2 size={29} />
              </span>
              <span className="text-[11px] text-slate-300">MOTOR</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between rounded bg-[#111a22] px-3 py-2 text-xs">
            <span className="text-slate-400">Motor_Run</span>
            <span className="font-mono text-slate-300">0 · OFF</span>
          </div>
        </div>
        <p className="mt-4 max-w-xs text-center text-[11px] leading-relaxed text-slate-400">
          Escena ilustrativa. Los pulsadores y el motor funcionarán cuando incorporemos el motor de ejecución PLC.
        </p>
      </div>
    </section>
  );
}
