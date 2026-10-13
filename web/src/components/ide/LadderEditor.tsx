import type { EditorView } from "./ControllerOrganizer";

export type Instruction = "XIC" | "XIO" | "OTE" | "OTL" | "OTU" | "TON" | "CTU";

export const INSTRUCTIONS: { id: Instruction; label: string; symbol: string }[] = [
  { id: "XIC", label: "Examine If Closed", symbol: "─| |─" },
  { id: "XIO", label: "Examine If Open", symbol: "─|/|─" },
  { id: "OTE", label: "Output Energize", symbol: "─( )─" },
  { id: "OTL", label: "Output Latch", symbol: "─(L)─" },
  { id: "OTU", label: "Output Unlatch", symbol: "─(U)─" },
  { id: "TON", label: "Timer On Delay", symbol: "TON" },
  { id: "CTU", label: "Count Up", symbol: "CTU" },
];

const tags = [
  { name: "Start_PB", type: "BOOL", value: "0", desc: "Pulsador de arranque" },
  { name: "Stop_PB", type: "BOOL", value: "0", desc: "Pulsador de parada" },
  { name: "Motor_Run", type: "BOOL", value: "0", desc: "Estado de salida del motor" },
];

function TagsTable() {
  return (
    <section className="h-full overflow-auto bg-[#17212b] p-4">
      <h2 className="text-sm font-semibold">Program Tags</h2>
      <p className="mt-1 text-xs text-slate-400">Variables de ejemplo · Edición disponible en una próxima etapa</p>
      <div className="mt-4 overflow-x-auto rounded-md border border-slate-700">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-800 text-slate-300">
            <tr><th className="p-2">Nombre</th><th className="p-2">Tipo</th><th className="p-2">Valor</th><th className="p-2">Descripción</th></tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.name} className="border-t border-slate-700/70">
                <td className="p-2 font-mono text-sky-300">{tag.name}</td>
                <td className="p-2">{tag.type}</td>
                <td className="p-2 font-mono">{tag.value}</td>
                <td className="p-2 text-slate-400">{tag.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface Props {
  view: EditorView;
  instruction: Instruction;
}

export function LadderEditor({ view, instruction }: Props) {
  if (view === "tags") return <TagsTable />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#121b24]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700/70 bg-[#1a2631] px-4 py-2">
        <div>
          <h2 className="text-xs font-semibold">MainRoutine.LAD</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">MainTask / MainProgram</p>
        </div>
        <span className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-400">VIEW ONLY</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-5">
        <div className="min-w-[590px] rounded border border-slate-700 bg-[#202d38] p-3">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Rung 000</span><span>Arranque y enclavamiento de motor · ejemplo</span>
          </div>
          <svg viewBox="0 0 1000 210" role="img" aria-label="Rung Ladder: contacto de parada normalmente cerrado, arranque con auto-retención y bobina de motor" className="mt-2 h-auto w-full text-slate-200">
            <g fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square">
              <path d="M24 18 V198 M976 18 V198 M24 91 H180 M234 91 H290 M290 91 H390 M442 91 H580 M580 91 H760 M822 91 H976" />
              <path d="M180 66 V116 M234 66 V116 M183 116 L231 66" />
              <path d="M390 66 V116 M442 66 V116" />
              <path d="M290 91 V161 H390 M442 161 H580 V91 M390 138 V184 M442 138 V184" />
              <path d="M760 64 C745 80 745 102 760 118 M822 64 C837 80 837 102 822 118" />
            </g>
            <g fontSize="20" fontFamily="ui-monospace, monospace" textAnchor="middle" fill="#93c5fd">
              <text x="207" y="51">Stop_PB</text>
              <text x="416" y="51">Start_PB</text>
              <text x="416" y="132">Motor_Run</text>
              <text x="791" y="51">Motor_Run</text>
            </g>
          </svg>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Herramienta seleccionada: <span className="font-mono font-semibold text-sky-300">{instruction}</span>.
          La inserción, evaluación del rung y edición de tags se habilitarán en los próximos incrementos.
        </p>
      </div>
      <div className="shrink-0 border-t border-slate-700 bg-[#1a2631] px-4 py-2 text-[11px] text-slate-400">
        1 rung de referencia · Sin ejecución Ladder
      </div>
    </div>
  );
}
