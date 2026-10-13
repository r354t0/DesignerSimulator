import { useState } from "react";
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
  const [selectedRung, setSelectedRung] = useState<number | null>(null);
  const toggleRung = (index: number) => setSelectedRung((current) => current === index ? null : index);
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
        <div className="min-w-[680px] bg-white">
          <svg
            viewBox="0 0 712 344"
            role="group"
            aria-label="Tres rungs Ladder compactos. Selecciona un rung para resaltarlo en azul."
            className="block h-auto w-full max-w-[760px]"
          >
            <rect x="0" y="0" width="712" height="344" fill="#ffffff" />
            <rect x="1" y="23" width="48" height="305" fill="#f4f7fa" />
            <path
              d="M60 25V323 M690 25V323"
              stroke={online ? "#00c83a" : "#bcc5ce"}
              strokeWidth={online ? 3.5 : 1.6}
              fill="none"
            />
            <path d="M49 151H700 M49 242H700" stroke="#e5e9ed" strokeWidth="1" />

            <RungFrame index={0} y={82} selected={selectedRung === 0} onSelect={() => toggleRung(0)} live={online}>
              <Wire x1={100} y1={82} x2={138} y2={82} live={online} />
              <Contact x={160} y={82} kind="XIO" tag="Stop_PB" comment="Parada simulada" value={values.Stop_PB} online={online} powerIn />
              <Wire x1={182} y1={82} x2={244} y2={82} live={live(stopCondition)} />
              <Wire x1={244} y1={82} x2={296} y2={82} live={live(stopCondition)} />
              <Wire x1={244} y1={82} x2={244} y2={125} live={live(stopCondition)} />
              <Wire x1={244} y1={125} x2={296} y2={125} live={live(stopCondition)} />
              <Contact x={318} y={82} kind="XIC" tag="Start_PB" comment="Arranque" value={values.Start_PB} online={online} powerIn={stopCondition} />
              <Contact x={318} y={125} kind="XIC" tag="Motor_Run" value={values.Motor_Run} online={online} powerIn={stopCondition} />
              <Wire x1={340} y1={82} x2={412} y2={82} live={live(stopCondition && startCondition)} />
              <Wire x1={340} y1={125} x2={412} y2={125} live={live(stopCondition && sealCondition)} />
              <Wire x1={412} y1={125} x2={412} y2={82} live={live(stopCondition && sealCondition)} />
              <Wire x1={412} y1={82} x2={591} y2={82} live={live(mainRung)} />
              <Coil x={615} y={82} tag="Motor_Run" comment="Marcha del motor" online={online} live={values.Motor_Run} />
              <Wire x1={639} y1={82} x2={690} y2={82} live={live(values.Motor_Run)} />
            </RungFrame>

            <RungFrame index={1} y={197} selected={selectedRung === 1} onSelect={() => toggleRung(1)} live={online}>
              <Wire x1={100} y1={197} x2={138} y2={197} live={online} />
              <Contact x={160} y={197} kind="XIO" tag="Stop_PB" comment="Parada libre" value={values.Stop_PB} online={online} powerIn />
              <Wire x1={182} y1={197} x2={591} y2={197} live={live(stopCondition)} />
              <Coil x={615} y={197} tag="Stop_OK" comment="Permisivo" online={online} live={values.Stop_OK} />
              <Wire x1={639} y1={197} x2={690} y2={197} live={live(values.Stop_OK)} />
            </RungFrame>

            <RungFrame index={2} y={291} selected={selectedRung === 2} onSelect={() => toggleRung(2)} live={online}>
              <Wire x1={100} y1={291} x2={138} y2={291} live={online} />
              <Contact x={160} y={291} kind="XIC" tag="Motor_Run" comment="Marcha" value={values.Motor_Run} online={online} powerIn />
              <Wire x1={182} y1={291} x2={296} y2={291} live={live(values.Motor_Run)} />
              <Contact x={318} y={291} kind="XIC" tag="Auto_Mode" comment="Automático" value={values.Auto_Mode} online={online} powerIn={values.Motor_Run} />
              <Wire x1={340} y1={291} x2={591} y2={291} live={live(lampRung)} />
              <Coil x={615} y={291} tag="Lamp_Run" comment="Indicador de marcha" online={online} live={values.Lamp_Run} />
              <Wire x1={639} y1={291} x2={690} y2={291} live={live(values.Lamp_Run)} />
            </RungFrame>
          </svg>
        </div>
        <p className="px-4 pb-4 pt-2 text-xs text-slate-500">
          Vista compacta de prueba: geometría de los símbolos al 50 %, rungs más próximos y ninguna fila seleccionada inicialmente.
          Haz clic en el número o en cualquier parte del rung para seleccionarlo; un segundo clic lo deselecciona.
        </p>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-slate-200 bg-[#f2f5f8] px-4 text-[11px] text-slate-600">
        <span>Rung 0–2 · Diseño compacto (50 %)</span>
        <span>{online ? "Evaluación visual activa" : "Sin resaltado online"}</span>
      </div>
    </div>
  );
}
