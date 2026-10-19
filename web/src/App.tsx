import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Actions, DockLocation, Layout, Model, type IJsonModel, type TabNode, type TabSetNode } from "flexlayout-react";
import { Cpu, Menu, PanelLeftClose, PanelLeftOpen, CircleHelp, BookOpen } from "lucide-react";
import { ControllerOrganizer, type EditorView } from "./components/ide/ControllerOrganizer";
import { ControllerTags } from "./components/ide/ControllerTags";
import { PracticeEditor } from "./components/ide/PracticeEditor";
import { CrossReferencePanel } from "./components/ide/CrossReferencePanel";
import type { TagReference } from "./plc/practiceCrossReference";
import { setTagValue, type EditableKind, type PracticeProject } from "./plc/practiceDocument";
import {
  initialPracticeScanState, changePracticeScanProject,
  startPracticeScans, stopPracticeScans, pausePracticeScans,
  resumePracticeScans, stepPracticeScan, tickPracticeScan, setScanPeriod,
  applyMomentaryBoolInput, applySceneSensorBoolInput,
  type PracticeScanState,
} from "./plc/practiceScanCycle";
import { isEditableKind, LADDER_DRAG_MIME } from "./plc/ladderDragDrop";
import { type Instruction } from "./components/ide/LadderSymbols";
import { evaluateDemo, initialDemoInputs, type DemoInputs, type InputTag } from "./plc/demoModel";
import { initialDemoBlocks, resetDemoCounters, stepDemoBlocks, type DemoBlockRuntime } from "./plc/timerCounterDemo";
import { SimulationScene } from "./components/ide/SimulationScene";
import { ConveyorScene } from "./components/ide/ConveyorScene";
import { SortScene } from "./components/ide/SortScene";
import { TankScene } from "./components/ide/TankScene";
import { TrafficScene } from "./components/ide/TrafficScene";
import { BatchMixerScene } from "./components/ide/BatchMixerScene";
import { GearSprayScene } from "./components/ide/GearSprayScene";
import {
  initialGearSprayProject, prepareGearSprayTags, writeGearScadaInput,
  type GearPushButton, type GearDigitalInput, type GearAnalogInput,
  type GearSetpoint,
} from "./plc/gearSpraySceneModel";
import {
  initialBatchProject, createBatchSolution, prepareBatchTags,
  initialBatchState, stepBatchPhysics, batchDigitalSensors, resetBatchProgramState,
  batchBool, batchInt,
  type BatchMixerState, type BatchExercise, type BatchMode,
} from "./plc/batchMixerSceneModel";
import {
  addTrafficVehicle, createTrafficExampleProject,
  initialTrafficProject, initialTrafficState,
  prepareTrafficTags, readTrafficBool, stepTrafficState, trafficWaiting,
  type TrafficDirection, type TrafficState,
} from "./plc/trafficSceneModel";
import {
  createTankExampleProject, initialTankProject, initialTankState,
  prepareTankTags, readTankBool, stepTankState, tankSensorInputs,
  type TankState,
} from "./plc/tankSceneModel";
import {
  addSortBox, createSortExampleProject, initialSortProject, initialSortState,
  applySortMomentaryInput, applySortSensorInput, prepareSortTags,
  readSortBool, stepSortState, type SortBoxType, type SortState,
} from "./plc/sortSceneModel";
import {
  CONVEYOR_SENSOR_TAG, addConveyorItem, createConveyorExampleProject,
  applyConveyorMomentaryInput, applyConveyorPhotoeyeInput,
  initialConveyorProject, initialConveyorState, prepareConveyorTags, readConveyorBool, stepConveyor,
  type ConveyorState,
} from "./plc/conveyorSceneModel";
import "flexlayout-react/style/dark.css";
import "./workspace.css";

const layoutConfig: IJsonModel = {
  global: {
    tabEnableClose: true,
    tabEnableRename: false,
    tabSetEnableMaximize: true,
    tabSetMinWidth: 260,
    tabSetMinHeight: 180,
  },
  borders: [],
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        id: "workspace-editor",
        weight: 55,
        selected: 0,
        children: [
          { type: "tab", id: "editor-mainroutine", name: "MainRoutine.LAD", component: "practice" },
          { type: "tab", id: "editor-tags", name: "Controller Tags", component: "tags" },
        ],
      },
      {
        type: "tabset",
        weight: 45,
        children: [
          { type: "tab", id: "simulation", name: "Simulación industrial", component: "simulation", enableClose: false },
        ],
      },
    ],
  },
};

type SimulationTab = "conveyor" | "sorting" | "tank" | "traffic" | "batch" | "gear" | "motor";
type ProgrammingScene = "conveyor" | "sorting" | "tank" | "traffic" | "batch" | "gear";

interface DemoMachineState {
  inputs: DemoInputs;
  motorLatched: boolean;
  blocks: DemoBlockRuntime;
}

function scanDemo(previous: DemoMachineState, elapsedMs: number): DemoMachineState {
  const motorLatched = !previous.inputs.PB_Stop && (previous.inputs.PB_Start || previous.motorLatched);
  const values = evaluateDemo(previous.inputs, motorLatched);
  return {
    ...previous,
    motorLatched,
    blocks: stepDemoBlocks(previous.blocks, values, elapsedMs),
  };
}

