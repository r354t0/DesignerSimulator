import { Contact, Coil, RungFrame, Wire } from "./LadderSymbols";
import {
  demoTagMetadata,
  type DemoInputs,
  type DemoValues,
  type InputTag,
} from "../../plc/demoModel";

interface MonitorProps {
  online: boolean;
  values: DemoValues;
  inputs: DemoInputs;
  onTagChange: (tag: InputTag, value: boolean) => void;
}

export function ProgramTags({ online, values, inputs, onTagChange }: MonitorProps) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-800">
      <div className="border-b border-slate-200 bg-[#f7f9fb] px-4 py-3">
        <h2 className="text-sm font-semibold">Program Tags</h2>
        <p className="mt-1 text-xs text-slate-500">
          Variables del ejemplo · Los BOOL de entrada se pueden modificar para probar la visualización.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <table className="w-full min-w-[590px] border-collapse border border-slate-200 text-left text-xs">
          <thead className="bg-[#edf1f5] text-slate-600">
            <tr>
              <th className="border border-slate-200 px-3 py-2">Nombre</th>
              <th className="border border-slate-200 px-3 py-2">Tipo</th>
              <th className="border border-slate-200 px-3 py-2">Valor</th>
              <th className="border border-slate-200 px-3 py-2">Acceso</th>
              <th className="border border-slate-200 px-3 py-2">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {demoTagMetadata.map((tag) => (
              <tr key={tag.name} className="hover:bg-sky-50/60">
                <td className="border border-slate-200 px-3 py-2 font-mono font-medium text-slate-800">{tag.name}</td>
                <td className="border border-slate-200 px-3 py-2">{tag.type}</td>
                <td className="border border-slate-200 px-3 py-2 font-mono">
                  {tag.access === "input" ? (
                    <button
                      type="button"
                      aria-label={"Cambiar " + tag.name}
                      aria-pressed={inputs[tag.name as InputTag]}
                      onClick={() => onTagChange(tag.name as InputTag, !inputs[tag.name as InputTag])}
                      className="min-w-12 rounded border border-sky-300 bg-sky-50 px-2 py-1 font-semibold text-sky-800 hover:bg-sky-100"
                    >
                      {values[tag.name] ? "1" : "0"} ↺
                    </button>
                  ) : (
                    <span className={online && values[tag.name] ? "font-semibold text-emerald-700" : "text-slate-600"}>
                      {values[tag.name] ? "1" : "0"}
                    </span>
                  )}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-slate-500">{tag.access === "input" ? "Demo input" : "Calculado"}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-500">{tag.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Valores de prueba en memoria. No existe conexión con Studio 5000 ni con un PLC físico.
        </p>
      </div>
    </section>
  );
}

export function LadderEditor({ online, inputs, values, onTagChange }: MonitorProps) {
  const stopCondition = !values.Stop_PB;
  const startCondition = values.Start_PB;
  const sealCondition = values.Motor_Run;
  const mainRung = stopCondition && (startCondition || sealCondition);
  const lampRung = values.Motor_Run && values.Auto_Mode;
  const live = (condition: boolean) => online && condition;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-800">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-[#f4f6f8] px-4 py-2">
        <div>
          <h2 className="text-xs font-semibold text-slate-900">MainRoutine.LAD</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">MainTask / MainProgram · Monitoreo de ejemplo</p>
        </div>
        <span className={online ? "rounded border border-green-300 bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-800" : "rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-500"}>
          {online ? "ONLINE · DEMO RUN" : "OFFLINE"}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-[#f7f9fb] px-3 py-2 text-[11px]">
        <span className="mr-1 font-semibold text-slate-600">Monitor de entradas</span>
        {(["Start_PB", "Stop_PB", "Auto_Mode"] as InputTag[]).map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={inputs[tag]}
            title={"Alternar bit " + tag}
            onClick={() => onTagChange(tag, !inputs[tag])}
            className={inputs[tag]
              ? "rounded border border-sky-300 bg-sky-100 px-2 py-1 font-mono font-medium text-sky-800 hover:bg-sky-200"
              : "rounded border border-slate-300 bg-white px-2 py-1 font-mono text-slate-700 hover:bg-slate-100"}
          >
            {tag}: {inputs[tag] ? "1" : "0"}
          </button>
        ))}
        <span className="ml-auto text-slate-500">Verde = instrucción verdadera / continuidad activa</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <div className="min-w-[820px] bg-white">
          <svg viewBox="0 0 1180 585" role="img" aria-label="Tres rungs Ladder con contactos XIC y XIO y bobinas OTE, con resaltado verde en modo online" className="block h-auto w-full">
            <rect x="0" y="0" width="1180" height="585" fill="#ffffff" />
            <rect x="1" y="24" width="53" height="530" fill="#f4f7fa" />
            <path d="M61 31V550 M1153 31V550" stroke={online ? "#00c83a" : "#bcc5ce"} strokeWidth={online ? 2.8 : 1.6} fill="none" />
            <path d="M54 241H1159 M54 404H1159" stroke="#e5e9ed" strokeWidth="1" />
            <RungFrame index={0} y={92} selected live={online}>
              <Wire x1={92} y1={92} x2={216} y2={92} live={online} />
              <Contact x={260} y={92} kind="XIO" tag="Stop_PB" comment="Parada simulada" value={values.Stop_PB} online={online} powerIn />
              <Wire x1={304} y1={92} x2={442} y2={92} live={live(stopCondition)} />
              <Wire x1={442} y1={92} x2={566} y2={92} live={live(stopCondition)} />
              <Wire x1={442} y1={92} x2={442} y2={174} live={live(stopCondition)} />
              <Wire x1={442} y1={174} x2={566} y2={174} live={live(stopCondition)} />
              <Contact x={610} y={92} kind="XIC" tag="Start_PB" comment="Arranque" value={values.Start_PB} online={online} powerIn={stopCondition} />
              <Contact x={610} y={174} kind="XIC" tag="Motor_Run" value={values.Motor_Run} online={online} powerIn={stopCondition} />
              <Wire x1={654} y1={92} x2={760} y2={92} live={live(stopCondition && startCondition)} />
              <Wire x1={654} y1={174} x2={760} y2={174} live={live(stopCondition && sealCondition)} />
              <Wire x1={760} y1={174} x2={760} y2={92} live={live(stopCondition && sealCondition)} />
              <Wire x1={760} y1={92} x2={962} y2={92} live={live(mainRung)} />
              <Coil x={1010} y={92} tag="Motor_Run" comment="Marcha del motor" online={online} live={values.Motor_Run} />
              <Wire x1={1058} y1={92} x2={1153} y2={92} live={live(values.Motor_Run)} />
            </RungFrame>
            <RungFrame index={1} y={309} live={online}>
              <Wire x1={92} y1={309} x2={216} y2={309} live={online} />
              <Contact x={260} y={309} kind="XIO" tag="Stop_PB" comment="Parada libre" value={values.Stop_PB} online={online} powerIn />
              <Wire x1={304} y1={309} x2={962} y2={309} live={live(stopCondition)} />
              <Coil x={1010} y={309} tag="Stop_OK" comment="Permisivo" online={online} live={values.Stop_OK} />
              <Wire x1={1058} y1={309} x2={1153} y2={309} live={live(values.Stop_OK)} />
            </RungFrame>
            <RungFrame index={2} y={479} live={online}>
              <Wire x1={92} y1={479} x2={216} y2={479} live={online} />
              <Contact x={260} y={479} kind="XIC" tag="Motor_Run" comment="Marcha" value={values.Motor_Run} online={online} powerIn />
              <Wire x1={304} y1={479} x2={566} y2={479} live={live(values.Motor_Run)} />
              <Contact x={610} y={479} kind="XIC" tag="Auto_Mode" comment="Automático" value={values.Auto_Mode} online={online} powerIn={values.Motor_Run} />
              <Wire x1={654} y1={479} x2={962} y2={479} live={live(lampRung)} />
              <Coil x={1010} y={479} tag="Lamp_Run" comment="Indicador de marcha" online={online} live={values.Lamp_Run} />
              <Wire x1={1058} y1={479} x2={1153} y2={479} live={live(values.Lamp_Run)} />
            </RungFrame>
          </svg>
        </div>
        <p className="px-4 pb-4 text-xs text-slate-500">
          Vista de referencia: en XIC el bit 1 es TRUE; en XIO el bit 0 es TRUE. La posición de los símbolos nunca cambia.
          El motor de programación PLC completo se implementará en una fase posterior.
        </p>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-slate-200 bg-[#f2f5f8] px-4 text-[11px] text-slate-600">
        <span>Rung 0–2 · Monitoreo demostrativo</span>
        <span>{online ? "Evaluación visual activa" : "Sin resaltado online"}</span>
      </div>
    </div>
  );
}
