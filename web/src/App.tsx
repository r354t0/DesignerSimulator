import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Actions, DockLocation, Layout, Model, type IJsonModel, type TabNode, type TabSetNode } from "flexlayout-react";
import { Cpu, Menu, PanelLeftClose, PanelLeftOpen, CircleHelp, BookOpen } from "lucide-react";
import { ControllerOrganizer, type EditorView } from "./components/ide/ControllerOrganizer";
import { ControllerTags } from "./components/ide/ControllerTags";
import { PracticeEditor } from "./components/ide/PracticeEditor";
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
import {
  addSortBox, createSortExampleProject, initialSortProject, initialSortState,
  prepareSortTags, readSortBool, stepSortState, type SortBoxType, type SortState,
} from "./plc/sortSceneModel";
import {
  CONVEYOR_SENSOR_TAG, addConveyorItem, createConveyorExampleProject,
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

type SimulationTab = "conveyor" | "sorting" | "motor";
type ProgrammingScene = "conveyor" | "sorting";

interface DemoMachineState {
  inputs: DemoInputs;
  motorLatched: boolean;
  blocks: DemoBlockRuntime;
}

function scanDemo(previous: DemoMachineState, elapsedMs: number): DemoMachineState {
  const motorLatched = !previous.inputs.Stop_PB && (previous.inputs.Start_PB || previous.motorLatched);
  const values = evaluateDemo(previous.inputs, motorLatched);
  return {
    ...previous,
    motorLatched,
    blocks: stepDemoBlocks(previous.blocks, values, elapsedMs),
  };
}

export default function App() {
  const [model] = useState(() => Model.fromJson(layoutConfig));
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
  });
  const activeControllerScene = useRef<ProgrammingScene>("conveyor");
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
      const motorOn = readConveyorBool(plc.project, "Motor_Run");
      const next = stepConveyor(conveyorRef.current, motorOn, 50);
      if (next !== conveyorRef.current) changeConveyor(() => next);
      const sensorTag = plc.project.tags.find((tag) => tag.name === CONVEYOR_SENSOR_TAG);
      if (sensorTag?.type === "BOOL" && sensorTag.value !== next.sensorActive) {
        changeScan((current) =>
          applySceneSensorBoolInput(current, CONVEYOR_SENSOR_TAG, next.sensorActive));
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
        readSortBool(current.project, "Sort_Motor"),
        readSortBool(current.project, "Sort_Divert"), 50);
      if (next !== sortRef.current) changeSort(() => next);
      const sensors: readonly [string, boolean][] = [
        ["Sort_TypeB", next.sensorTypeB],
        ["Sort_AExit", next.sensorExitA],
        ["Sort_BExit", next.sensorExitB],
      ];
      for (const [name, value] of sensors) {
        const tag = scanRef.current.project.tags.find((item) => item.name === name);
        if (tag?.type === "BOOL" && tag.value !== value) {
          changeScan((state) => applySceneSensorBoolInput(state, name, value));
        }
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [practiceMode, simulationTab, changeSort, changeScan]);

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

  const setSortInput = useCallback((tag: "Sort_StartPB" | "Sort_StopPB", value: boolean) => {
    changeScan((state) => applyMomentaryBoolInput(state, tag, value));
  }, [changeScan]);
  const resetSort = useCallback(() => {
    changeSort(() => initialSortState());
    changeScan((current) => {
      let next = current;
      for (const name of ["Sort_TypeB", "Sort_AExit", "Sort_BExit"]) {
        if (next.project.tags.some((tag) =>
          tag.name === name && tag.type === "BOOL" && tag.value === true)) {
          next = applySceneSensorBoolInput(next, name, false);
        }
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

  const setConveyorInput = useCallback((tag: "Start_PB" | "Stop_PB", value: boolean) => {
    // A quick momentary press must reach the PLC even between timer ticks.
    // Only the rising press samples a zero-elapsed scan in RUN mode.
    changeScan((state) => applyMomentaryBoolInput(state, tag, value));
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
  }, [simulationTab, prepareConveyor, prepareSort]);

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

  const loadSortExample = useCallback(() => {
    if (!window.confirm(
      "Se reemplazará el MainRoutine y los Controller Tags del CLASIFICADOR por su plantilla Ladder. ¿Continuar?",
    )) return;
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
    changeScan((state) => ({
      ...initialPracticeScanState(createConveyorExampleProject()),
      scanPeriodMs: state.scanPeriodMs,
    }));
    changeConveyor(() => initialConveyorState());
    openEditorView("practice");
  }, [changeScan, changeConveyor, openEditorView]);

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
            />
          );

        case "tags":
          return <ControllerTags activeScene={simulationTab} project={practice} onChange={handlePracticeChange} practiceRunning={practiceMode !== "stopped"} practicePaused={practiceMode === "paused"} online={online} inputs={inputs} values={values} onTagChange={handleTagChange} onResetCounters={handleResetCounters} />;
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
                      onLoadExample={loadConveyorExample}/>
                  : simulationTab === "sorting"
                    ? <SortScene project={practice} mode={practiceMode} state={sortState}
                        onInputChange={setSortInput}
                        onAddBox={(kind: SortBoxType) => changeSort((state) => addSortBox(state, kind))}
                        onReset={resetSort}
                        onPrepareTags={prepareSort}
                        setupError={sortSetupError}
                        onOpenTags={() => openEditorView("tags")}
                        onLoadExample={loadSortExample}/>
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
      draggingKind, nextPracticeId, handlePracticeChange, startPractice, stopPractice,
      pausePractice, resumePractice, stepPractice, changeScanPeriod, handleTagChange,
      handleResetCounters, openEditorView, onToolbarDragStart, simulationTab, conveyor,
      setConveyorInput, changeConveyor, resetConveyor, prepareConveyor,
      conveyorTagSetupError, loadConveyorExample, sortState, setSortInput,
      changeSort, resetSort, prepareSort, sortSetupError, loadSortExample,
      chooseSimulationTab],
  );

  const syncTabSelection = useCallback((updatedModel: Model) => {
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
        <main className="relative min-w-0 flex-1" aria-label="Área de trabajo acoplable">
          <Layout model={model} factory={factory} onModelChange={syncTabSelection} />
        </main>
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-slate-700/70 bg-[#1b2732] px-3 text-[11px] text-slate-400">
        <Menu size={12} />
        <span>VirtualPLC</span>
        <span className="text-slate-600">|</span>
        <span>{online ? "Monitoreo DEMO · Sin controlador físico" : "Sin conexión a controlador"}</span>
        <span className="ml-auto">Fase 5 · Escena 01 · Faja transportadora (MainRoutine)</span>
      </footer>
    </div>
  );
}
