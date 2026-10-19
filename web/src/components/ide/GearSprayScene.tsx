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

/** Edición numérica y deslizante sincronizada. Los setpoints DINT no tienen
 * escalamiento de proceso publicado: su slider usa una ventana local ampliable,
 * pero el campo numérico conserva el rango permitido por el PLC. */
function NumberSetting({label,name,value,onCommit,integer=false,caption,
  min=0,max,step}:{label:string;name:string;value:number;
  onCommit:(value:number)=>void;integer?:boolean;caption?:string;
  min?:number;max?:number;step?:number;
}){
  const [draft,setDraft]=useState(String(value));
  const [error,setError]=useState("");
  const [windowMax,setWindowMax]=useState(()=>
    Math.min(2147483647,Math.max(100,Math.ceil(Math.max(value,0)/100)*100)));
  useEffect(()=>setDraft(String(value)),[value]);
  useEffect(()=>{
    if(max===undefined&&value>windowMax)
      setWindowMax(Math.min(2147483647,Math.ceil(value/100)*100));
  },[max,value,windowMax]);
  const sliderMax=max??windowMax;
  const sliderStep=step??(integer?1:0.1);
  const outOfRange=value<min||value>sliderMax;
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
  return <div className="min-w-0 rounded border border-[#354d62] bg-[#0f2434] p-2.5">
    <label htmlFor={"gear-value-"+name} className="block">
      <span className="block text-[11px] font-semibold text-slate-100">{label}</span>
      <span className="mb-2 block break-all font-mono text-[10px] text-sky-300">{name}</span>
    </label>
    <input id={"gear-value-"+name} type="number" min={min}
      step={integer?"1":"any"} value={draft}
      onChange={e=>setDraft(e.target.value)} onBlur={save}
      onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}
      className="w-full min-w-0 rounded border border-[#466075] bg-[#0c1d2a] px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-400"
      aria-label={label+" · valor numérico"}/>
    <input type="range" min={min} max={sliderMax} step={sliderStep}
      value={Math.min(sliderMax,Math.max(min,value))}
      onChange={e=>{onCommit(Number(e.target.value));setError("");}}
      className="mt-3 block h-2 w-full cursor-pointer accent-sky-500"
      aria-label={label+" · barra deslizante"}/>
    <div className="mt-1 flex items-center justify-between gap-1 text-[10px] tabular-nums text-slate-400">
      <span>{min}</span><span>{sliderMax}</span>
    </div>
    {max===undefined&&<button type="button"
      className="mt-1 text-[10px] text-sky-300 underline decoration-dotted hover:text-sky-100"
      onClick={()=>setWindowMax(prev=>Math.min(2147483647,prev*2))}>
      Ampliar escala del deslizador
    </button>}
    {caption&&<span className="mt-1 block text-[10px] leading-snug text-slate-400">{caption}</span>}
    {outOfRange&&max!==undefined&&
      <span className="block text-[10px] text-amber-300">
        Valor fuera del rango de referencia. Usa el campo numérico para pruebas de falla.
      </span>}
    {error&&<span role="alert" className="block text-[10px] text-amber-400">{error}</span>}
  </div>;
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
 * (azul) y lubricante presurizada (acero/ámbar). El SCADA únicamente lee tags PLC.
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
  const nozzleYs=[326,366,406,446,486,526];

  // Cada red tiene un trazo continuo: los ramales se unen con tees,
  // no se dibujan como segmentos sueltos separados por un borde blanco.
  const pipe=(d:string,kind:"air"|"lube",flow:boolean)=>(
    <g fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} stroke="#334155" strokeWidth="11"/>
      <path d={d} stroke={kind==="air"?"#168bd1":"#a4adb9"} strokeWidth="7"/>
      {flow&&<path d={d} stroke={kind==="air"?"#a5ebff":"#f5bc62"}
        strokeWidth="2" strokeDasharray="10 10"/>}
    </g>
  );
  // Un punto distingue el empalme real de un cruce sin conexión.
  const tee=(x:number,y:number,kind:"air"|"lube")=>(
    <circle cx={x} cy={y} r="5.5" fill={kind==="air"?"#168bd1":"#a4adb9"}
      stroke="#334155" strokeWidth="2"/>
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
      <text x={cx} y={cy-46} textAnchor="middle" fontSize="11" fontWeight="750"
        fill={on?"#047857":"#475569"}>{on?"ON":"OFF"}</text>
      <rect x={cx-47} y={cy+22} width="94" height="20" rx="4"
        fill="#fff" stroke="#91a4b7"/>
      <text x={cx} y={cy+36} textAnchor="middle" fontSize="11.5" fontWeight="750"
        fill="#334155">{code}</text>
      <title>{code+" · "+(kind==="air"?"Válvula de aire":"Válvula de lubricante")+
        " · "+(on?"Activa":"Inactiva")}</title>
    </g>
  );

  return <svg viewBox="0 0 1120 690" role="img"
    aria-label="Gear Spray: aire instrumental desde acometida a SV-2560, SV-2563 y colector; transmisor PI-2561 próximo al dosificador; tambor, bomba, filtro, PI-2560, SV-2561, dosificador y seis boquillas"
    className="block h-auto w-full min-w-[700px] rounded-lg border border-slate-300 bg-white">
    <rect x="0" y="0" width="1120" height="690" rx="10" fill="#fff"/>
    <text x="24" y="29" fontSize="17" fontWeight="750" fill="#0f2940">
      LUBRICACIÓN DE CORONA · GEAR SPRAY
    </text>
    <text x="24" y="49" fontSize="11" fill="#64748b">
      Escena 06 · Distribución de aire y lubricante · E/S físicas del Micro850
    </text>
    <g fontSize="10.5" fill="#334155">
      <path d="M771 24 H801" stroke="#168bd1" strokeWidth="6"/>
      <text x="811" y="28">Aire</text>
      <path d="M869 24 H899" stroke="#a4adb9" strokeWidth="7"/>
      <text x="909" y="28">Lubricante</text>
      <circle cx="988" cy="24" r="6" fill="#16a34a"/>
      <text x="1001" y="28">Activo</text>
    </g>
    <rect x="18" y="65" width="1084" height="590" rx="10"
      fill="#f5f7fa" stroke="#d7e1e9"/>

    {/* AIRE: una sola acometida con una tee en x=230. Dos válvulas:
        SV-2560 acciona la bomba, SV-2563 alimenta la atomización. */}
    <text x="38" y="264" fontSize="12" fontWeight="750" fill="#0369a1">
      AIRE INSTRUMENTAL
    </text>
    <text x="38" y="282" fontSize="10.5" fill="#475569">Acometida de planta</text>
    {pipe("M42 305 H230 V156 H964 V548","air",air)}
    {pipe("M230 305 H370 V412 H305","air",pump)}
    {tee(230,305,"air")}
    <path d="M42 293 L27 305 L42 317" fill="none"
      stroke="#0284c7" strokeWidth="3"/>
    <text x="564" y="133" fontSize="11" fontWeight="700" fill="#075985">
      AIRE DE ATOMIZACIÓN
    </text>
    {solenoid(464,156,"SV-2563",air,"air")}
    {solenoid(300,305,"SV-2560",pump,"air")}

    {/* Presión de aire en la zona del bloque dosificador.
        La toma parte directamente del cabezal neumático mediante una tee. */}
    {pipe("M704 156 V188","air",air)}
    {tee(704,156,"air")}
    <circle cx="704" cy="205" r="17" fill="#dbeafe"
      stroke="#0369a1" strokeWidth="3"/>
    <path d="M704 205 L714 197 M704 192 V195" stroke="#0369a1"
      strokeWidth="2" fill="none"/>
    <text x="638" y="247" fontSize="11.5" fontWeight="750" fill="#334155">
      PI-2561 · AIRE
    </text>
    <rect x="638" y="255" width="124" height="34" rx="5"
      fill="#dbeafe" stroke="#0284c7" strokeWidth="1.5"/>
    <text x="700" y="277" textAnchor="middle" fontSize="17" fontWeight="750"
      fill="#075985">{gearNumber(project,"_310_PI_2561").toFixed(1)}</text>

    {/* LUBRICANTE: succión desde el tambor, descarga de la bomba, filtro y
        válvula SV-2561 hasta la entrada lateral del dosificador. */}
    <text x="433" y="491" fontSize="11.5" fontWeight="700" fill="#92400e">
      CIRCUITO DE LUBRICANTE
    </text>
    <rect x="208" y="483" width="103" height="109" rx="9"
      fill="#334155" stroke="#0f172a" strokeWidth="3"/>
    <ellipse cx="259" cy="483" rx="51" ry="11"
      fill="#64748b" stroke="#0f172a" strokeWidth="2"/>
    <path d="M208 521 H311 M208 555 H311" stroke="#94a3b8" strokeWidth="3"/>
    <text x="259" y="529" fontSize="11" fontWeight="750" fill="#fff"
      textAnchor="middle">TAMBOR</text>
    <text x="259" y="547" fontSize="10" fill="#e2e8f0"
      textAnchor="middle">310-LU-003-HE</text>
    <circle cx="331" cy="537" r="9" fill={low?"#ef4444":"#34d399"}
      stroke="#0f172a" strokeWidth="2"/>
    <text x="348" y="541" fontSize="10.5" fontWeight="650"
      fill="#334155">LSL {low?"BAJO":"OK"}</text>
    {pipe("M259 483 V445 H779","lube",grease&&pump)}
    <rect x="224" y="412" width="79" height="55" rx="8"
      fill={pump?"#ccf5e3":"#dce4ec"}
      stroke={pump?surfaces.active:"#475569"} strokeWidth="3"/>
    <circle cx="263" cy="439" r="19" fill="#fff" stroke="#475569" strokeWidth="2"/>
    <path d="M251 449 L263 427 L275 449 Z"
      fill={pump?surfaces.active:"#94a3b8"}/>
    <rect x="296" y="405" width="15" height="14" rx="2"
      fill={pump?"#0ea5e9":"#cbd5e1"} stroke="#475569" strokeWidth="2"/>
    <text x="263" y="395" fontSize="11" fontWeight="750"
      fill="#334155" textAnchor="middle">BOMBA NEUMÁTICA</text>

    {/* Equipos montados sobre la tubería de lubricante, sin juntas ficticias. */}
    {/* Filtro compacto para liberar espacio respecto al transmisor PI-2560. */}
    <rect x="389" y="432" width="32" height="26" rx="4"
      fill="#fff" stroke="#64748b" strokeWidth="2.5"/>
    <path d="M394 454 L415 435 M394 443 L402 435 M407 454 L417 445"
      stroke="#94a3b8" strokeWidth="2.4"/>
    <text x="405" y="418" fontSize="10.5" fontWeight="750" fill="#334155"
      textAnchor="middle">FILTRO</text>
    {solenoid(659,445,"SV-2561",grease,"lube")}

    {/* PI-2560: presión de lubricante en la toma entre el FILTRO y SV-2561.
        Derivación vertical conectada al mismo tramo continuo de lubricante. */}
    <path d="M530 445 V416" stroke="#64748b" strokeWidth="4" fill="none"/>
    {tee(530,445,"lube")}
    <circle cx="530" cy="402" r="14" fill="#ffedd5"
      stroke="#d97706" strokeWidth="3"/>
    <path d="M530 402 L538 396" stroke="#92400e" strokeWidth="2.5"/>
    <text x="530" y="337" textAnchor="middle" fontSize="11.5" fontWeight="750" fill="#334155">
      PI-2560 · LUBRICANTE
    </text>
    <rect x="473" y="345" width="114" height="34" rx="5"
      fill="#ffedd5" stroke="#d97706" strokeWidth="1.5"/>
    <text x="530" y="367" textAnchor="middle" fontSize="17" fontWeight="750"
      fill="#92400e">{gearNumber(project,"_310_PI_2560").toFixed(1)}</text>

    {/* Sensor de proximidad colocado encima del bloque. */}
    <circle cx="845" cy="250" r="25" fill={dosing?"#22c55e":"#e2e8f0"}
      stroke={dosing?"#15803d":"#64748b"} strokeWidth="3"/>
    <text x="845" y="246" textAnchor="middle" fill="#0f172a"
      fontSize="12" fontWeight="750">SQS</text>
    <text x="845" y="260" textAnchor="middle" fill="#0f172a"
      fontSize="12" fontWeight="750">2561</text>
    <rect x="839" y="275" width="12" height="26" rx="2"
      fill="#94a3b8" stroke="#475569" strokeWidth="2"/>

    {/* Bloque de dosificación: la alimentación de lubricante entra por la
        conexión izquierda; sus seis salidas alimentan las boquillas. */}
    <rect x="779" y="301" width="132" height="251" rx="9"
      fill="#cbd5e1" stroke="#475569" strokeWidth="3"/>
    <rect x="790" y="311" width="109" height="231" rx="6"
      fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2"/>
    <path d="M845 313 V540" stroke="#94a3b8" strokeWidth="2"/>
    {nozzleYs.map((y,i)=><g key={"dist-"+i}>
      <circle cx="845" cy={y} r="7" fill="#94a3b8"
        stroke="#475569" strokeWidth="2"/>
      <circle cx="845" cy={y} r="2.5" fill="#fff"/>
      <rect x="902" y={y-9} width="18" height="18" rx="3"
        fill="#cbd5e1" stroke="#475569" strokeWidth="1.5"/>
    </g>)}
    <text x="845" y="576" textAnchor="middle" fontSize="11.5"
      fontWeight="750" fill="#334155">BLOQUE DOSIFICADOR</text>

    {/* Cada boquilla es un cabezal mixto: una entrada de lubricante y otra de aire.
        Las líneas cruzan el colector de aire SIN conectarse: el pequeño puente
        blanco marca el cruce, y las dos entradas terminan en el mismo cabezal. */}
    {nozzleYs.map((y,i)=><g key={"nozzle-"+i}>
      {pipe("M911 "+(y+9)+" H1019","lube",grease&&pump)}
      <path d={"M957 "+(y+9)+" H971"} stroke="#f5f7fa" strokeWidth="14"/>
      <path d={"M957 "+(y+9)+" H971"} stroke="#334155" strokeWidth="11"/>
      <path d={"M957 "+(y+9)+" H971"} stroke="#a4adb9" strokeWidth="7"/>
      {pipe("M964 "+(y-12)+" H1019","air",air)}
      <rect x="1014" y={y-19} width="46" height="39" rx="5"
        fill={atomizing?"#c1dcee":"#d5dde5"}
        stroke="#475569" strokeWidth="2.5"/>
      <path d={"M1014 "+(y-12)+" h18 M1014 "+(y+9)+" h18"}
        strokeWidth="5" stroke="#334155"/>
      <ellipse cx="1060" cy={y} rx="9" ry="13"
        fill="#cbd5e1" stroke="#475569" strokeWidth="2"/>
      <path d={"M1068 "+y+" l20 -13 M1068 "+y+" h25 M1068 "+y+" l20 13"}
        stroke={atomizing?"#0284c7":"#94a3b8"}
        strokeWidth="2.5" strokeLinecap="round"/>
      {atomizing&&<path d={"M1075 "+y+" l24 -19 M1075 "+y+" l24 19"}
        stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 5"/>}
    </g>)}
    <text x="1020" y="576" textAnchor="middle"
      fontSize="11.5" fontWeight="750" fill="#334155">6 BOQUILLAS</text>

    {/* La válvula de atomización y la de bomba solo cambian de color según
        las salidas del PLC; esta vista no escribe ni fuerza E/S. */}
    <rect x="34" y="607" width="265" height="27" rx="5"
      fill="#e2e8f0" stroke="#cbd5e1"/>
    <circle cx="49" cy="620" r="6" fill={pump?"#16a34a":"#94a3b8"}/>
    <text x="63" y="624" fontSize="11" fill="#334155" fontWeight="650">
      Bomba: {pump?"ON":"OFF"}
    </text>
    <circle cx="172" cy="620" r="6" fill={grease?"#16a34a":"#94a3b8"}/>
    <text x="185" y="624" fontSize="11" fill="#334155" fontWeight="650">
      Lubricante: {grease?"ON":"OFF"}
    </text>
    <rect x="860" y="606" width="186" height="28" rx="5"
      fill={mill?"#d1fae5":"#e2e8f0"} stroke="#94a3b8"/>
    <text x="953" y="625" textAnchor="middle" fontSize="11.5"
      fontWeight="750" fill={mill?"#065f46":"#475569"}>
      MOLINO {mill?"RUN":"STOP"}
    </text>
    <text x="25" y="679" fontSize="11" fill="#64748b">
      Visualización de E/S CCW · Presiones sin unidad verificada · sin física automática en fase 1
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
            Ingresa un número o mueve la barra. Presiones: rangos de escalamiento
            del sistema original Cscape; falta confirmar la equivalencia en CCW.
          </p>
          <h4 className="mb-2 text-[11px] font-semibold text-slate-200">Entradas analógicas</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GEAR_FIELD_INPUTS.filter(x=>x.type==="REAL").map(input=>{
              const isAir=input.name==="_310_PI_2561";
              return <NumberSetting key={input.name} name={input.name}
                label={isAir?"Presión de aire":"Presión de lubricante"}
                min={0} max={isAir?148:1480} step={0.1}
                caption={isAir?"Referencia original: 0–148":
                  "Referencia original: 0–1480"}
                value={gearNumber(project,input.name)}
                onCommit={value=>onAnalogInput(input.name as GearAnalogInput,value)}/>;
            })}
          </div>
          <h4 className="mb-2 mt-3 text-[11px] font-semibold text-slate-200">Setpoints de operación</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GEAR_HMI_SETPOINTS.map(sp=><NumberSetting key={sp.name}
              name={sp.name} integer value={gearNumber(project,sp.name)}
              label={sp.name==="TMR_Freq_SP"?"Frecuencia entre lubricaciones":
                sp.name==="CNT_LubeFlo_SP"?"Pulsos por lubricación":
                sp.name==="TMR_LubeFlo_SP"?"Tiempo máximo de lubricación":
                "Duración de mantenimiento"}
              caption="Deslizador con escala ampliable; el programa no define un máximo operativo para esta consigna."
              onCommit={value=>onSetpoint(sp.name as GearSetpoint,value)}/>)}
          </div>
          <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
            <h4 className="text-[11px] font-semibold">Entradas digitales de campo</h4>
            {GEAR_FIELD_INPUTS.filter(x=>x.type==="BOOL").map(x=>
              <label key={x.name} className="flex cursor-pointer items-start gap-2 rounded border border-[#354d62] bg-[#0f2434] p-2 text-[11px]">
                <input type="checkbox" checked={v(x.name)}
                  onChange={event=>onDigitalInput(x.name as GearDigitalInput,event.target.checked)}
                  className="mt-0.5 accent-sky-500"/>
                <span className="min-w-0 break-words text-slate-200">
                  {x.name==="_310_PLC104_YI_MillRun"?"Confirmación de molino en marcha":
                    x.name==="_310_SQS_2561"?"Pulso del dosificador":
                    "Sensor de nivel bajo de lubricante"}{" "}
                  <span className="font-mono text-sky-300">({x.name})</span>
                </span>
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
