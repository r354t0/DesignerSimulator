import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, CircleHelp, Gauge,
  Play, ShieldAlert, Wrench, RotateCcw, Settings2, Droplets } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { ScadaLedGroup } from "./ScadaLedGroup";
import {
  GEAR_FIELD_INPUTS, GEAR_FIELD_OUTPUTS, GEAR_HMI_PUSHBUTTONS,
  GEAR_HMI_SETPOINTS, GEAR_SCADA_TAGS,
  gearBool, gearNumber,
  type GearPushButton, type GearDigitalInput, type GearAnalogInput,
  type GearSetpoint,
} from "../../plc/gearSpraySceneModel";

interface Props {
  project: PracticeProject;
  mode: ScanMode;
  setupError: string | null;
  onPushButton: (tag: GearPushButton, value: boolean) => void;
  onDigitalInput: (tag: GearDigitalInput, value: boolean) => void;
  onAnalogInput: (tag: GearAnalogInput, value: number) => void;
  onSetpoint: (tag: GearSetpoint, value: number) => void;
  onPrepareTags: () => void;
  onOpenTags: () => void;
}

const surfaces = {
  active:"#087f67", off:"#64748b", air:"#0284c7",
  lube:"#b45309", steel:"#334155",
};

/** Numeric field commits on blur/Enter, with whole-word edits. No implicit
 * changes to PLC values during intermediate keyboard editing. */
function NumberSetting({name,value,onCommit,integer=false,caption}:{
  name:string;value:number;onCommit:(value:number)=>void;
  integer?:boolean;caption?:string;
}){
  const [draft,setDraft]=useState(String(value));
  const [error,setError]=useState("");
  useEffect(()=>setDraft(String(value)),[value]);
  const save=()=>{
    if(draft.trim()===""){setError("Introduce un valor.");setDraft(String(value));return;}
    const parsed=Number(draft);
    if(!Number.isFinite(parsed)||parsed<0||
      (integer&&(!Number.isSafeInteger(parsed)||parsed>2147483647))){
      setError("Valor numérico inválido.");
      setDraft(String(value));return;
    }
    onCommit(parsed);setError("");
  };
  return <label className="block min-w-0">
    <span className="mb-1 block truncate text-[10px] font-medium text-slate-300"
      title={name}>{name}</span>
    <input type="number" min="0" step={integer?"1":"any"}
      value={draft} onChange={e=>setDraft(e.target.value)}
      onBlur={save} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
      className="w-full min-w-0 rounded border border-[#466075] bg-[#0c1d2a] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-400"
      aria-label={name}/>
    {caption&&<span className="block pt-1 text-[9px] text-slate-500">{caption}</span>}
    {error&&<span role="alert" className="block text-[10px] text-amber-400">{error}</span>}
  </label>;
}

function Pilot({label,active,tone="green"}:{
  label:string;active:boolean;tone?:"green"|"amber"|"blue"|"red";
}){
  const tones={green:"bg-emerald-400 shadow-[0_0_11px_#34d399]",
    amber:"bg-amber-400 shadow-[0_0_11px_#fbbf24]",
    blue:"bg-sky-400 shadow-[0_0_11px_#38bdf8]",
    red:"bg-red-400 shadow-[0_0_11px_#f87171]"};
  return <div className="flex min-h-9 min-w-0 items-center gap-2 rounded border border-[#34495d] bg-[#101e2b] px-2">
    <span className={"size-3 shrink-0 rounded-full border border-slate-500 "+
      (active?tones[tone]:"bg-slate-700")}/>
    <span className="min-w-0 break-words text-[10px] leading-snug text-slate-200">{label}</span>
  </div>;
}

