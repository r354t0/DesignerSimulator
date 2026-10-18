import { useState } from "react";
import { ArrowRight, CarFront, CircleAlert, CircleHelp, Gauge, Pause, Play, RotateCcw, ScanLine, Users } from "lucide-react";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { TrafficSceneInfoDialog } from "./TrafficSceneInfoDialog";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import {
  readTrafficBool, readTrafficCount, trafficWaiting, TRAFFIC_PHASES,
  TRAFFIC_TIMERS, type TrafficDirection, type TrafficState,
} from "../../plc/trafficSceneModel";

interface Props {
  project:PracticeProject;
  mode:ScanMode;
  state:TrafficState;
  onInputChange:(name:"PB_Start"|"PB_Stop"|"PB_Reset"|"PB_Pedestrian",pressed:boolean)=>void;
  onAddVehicle:(direction:TrafficDirection)=>void;
  onReset:()=>void;
  onPrepareTags:()=>void;
  setupError:string|null;
  onOpenTags:()=>void;
  onLoadExample:()=>void;
  onResetExample:()=>void;
}

function Led({label,lit,tone="green"}:{
  label:string;lit:boolean;tone?:"green"|"amber"|"red"|"blue";
}) {
  const glow={green:"bg-emerald-400 shadow-[0_0_12px_#34d39999]",
    amber:"bg-amber-400 shadow-[0_0_12px_#fbbf2499]",
    red:"bg-red-400 shadow-[0_0_12px_#f8717199]",
    blue:"bg-sky-400 shadow-[0_0_12px_#38bdf899]"}[tone];
  return <div className="flex min-h-9 items-center gap-2 rounded border border-[#334d5f] bg-[#112231] px-2">
    <span className={"size-3.5 shrink-0 rounded-full border border-white/25 "+
      (lit?glow:"bg-[#334452]")}/>
    <span className="text-[10px] font-medium text-slate-200">{label}</span>
  </div>;
}
function Lamp({x,y,green,yellow,red,title}:{
  x:number;y:number;green:boolean;yellow:boolean;red:boolean;title:string;
}) {
  return <g>
    <rect x={x-16} y={y-20} width="32" height="98" rx="7" fill="#0e1b24"
      stroke="#607889" strokeWidth="2"/>
    {([["#ef4444",red],["#fbbf24",yellow],["#22c55e",green]] as const)
      .map(([color,on],i)=>
        <circle key={i} cx={x} cy={y+i*30} r="10"
          fill={on?color:"#233641"} stroke={on?color:"#586e7a"}
          strokeWidth="1.5" opacity={on?1:0.6}/>)}
    <text x={x} y={y+91} textAnchor="middle" fontSize="12" fontWeight="700"
      fill="#1f3443">{title}</text>
  </g>;
}
export function TrafficScene({project,mode,state,onInputChange,onAddVehicle,onReset,
  onPrepareTags,setupError,onOpenTags,onLoadExample,onResetExample}:Props) {
  const [infoOpen,setInfoOpen]=useState(false);
  const running=mode==="running";
  const b=(name:string)=>running&&readTrafficBool(project,name);
  const nsG=b("DO_NS_GreenLight"),ewG=b("DO_EW_GreenLight");
  const nsY=b("DO_NS_YellowLight"),ewY=b("DO_EW_YellowLight");
  const nsR=b("DO_NS_RedLight"),ewR=b("DO_EW_RedLight");
  const walk=b("DO_PedestrianWalk");
  const pending=readTrafficBool(project,"ST_PedPending");
  const fault=readTrafficBool(project,"ALM_PhaseConflict");
  const phase=TRAFFIC_PHASES.find(p=>readTrafficBool(project,p));
  const phaseLabels: Record<string,string> = {
    ST_NS_GreenPhase:"VERDE N-S",ST_NS_YellowPhase:"AMARILLO N-S",
    ST_AllRed1Phase:"ROJO DE SEGURIDAD",ST_EW_GreenPhase:"VERDE E-O",
    ST_EW_YellowPhase:"AMARILLO E-O",ST_AllRed2Phase:"ROJO DE SEGURIDAD",
    ST_PedestrianPhase:"CRUCE PEATONAL",
  };
  const phaseLabel=phaseLabels[phase??""]??"EN ESPERA";
  const timer=Object.keys(TRAFFIC_TIMERS).find(name=>{
    const tag=project.tags.find(t=>t.name===name);
    return tag?.type==="TIMER"&&typeof tag.value==="object"&&tag.value.EN===true;
  });
  const timed=project.tags.find(t=>t.name===timer);
  const timerValue=timed?.type==="TIMER"&&typeof timed.value==="object"?timed.value:null;
  const valid=["PB_Start","DO_NS_GreenLight","CNT_NS_Vehicles","PB_Pedestrian"]
    .every(name=>project.tags.some(t=>t.name===name));
  const nsCount=readTrafficCount(project,"CNT_NS_Vehicles");
  const ewCount=readTrafficCount(project,"CNT_EW_Vehicles");
  return (
    <section aria-label="SCADA · Control semaforizado"
      className="sort-scada-shell scada-control-shell flex h-full min-h-0 flex-col overflow-y-auto text-slate-100">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <header className="sort-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#344c5e] px-3 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-md border border-[#335d76] bg-[#14344a] text-sky-300">
              <CarFront size={21}/>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">SCADA · INTERSECCIÓN C-04</div>
              <h2 className="text-sm font-semibold">Control de tráfico de dos avenidas</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={"rounded border px-2 py-1.5 text-[10px] font-bold "+
              (running?"border-emerald-800 bg-emerald-950/60 text-emerald-300":
                "border-slate-600 bg-slate-800 text-slate-300")}>
              PLC · {running?"RUN":mode==="paused"?"PAUSE":"STOP"}
            </span>
            <button type="button" onClick={()=>setInfoOpen(true)}
              aria-label="Información sobre la escena de semáforos"
              className="inline-flex items-center gap-1 rounded border border-[#456276] bg-[#1a3549] px-2.5 py-1.5 text-[11px] text-sky-200 hover:bg-[#24475f]">
              <CircleHelp size={15}/> Objetivo y mapa E/S
            </button>
          </div>
        </header>

        <div className="scada-scene-workspace">
        <section className="sort-panel scada-process-panel rounded-lg border border-[#344c5e] p-3"
          aria-labelledby="traffic-process-title">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="traffic-process-title" className="flex items-center gap-2 text-xs font-semibold">
              <ScanLine size={16} className="text-sky-300"/> Vista de proceso
            </h3>
            <span className={"rounded bg-[#102534] px-2 py-1 font-mono text-[10px] "+
              (fault?"text-red-300":"text-sky-300")}>{fault?"ALARMA":phaseLabel}</span>
          </div>
          <div className="scada-process-canvas overflow-x-auto rounded border border-[#7d8992] bg-[#ffffff]"
            role="img" aria-label={"Intersección: NS "+(nsG?"verde":nsY?"amarillo":"rojo")+
              ", EW "+(ewG?"verde":ewY?"amarillo":"rojo")+
              ", peatones "+(walk?"cruzando":"esperando")}>
            <svg viewBox="0 0 760 440" className="block h-auto w-full min-w-[390px]"
              xmlns="http://www.w3.org/2000/svg">
              <rect width="760" height="440" fill="#ffffff"/>
              <rect x="308" y="0" width="144" height="440" fill="#485560"/>
              <rect x="0" y="149" width="760" height="142" fill="#485560"/>
              <rect x="308" y="149" width="144" height="142" fill="#3c4853"/>
              <path d="M380 0 V149 M380 291 V440 M0 220 H308 M452 220 H760"
                stroke="#efde8a" strokeWidth="3" strokeDasharray="22 14"/>
              {Array.from({length:7},(_,i)=>(
                <g key={i}>
                  <rect x={312+i*20} y="133" width="12" height="14" fill="#d2dee6" opacity=".75"/>
                  <rect x={312+i*20} y="293" width="12" height="14" fill="#d2dee6" opacity=".75"/>
                  <rect x="291" y={154+i*19} width="14" height="11" fill="#d2dee6" opacity=".75"/>
                  <rect x="454" y={154+i*19} width="14" height="11" fill="#d2dee6" opacity=".75"/>
                </g>
              ))}
              <path d="M309 148 H379 M381 291 H450 M307 149 V220 M452 221 V290"
                stroke="#e4e8ee" strokeWidth="4"/>
              <text x="390" y="30" fill="#c6d5de" fontSize="13" textAnchor="middle">AV. NORTE - SUR</text>
              <text x="145" y="178" fill="#c6d5de" fontSize="13" textAnchor="middle">AV. ESTE - OESTE</text>
              <Lamp x={265} y={36} green={nsG} yellow={nsY} red={nsR} title="N-S"/>
              <Lamp x={494} y={327} green={ewG} yellow={ewY} red={ewR} title="E-O"/>
              {state.vehicles.map(car=>{
                const ns=car.axis==="NS";
                const x=ns?352:35+690*car.position;
                const y=ns?24+391*car.position:251;
                return <g key={car.id} transform={"translate("+x+" "+y+") rotate("+(ns?0:90)+")"}>
                  <rect x="-10" y="-17" width="20" height="34" rx="5"
                    fill={ns?"#3b82f6":"#f472b6"} stroke="#182735" strokeWidth="1.5"/>
                  <rect x="-7" y="-9" width="14" height="12" rx="2" fill="#23415b"/>
                  <path d="M-6 11H6" stroke="#e2e8f0" strokeWidth="2"/>
                </g>;
              })}
              <g transform="translate(548 38)">
                <rect x="-12" y="-16" width="83" height="62" rx="7" fill="#0e202b" stroke="#536d78"/>
                <circle cx="8" cy="4" r="8" fill={walk?"#4ade80":"#4b5a64"}/>
                <text x="25" y="8" fontSize="10" fill="#f1f5f9">PEATÓN</text>
                <text x="8" y="32" fontSize="10" fill={walk?"#86efac":"#eab767"}>
                  {walk?"PASE":"ESPERE"}</text>
              </g>
              {fault&&<g>
                <rect x="260" y="191" width="240" height="55" rx="6" fill="#7f1d1d" stroke="#f87171"/>
                <text x="380" y="222" textAnchor="middle" fontSize="16" fontWeight="700"
                  fill="#fff">CONFLICTO DE FASES</text>
              </g>}
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={()=>onAddVehicle("NS")}
              className="inline-flex items-center gap-1 rounded border border-sky-700 bg-[#173a53] px-3 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-[#24536f]">
              <CarFront size={14}/> Añadir vehículo N-S
            </button>
            <button type="button" onClick={()=>onAddVehicle("EW")}
              className="inline-flex items-center gap-1 rounded border border-sky-700 bg-[#173a53] px-3 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-[#24536f]">
              <CarFront size={14}/> Añadir vehículo E-O
            </button>
            <button type="button" onClick={onReset} disabled={running}
              title="Disponible solamente con el PLC detenido"
              className="inline-flex items-center gap-1 rounded border border-slate-600 px-3 py-1.5 text-[11px] hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
              <RotateCcw size={13}/> Vaciar intersección
            </button>
            <span className="ml-auto text-[10px] text-slate-400">
              Vehículos en escena: {state.vehicles.length}
            </span>
          </div>
        </section>

        <aside className="scada-scene-sidebar" aria-label="Controles e indicadores del SCADA">
          <div className="scada-dashboard-grid grid gap-3">
          <section className="sort-panel rounded-lg border border-[#344c5e] p-2.5"
            aria-label="Tablero de mando">
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
              <Gauge size={14}/> Tablero de mando
            </h3>
            <div className="scada-command-buttons grid max-w-[210px] grid-cols-2 gap-2">
              <MomentaryPushButton compact name="START" tone="start"
                pressed={readTrafficBool(project,"PB_Start")}
                onChange={value=>onInputChange("PB_Start",value)}
                icon={<Play size={15}/>}>START</MomentaryPushButton>
              <MomentaryPushButton compact name="STOP" tone="stop"
                pressed={readTrafficBool(project,"PB_Stop")}
                onChange={value=>onInputChange("PB_Stop",value)}
                icon={<Pause size={15}/>}>STOP</MomentaryPushButton>
              <MomentaryPushButton compact name="PEATÓN" tone="drain"
                pressed={readTrafficBool(project,"PB_Pedestrian")}
                onChange={value=>onInputChange("PB_Pedestrian",value)}
                icon={<Users size={15}/>}>PEATÓN</MomentaryPushButton>
              <MomentaryPushButton compact name="RESET" tone="drain"
                pressed={readTrafficBool(project,"PB_Reset")}
                onChange={value=>onInputChange("PB_Reset",value)}
                icon={<RotateCcw size={15}/>}>RESET</MomentaryPushButton>
            </div>
          </section>
          <section className="sort-panel min-w-0 rounded-lg border border-[#344c5e] p-3"
            aria-label="Pilotos LED y tráfico">
            <h3 className="mb-2 text-xs font-semibold">Pilotos LED y tráfico</h3>
            <div className="scada-pilot-grid grid grid-cols-2 gap-2">
              <Led label="VERDE N-S" tone="green" lit={nsG}/>
              <Led label="AMARILLO N-S" tone="amber" lit={nsY}/>
              <Led label="ROJO N-S" tone="red" lit={nsR}/>
              <Led label="VERDE E-O" tone="green" lit={ewG}/>
              <Led label="AMARILLO E-O" tone="amber" lit={ewY}/>
              <Led label="ROJO E-O" tone="red" lit={ewR}/>
              <Led label="CRUCE PEATONAL" tone="green" lit={walk}/>
              <Led label="SOLICITUD PENDIENTE" tone="blue" lit={pending}/>
              <Led label="DEMANDA N-S" tone="amber" lit={trafficWaiting(state,"NS")}/>
              <Led label="DEMANDA E-O" tone="amber" lit={trafficWaiting(state,"EW")}/>
              <Led label="FALLO / CONFLICTO" tone="red" lit={fault}/>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#344c5e] pt-2 text-center">
              <div><span className="text-[10px] text-slate-400">Vehículos N-S</span>
                <div className="font-mono text-lg font-bold text-sky-300">{nsCount}</div></div>
              <div><span className="text-[10px] text-slate-400">Vehículos E-O</span>
                <div className="font-mono text-lg font-bold text-rose-300">{ewCount}</div></div>
            </div>
          </section>
          </div>

          <section className="sort-panel rounded-lg border border-[#344c5e] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Supervisión de ciclo</h3>
            <span className="text-[11px] text-sky-300">{phaseLabel}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
            <div className="rounded border border-[#344c5e] bg-[#102130] p-2">
              <div className="text-slate-400">Temporizador</div>
              <div className="mt-1 font-mono text-slate-200">{timer??"—"}</div>
            </div>
            <div className="rounded border border-[#344c5e] bg-[#102130] p-2">
              <div className="text-slate-400">ACC / PRE</div>
              <div className="mt-1 font-mono text-slate-200">
                {timerValue?.ACC??0} / {timerValue?.PRE??0} ms
              </div>
            </div>
            <div className="rounded border border-[#344c5e] bg-[#102130] p-2">
              <div className="text-slate-400">Paso siguiente</div>
              <div className="mt-1 text-slate-200">
                {pending?"Peatón solicitado":"Secuencia normal"} <ArrowRight size={12} className="inline"/>
              </div>
            </div>
          </div>
          </section>
        </aside>
        </div>
        {!valid&&<div role="alert" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-xs">
          <p className="flex items-center gap-2 font-semibold text-amber-300">
            <CircleAlert size={15}/> Faltan tags de la escena
          </p>
          <p className="mt-1 text-slate-300">{setupError??"Revisa los tags de semáforos."}</p>
          <button type="button" onClick={onPrepareTags}
            className="mt-2 rounded border border-amber-600 px-3 py-1.5 text-amber-200">
            Reintentar registro
          </button>
        </div>}
      </div>
      <TrafficSceneInfoDialog open={infoOpen} project={project}
        onClose={()=>setInfoOpen(false)} onOpenTags={onOpenTags}
        onLoadExample={onLoadExample} onResetExample={onResetExample}/>
    </section>
  );
}
