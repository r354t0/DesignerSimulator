import { useEffect, useRef, useState } from "react";
import { Contact, Coil, RungFrame, Wire } from "./LadderSymbols";
import { PREVIEW_BLOCKS, PREVIEW_BLOCK_WIDTH, LadderFunctionBlock } from "./LadderFunctionBlocks";
import type { DemoBlockRuntime } from "../../plc/timerCounterDemo";
import type { PracticeTag } from "../../plc/practiceDocument";
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
  blocks: DemoBlockRuntime;
  onTagChange: (tag: InputTag, value: boolean) => void;
  onResetCounters: () => void;
  practiceTags?: PracticeTag[];
}

export function ProgramTags({ online, values, inputs, blocks, onTagChange, onResetCounters, practiceTags = [] }: MonitorProps) {
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
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-slate-700">Tags de PracticeRoutine (solo edición, sin ejecución)</h3>
          <div className="mt-2 overflow-x-auto rounded border border-slate-200">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead className="bg-[#edf1f5] text-slate-600">
                <tr><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Descripción</th></tr>
              </thead>
              <tbody>
                {practiceTags.map((tag) => (
                  <tr key={tag.name} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-mono">{tag.name}</td>
                    <td className="px-3 py-2">BOOL</td>
                    <td className="px-3 py-2 text-slate-500">{tag.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-700">Instancias de temporizadores y contadores (demo)</h3>
          <button type="button" onClick={onResetCounters}
            className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">
            Reset CTU / Precargar CTD
          </button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[550px] border-collapse border border-slate-200 text-left text-xs">
            <thead className="bg-[#edf1f5] text-slate-600">
              <tr><th className="border border-slate-200 px-2 py-2">Instancia</th><th className="border border-slate-200 px-2 py-2">PRE (ms / pulsos)</th><th className="border border-slate-200 px-2 py-2">ACC</th><th className="border border-slate-200 px-2 py-2">EN/CU/CD</th><th className="border border-slate-200 px-2 py-2">TT</th><th className="border border-slate-200 px-2 py-2">DN</th></tr>
            </thead>
            <tbody>
              {PREVIEW_BLOCKS.map((block) => {
                const state = blocks[block.kind];
                return (
                  <tr key={block.kind}>
                    <td className="border border-slate-200 px-2 py-2 font-mono">{block.tag}</td>
                    <td className="border border-slate-200 px-2 py-2">{state.pre}{state.offPre > 0 ? ` / ${state.offPre}` : ""}</td>
                    <td className="border border-slate-200 px-2 py-2 font-mono">{Math.round(state.acc)}</td>
                    <td className="border border-slate-200 px-2 py-2">{Number(state.en || state.cu || state.cd)}</td>
                    <td className="border border-slate-200 px-2 py-2">{Number(state.tt)}</td>
                    <td className={"border border-slate-200 px-2 py-2 " + (online && state.dn ? "font-bold text-emerald-700" : "")}>{Number(state.dn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Simulación local, no conectada a un PLC. El CTD se precarga explícitamente con ACC=PRE=8;
          su bit DN sigue la comparación ACC ≥ PRE, como en Logix. TONOFF es una instrucción personalizada.
        </p>
      </div>
    </section>
  );
}

export function LadderEditor({ online, inputs, values, blocks, onTagChange, onResetCounters }: MonitorProps) {
  const [selectedRung, setSelectedRung] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [diagramWidth, setDiagramWidth] = useState(712);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // FlexLayout changes panel size when a tab is dragged, docked or maximized.
    // Recompute the SVG coordinate space instead of scaling the symbols/text.
    const updateWidth = () => {
      setDiagramWidth(Math.max(712, Math.floor(viewport.clientWidth)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Left-side contacts remain compact; the coil and right rail track panel width.
  const rightRailX = diagramWidth - 22;
  const coilX = diagramWidth - 97;
  const blockX = rightRailX - PREVIEW_BLOCK_WIDTH - 12;
  // The OR branch keeps its full vertical height; reduce only the whitespace after each rung.
  // Blocks retain enough room for their labels, PRE/ACC fields, and status indicators.
  const diagramHeight = 1030;

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
        <button
          type="button"
          onClick={onResetCounters}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100"
          title="Reiniciar CTU a 0 y recargar CTD desde PRE (demo)"
        >
          Reset contadores
        </button>
        <span className="ml-auto text-slate-500">Verde = instrucción verdadera / continuidad activa</span>
      </div>
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto bg-white">
        <div className="bg-white" style={{ width: diagramWidth }}>
          <svg
            viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
            width={diagramWidth}
            height={diagramHeight}
            role="group"
            aria-label="Ocho rungs Ladder compactos, incluyendo temporizadores y contadores de demostración."
            className="block"
          >
            <rect x="0" y="0" width={diagramWidth} height={diagramHeight} fill="#ffffff" />
            <rect x="1" y="23" width="48" height={diagramHeight - 46} fill="#f4f7fa" />
            <path
              d={"M60 25V1005 M" + rightRailX + " 25V1005"}
              stroke={online ? "#00c83a" : "#bcc5ce"}
              strokeWidth={online ? 2.625 : 1.6}
              fill="none"
            />
            {[184, 270, 370, 501, 627, 753, 879].map((separatorY) => (
              <path
                key={separatorY}
                d={`M49 ${separatorY}H${diagramWidth - 12}`}
                stroke="#e5e9ed"
                strokeWidth="1"
              />
            ))}

            <RungFrame index={0} y={82} selected={selectedRung === 0} onSelect={() => toggleRung(0)} width={diagramWidth} live={online}>
              <Wire x1={100} y1={82} x2={138} y2={82} live={online} />
              <Contact x={160} y={82} kind="XIO" tag="Stop_PB" comment="Parada simulada" value={values.Stop_PB} online={online} powerIn />
              <Wire x1={182} y1={82} x2={244} y2={82} live={live(stopCondition)} />
              <Wire x1={244} y1={82} x2={296} y2={82} live={live(stopCondition)} />
              <Wire x1={244} y1={82} x2={244} y2={168} live={live(stopCondition)} />
              <Wire x1={244} y1={168} x2={296} y2={168} live={live(stopCondition)} />
              <Contact x={318} y={82} kind="XIC" tag="Start_PB" comment="Arranque" value={values.Start_PB} online={online} powerIn={stopCondition} />
              <Contact x={318} y={168} kind="XIC" tag="Motor_Run" comment="Enclavamiento" value={values.Motor_Run} online={online} powerIn={stopCondition} />
              <Wire x1={340} y1={82} x2={412} y2={82} live={live(stopCondition && startCondition)} />
              <Wire x1={340} y1={168} x2={412} y2={168} live={live(stopCondition && sealCondition)} />
              <Wire x1={412} y1={168} x2={412} y2={82} live={live(stopCondition && sealCondition)} />
              <Wire x1={412} y1={82} x2={coilX - 24} y2={82} live={live(mainRung)} />
              <Coil x={coilX} y={82} tag="Motor_Run" comment="Marcha del motor" online={online} live={values.Motor_Run} />
              <Wire x1={coilX + 24} y1={82} x2={rightRailX} y2={82} live={live(values.Motor_Run)} />
            </RungFrame>

            <RungFrame index={1} y={232} selected={selectedRung === 1} onSelect={() => toggleRung(1)} width={diagramWidth} live={online}>
              <Wire x1={100} y1={232} x2={138} y2={232} live={online} />
              <Contact x={160} y={232} kind="XIO" tag="Stop_PB" comment="Parada libre" value={values.Stop_PB} online={online} powerIn />
              <Wire x1={182} y1={232} x2={coilX - 24} y2={232} live={live(stopCondition)} />
              <Coil x={coilX} y={232} tag="Stop_OK" comment="Permisivo" online={online} live={values.Stop_OK} />
              <Wire x1={coilX + 24} y1={232} x2={rightRailX} y2={232} live={live(values.Stop_OK)} />
            </RungFrame>

            <RungFrame index={2} y={318} selected={selectedRung === 2} onSelect={() => toggleRung(2)} width={diagramWidth} live={online}>
              <Wire x1={100} y1={318} x2={138} y2={318} live={online} />
              <Contact x={160} y={318} kind="XIC" tag="Motor_Run" comment="Marcha" value={values.Motor_Run} online={online} powerIn />
              <Wire x1={182} y1={318} x2={296} y2={318} live={live(values.Motor_Run)} />
              <Contact x={318} y={318} kind="XIC" tag="Auto_Mode" comment="Automático" value={values.Auto_Mode} online={online} powerIn={values.Motor_Run} />
              <Wire x1={340} y1={318} x2={coilX - 24} y2={318} live={live(lampRung)} />
              <Coil x={coilX} y={318} tag="Lamp_Run" comment="Indicador de marcha" online={online} live={values.Lamp_Run} />
              <Wire x1={coilX + 24} y1={318} x2={rightRailX} y2={318} live={live(values.Lamp_Run)} />
            </RungFrame>

            {PREVIEW_BLOCKS.map((block, index) => {
              const rungNumber = index + 3;
              const rungY = 438 + index * 126;
              const inputValue = values[block.contact];
              return (
                <RungFrame
                  key={block.kind}
                  index={rungNumber}
                  y={rungY}
                  selected={selectedRung === rungNumber}
                  onSelect={() => toggleRung(rungNumber)}
                  width={diagramWidth}
                  live={online}
                >
                  <Wire x1={100} y1={rungY} x2={138} y2={rungY} live={online} />
                  <Contact
                    x={160}
                    y={rungY}
                    kind="XIC"
                    tag={block.contact}
                    comment={block.description}
                    value={inputValue}
                    online={online}
                    powerIn
                  />
                  <Wire
                    x1={182}
                    y1={rungY}
                    x2={blockX}
                    y2={rungY}
                    live={online && inputValue}
                  />
                  <LadderFunctionBlock
                    kind={block.kind}
                    tag={block.tag}
                    x={blockX}
                    y={rungY}
                    online={online}
                    energized={inputValue}
                    state={blocks[block.kind]}
                    bits={block.bits}
                  />
                  <Wire
                    x1={blockX + PREVIEW_BLOCK_WIDTH}
                    y1={rungY}
                    x2={rightRailX}
                    y2={rungY}
                    live={online && inputValue}
                  />
                </RungFrame>
              );
            })}
          </svg>
        </div>
        <p className="px-4 pb-4 pt-2 text-xs text-slate-500">
          Rungs 3–7: TON, TOF, TONOFF (personalizado), CTU y CTD se evalúan en un ciclo de demostración de 50 ms.
          Mantén Start_PB en 1 para observar TON, alterna Start_PB para incrementar CTU y alterna Stop_PB
          para decrementar CTD. Los campos ACC y los indicadores se actualizan en DEMO · REM RUN; esto no es una conexión PLC real.
        </p>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-slate-200 bg-[#f2f5f8] px-4 text-[11px] text-slate-600">
        <span>Rungs 0–7 · Temporizadores y contadores funcionales (demo)</span>
        <span>{online ? "Evaluación visual activa" : "Sin resaltado online"}</span>
      </div>
    </div>
  );
}