function ProcessGraphic({project}: {project:PracticeProject}){
  const v=(name:string)=>gearBool(project,name);
  const pump=v("_310_SV_2560");
  const air=v("_310_SV_2563");
  const grease=v("_310_SV_2561");
  const mill=v("_310_PLC104_YI_MillRun");
  const dosing=v("_310_SQS_2561");
  const low=v("_310_LSL");
  const atomizing=air&&grease;
  const valve=(cx:number,cy:number,on:boolean,color:string,code:string)=>(
    <g>
      <path d={`M${cx-17} ${cy-16} L${cx+17} ${cy+16} L${cx+17} ${cy-16} L${cx-17} ${cy+16}Z`}
        fill={on?color:"#e2e8f0"} stroke="#334155" strokeWidth="2"/>
      <rect x={cx-8} y={cy-37} width="16" height="17" rx="3"
        fill={on?color:"#94a3b8"} stroke="#475569"/>
      <path d={`M${cx} ${cy-20} V${cy-16}`} stroke="#334155" strokeWidth="2"/>
      <text x={cx} y={cy-48} textAnchor="middle" fill="#334155" fontSize="12" fontWeight="700">{code}</text>
    </g>
  );
  return <svg viewBox="0 0 970 552" role="img"
    aria-label="Proceso Gear Spray: circuito de aire, circuito de lubricación y boquillas en corona del molino"
    className="block h-auto w-full min-w-[600px] rounded-lg border border-slate-300 bg-white">
    <rect x="0" y="0" width="970" height="552" rx="10" fill="#fff"/>
    <text x="25" y="28" fontSize="17" fontWeight="750" fill="#0f2940">
      LUBRICACIÓN DE CORONA · GEAR SPRAY
    </text>
    <text x="25" y="49" fontSize="11" fill="#64748b">
      Esquema de proceso · Circuitos de aire y grasa · E/S físicas del Micro850
    </text>
    <rect x="20" y="68" width="930" height="457" rx="12" fill="#f8fafc" stroke="#d6e0ea"/>
    {/* Air source and manifold */}
    <text x="37" y="97" fontSize="12" fontWeight="700" fill="#0369a1">AIRE COMPRIMIDO</text>
    <path d="M36 155 H786 V258" fill="none" stroke="#dbeafe" strokeWidth="11" strokeLinejoin="round"/>
    <path d="M36 155 H786 V258" fill="none" stroke={surfaces.air} strokeWidth="4"
      strokeDasharray={air?"12 7":"0"} opacity={air?1:0.45} strokeLinejoin="round"/>
    <rect x="45" y="131" width="74" height="49" rx="6" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2"/>
    <text x="82" y="150" textAnchor="middle" fontSize="10" fontWeight="700" fill="#075985">FILTRO</text>
    <text x="82" y="164" textAnchor="middle" fontSize="9" fill="#075985">AIRE</text>
    {valve(252,155,pump,surfaces.active,"SV-2560 · BOMBA")}
    {valve(560,155,air,surfaces.air,"SV-2563 · ATOMIZACIÓN")}
    <path d="M252 172 V328" stroke="#94a3b8" strokeWidth="10"/>
    <path d="M252 172 V328" stroke={pump?surfaces.air:"#64748b"} strokeWidth="4" opacity=".9"
      strokeDasharray={pump?"9 6":"0"}/>
    {/* Lubricant supply */}
    <text x="36" y="253" fontSize="12" fontWeight="700" fill="#92400e">CIRCUITO DE GRASA</text>
    <rect x="45" y="287" width="119" height="180" rx="13" stroke="#854d0e" strokeWidth="3" fill="#fef3c7"/>
    <ellipse cx="104" cy="287" rx="59" ry="13" fill="#e7c58a" stroke="#854d0e" strokeWidth="2"/>
    <rect x="52" y="382" width="104" height="75" rx="5" fill="#f59e0b" opacity=".55"/>
    <text x="104" y="348" fontSize="13" fontWeight="700" textAnchor="middle" fill="#78350f">TAMBOR</text>
    <text x="104" y="365" fontSize="11" textAnchor="middle" fill="#78350f">GRASA</text>
    <text x="104" y="480" fontSize="11" fontWeight="600" textAnchor="middle" fill="#475569">
      Nivel bajo: {low?"1":"0"}
    </text>
    <path d="M165 355 H300 H430 H555 H666 V329 H738 V297" fill="none"
      stroke="#e7d9c5" strokeWidth="14" strokeLinejoin="round"/>
    <path d="M165 355 H300 H430 H555 H666 V329 H738 V297" fill="none"
      stroke={grease?surfaces.lube:"#64748b"} strokeWidth="5" strokeLinejoin="round"
      strokeDasharray={grease?"10 7":"0"}/>
    <rect x="214" y="304" width="75" height="102" rx="10"
      fill={pump?"#c5e9e1":"#dce4ec"} stroke={pump?surfaces.active:surfaces.steel}
      strokeWidth="3"/>
    <circle cx="252" cy="353" r="24" fill="white" stroke="#334155" strokeWidth="2"/>
    <path d="M238 363 L252 338 L266 363 Z" fill={pump?surfaces.active:"#94a3b8"}/>
    <text x="252" y="426" fontSize="11" textAnchor="middle" fontWeight="700" fill="#334155">
      BOMBA NEUMÁTICA
    </text>
    <rect x="351" y="322" width="64" height="65" rx="7" fill="#f1f5f9" stroke="#64748b" strokeWidth="2"/>
    <path d="M359 375 L408 332 M359 349 L385 332 M384 377 L408 355"
      stroke="#94a3b8" strokeWidth="4"/>
    <text x="383" y="405" fontSize="11" textAnchor="middle" fill="#334155">FILTRO</text>
    {valve(502,355,grease,surfaces.lube,"SV-2561 · GRASA")}
    <rect x="603" y="307" width="107" height="93" rx="9" fill="#edf1f4"
      stroke="#475569" strokeWidth="3"/>
    <path d="M615 338 H697 M615 357 H697 M615 376 H697" stroke="#64748b" strokeWidth="3"/>
    <circle cx="650" cy="329" r="9" fill={dosing?"#34d399":"#cbd5e1"} stroke="#334155" strokeWidth="2"/>
    <text x="657" y="417" textAnchor="middle" fontWeight="700" fontSize="11" fill="#334155">
      BLOQUE DOSIFICADOR
    </text>
    <text x="656" y="434" textAnchor="middle" fontSize="10" fill="#475569">
      PULSO SQS-2561: {dosing?"1":"0"}
    </text>
    {/* Spray / ball mill */}
    <g>
      <circle cx="811" cy="370" r="110" fill="#e2e8f0" stroke="#475569" strokeWidth="7"/>
      <circle cx="811" cy="370" r="91" fill="none" stroke="#64748b" strokeWidth="5" strokeDasharray="7 8"/>
      <circle cx="811" cy="370" r="74" fill="#fff" stroke="#64748b" strokeWidth="5"/>
      <circle cx="811" cy="370" r="28" fill="#cbd5e1" stroke="#475569" strokeWidth="3"/>
      <path d="M737 370 H885 M811 296 V444 M759 318 L864 424 M863 318 L759 424"
        stroke="#cbd5e1" strokeWidth="11"/>
      <circle cx="811" cy="370" r="28" fill="#94a3b8" stroke="#475569" strokeWidth="2"/>
      <rect x="756" y="487" width="114" height="25" rx="5"
        fill={mill?"#d1fae5":"#e2e8f0"} stroke="#64748b"/>
      <text x="813" y="503" fontSize="11" fontWeight="700" textAnchor="middle"
        fill={mill?"#065f46":"#475569"}>MOLINO {mill?"RUN":"STOP"}</text>
    </g>
    <g strokeLinecap="round">
      <path d="M739 259 V282 M765 255 V278 M790 255 V278" stroke="#334155" strokeWidth="7"/>
      {atomizing&&<g stroke="#0d9488" strokeWidth="3" opacity=".9">
        <path d="M740 282 L716 311 M740 282 L760 312 M766 278 L752 318 M766 278 L783 318 M790 278 L775 313 M790 278 L808 313"/>
      </g>}
    </g>
    <text x="848" y="216" fontSize="11" fill="#334155" fontWeight="700" textAnchor="middle">
      BOQUILLAS
    </text>
    {/* Status cards */}
    <rect x="44" y="493" width="250" height="27" rx="5" fill="#e0f2fe" stroke="#bae6fd"/>
    <text x="56" y="511" fontSize="12" fill="#075985" fontWeight="650">
      P aire (CCW): {gearNumber(project,"_310_PI_2561").toFixed(1)}
    </text>
    <rect x="308" y="493" width="290" height="27" rx="5" fill="#ffedd5" stroke="#fed7aa"/>
    <text x="320" y="511" fontSize="12" fill="#9a3412" fontWeight="650">
      P grasa (CCW): {gearNumber(project,"_310_PI_2560").toFixed(1)}
    </text>
    <text x="27" y="541" fontSize="11" fill="#64748b">
      Esquema didáctico · Animación gobernada por tags; sin física automática en fase 1
    </text>
  </svg>;
}

