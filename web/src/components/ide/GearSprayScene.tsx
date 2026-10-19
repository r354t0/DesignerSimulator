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

/** Diagrama de proceso para la escena 06.
 * Tuberías representadas como redes independientes: aire instrumental/atomización
 * (azul) y grasa presurizada (acero/ámbar). El SCADA únicamente lee tags PLC.
 * Los cruces sin unión entre redes se muestran con un puente blanco.
 */
function ProcessGraphic({project}: {project:PracticeProject}){
  const v=(name:string)=>gearBool(project,name);
  const pump=v("_310_SV_2560");
  const air=v("_310_SV_2563");
  const grease=v("_310_SV_2561");
  const mill=v("_310_PLC104_YI_MillRun");
  const dosing=v("_310_SQS_2561");
  const low=v("_310_LSL");
  const atomizing=air&&grease;
  const nozzleYs=[246,290,334,378,422,466];

  // Dos capas para que el contorno del conducto quede visible aun en reposo.
  const pipe=(d:string,kind:"air"|"lube",flow:boolean)=>(
    <g fill="none" strokeLinecap="square" strokeLinejoin="round">
      <path d={d} stroke="#f8fafc" strokeWidth="15"/>
      <path d={d} stroke={kind==="air"?"#294657":"#334155"} strokeWidth="11"/>
      <path d={d} stroke={kind==="air"?"#1198e3":"#94a3b8"} strokeWidth="6"/>
      {flow&&<path d={d} stroke={kind==="air"?"#a5e8ff":"#f6ad42"}
        strokeWidth="2.5" strokeDasharray="9 9" opacity=".95"/>}
    </g>
  );

  const solenoid=(cx:number,cy:number,code:string,on:boolean,kind:"air"|"lube")=>(
    <g>
      <rect x={cx-19} y={cy-14} width="38" height="28" rx="5"
        fill={on?"#c7f9da":"#e2e8f0"} stroke="#334155" strokeWidth="2"/>
      <path d={"M"+(cx-18)+" "+(cy-12)+" L"+(cx+18)+" "+(cy+12)+
        " M"+(cx+18)+" "+(cy-12)+" L"+(cx-18)+" "+(cy+12)}
        stroke={on?"#047857":"#475569"} strokeWidth="2.5"/>
      <rect x={cx-12} y={cy-33} width="24" height="15" rx="3"
        fill={on?"#22c55e":"#94a3b8"} stroke="#334155" strokeWidth="1.5"/>
      <path d={"M"+cx+" "+(cy-18)+" V"+(cy-14)} stroke="#334155" strokeWidth="2"/>
      <text x={cx} y={cy-43} textAnchor="middle" fontSize="10.5" fontWeight="750"
        fill={on?"#047857":"#64748b"}>{on?"ON":"OFF"}</text>
      <rect x={cx-48} y={cy+21} width="96" height="20" rx="4"
        fill="#fff" stroke="#a8bac9"/>
      <text x={cx} y={cy+35} textAnchor="middle" fontSize="11" fontWeight="750"
        fill="#334155">{code}</text>
      <title>{code+" · "+(kind==="air"?"Válvula de aire":"Válvula de grasa")+" · "+(on?"Activa":"Inactiva")}</title>
    </g>
  );

  return <svg viewBox="0 0 1060 610" role="img"
    aria-label="Escena 06 Gear Spray: acometida de aire a SV-2560 y SV-2563, tambor y bomba a SV-2561, bloque dosificador y seis boquillas con aire de atomización"
    className="block h-auto w-full min-w-[680px] rounded-lg border border-slate-300 bg-white">
    <rect x="0" y="0" width="1060" height="610" rx="10" fill="#fff"/>
    <text x="24" y="29" fontSize="17" fontWeight="750" fill="#0f2940">
      LUBRICACIÓN DE CORONA · GEAR SPRAY
    </text>
    <text x="24" y="49" fontSize="11" fill="#64748b">
      Escena 06 · Distribución de aire y grasa · Señales físicas del Micro850
    </text>
    <g fontSize="10.5" fill="#334155">
      <path d="M734 24 H765" stroke="#1198e3" strokeWidth="6"/>
      <text x="774" y="28">Aire</text>
      <path d="M832 24 H863" stroke="#64748b" strokeWidth="7"/>
      <text x="873" y="28">Grasa</text>
      <circle cx="952" cy="24" r="6" fill="#16a34a"/>
      <text x="964" y="28">Activo</text>
    </g>
    <rect x="18" y="65" width="1024" height="514" rx="10"
      fill="#f5f7fa" stroke="#d7e1e9"/>

    {/* Línea de suministro común y derivación a los dos circuitos neumáticos. */}
    <text x="38" y="215" fontSize="12" fontWeight="750" fill="#0369a1">
      AIRE INSTRUMENTAL
    </text>
    <text x="38" y="232" fontSize="10" fill="#475569">Acometida de planta</text>
    {pipe("M43 286 H282", "air", pump||air)}
    <path d="M43 274 L28 286 L43 298" fill="none"
      stroke="#0284c7" strokeWidth="3"/>
    {/* Ramal de atomización: fuente -> SV-2563 -> colector azul de boquillas. */}
    {pipe("M282 286 V124 H909 V475", "air", air)}
    {/* Ramal de accionamiento de bomba: fuente -> SV-2560 -> bomba. */}
    {pipe("M282 286 H444 V370", "air", pump)}
    <text x="584" y="101" fontSize="11" fontWeight="700" fill="#075985">
      AIRE DE ATOMIZACIÓN
    </text>
    <text x="93" y="138" fontSize="11" fontWeight="700" fill="#334155">
      PI-2561 · AIRE
    </text>
    <rect x="91" y="147" width="111" height="39" rx="5"
      fill="#dbeafe" stroke="#0284c7" strokeWidth="1.5"/>
    <text x="147" y="172" textAnchor="middle" fontSize="17" fontWeight="750"
      fill="#075985">{gearNumber(project,"_310_PI_2561").toFixed(1)}</text>
    <text x="209" y="172" fontSize="10" fill="#64748b">CCW</text>
    <path d="M148 190 V279" fill="none" stroke="#64748b" strokeWidth="3"/>
    <circle cx="148" cy="286" r="6" fill="#fff" stroke="#0284c7" strokeWidth="3"/>
    <text x="91" y="201" fontSize="10" fill="#64748b">Transmisor de presión</text>
    {solenoid(444,124,"SV-2563",air,"air")}
    {solenoid(444,286,"SV-2560",pump,"air")}

    {/* Línea de grasa: tambor -> bomba neumática -> filtro -> SV-2561
        -> transmisor de presión -> entrada del bloque dosificador. */}
    <text x="286" y="343" fontSize="11" fontWeight="750" fill="#92400e">
      ALIMENTACIÓN DE GRASA
    </text>
    <rect x="332" y="426" width="102" height="115" rx="9"
      fill="#334155" stroke="#0f172a" strokeWidth="3"/>
    <ellipse cx="383" cy="426" rx="51" ry="11" fill="#64748b" stroke="#0f172a" strokeWidth="2"/>
    <path d="M332 464 H434 M332 503 H434" stroke="#94a3b8" strokeWidth="3"/>
    <text x="383" y="479" fontSize="11" fontWeight="750" fill="#fff" textAnchor="middle">
      TAMBOR
    </text>
    <text x="383" y="496" fontSize="10" fill="#e2e8f0" textAnchor="middle">310-LU-003-HE</text>
    <circle cx="421" cy="443" r="9" fill={low?"#ef4444":"#34d399"}
      stroke="#0f172a" strokeWidth="2"/>
    <text x="441" y="447" fontSize="10.5" fill="#334155">
      LSL {low?"BAJO":"OK"}
    </text>
    {pipe("M383 427 V382 H722", "lube", grease&&pump)}
    {/* Bomba sobre el tambor. El ramal de SV-2560 llega a su actuador. */}
    <rect x="364" y="352" width="74" height="58" rx="8" fill={pump?"#ccf5e3":"#dce4ec"}
      stroke={pump?surfaces.active:"#475569"} strokeWidth="3"/>
    <circle cx="402" cy="381" r="20" fill="white" stroke="#475569" strokeWidth="2"/>
    <path d="M390 391 L402 368 L414 391 Z"
      fill={pump?surfaces.active:"#94a3b8"}/>
    <rect x="436" y="364" width="18" height="14" rx="3"
      fill={pump?"#0ea5e9":"#cbd5e1"} stroke="#475569" strokeWidth="2"/>
    <text x="400" y="338" textAnchor="middle" fontSize="10.5" fontWeight="750"
      fill="#334155">BOMBA NEUMÁTICA</text>
    {/* Filtro de línea de grasa. */}
    <rect x="480" y="365" width="58" height="35" rx="6"
      fill="#fff" stroke="#64748b" strokeWidth="2.5"/>
    <path d="M489 393 L528 371 M489 381 L506 371 M513 393 L529 384"
      stroke="#94a3b8" strokeWidth="3"/>
    <text x="509" y="356" textAnchor="middle" fontSize="10.5" fontWeight="700"
      fill="#334155">FILTRO</text>
    {solenoid(615,382,"SV-2561",grease,"lube")}

    {/* Transmisor de grasa conectado mediante toma en T: no es una válvula. */}
    <path d="M686 383 V453" fill="none" stroke="#64748b" strokeWidth="3.5"/>
    <circle cx="686" cy="382" r="6" fill="#fff" stroke="#64748b" strokeWidth="3"/>
    <circle cx="686" cy="466" r="16" fill="#dbeafe" stroke="#0369a1" strokeWidth="3"/>
    <path d="M686 455 V466 L696 462" stroke="#0369a1" strokeWidth="2"
      fill="none"/>
    <text x="603" y="504" fontSize="11" fontWeight="750" fill="#334155">
      PI-2560 · GRASA
    </text>
    <rect x="602" y="513" width="123" height="39" rx="5"
      fill="#ffedd5" stroke="#d97706" strokeWidth="1.5"/>
    <text x="663" y="538" textAnchor="middle" fontSize="17" fontWeight="750"
      fill="#92400e">{gearNumber(project,"_310_PI_2560").toFixed(1)}</text>
    <text x="733" y="538" fontSize="10" fill="#64748b">CCW</text>

    {/* Sensor de proximidad en la parte superior del dosificador. */}
    <circle cx="793" cy="174" r="27" fill={dosing?"#22c55e":"#e2e8f0"}
      stroke={dosing?"#15803d":"#64748b"} strokeWidth="3"/>
    <text x="793" y="170" textAnchor="middle" fill="#0f172a"
      fontSize="12" fontWeight="750">SQS</text>
    <text x="793" y="184" textAnchor="middle" fill="#0f172a"
      fontSize="12" fontWeight="750">2561</text>
    <rect x="787" y="204" width="12" height="21" rx="2"
      fill="#94a3b8" stroke="#475569" strokeWidth="2"/>

    {/* Bloque distribuidor y salidas individuales de grasa; no está conectado
        hidráulicamente al colector azul de aire que pasa a su derecha. */}
    <rect x="742" y="226" width="112" height="256" rx="9" fill="#cbd5e1"
      stroke="#475569" strokeWidth="3"/>
    <rect x="757" y="236" width="82" height="237" rx="5" fill="#e2e8f0"
      stroke="#94a3b8" strokeWidth="2"/>
    <path d="M798 237 V473" stroke="#94a3b8" strokeWidth="2"/>
    {nozzleYs.map((y,i)=><g key={"dist-"+i}>
      <path d={"M742 "+y+" h-18"} stroke="#64748b" strokeWidth="5"/>
      <circle cx="797" cy={y} r="6" fill="#94a3b8" stroke="#475569" strokeWidth="2"/>
      <circle cx="797" cy={y} r="2" fill="#fff"/>
      <rect x="841" y={y-8} width="20" height="16" rx="3"
        fill="#cbd5e1" stroke="#475569" strokeWidth="1.5"/>
    </g>)}
    <text x="797" y="501" textAnchor="middle" fontSize="11"
      fontWeight="750" fill="#334155">BLOQUE DOSIFICADOR</text>

    {/* El cabezal de atomización cruza las seis líneas de grasa SIN conexión.
        Puentes claros en los cruces impiden interpretarlos como una unión. */}
    {nozzleYs.map((y,i)=><g key={"nozzle-"+i}>
      {pipe("M855 "+y+" H961","lube",grease&&pump)}
      {pipe("M909 "+(y-13)+" H961","air",air)}
      <rect x="956" y={y-15} width="42" height="30" rx="5"
        fill={atomizing?"#c1dcee":"#d5dde5"} stroke="#475569" strokeWidth="2.5"/>
      <ellipse cx="998" cy={y} rx="9" ry="12" fill="#cbd5e1" stroke="#475569" strokeWidth="2"/>
      <path d={"M1006 "+y+" l22 -14 M1006 "+y+" h26 M1006 "+y+" l22 14"}
        stroke={atomizing?"#0284c7":"#94a3b8"} strokeWidth="2.5" strokeLinecap="round"/>
      {atomizing&&<path d={"M1015 "+y+" l25 -20 M1015 "+y+" l26 20"}
        stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 5"/>}
    </g>)}
    <text x="945" y="507" fontSize="11" textAnchor="middle" fontWeight="750"
      fill="#334155">6 BOQUILLAS</text>

    {/* Estados solo de lectura: no afectan el motor Ladder ni fuerzan E/S. */}
    <rect x="33" y="548" width="255" height="24" rx="4" fill="#e2e8f0"
      stroke="#cbd5e1"/>
    <circle cx="46" cy="560" r="6" fill={pump?"#16a34a":"#94a3b8"}/>
    <text x="61" y="564" fontSize="11" fill="#334155" fontWeight="650">
      Bomba: {pump?"ON":"OFF"}
    </text>
    <circle cx="159" cy="560" r="6" fill={grease?"#16a34a":"#94a3b8"}/>
    <text x="171" y="564" fontSize="11" fill="#334155" fontWeight="650">
      Grasa: {grease?"ON":"OFF"}
    </text>
    <rect x="835" y="540" width="177" height="29" rx="5"
      fill={mill?"#d1fae5":"#e2e8f0"} stroke="#94a3b8"/>
    <text x="923" y="559" fontSize="11" fontWeight="750" textAnchor="middle"
      fill={mill?"#065f46":"#475569"}>
      MOLINO {mill?"RUN":"STOP"}
    </text>
    <text x="25" y="596" fontSize="10.5" fill="#64748b">
      Visualización de E/S reales CCW · Presiones sin unidad verificada · sin física automática en fase 1
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