export default function App() {
  const [model] = useState(() => Model.fromJson(layoutConfig));
  // FlexLayout may maximize any tabset. Apply the 50/50 SCADA split only
  // while the simulation tabset itself is maximized, not MainRoutine.
  const [simulationMaximized, setSimulationMaximized] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(true);
  const [editorView, setEditorView] = useState<EditorView>("practice");
  const [instruction, setInstruction] = useState<Instruction>("XIC");
  const [draggingKind, setDraggingKind] = useState<EditableKind | null>(null);
  const [scanState, setScanState] = useState<PracticeScanState>(() =>
    initialPracticeScanState(initialConveyorProject()));
  const scanRef = useRef(scanState);
  // Separate Ladder programs per SCADA scene; no accidental tag mixing.
  const sceneSessions = useRef<Record<ProgrammingScene, PracticeScanState>>({
    conveyor: scanState, sorting: initialPracticeScanState(initialSortProject()),
    tank: initialPracticeScanState(initialTankProject()),
    traffic: initialPracticeScanState(initialTrafficProject()),
    batch: initialPracticeScanState(initialBatchProject()),
    gear: initialPracticeScanState(initialGearSprayProject()),
  });
  const activeControllerScene = useRef<ProgrammingScene>("conveyor");
  // Each scene keeps the learner's program immediately before inserting
  // its reference solution. Switching scenes must not discard that snapshot.
  const solutionSnapshots = useRef<Partial<Record<ProgrammingScene, PracticeProject>>>({});
  const [crossReferenceTag, setCrossReferenceTag] = useState<string | null>(null);
  const [referenceNavigation, setReferenceNavigation] = useState<{
    instructionId: string; rungId: string; branchId?: string; token: number;
  } | null>(null);
  const referenceSerial = useRef(0);
  const practice = scanState.project;
  const practiceMode = scanState.mode;
  // Serialize timer ticks and input/UI edits against the same synchronous
  // snapshot: neither action may overwrite a more recent tag update.
  const changeScan = useCallback((operation: (state: PracticeScanState) => PracticeScanState) => {
    const next = operation(scanRef.current);
    if (next !== scanRef.current) {
      scanRef.current = next;
      setScanState(next);
    }
  }, []);
  useEffect(() => {
    if (practiceMode !== "running") return;
    const id = window.setInterval(() => changeScan(tickPracticeScan),
      scanState.scanPeriodMs);
    return () => window.clearInterval(id);
  }, [practiceMode, scanState.scanPeriodMs, changeScan]);
  const practiceIdCounter = useRef(1);
  const nextPracticeId = useCallback((prefix: string) => `${prefix}-${++practiceIdCounter.current}`, []);
  const [online, setOnline] = useState(false);
  const [demo, setDemo] = useState<DemoMachineState>(() => ({
    inputs: { ...initialDemoInputs },
    motorLatched: false,
    blocks: initialDemoBlocks(),
  }));
  const { inputs, motorLatched, blocks } = demo;
  const [simulationTab, setSimulationTab] = useState<SimulationTab>("conveyor");
  const [tankSetupError, setTankSetupError] = useState<string | null>(null);
  const [tankState, setTankState] = useState<TankState>(initialTankState);
  const tankRef = useRef(tankState);
  const changeTank = useCallback((operation: (state: TankState) => TankState) => {
    const next = operation(tankRef.current);
    if (next !== tankRef.current) {
      tankRef.current = next;
      setTankState(next);
    }
  }, []);
  const [sortSetupError, setSortSetupError] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>(initialSortState);
  const sortRef = useRef(sortState);
  const changeSort = useCallback((operation: (state: SortState) => SortState) => {
    const next = operation(sortRef.current);
    if (next !== sortRef.current) {
      sortRef.current = next;
      setSortState(next);
    }
  }, []);

  const [trafficSetupError, setTrafficSetupError] = useState<string | null>(null);
  const [trafficState, setTrafficState] = useState<TrafficState>(initialTrafficState);
  const trafficRef = useRef(trafficState);
  const changeTraffic = useCallback((operation: (state: TrafficState) => TrafficState) => {
    const next = operation(trafficRef.current);
    if (next !== trafficRef.current) {
      trafficRef.current = next;
      setTrafficState(next);
    }
  }, []);

  const [gearSetupError, setGearSetupError] = useState<string | null>(null);
  const [batchSetupError, setBatchSetupError] = useState<string | null>(null);
  const [batchExercise, setBatchExercise] = useState<BatchExercise | null>(null);
  const [batchState, setBatchState] = useState<BatchMixerState>(initialBatchState);
  const batchRef = useRef(batchState);
  const changeBatch = useCallback((op:(state:BatchMixerState)=>BatchMixerState) => {
    const next=op(batchRef.current);
    if(next!==batchRef.current) {
      batchRef.current=next;
      setBatchState(next);
    }
  },[]);

  const chooseSimulationTab = useCallback((next: SimulationTab) => {
    if (next === simulationTab) return;
    if (next === "motor") {
      // The standalone demo is not connected to MainRoutine. Pause this
      // programming scene safely so it cannot run unseen in the background.
      changeScan(stopPracticeScans);
      setSimulationTab(next);
      return;
    }
    if (next !== activeControllerScene.current) {
      changeScan((current) => {
        const previous = activeControllerScene.current;
        // Switching stops the previous controller, but saves its Ladder,
        // counters, and customized tags for when the user returns.
        sceneSessions.current[previous] = stopPracticeScans(current);
        activeControllerScene.current = next;
        return stopPracticeScans(sceneSessions.current[next]);
      });
    }
    setSimulationTab(next);
  }, [simulationTab, changeScan]);
  const [conveyorTagSetupError, setConveyorTagSetupError] = useState<string | null>(null);
  const [conveyor, setConveyor] = useState<ConveyorState>(initialConveyorState);
  const conveyorRef = useRef(conveyor);
  const changeConveyor = useCallback((operation: (state: ConveyorState) => ConveyorState) => {
    const next = operation(conveyorRef.current);
    if (next !== conveyorRef.current) {
      conveyorRef.current = next;
      setConveyor(next);
    }
  }, []);

  // Physics samples the REAL MainRoutine output. Both photoeye edges are
  // evaluated immediately in RUN (zero elapsed time), so short gaps never
  // disappear between cyclic scans and CTU can count the next box.
  useEffect(() => {
    if (practiceMode !== "running" || activeControllerScene.current !== "conveyor") return;
    const id = window.setInterval(() => {
      const plc = scanRef.current;
      if (plc.mode !== "running" || activeControllerScene.current !== "conveyor") return;
      const motorOn = readConveyorBool(plc.project, "DO_Motor");
      const next = stepConveyor(conveyorRef.current, motorOn, 50);
      if (next !== conveyorRef.current) changeConveyor(() => next);
      const sensorTag = plc.project.tags.find((tag) => tag.name === CONVEYOR_SENSOR_TAG);
      if (sensorTag?.type === "BOOL" && sensorTag.value !== next.sensorActive) {
        changeScan((current) =>
          applyConveyorPhotoeyeInput(current, next.sensorActive));
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [practiceMode, simulationTab, changeConveyor, changeScan]);

  // Separate 50ms browser physics. Each optical edge is passed through the
  // serialized zero-elapsed MainRoutine scan to protect CTU counting.
  useEffect(() => {
    if (practiceMode !== "running" || activeControllerScene.current !== "sorting") return;
    const id = window.setInterval(() => {
      const current = scanRef.current;
      if (current.mode !== "running" || activeControllerScene.current !== "sorting") return;
      const next = stepSortState(sortRef.current,
        readSortBool(current.project, "DO_Motor"),
        readSortBool(current.project, "DO_Diverter"), 50);
      if (next !== sortRef.current) changeSort(() => next);
      const sensors: readonly [string, boolean][] = [
        ["DI_TypeB", next.sensorTypeB],
        ["DI_ExitA", next.sensorExitA],
        ["DI_ExitB", next.sensorExitB],
        ["DI_LineClear", next.lineClear],
      ];
      for (const [name, value] of sensors) {
        const tag = scanRef.current.project.tags.find((item) => item.name === name);
        if (tag?.type === "BOOL" && tag.value !== value) {
          changeScan((state) => applySortSensorInput(state, name, value));
        }
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [practiceMode, simulationTab, changeSort, changeScan]);

  // Scene 04 physical movement only reads PLC lamp outputs, never chooses
  // a traffic-light phase. Detection edges trigger zero-time scan events
  // without accelerating TON timers (identical principle to scenes 1–3).
  useEffect(() => {
    if (practiceMode !== "running" || activeControllerScene.current !== "traffic") return;
    const id = window.setInterval(() => {
      const current = scanRef.current;
      if (current.mode !== "running" || activeControllerScene.current !== "traffic") return;
      const previous = trafficRef.current;
      const next = stepTrafficState(previous,
        readTrafficBool(current.project, "DO_NS_GreenLight"),
        readTrafficBool(current.project, "DO_EW_GreenLight"),
        readTrafficBool(current.project, "DO_PedestrianWalk"), 50);
      if (next !== trafficRef.current) changeTraffic(() => next);
      // Sensor pulses are generated on a *new* vehicle exit. They always
      // fall before the next event, preserving CTU rising-edge semantics.
      changeScan(state => {
        let updated=state;
        for (const [tag,prev,now] of [
          ["DI_NSExit", previous.exitedNS, next.exitedNS],
          ["DI_EWExit", previous.exitedEW, next.exitedEW],
        ] as const) {
          const input=updated.project.tags.find(t=>t.name===tag);
          if (input?.type==="BOOL" && now>prev) {
            for(let pulse=prev;pulse<now;pulse++) {
              updated=applySceneSensorBoolInput(updated,tag,true);
              updated=applySceneSensorBoolInput(updated,tag,false);
            }
          }
        }
        for(const [tag,wants] of [
          ["DI_NSWaiting",trafficWaiting(next,"NS")],
          ["DI_EWWaiting",trafficWaiting(next,"EW")],
        ] as const) {
          const input=updated.project.tags.find(t=>t.name===tag);
          if(input?.type==="BOOL" && input.value!==wants)
            updated=applySceneSensorBoolInput(updated,tag,wants);
        }
        return updated;
      });
    },50);
    return () => window.clearInterval(id);
  }, [practiceMode,simulationTab,changeTraffic,changeScan]);

  // Scene 05: process physics only follows the physical PLC output bits.
  // Flowmeter pulses are sampled as 0-ms scan edges for CTU and CTD.
  // Temperature remains an internal simulated state: only DI_Thermostat
  // is published to MainRoutine when temperature reaches integer INT_TempSP.
  useEffect(() => {
    if (practiceMode!=="running" || activeControllerScene.current!=="batch") return;
    const id=window.setInterval(() => {
      const previous=batchRef.current;
      const plc=scanRef.current;
      if (plc.mode!=="running" || activeControllerScene.current!=="batch") return;
      const next=stepBatchPhysics(previous,{
        pump1:batchBool(plc.project,"DO_Pump1"),
        pump2:batchBool(plc.project,"DO_Pump2"),
        pump3:batchBool(plc.project,"DO_Pump3"),
        heater:batchBool(plc.project,"DO_Heater"),
      },50);
      if(next!==previous)changeBatch(()=>next);
      changeScan(state=>{
        let result=state;
        const pulseNames=["DI_Flowmeter1","DI_Flowmeter2","DI_Flowmeter3"] as const;
        for(let n=0;n<3;n++) {
          const name=pulseNames[n];
          if(!result.project.tags.some(t=>t.name===name&&t.type==="BOOL"))continue;
          for(let pulse=previous.totalPulses[n];pulse<next.totalPulses[n];pulse++){
            result=applySceneSensorBoolInput(result,name,true);
            result=applySceneSensorBoolInput(result,name,false);
          }
        }
        const sensors=batchDigitalSensors(next,batchInt(result.project,"INT_TempSP"));
        for(const [name,value] of Object.entries(sensors)){
          const tag=result.project.tags.find(t=>t.name===name);
          if(tag?.type==="BOOL"&&tag.value!==value)
            result=applySceneSensorBoolInput(result,name,value);
        }
        return result;
      });
    },50);
    return ()=>window.clearInterval(id);
  },[practiceMode,simulationTab,changeBatch,changeScan]);

  // Tank process physics follows the real PLC output values and is never
  // active while this scene is stopped, paused, or not the selected controller.
  useEffect(() => {
    if (practiceMode !== "running" || activeControllerScene.current !== "tank") return;
    const id = window.setInterval(() => {
      const current = scanRef.current;
      if (current.mode !== "running" || activeControllerScene.current !== "tank") return;
      const next = stepTankState(tankRef.current,
        readTankBool(current.project, "DO_Pump"),
        readTankBool(current.project, "DO_InletValve"),
        readTankBool(current.project, "DO_DrainValve"), 50);
      if (next !== tankRef.current) changeTank(() => next);
      const sensorValues = tankSensorInputs(next.levelPercent);
      changeScan((state) => {
        let result = state;
        // Publish the REAL level first, then scan on BOOL level switches.
        const valueTag = result.project.tags.find(t => t.name === "AI_LevelPct");
        if (valueTag?.type === "REAL" && valueTag.value !== sensorValues.AI_LevelPct) {
          result = changePracticeScanProject(result,
            setTagValue(result.project, "AI_LevelPct", sensorValues.AI_LevelPct));
        }
        for (const name of ["DI_LowLevel", "DI_HighLevel"] as const) {
          const value = sensorValues[name];
          const tag = result.project.tags.find(t => t.name === name);
          if (tag?.type === "BOOL" && tag.value !== value) {
            result = applySceneSensorBoolInput(result, name, value);
          }
        }
        return result;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [practiceMode, simulationTab, changeTank, changeScan]);

  // Advance the five fixed demo rungs with elapsed milliseconds, independent of
  // React render frequency. This is NOT a controller-quality real-time scan.
  useEffect(() => {
    if (!online) {
      setDemo((previous) => ({
        ...previous,
        motorLatched: false,
        blocks: initialDemoBlocks(),
      }));
      return;
    }
    let previousTick = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, Math.min(250, now - previousTick));
      previousTick = now;
      setDemo((previous) => scanDemo(previous, dt));
    }, 50);
    return () => window.clearInterval(id);
  }, [online]);

  const values = useMemo(() => evaluateDemo(inputs, motorLatched), [inputs, motorLatched]);
  const handleTagChange = useCallback((tag: InputTag, value: boolean) => {
    setDemo((previous) => {
      const next = { ...previous, inputs: { ...previous.inputs, [tag]: value } };
      return online ? scanDemo(next, 0) : next;
    });
  }, [online]);

  const handleResetCounters = useCallback(() => {
    setDemo((previous) => ({ ...previous, blocks: resetDemoCounters(previous.blocks) }));
  }, []);
  const handlePracticeChange = useCallback((next: PracticeProject) =>
    changeScan((state) => changePracticeScanProject(state, next)), [changeScan]);

  // Scene 06: only documented physical inputs and HMI commands are writable.
  // No independently generated PLC outputs, alarms, UDFB transitions or
  // pressure physics are implied by this first stage of implementation.
  const setGearPushButton=useCallback((tag:GearPushButton,value:boolean)=>{
    if(activeControllerScene.current!=="gear")return;
    changeScan(state=>applyMomentaryBoolInput(state,tag,value,true));
  },[changeScan]);
  const setGearDigitalInput=useCallback((tag:GearDigitalInput,value:boolean)=>{
    if(activeControllerScene.current!=="gear")return;
    changeScan(state=>applySceneSensorBoolInput(state,tag,value));
  },[changeScan]);
  const setGearNumber=useCallback((tag:GearAnalogInput|GearSetpoint,value:number)=>{
    if(activeControllerScene.current!=="gear")return;
    changeScan(state=>changePracticeScanProject(state,
      writeGearScadaInput(state.project,tag,value)));
  },[changeScan]);
  const prepareGear=useCallback(()=>{
    try{
      changeScan(state=>{
        const next=prepareGearSprayTags(state.project);
        return next===state.project?state:changePracticeScanProject(state,next);
      });
      setGearSetupError(null);
    }catch(error){
      setGearSetupError(error instanceof Error?error.message:
        "No se pudieron registrar las E/S de Gear Spray.");
    }
  },[changeScan]);

  const setBatchInput = useCallback((tag:"PB_Start"|"PB_Stop"|"PB_Enter",
    pressed:boolean) => {
    if(activeControllerScene.current!=="batch")return;
    changeScan(state=>applyMomentaryBoolInput(state,tag,pressed,tag==="PB_Stop"));
  },[changeScan]);
  const setBatchMode = useCallback((nextMode:BatchMode) => {
    if(activeControllerScene.current!=="batch"||scanRef.current.mode!=="stopped")return;
    changeScan(state=>{
      let project=state.project;
      for(const mode of ["A","B","C"] as const)
        project=setTagValue(project,"DI_Mode"+mode,mode===nextMode);
      return changePracticeScanProject(state,project);
    });
  },[changeScan]);
  const setBatchIntegers = useCallback((values:{
    INT_TempSP:number;INT_RatioP1:number;INT_BatchTarget:number;
  })=>{
    if(activeControllerScene.current!=="batch"||scanRef.current.mode!=="stopped")return;
    changeScan(state=>{
      let project=state.project;
      for(const [name,value] of Object.entries(values))
        project=setTagValue(project,name,value);
      return changePracticeScanProject(state,project);
    });
  },[changeScan]);
  const resetBatch = useCallback(()=>{
    if(activeControllerScene.current!=="batch"||scanRef.current.mode!=="stopped")return;
    changeBatch(()=>initialBatchState());
    changeScan(state=>({
      ...initialPracticeScanState(resetBatchProgramState(state.project)),
      scanPeriodMs:state.scanPeriodMs,
    }));
  },[changeBatch,changeScan]);
  const prepareBatch = useCallback(()=>{
    try{
      changeScan(state=>{
        const prepared=prepareBatchTags(state.project);
        return prepared===state.project?state:changePracticeScanProject(state,prepared);
      });
      setBatchSetupError(null);
    }catch(error){
      setBatchSetupError(error instanceof Error?error.message:"No se registraron las E/S.");
    }
  },[changeScan]);

  const setTrafficInput = useCallback((tag:
    "PB_Start" | "PB_Stop" | "PB_Reset" | "PB_Pedestrian", pressed:boolean) => {
    if (activeControllerScene.current !== "traffic") return;
    changeScan(state => applyMomentaryBoolInput(state,tag,pressed,
      tag==="PB_Pedestrian" || tag==="PB_Reset"));
  }, [changeScan]);
  const resetTraffic = useCallback(() => {
    if(scanRef.current.mode==="running")return;
    changeTraffic(() => initialTrafficState());
    changeScan(state=>{
      let updated=state;
      for(const tag of ["DI_NSWaiting","DI_EWWaiting","DI_NSExit","DI_EWExit"]) {
        const input=updated.project.tags.find(t=>t.name===tag);
        if(input?.type==="BOOL" && input.value)
          updated=changePracticeScanProject(updated,
            setTagValue(updated.project,tag,false));
      }
      return updated;
    });
  },[changeTraffic,changeScan]);
  const prepareTraffic = useCallback(() => {
    try {
      changeScan(state => {
        const prepared=prepareTrafficTags(state.project);
        return prepared===state.project ? state :
          changePracticeScanProject(state,prepared);
      });
      setTrafficSetupError(null);
    }catch(error){
      setTrafficSetupError(error instanceof Error ?
        error.message : "No se pudieron registrar los tags.");
    }
  },[changeScan]);

  const setTankInput = useCallback((
    tag: "PB_Start" | "PB_Stop" | "PB_Drain" | "PB_Reset", pressed: boolean,
  ) => {
    // React may unmount a held momentary input when the scene changes.
    // Never dispatch that release event into a different MainRoutine project.
    if (activeControllerScene.current !== "tank") return;
    changeScan(state => applyMomentaryBoolInput(
      state, tag, pressed, tag === "PB_Drain" || tag === "PB_Reset",
    ));
  }, [changeScan]);

  const resetTank = useCallback(() => {
    changeTank(() => initialTankState());
    changeScan(current => {
      const initial = tankSensorInputs(initialTankState().levelPercent);
      let next = current;
      if (next.project.tags.some(t => t.name === "AI_LevelPct" && t.type === "REAL")) {
        next = changePracticeScanProject(next,
          setTagValue(next.project, "AI_LevelPct", initial.AI_LevelPct));
      }
      for (const name of ["DI_LowLevel", "DI_HighLevel"] as const) {
        const tag = next.project.tags.find(t => t.name === name);
        if (tag?.type === "BOOL" && tag.value !== initial[name]) {
          next = applySceneSensorBoolInput(next, name, initial[name]);
        }
      }
      return next;
    });
  }, [changeTank, changeScan]);

  const prepareTank = useCallback(() => {
    try {
      changeScan(state => {
        const project = prepareTankTags(state.project);
        return project === state.project ? state : changePracticeScanProject(state, project);
      });
      setTankSetupError(null);
    } catch (error) {
      setTankSetupError(error instanceof Error
        ? error.message : "No se pudieron preparar los tags del tanque.");
    }
  }, [changeScan]);

  const setSortInput = useCallback((
    tag: "PB_Start" | "PB_Stop" | "PB_Reset", value: boolean,
  ) => {
    if (activeControllerScene.current !== "sorting") return;
    changeScan((state) => applySortMomentaryInput(state, tag, value));
  }, [changeScan]);
  const resetSort = useCallback(() => {
    changeSort(() => initialSortState());
    changeScan((current) => {
      let next = current;
      for (const name of ["DI_TypeB", "DI_ExitA", "DI_ExitB"]) {
        if (next.project.tags.some((tag) =>
          tag.name === name && tag.type === "BOOL" && tag.value === true)) {
          next = applySortSensorInput(next, name, false);
        }
      }
      // A physically cleared scene has both lines empty.
      const clear = next.project.tags.find(tag => tag.name === "DI_LineClear");
      if (clear?.type === "BOOL" && clear.value !== true) {
        next = applySortSensorInput(next, "DI_LineClear", true);
      }
      return next;
    });
  }, [changeSort, changeScan]);
  const prepareSort = useCallback(() => {
    try {
      changeScan((state) => {
        const prepared = prepareSortTags(state.project);
        return prepared === state.project ? state : changePracticeScanProject(state, prepared);
      });
      setSortSetupError(null);
    } catch (error) {
      setSortSetupError(error instanceof Error ? error.message : "No se pudieron preparar los tags.");
    }
  }, [changeScan]);

  const setConveyorInput = useCallback((tag: "PB_Start" | "PB_Stop" | "PB_Reset", value: boolean) => {
    if (activeControllerScene.current !== "conveyor") return;
    changeScan(state => applyConveyorMomentaryInput(state, tag, value));
  }, [changeScan]);
  const resetConveyor = useCallback(() => {
    changeConveyor(() => initialConveyorState());
    changeScan((state) => {
      const sensor = state.project.tags.find((tag) => tag.name === CONVEYOR_SENSOR_TAG);
      return sensor?.type === "BOOL" && sensor.value !== false
        ? changePracticeScanProject(state, setTagValue(state.project, CONVEYOR_SENSOR_TAG, false))
        : state;
    });
  }, [changeConveyor, changeScan]);
  const prepareConveyor = useCallback(() => {
    try {
      changeScan((state) => {
        const next = prepareConveyorTags(state.project);
        // No redundant state update or PLC scan reset when revisiting the scene.
        return next === state.project ? state : changePracticeScanProject(state, next);
      });
      setConveyorTagSetupError(null);
    } catch (error) {
      setConveyorTagSetupError(error instanceof Error
        ? error.message : "No se pudieron registrar los tags de la escena.");
    }
  }, [changeScan]);

  // The scene registers all linked Controller Tags upon entry. Returning to
  // the conveyor safely restores any missing declarations without touching
  // existing Ladder logic, tag values, or personalized descriptions.
  useEffect(() => {
    if (simulationTab === "conveyor") prepareConveyor();
    else if (simulationTab === "sorting") prepareSort();
    else if (simulationTab === "tank") prepareTank();
    else if (simulationTab === "traffic") prepareTraffic();
    else if (simulationTab === "batch") prepareBatch();
    else if (simulationTab === "gear") prepareGear();
  }, [simulationTab, prepareConveyor, prepareSort, prepareTank, prepareTraffic, prepareBatch, prepareGear]);

  const startPractice = useCallback(() =>
    changeScan(startPracticeScans), [changeScan]);
  const stopPractice = useCallback(() =>
    changeScan(stopPracticeScans), [changeScan]);
  const pausePractice = useCallback(() =>
    changeScan(pausePracticeScans), [changeScan]);
  const resumePractice = useCallback(() =>
    changeScan(resumePracticeScans), [changeScan]);
  const stepPractice = useCallback(() =>
    changeScan(stepPracticeScan), [changeScan]);
  const changeScanPeriod = useCallback((period: number) =>
    changeScan((state) => setScanPeriod(state, period)), [changeScan]);

  const openEditorView = useCallback((view: EditorView) => {
    const tab = view === "practice"
      ? { id: "editor-mainroutine", name: "MainRoutine.LAD", component: "practice" }
      : { id: "editor-tags", name: "Controller Tags", component: "tags" };

    // Select an existing document, instead of replacing the content of another tab.
    if (model.getNodeById(tab.id)) {
      model.doAction(Actions.selectTab(tab.id));
    } else {
      // A closed document can be reopened from Controller Organizer.
      const tabsetExists = model.getNodeById("workspace-editor") !== undefined;
      model.doAction(Actions.addNode(
        { type: "tab", ...tab },
        tabsetExists ? "workspace-editor" : "simulation",
        tabsetExists ? DockLocation.CENTER : DockLocation.LEFT,
        -1,
        true,
      ));
    }
    setEditorView(view);
  }, [model]);

  const navigateToReference = useCallback((ref: TagReference) => {
    setCrossReferenceTag(null);
    setReferenceNavigation({
      instructionId: ref.instructionId, rungId: ref.rungId,
      branchId: ref.branchId, token: ++referenceSerial.current,
    });
    openEditorView("practice");
  }, [openEditorView]);

  const loadBatchSolution=useCallback((exercise:BatchExercise)=>{
    if(activeControllerScene.current!=="batch")return;
    if(!window.confirm("Implementar la solución del ejercicio "+exercise+
      " de Batch Mixer? Se reemplazarán MainRoutine y los Controller Tags de esta escena."))return;
    if(!solutionSnapshots.current.batch)
      solutionSnapshots.current.batch=scanRef.current.project;
    changeScan(state=>{
      // Operator HMI values survive loading a different Ladder exercise.
      let example=createBatchSolution(exercise);
      for(const name of ["INT_TempSP","INT_RatioP1","INT_BatchTarget"]){
        const tag=state.project.tags.find(t=>t.name===name);
        if(tag?.type==="INT"&&typeof tag.value==="number")
          example=setTagValue(example,name,tag.value);
      }
      return {...initialPracticeScanState(example),
        scanPeriodMs:state.scanPeriodMs};
    });
    changeBatch(()=>initialBatchState());
    setBatchExercise(exercise);
    openEditorView("practice");
  },[changeScan,changeBatch,openEditorView]);

  const loadTrafficExample = useCallback(() => {
    if (!window.confirm(
      "Se reemplazarán MainRoutine y Controller Tags de la escena SEMÁFOROS. ¿Continuar?",
    )) return;
    if (!solutionSnapshots.current.traffic) {
      solutionSnapshots.current.traffic = scanRef.current.project;
    }
    changeScan(state=>({
      ...initialPracticeScanState(createTrafficExampleProject()),
      scanPeriodMs:state.scanPeriodMs,
    }));
    changeTraffic(()=>initialTrafficState());
    openEditorView("practice");
  },[changeScan,changeTraffic,openEditorView]);

  const loadTankExample = useCallback(() => {
    if (!window.confirm(
      "Se reemplazará MainRoutine y sus Controller Tags de la escena TANQUE por la plantilla Ladder. ¿Continuar?",
    )) return;
    if (!solutionSnapshots.current.tank) {
      solutionSnapshots.current.tank = scanRef.current.project;
    }
    changeScan(state => ({
      ...initialPracticeScanState(createTankExampleProject()),
      scanPeriodMs: state.scanPeriodMs,
    }));
    changeTank(() => initialTankState());
    openEditorView("practice");
  }, [changeScan, changeTank, openEditorView]);

  const loadSortExample = useCallback(() => {
    if (!window.confirm(
      "Se reemplazará el MainRoutine y los Controller Tags del CLASIFICADOR por su plantilla Ladder. ¿Continuar?",
    )) return;
    if (!solutionSnapshots.current.sorting) {
      solutionSnapshots.current.sorting = scanRef.current.project;
    }
    changeScan((state) => ({
      ...initialPracticeScanState(createSortExampleProject()),
      scanPeriodMs: state.scanPeriodMs,
    }));
    changeSort(() => initialSortState());
    openEditorView("practice");
  }, [changeScan, changeSort, openEditorView]);

  const loadConveyorExample = useCallback(() => {
    if (!window.confirm("Se reemplazará MainRoutine y sus Controller Tags por el ejemplo de faja. ¿Continuar?")) {
      return;
    }
    if (!solutionSnapshots.current.conveyor) {
      solutionSnapshots.current.conveyor = scanRef.current.project;
    }
    changeScan((state) => ({
      ...initialPracticeScanState(createConveyorExampleProject()),
      scanPeriodMs: state.scanPeriodMs,
    }));
    changeConveyor(() => initialConveyorState());
    openEditorView("practice");
  }, [changeScan, changeConveyor, openEditorView]);

  const resetRecommendedSolution = useCallback((scene: ProgrammingScene) => {
    if (activeControllerScene.current !== scene) return;
    const saved = solutionSnapshots.current[scene];
    if (!window.confirm(saved
      ? "Se descartarán los cambios del ejemplo y se recuperará tu programa anterior a la solución recomendada. ¿Continuar?"
      : "No hay una copia previa de la solución. Se limpiará MainRoutine y quedarán únicamente las E/S del SCADA. ¿Continuar?"
    )) return;
    const initial = scene === "conveyor" ? initialConveyorProject()
      : scene === "sorting" ? initialSortProject()
      : scene === "tank" ? initialTankProject()
      : scene === "traffic" ? initialTrafficProject()
      : scene === "gear" ? initialGearSprayProject() : initialBatchProject();
    changeScan(state => ({
      ...initialPracticeScanState(saved ?? initial),
      scanPeriodMs: state.scanPeriodMs,
    }));
    delete solutionSnapshots.current[scene];
    if (scene === "conveyor") changeConveyor(() => initialConveyorState());
    else if (scene === "sorting") changeSort(() => initialSortState());
    else if (scene === "tank") changeTank(() => initialTankState());
    else if (scene === "traffic") changeTraffic(() => initialTrafficState());
    else if(scene==="batch") {
      changeBatch(()=>initialBatchState());
      setBatchExercise(null);
    }
    openEditorView("practice");
  }, [changeScan, changeConveyor, changeSort, changeTank, changeTraffic, changeBatch, openEditorView]);

  const onToolbarDragStart = useCallback((event: DragEvent<HTMLButtonElement>, kind: Instruction) => {
    if (!isEditableKind(kind)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LADDER_DRAG_MIME, kind);
    setInstruction(kind);
    setDraggingKind(kind);
    // Palette lives inside MainRoutine; keep the same tab and drag surface mounted.
  }, []);

  const factory = useCallback(
    (node: TabNode) => {
      switch (node.getComponent()) {
        case "practice":
          return (
            <PracticeEditor
              project={practice}
              selectedTool={instruction}
              draggingKind={draggingKind}
              onChange={handlePracticeChange}
              running={practiceMode !== "stopped"}
              scanMode={practiceMode}
              scanState={scanState}
              onStart={startPractice}
              onStop={stopPractice}
              onPause={pausePractice}
              onResume={resumePractice}
              onStep={stepPractice}
              onScanPeriodChange={changeScanPeriod}
              nextId={nextPracticeId}
              onSelectPaletteTool={setInstruction}
              onSelectDemoTool={(kind) => {
                setInstruction(kind);
                openEditorView("practice");
              }}
              onPaletteDragStart={onToolbarDragStart}
              onPaletteDragEnd={() => setDraggingKind(null)}
              onCrossReference={setCrossReferenceTag}
              navigateToReference={referenceNavigation}
            />
          );

        case "tags":
          return <ControllerTags activeScene={simulationTab} project={practice} onChange={handlePracticeChange} practiceRunning={practiceMode !== "stopped"} practicePaused={practiceMode === "paused"} online={online} inputs={inputs} values={values} onTagChange={handleTagChange} onResetCounters={handleResetCounters} onCrossReference={setCrossReferenceTag} />;
        case "simulation":
          return (
            <div className="flex h-full min-h-0 flex-col bg-[#111c27]">
              {/* Scene navigation is a compact selector, not a second page header. */}
              <div className="flex h-9 shrink-0 items-center border-b border-slate-700/70 bg-[#172432] px-3">
                <label htmlFor="simulation-scene-selector" className="sr-only">
                  Seleccionar escena de simulación
                </label>
                <select id="simulation-scene-selector" value={simulationTab}
                  onChange={(event) => chooseSimulationTab(event.target.value as SimulationTab)}
                  className="max-w-full cursor-pointer rounded border border-slate-600 bg-[#1c2e3e] px-2 py-1 text-[11px] font-medium text-slate-200 outline-none hover:border-slate-400 focus-visible:border-sky-500">
                  <option value="conveyor">Faja transportadora</option>
                  <option value="sorting">Clasificación de cajas</option>
                  <option value="tank">Sistema de llenado de tanques</option>
                  <option value="traffic">Intersección semaforizada</option>
                  <option value="batch">Batch Mixer · Mezcla por lotes</option>
                  <option value="gear">Gear Spray · Molino de bolas</option>
                  <option value="motor">Motor · DEMO</option>
                </select>
              </div>
              <div className="min-h-0 flex-1">
                {simulationTab === "conveyor"
                  ? <ConveyorScene project={practice} mode={practiceMode} scene={conveyor}
                      onInputChange={setConveyorInput}
                      onAddItem={() => changeConveyor(addConveyorItem)}
                      onResetScene={resetConveyor}
                      onPrepareTags={prepareConveyor}
                      setupError={conveyorTagSetupError}
                      onOpenTags={() => openEditorView("tags")}
                      onLoadExample={loadConveyorExample}
                      onResetExample={() => resetRecommendedSolution("conveyor")}/>
                  : simulationTab === "sorting"
                    ? <SortScene project={practice} mode={practiceMode} state={sortState}
                        onInputChange={setSortInput}
                        onAddBox={(kind: SortBoxType) => changeSort((state) => addSortBox(state, kind))}
                        onReset={resetSort}
                        onPrepareTags={prepareSort}
                        setupError={sortSetupError}
                        onOpenTags={() => openEditorView("tags")}
                        onLoadExample={loadSortExample}
                      onResetExample={() => resetRecommendedSolution("sorting")}/>
                    : simulationTab === "tank"
                      ? <TankScene project={practice} mode={practiceMode} state={tankState}
                          onInputChange={setTankInput}
                          onReset={resetTank}
                          onPrepareTags={prepareTank}
                          setupError={tankSetupError}
                          onOpenTags={() => openEditorView("tags")}
                          onLoadExample={loadTankExample}
                      onResetExample={() => resetRecommendedSolution("tank")}/>
                    : simulationTab === "traffic"
                      ? <TrafficScene project={practice} mode={practiceMode} state={trafficState}
                          onInputChange={setTrafficInput}
                          onAddVehicle={(direction: TrafficDirection) =>
                            changeTraffic(state=>addTrafficVehicle(state,direction))}
                          onReset={resetTraffic}
                          onPrepareTags={prepareTraffic}
                          setupError={trafficSetupError}
                          onOpenTags={() => openEditorView("tags")}
                          onLoadExample={loadTrafficExample}
                      onResetExample={() => resetRecommendedSolution("traffic")}/>
                    : simulationTab === "batch"
                      ? <BatchMixerScene project={practice} mode={practiceMode}
                          state={batchState} selectedExercise={batchExercise}
                          setupError={batchSetupError}
                          onInputChange={setBatchInput}
                          onModeChange={setBatchMode}
                          onSetIntegers={setBatchIntegers}
                          onReset={resetBatch}
                          onPrepareTags={prepareBatch}
                          onOpenTags={() => openEditorView("tags")}
                          onLoadSolution={loadBatchSolution}
                          onResetSolution={() => resetRecommendedSolution("batch")}/>
                    : simulationTab === "gear"
                      ? <GearSprayScene project={practice} mode={practiceMode}
                          setupError={gearSetupError}
                          onPushButton={setGearPushButton}
                          onDigitalInput={setGearDigitalInput}
                          onAnalogInput={setGearNumber}
                          onSetpoint={setGearNumber}
                          onPrepareTags={prepareGear}
                          onOpenTags={() => openEditorView("tags")}/>
                      : <SimulationScene online={online} inputs={inputs} values={values}
                        onTagChange={handleTagChange}/>}
              </div>
            </div>
          );
        default:
          return <div className="p-4">Panel no disponible</div>;
      }
    },
    [online, inputs, values, blocks, practice, practiceMode, scanState, instruction,
      draggingKind, nextPracticeId, handlePracticeChange, referenceNavigation,
      startPractice, stopPractice,
      pausePractice, resumePractice, stepPractice, changeScanPeriod, handleTagChange,
      handleResetCounters, openEditorView, onToolbarDragStart, simulationTab, conveyor,
      setConveyorInput, changeConveyor, resetConveyor, prepareConveyor,
      conveyorTagSetupError, loadConveyorExample, resetRecommendedSolution, sortState, setSortInput,
      changeSort, resetSort, prepareSort, sortSetupError, loadSortExample,
      chooseSimulationTab, tankState, changeTank, setTankInput, resetTank,
      prepareTank, tankSetupError, loadTankExample, trafficState, changeTraffic,
      setTrafficInput, resetTraffic, prepareTraffic, trafficSetupError,
      loadTrafficExample, batchState, batchExercise, batchSetupError,
      setBatchInput, setBatchMode, setBatchIntegers, resetBatch, prepareBatch, loadBatchSolution,
      gearSetupError, setGearPushButton, setGearDigitalInput, setGearNumber, prepareGear],
  );

  const syncTabSelection = useCallback((updatedModel: Model) => {
    const maximized = updatedModel.getMaximizedTabset();
    setSimulationMaximized(maximized?.getSelectedNode()?.getId() === "simulation");
    const activeTabset = updatedModel.getNodeById("workspace-editor");
    if (!activeTabset || activeTabset.getType() !== "tabset") return;
    const selectedId = (activeTabset as TabSetNode).getSelectedNode()?.getId();
    if (selectedId === "editor-mainroutine") setEditorView("practice");
    if (selectedId === "editor-tags") setEditorView("tags");
  }, []);

  return (
    <div className="dark ide-shell flex h-dvh flex-col overflow-hidden bg-[#101820] text-slate-100">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-700/70 bg-[#1c2732] px-3">
        <button
          type="button"
          onClick={() => setOrganizerOpen((current) => !current)}
          aria-label={organizerOpen ? "Ocultar Controller Organizer" : "Mostrar Controller Organizer"}
          title={organizerOpen ? "Ocultar navegador" : "Mostrar navegador"}
          className="ide-icon-button"
        >
          {organizerOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <span className="flex size-8 items-center justify-center rounded-md bg-sky-600/20 text-sky-300">
          <Cpu size={20} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-4">DesignerSimulator</h1>
          <p className="text-[10px] text-slate-400">VirtualPLC · Entorno de programación</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-md border border-slate-600/70 px-2 py-1 text-xs text-slate-300 sm:flex">
            <BookOpen size={13} /> Desde cero / Estudio
          </span>
          <button
            type="button"
            onClick={() => setOnline((current) => !current)}
            aria-pressed={online}
            title="Alternar monitor de demostración; no conecta con Studio 5000 ni un PLC"
            className={online
              ? "rounded-md border border-emerald-700 bg-emerald-950 px-2 py-1 text-[11px] font-semibold text-emerald-300"
              : "rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300"}
          >
            {online ? "DEMO · REM RUN" : "OFFLINE"}
          </button>
          <button type="button" className="ide-icon-button" title="Versión inicial de la interfaz" aria-label="Información">
            <CircleHelp size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {organizerOpen && (
          <aside className="w-56 shrink-0 overflow-hidden border-r border-slate-700/70 bg-[#17212b] xl:w-64">
            <ControllerOrganizer view={editorView} onSelectView={openEditorView} onHide={() => setOrganizerOpen(false)} />
          </aside>
        )}
        <main className={"relative min-w-0 flex-1" +
          (simulationMaximized ? " scada-tabset-maximized" : "")}
          aria-label="Área de trabajo acoplable">
          <Layout model={model} factory={factory} onModelChange={syncTabSelection} />
        </main>
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-slate-700/70 bg-[#1b2732] px-3 text-[11px] text-slate-400">
        <Menu size={12} />
        <span>VirtualPLC</span>
        <span className="text-slate-600">|</span>
        <span>{online ? "Monitoreo DEMO · Sin controlador físico" : "Sin conexión a controlador"}</span>
        <span className="ml-auto">
          {simulationTab === "gear" ? "Escena 06 · Gear Spray"
            : simulationTab === "batch" ? "Escena 05 · Batch Mixer"
            : simulationTab === "traffic" ? "Escena 04 · Intersección semaforizada"
            : simulationTab === "tank" ? "Escena 03 · Tanque por lotes"
            : simulationTab === "sorting" ? "Escena 02 · Clasificación de cajas"
            : simulationTab === "conveyor" ? "Escena 01 · Faja transportadora"
            : "Motor · DEMO"}
        </span>
      </footer>
      {crossReferenceTag && (
        <CrossReferencePanel tag={crossReferenceTag} project={practice}
          onClose={() => setCrossReferenceTag(null)}
          onNavigate={navigateToReference}/>
      )}
    </div>
  );
}