function InfoModal({onClose,onOpenTags}:{
  onClose:()=>void;onOpenTags:()=>void;
}){
  const headings:{title:string;content:readonly typeof GEAR_SCADA_TAGS[number][]}[]=[
    {title:"Entradas de campo",content:GEAR_FIELD_INPUTS},
    {title:"Salidas físicas",content:GEAR_FIELD_OUTPUTS},
    {title:"Pulsadores HMI",content:GEAR_HMI_PUSHBUTTONS},
    {title:"Consignas",content:GEAR_HMI_SETPOINTS},
  ];
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black/75 p-3"
    onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="gear-info-title"
      className="max-h-[90vh] w-[min(1050px,98vw)] overflow-y-auto rounded-lg border border-slate-600 bg-[#152535] p-4 text-slate-100 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="gear-info-title" className="text-sm font-bold">
          Escena 06 · Gear Spray · Información del proyecto CCW
        </h2>
        <button type="button" onClick={onClose} aria-label="Cerrar información"
          className="rounded border border-slate-500 px-3 py-1.5 text-xs hover:bg-slate-700">
          Cerrar
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-300">
        Control de lubricación de corona de molino de bolas · Proyecto
        PLC_107_Molino_Bolas_SM · Rutinas P01–P07 y FB_GearSpray_Sequence.
        La pantalla de esta primera etapa está conectada al motor de tags
        y MainRoutine de DesignerSimulator. Todavía no se ha traducido el
        programa CCW ni implementado el modelo físico.
      </p>
      <div className="mt-3 rounded border border-amber-700/70 bg-amber-950/40 p-3 text-xs text-amber-100">
        <strong>Correspondencias pendientes:</strong> P01 copia _310_SQS_2561
        a DI_PDB_2, pero P03 cuenta DI_PDB. Se conservan como señales diferentes.
        La escala/unidad de presión y la polaridad de _310_LSL aún requieren
        comprobación. P05 incluye AFI para la alarma de alta presión.
      </div>
      <div className="mt-4 space-y-4">
        {headings.map(group=><section key={group.title}>
          <h3 className="mb-1.5 text-xs font-bold text-sky-200">{group.title}</h3>
          <div className="overflow-x-auto rounded border border-slate-600">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead className="bg-[#263949] text-slate-200"><tr>
                <th className="p-2">Tag CCW</th><th className="p-2">Tipo</th>
                <th className="p-2">Descripción</th>
              </tr></thead>
              <tbody>{group.content.map(tag=><tr key={tag.name} className="border-t border-slate-700">
                <td className="p-2 font-mono text-sky-100">{tag.name}</td>
                <td className="p-2 text-slate-300">{tag.type}</td>
                <td className="p-2 text-slate-300">{tag.description}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>)}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={()=>{onClose();onOpenTags();}}
          className="rounded border border-sky-600 px-3 py-2 text-xs text-sky-200 hover:bg-sky-900">
          Abrir Controller Tags
        </button>
      </div>
    </div>
  </div>;
}

/** Phase 1: industrial presentation + manual field stimuli ONLY.
 * This component has NO independent PLC sequence, interlocking or physics.
 */
export function GearSprayScene({project,mode,setupError,onPushButton,
  onDigitalInput,onAnalogInput,onSetpoint,onPrepareTags,onOpenTags}:Props){
  const [openInfo,setOpenInfo]=useState(false);
  const sceneRef=useRef<HTMLDivElement>(null);
  const v=(name:string)=>gearBool(project,name);
  const outputs=GEAR_FIELD_OUTPUTS;
  const modeLabel=mode==="running"?"PLC RUN":
    mode==="paused"?"PLC PAUSE":"PLC STOP";
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{
      if(event.key==="Escape")setOpenInfo(false);
    };
    window.addEventListener("keydown",listener);
    return ()=>window.removeEventListener("keydown",listener);
  },[]);
  const processActive=v("_310_SV_2561")&&v("_310_SV_2563");
  const diagnostics:{label:string;value:ReactNode}[]=[
    {label:"Presión de aire (valor CCW)",
      value:gearNumber(project,"_310_PI_2561").toFixed(1)},
    {label:"Presión de lubricante (valor CCW)",
      value:gearNumber(project,"_310_PI_2560").toFixed(1)},
    {label:"Molino",value:v("_310_PLC104_YI_MillRun")?"MARCHA":"DETENIDO"},
    {label:"Pulso dosificador",value:v("_310_SQS_2561")?"ACTIVO":"INACTIVO"},
    {label:"Pulverización",value:processActive?"SOLENOIDES ACTIVOS":"SIN ACTIVACIÓN"},
    {label:"Secuencia CCW",value:"PENDIENTE DE PORTAR"},
  ];
  return <div ref={sceneRef}
    className="sort-scada-shell scada-control-shell gear-scada-shell flex h-full min-h-0 flex-col overflow-y-auto p-3 text-slate-100">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Droplets size={19} className="text-sky-300"/>
        <div>
          <h2 className="text-sm font-semibold">Escena 06 · Gear Spray</h2>
          <p className="text-[10px] text-slate-400">Lubricación de corona · Molino de bolas</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300">
          {modeLabel}
        </span>
        <span className="rounded border border-amber-700 bg-amber-950/60 px-2 py-1 text-[10px] text-amber-200">
          Fase 1 · SCADA + E/S
        </span>
        <button type="button" onClick={()=>setOpenInfo(true)}
          className="flex items-center gap-1 rounded border border-slate-600 px-2 py-1.5 text-[11px] hover:bg-slate-700">
          <CircleHelp size={15}/> Información
        </button>
      </div>
    </div>
    {setupError&&<div role="alert" className="mb-2 rounded border border-red-700 bg-red-950 p-2 text-xs text-red-200">
      {setupError}
      <button type="button" className="ml-3 underline" onClick={onPrepareTags}>Reintentar</button>
    </div>}
    <div className="scada-scene-workspace">
      <section className="scada-process-panel min-w-0">
        <h3 className="mb-2 text-xs font-semibold">Vista de proceso</h3>
        <div className="overflow-x-auto rounded-lg bg-white">
          <ProcessGraphic project={project}/>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {diagnostics.map(item=><div key={item.label}
            className="rounded border border-[#344b60] bg-[#102333] p-2 text-center">
            <div className="text-[10px] text-slate-400">{item.label}</div>
            <div className="mt-1 text-xs font-semibold text-slate-100">{item.value}</div>
          </div>)}
        </div>
      </section>
      <aside className="scada-scene-sidebar min-w-0">
        <section className="sort-panel rounded-lg border border-[#344c5e] p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <Settings2 size={15}/> Tablero de mando
          </h3>
          <p className="mb-3 text-[10px] text-slate-400">
            Los botones escriben entradas PB momentáneas. Solo el programa PLC
            gobierna las salidas.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GEAR_HMI_PUSHBUTTONS.map((tag,index)=>{
              const glyph=[<Play size={14}/>,<Wrench size={14}/>,
                <Wrench size={14}/>,<Droplets size={14}/>,
                <RotateCcw size={14}/>,<Gauge size={14}/>][index];
              return <MomentaryPushButton key={tag.name} compact
                name={tag.name} pressed={v(tag.name)}
                tone={tag.name==="PB_Reset"?"stop":
                  tag.name==="PB_Auto"?"start":"drain"}
                icon={glyph} onChange={pressed=>onPushButton(tag.name,pressed)}>
                {tag.name.replace("PB_","").replace("_"," ")}
              </MomentaryPushButton>;
            })}
          </div>
        </section>
        <section className="sort-panel rounded-lg border border-[#344c5e] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <Gauge size={15}/> Instrumentación y setpoints
          </h3>
          <p className="mb-3 text-[10px] text-slate-400">
            Fase 1: consignas manuales para pruebas. Unidades de presión
            según CCW, pendientes de escalamiento.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {GEAR_FIELD_INPUTS.filter(x=>x.type==="REAL").map(input=>
              <NumberSetting key={input.name} name={input.name}
                caption={input.name==="_310_PI_2561"?"Presión de aire · simulada manualmente":
                  "Presión de lubricante · simulada manualmente"}
                value={gearNumber(project,input.name)}
                onCommit={value=>onAnalogInput(input.name as GearAnalogInput,value)}/>)}
            {GEAR_HMI_SETPOINTS.map(sp=><NumberSetting key={sp.name}
              name={sp.name} integer value={gearNumber(project,sp.name)}
              caption={sp.description}
              onCommit={value=>onSetpoint(sp.name as GearSetpoint,value)}/>)}
          </div>
          <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
            <h4 className="text-[11px] font-semibold">Entradas digitales de campo</h4>
            {GEAR_FIELD_INPUTS.filter(x=>x.type==="BOOL").map(x=>
              <label key={x.name} className="flex cursor-pointer items-center gap-2 text-[11px]">
                <input type="checkbox" checked={v(x.name)}
                  onChange={event=>onDigitalInput(x.name as GearDigitalInput,event.target.checked)}
                  className="accent-sky-500" />
                <span className="break-all text-slate-200">{x.name}</span>
              </label>)}
          </div>
        </section>
        <section className="sort-panel scada-led-panel min-w-0 rounded-lg border border-[#344c5e] p-3">
          <h3 className="mb-3 text-xs font-semibold">Pilotos LED y equipos</h3>
          <div className="space-y-3">
            <ScadaLedGroup kind="status">
              <Pilot label="SISTEMA HEALTHY" active={v("_310_YI_SystemHealthy")}/>
              <Pilot label="LUBRICACIÓN RUN" active={v("_310_YI_LubricationSystemRunning")}/>
              <Pilot label="ALARMA ACTIVA" active={v("_310_UY_2560")} tone="red"/>
              <Pilot label="MOLINO RUN" active={v("_310_PLC104_YI_MillRun")} tone="blue"/>
            </ScadaLedGroup>
            <ScadaLedGroup kind="inputs">
              {GEAR_HMI_PUSHBUTTONS.map(tag=>
                <Pilot key={tag.name} label={tag.name} active={v(tag.name)} tone="blue"/>)}
              {GEAR_FIELD_INPUTS.filter(x=>x.type==="BOOL").map(tag=>
                <Pilot key={tag.name} label={tag.name} active={v(tag.name)} tone="amber"/>)}
            </ScadaLedGroup>
            <ScadaLedGroup kind="outputs">
              {outputs.map(tag=>
                <Pilot key={tag.name} label={tag.name}
                  active={v(tag.name)}
                  tone={tag.name==="_310_UY_2560"?"red":"green"}/>)}
            </ScadaLedGroup>
          </div>
        </section>
        <section className="rounded-lg border border-[#344c5e] bg-[#132432] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <ShieldAlert size={16}/> Alarmas y diagnóstico
          </h3>
          <div className="mb-2 rounded border border-amber-700/60 bg-amber-950/40 p-2 text-[11px] text-amber-200">
            <AlertTriangle size={13} className="mr-1 inline"/>
            P01–P07 y FB_GearSpray_Sequence pendientes de portar.
            Las alarmas y secuencias CCW aún no se calculan automáticamente.
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-200">
            <div className="rounded bg-[#0c1b28] p-2">Máquina de estados: <strong>no disponible</strong></div>
            <div className="rounded bg-[#0c1b28] p-2">Fault_Code: <strong>no disponible</strong></div>
            <div className="rounded bg-[#0c1b28] p-2">Pulsos DI_PDB: <strong>sin correspondencia confirmada</strong></div>
            <div className="rounded bg-[#0c1b28] p-2">Alarmas CCW: <strong>no disponibles</strong></div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[10px] text-emerald-300">
            <CheckCircle2 size={13}/> Las salidas visibles leen Controller Tags.
          </div>
        </section>
        <section className="rounded-lg border border-[#344c5e] bg-[#132432] p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <BookOpen size={15}/> Programa y referencias
          </h3>
          <p className="text-[11px] text-slate-300">
            CCW: P01 Mapping, P02 Mode Manager, P03 Cycle Manager,
            P04 Pump Pressure Control, P05 Alarms, P06 Shutdown/Maintenance,
            P07 HMI Diagnostics y FB_GearSpray_Sequence.
          </p>
          <button type="button" onClick={onOpenTags}
            className="mt-3 rounded border border-sky-700 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-950">
            Abrir Controller Tags
          </button>
        </section>
      </aside>
    </div>
    {openInfo&&<InfoModal onClose={()=>setOpenInfo(false)} onOpenTags={onOpenTags}/>}
  </div>;
}
