import { useEffect, useState } from "react";
import { Beaker, CircleHelp, Gauge, Play, Square, RotateCcw, Thermometer } from "lucide-react";
import type { PracticeProject } from "../../plc/practiceDocument";
import type { ScanMode } from "../../plc/practiceScanCycle";
import {
  batchBool,batchInt,batchCounter,BATCH_EXERCISES,BATCH_IO_TAGS,
  type BatchExercise,type BatchMode,type BatchMixerState,
} from "../../plc/batchMixerSceneModel";
import { MomentaryPushButton } from "./MomentaryPushButton";
import { BatchMixerSceneInfoDialog } from "./BatchMixerSceneInfoDialog";

interface Props {
  project:PracticeProject;
  mode:ScanMode;
  state:BatchMixerState;
  selectedExercise:BatchExercise|null;
  setupError:string|null;
  onInputChange:(name:"PB_Start"|"PB_Stop"|"PB_Enter",pressed:boolean)=>void;
  onModeChange:(mode:BatchMode)=>void;
  onSetIntegers:(values:{INT_TempSP:number;INT_RatioP1:number;INT_BatchTarget:number})=>void;
  onReset:()=>void;
  onPrepareTags:()=>void;
  onOpenTags:()=>void;
  onLoadSolution:(exercise:BatchExercise)=>void;
  onResetSolution:()=>void;
}
function Indicator({name,active,tone="green"}:{
  name:string;active:boolean;tone?:"green"|"amber"|"blue"|"red";
}){
  const colors={green:"bg-emerald-400 shadow-[0_0_12px_#34d399]",
    amber:"bg-amber-400 shadow-[0_0_12px_#fbbf24]",
    blue:"bg-sky-400 shadow-[0_0_12px_#38bdf8]",
    red:"bg-red-400 shadow-[0_0_12px_#f87171]"};
  return <div className="flex min-h-9 items-center gap-2 rounded border border-[#34495d] bg-[#101e2b] px-2">
    <span className={"size-3.5 shrink-0 rounded-full border border-slate-500 "+
      (active?colors[tone]:"bg-slate-700")}/>
    <span className="text-[11px] text-slate-200">{name}</span>
  </div>;
}
function Pump({x,y,label,on,down=false}:{
  x:number;y:number;label:string;on:boolean;down?:boolean;
}){
  return <g transform={"translate("+x+" "+y+")"}>
    <rect x="-22" y="-21" width="44" height="42" rx="8"
      fill={on?"#246052":"#475569"} stroke={on?"#059669":"#1e293b"} strokeWidth="3"/>
    <circle r="14" fill="#182a36" stroke={on?"#4ade80":"#94a3b8"} strokeWidth="2.5"/>
    <path d="M-8 0H8M0 -8V8" stroke="#dbeafe" strokeWidth="3"/>
    <path d={down?"M0 -8L7 1L0 8":"M-7 -7L7 0L-7 7"} fill="none"
      stroke={on?"#86efac":"#cbd5e1"} strokeWidth="2.3"/>
    <text x="0" y="-34" textAnchor="middle" fill="#263746"
      fontSize="12" fontWeight="700">{label}</text>
  </g>;
}
function Flowmeter({x,y,label,active}:{
  x:number;y:number;label:string;active:boolean;
}){
  return <g transform={"translate("+x+" "+y+")"}>
    <circle r="14" fill="#f1f5f9" stroke="#334155" strokeWidth="2.8"/>
    <circle r="5" fill={active?"#16a34a":"#64748b"}/>
    <path d="M-5 0H6M2 -4L6 0L2 4" fill="none" stroke="#0f172a" strokeWidth="2"/>
    <text x="0" y="-24" textAnchor="middle" fontSize="10" fontWeight="700"
      fill="#1e3a4a">{label}</text>
  </g>;
}
function BatchProcessGraphic({state,outputs,sp}:{state:BatchMixerState;
  outputs:{p1:boolean;p2:boolean;p3:boolean;mixer:boolean;heater:boolean};
  sp:number;}){
  const levelY=292-state.level*2.1;
  const in1=outputs.p1,in2=outputs.p2,out3=outputs.p3;
  return <div className="scada-process-canvas overflow-x-auto rounded-lg border border-[#8b97a2] bg-white"
    role="img" aria-label={"Batch Mixer: nivel "+state.level+"%, temperatura "+
      state.temperature.toFixed(1)+" grados, bombas "+
      [in1,in2,out3].map(x=>x?"RUN":"OFF").join(", ")}>
    <svg viewBox="0 0 760 380" className="block h-auto w-full min-w-[580px]"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="bm-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6dd3ef"/>
          <stop offset="100%" stopColor="#1175ac"/>
        </linearGradient>
        <clipPath id="bm-clip"><rect x="292" y="82" width="184" height="210" rx="8"/></clipPath>
      </defs>
      <rect width="760" height="380" fill="#ffffff"/>
      <path d="M20 321H733" stroke="#a3afb8" strokeWidth="4"/>
      {/* Two feed lines with individual pumps and flowmeters */}
      {[0,1].map(i=>{
        const y=i===0?92:171;
        const active=i===0?in1:in2;
        return <g key={i}>
          <path d={"M15 "+y+" H260 L284 "+(i===0?135:210)+" H291"}
            fill="none" stroke="#334155" strokeWidth="12" strokeLinejoin="round"/>
          <path d={"M15 "+y+" H260 L284 "+(i===0?135:210)+" H291"}
            fill="none" stroke={active?"#22c55e":"#5d7180"}
            strokeWidth="6" strokeLinejoin="round" strokeDasharray={active?"14 8":undefined}
            className={active?"tank-flow-motion":undefined}/>
          <Flowmeter x={76} y={y} label={"FM-"+(i+1)} active={active}/>
          <Pump x={166} y={y} label={"P"+(i+1)} on={active}/>
          <text x="18" y={y-48} fontSize="10" fill="#334155" fontWeight="700">
            {i===0?"PRODUCTO 1":"PRODUCTO 2"}
          </text>
        </g>;
      })}
      {/* Tank vessel and level */}
      <rect x="286" y="75" width="196" height="225" rx="10"
        fill="#e2e8f0" stroke="#334155" strokeWidth="6"/>
      <g clipPath="url(#bm-clip)">
        <rect x="292" y={levelY} width="184" height={Math.max(0,292-levelY)}
          fill="url(#bm-water)" opacity=".90"/>
        {state.level>0&&<path d={"M292 "+levelY+" Q330 "+(levelY-4)+" 382 "+levelY+
          " T476 "+levelY} fill="none" stroke="#e0f2fe" strokeWidth="2"/>}
      </g>
      {/* The tank's title and the two probe names remain outside equipment
          outlines, in clear white space. The HMI already shows level %. */}
      <text x="590" y="57" textAnchor="middle" fontSize="13"
        fontWeight="700" fill="#263a47">TK-05 · BATCH MIXER</text>
      {/* Each sensor has normally-open (wet = TRUE) detection.
          HI is mounted at 100%, LO at the tank floor (0%).
          No intermediate level lines: the SCADA shows the percentage below. */}
      <g>
        <rect x="479" y="79" width="14" height="13" rx="3"
          fill={state.level>=100?"#eab308":"#64748b"} stroke="#334155" strokeWidth="1.5"/>
        <text x="500" y="90" fontSize="12" fontWeight="700"
          fill="#243746">HI-LEVEL</text>
      </g>
      <g>
        <rect x="279" y="283" width="14" height="13" rx="3"
          fill={state.level>0?"#eab308":"#64748b"} stroke="#334155" strokeWidth="1.5"/>
        <text x="268" y="292" textAnchor="end" fontSize="12" fontWeight="700"
          fill="#243746">LO-LEVEL</text>
      </g>
      {/* Mixer motor and rotating shaft */}
      <rect x="356" y="16" width="55" height="29" rx="5"
        fill={outputs.mixer?"#16a34a":"#b45309"} stroke="#334155" strokeWidth="2"/>
      <text x="383" y="10" textAnchor="middle" fontSize="11" fill="#334155"
        fontWeight="700">MIXER</text>
      <path d="M384 46V240" stroke="#334155" strokeWidth="6"/>
      <g className="conveyor-motor-spin"
        style={{transformOrigin:"384px 240px",
          animationPlayState:outputs.mixer?"running":"paused"}}>
        <path d="M332 240H436M348 228L420 252M420 228L348 252"
          stroke={outputs.mixer?"#047857":"#64748b"} strokeWidth="7"
          fill="none" strokeLinecap="round"/>
      </g>
      {/* Heating element below vessel */}
      <rect x="311" y="301" width="151" height="29" rx="4"
        fill={outputs.heater?"#dc2626":"#9ca3af"} stroke="#475569" strokeWidth="2"/>
      <path d="M322 315h16l8 -7l8 14l8 -14l8 14l8 -14l8 14l8 -7h70"
        fill="none" stroke={outputs.heater?"#fef08a":"#475569"} strokeWidth="3"/>
      <text x="385" y="351" textAnchor="middle" fontSize="11" fill="#334155"
        fontWeight="700">HEATER {outputs.heater?"ON":"OFF"}</text>
      {/* Drain pump P3 and flowmeter */}
      <path d="M482 275 H560 V318 H737" fill="none" stroke="#334155"
        strokeWidth="12" strokeLinejoin="round"/>
      <path d="M482 275 H560 V318 H737" fill="none"
        stroke={out3?"#22c55e":"#5d7180"} strokeWidth="6"
        strokeDasharray={out3?"14 8":undefined}
        className={out3?"tank-flow-motion":undefined}/>
      <Flowmeter x={607} y={318} label="FM-3" active={out3}/>
      <Pump x={686} y={318} label="P3" on={out3}/>
      {/* Temperature is private simulated physics, not a PLC AI */}
      <rect x="543" y="173" width="202" height="70" rx="7"
        fill="#edf2f7" stroke="#64748b" strokeWidth="2"/>
      <text x="554" y="190" fontSize="11" fontWeight="700" fill="#334155">TERMOSTATO · DI</text>
      <text x="554" y="211" fontSize="16" fontWeight="700"
        fill="#075985">{state.temperature.toFixed(1)} °C</text>
      <text x="554" y="228" fontSize="11" fill="#334155">
        SP {sp} °C · {out3?"ENFRIANDO":outputs.heater?"CALENTANDO":
          state.temperature>=sp?"ALCANZADO":"EN ESPERA"}
      </text>
    </svg>
  </div>;
}
export function BatchMixerScene({project,mode,state,selectedExercise,setupError,
  onInputChange,onModeChange,onSetIntegers,onReset,onPrepareTags,onOpenTags,
  onLoadSolution,onResetSolution}:Props){
  const [infoOpen,setInfoOpen]=useState(false);
  const [draft,setDraft]=useState({INT_TempSP:"32",INT_RatioP1:"40",INT_BatchTarget:"3"});
  const [error,setError]=useState("");
  const running=mode==="running";
  const canSet=mode==="stopped";
  const selectedMode:BatchMode=batchBool(project,"DI_ModeB")?"B":
    batchBool(project,"DI_ModeC")?"C":"A";
  const tempSP=batchInt(project,"INT_TempSP");
  const ratio=batchInt(project,"INT_RatioP1");
  const target=batchInt(project,"INT_BatchTarget");
  useEffect(()=>{
    if(mode!=="stopped")return;
    setDraft({INT_TempSP:String(tempSP),INT_RatioP1:String(ratio),
      INT_BatchTarget:String(target)});
  },[tempSP,ratio,target,mode]);
  const save=()=>{
    const parsed=Object.entries(draft).map(([name,text])=>({name,value:Number(text)}));
    const valid=parsed.every(({value})=>Number.isInteger(value))&&
      Number(draft.INT_TempSP)>=20&&Number(draft.INT_TempSP)<=90&&
      Number(draft.INT_RatioP1)>=0&&Number(draft.INT_RatioP1)<=100&&
      Number(draft.INT_BatchTarget)>=1&&Number(draft.INT_BatchTarget)<=99;
    if(!valid){setError("Usa enteros: temperatura 20–90 °C, producto 1 0–100 %, lotes 1–99.");return;}
    onSetIntegers({
      INT_TempSP:Number(draft.INT_TempSP),
      INT_RatioP1:Number(draft.INT_RatioP1),
      INT_BatchTarget:Number(draft.INT_BatchTarget),
    });
    // Keep the original Enter pushbutton as a real SCADA digital input.
    // The editable HMI values themselves are ordinary INT tags, not BCD.
    onInputChange("PB_Enter",true);
    onInputChange("PB_Enter",false);
    setError("");
  };
  const bool=(name:string)=>running&&batchBool(project,name);
  const p1=bool("DO_Pump1"),p2=bool("DO_Pump2"),p3=bool("DO_Pump3");
  const mix=bool("DO_Mixer"),heat=bool("DO_Heater");
  const wired=BATCH_IO_TAGS.every(spec=>project.tags.some(tag=>
    tag.name===spec.name&&tag.type===spec.type));
  const source=selectedExercise?BATCH_EXERCISES.find(x=>x.id===selectedExercise):null;
  return <section aria-label="SCADA Batch Mixer"
    className="sort-scada-shell scada-control-shell flex h-full min-h-0 flex-col overflow-y-auto text-slate-100">
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <header className="sort-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#344c5e] p-3">
        <div className="flex items-center gap-2">
          <div className="rounded border border-sky-700 bg-[#14344a] p-2 text-sky-300"><Beaker size={21}/></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            SCADA · ESCENA 05</p>
            <h2 className="text-sm font-semibold">Batch Mixer · Mezcla por lotes</h2>
            <p className="text-[10px] text-slate-400">
              {source?source.source+" · "+source.title:"Selecciona un ejercicio desde Información"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-slate-600 bg-[#102232] px-2 py-1.5 text-[10px] font-bold">
            PLC · {running?"RUN":mode==="paused"?"PAUSE":"STOP"}
          </span>
          <button type="button" onClick={()=>setInfoOpen(true)}
            className="inline-flex items-center gap-1 rounded border border-sky-800 px-2 py-1.5 text-xs text-sky-200 hover:bg-sky-950">
            <CircleHelp size={15}/> Objetivo, ejercicios y soluciones
          </button>
        </div>
      </header>
      <div className="scada-scene-workspace">
        <section className="sort-panel scada-process-panel rounded-lg border border-[#344c5e] p-3">
          <h3 className="mb-2 text-xs font-semibold">Vista de proceso</h3>
          <BatchProcessGraphic state={state}
            outputs={{p1,p2,p3,mixer:mix,heater:heat}} sp={tempSP}/>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {[
              ["Nivel",state.level+" %"],["Temperatura",state.temperature.toFixed(1)+" °C"],
              ["P1 / P2",state.totalPulses[0]+" / "+state.totalPulses[1]],
              ["Descarga",String(state.totalPulses[2])],
            ].map(([name,value])=><div key={name}
              className="rounded border border-[#344c5e] bg-[#0d1e2b] p-2">
              <div className="text-[10px] text-slate-400">{name}</div>
              <div className="mt-1 font-mono font-bold text-sky-200">{value}</div>
            </div>)}
          </div>
          <p className="mt-2 text-[10px] text-slate-300">Caudalímetros FM1 / FM2 / FM3: 1 pulso = 0,1 % del tanque (1000 pulsos = 100 %).</p>
        </section>
        <aside className="scada-scene-sidebar" aria-label="Controles e indicadores del SCADA">
          <div className="scada-dashboard-grid grid gap-3">
            <section className="sort-panel rounded-lg border border-[#344c5e] p-2.5">
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
                <Gauge size={14}/> Tablero de mando
              </h3>
              <div className="scada-command-buttons grid max-w-[210px] grid-cols-2 gap-2">
                <MomentaryPushButton compact name="START" tone="start"
                  pressed={batchBool(project,"PB_Start")}
                  onChange={value=>onInputChange("PB_Start",value)}
                  icon={<Play size={15}/>}>START</MomentaryPushButton>
                <MomentaryPushButton compact name="STOP" tone="stop"
                  pressed={batchBool(project,"PB_Stop")}
                  onChange={value=>onInputChange("PB_Stop",value)}
                  icon={<Square size={15}/>}>STOP</MomentaryPushButton>
              </div>
              <label className="mt-3 block text-[10px] text-slate-400" htmlFor="batch-mode">Selector A / B / C</label>
              <select id="batch-mode" value={selectedMode} disabled={!canSet}
                onChange={event=>onModeChange(event.target.value as BatchMode)}
                className="mt-1 w-full rounded border border-slate-600 bg-[#0b1e2d] p-2 text-xs text-slate-100 disabled:opacity-50">
                <option value="A">A · Lote único</option>
                <option value="B">B · Lotes múltiples</option>
                <option value="C">C · Reserva</option>
              </select>
              <button type="button" onClick={onReset} disabled={!canSet}
                className="mt-3 flex items-center gap-1 rounded border border-slate-600 px-2 py-1.5 text-[11px] hover:bg-slate-700 disabled:opacity-40">
                <RotateCcw size={13}/> Reiniciar proceso
              </button>
            </section>
            <section className="sort-panel min-w-0 rounded-lg border border-[#344c5e] p-3">
              <h3 className="mb-2 text-xs font-semibold">Pilotos LED y equipos</h3>
              <div className="scada-pilot-grid grid grid-cols-2 gap-2">
                <Indicator name="RUN" active={bool("DO_RunLamp")}/>
                <Indicator name="IDLE" active={bool("DO_IdleLamp")} tone="amber"/>
                <Indicator name="FULL" active={bool("DO_FullLamp")} tone="blue"/>
                <Indicator name="PUMP 1" active={p1}/>
                <Indicator name="PUMP 2" active={p2}/>
                <Indicator name="PUMP 3" active={p3}/>
                <Indicator name="MIXER" active={mix}/>
                <Indicator name="HEATER" active={heat} tone="amber"/>
                <Indicator name="HI-LEVEL" active={batchBool(project,"DI_HighLevel")} tone="amber"/>
                <Indicator name="LO-LEVEL" active={batchBool(project,"DI_LowLevel")} tone="blue"/>
                <Indicator name="THERMOSTAT" active={batchBool(project,"DI_Thermostat")}/>
              </div>
            </section>
          </div>
          <section className="sort-panel rounded-lg border border-[#344c5e] p-3">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <Thermometer size={14}/> Parámetros numéricos HMI · INT
            </h3>
            <p className="mb-2 text-[10px] text-slate-400">Ingresa los valores con el PLC detenido.
              Enter confirma los tres valores; no se utiliza BCD.</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["INT_TempSP","SP °C","20–90"],
                ["INT_RatioP1","P1 %","0–100"],
                ["INT_BatchTarget","Lotes","1–99"],
              ] as const).map(([name,label,hint])=><label key={name} className="min-w-0 text-[10px] text-slate-300">
                {label}
                <input type="number" inputMode="numeric" step="1"
                  min={name==="INT_TempSP"?20:name==="INT_BatchTarget"?1:0}
                  max={name==="INT_TempSP"?90:name==="INT_BatchTarget"?99:100}
                  disabled={!canSet} title={name+" · "+hint}
                  aria-label={name}
                  value={draft[name]}
                  onChange={event=>setDraft(v=>({...v,[name]:event.target.value}))}
                  className="mt-1 w-full min-w-0 rounded border border-slate-500 bg-[#0c1e2a] px-2 py-1.5 font-mono text-sm text-white disabled:opacity-50"/>
              </label>)}
            </div>
            <button type="button" disabled={!canSet} onClick={save}
              className="mt-2 w-full rounded border border-sky-600 bg-[#174260] px-3 py-2 text-xs font-semibold text-sky-100 disabled:opacity-40">
              ENTER · Aplicar valores INT
            </button>
            {error&&<p role="alert" className="mt-2 text-[11px] text-amber-300">{error}</p>}
            <div className="mt-3 flex items-center justify-between rounded border border-[#3b5267] bg-[#081923] p-2">
              <span className="text-[10px] text-slate-300">DISPLAY</span>
              <span className="font-mono text-2xl font-bold tracking-[.2em] text-amber-300"
                aria-label="INT_DisplayValue">
                {String(selectedExercise===5
                  ? batchCounter(project,"CNT_Lotes")
                  : batchInt(project,"INT_DisplayValue")).padStart(4,"0")}
              </span>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              Lotes completados: {batchCounter(project,"CNT_Lotes")}
              {" · "}Temperatura SP: {tempSP} °C
              {" · "}Relación P1/P2: {ratio}/{100-ratio} %
              {" · "}Objetivo: {target}
            </div>
          </section>
        </aside>
      </div>
      {!wired&&<div role="alert" className="rounded border border-amber-700 bg-[#3b2b19] p-3 text-xs">
        {setupError??"Faltan las E/S requeridas por la escena Batch Mixer."}
        <button type="button" onClick={onPrepareTags}
          className="ml-2 rounded border border-amber-500 px-2 py-1">Registrar E/S</button>
      </div>}
    </div>
    <BatchMixerSceneInfoDialog open={infoOpen} project={project}
      selectedExercise={selectedExercise} onClose={()=>setInfoOpen(false)}
      onOpenTags={onOpenTags} onLoadSolution={onLoadSolution}
      onResetSolution={onResetSolution}/>
  </section>;
}
