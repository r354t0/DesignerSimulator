import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Actions, DockLocation, Layout, Model, type IJsonModel, type TabNode, type TabSetNode } from "flexlayout-react";
import { Cpu, Menu, PanelLeftClose, PanelLeftOpen, CircleHelp, BookOpen } from "lucide-react";
import { ControllerOrganizer, type EditorView } from "./components/ide/ControllerOrganizer";
import { LadderEditor } from "./components/ide/LadderEditor";
import { ControllerTags } from "./components/ide/ControllerTags";
import { PracticeEditor } from "./components/ide/PracticeEditor";
import { initialPracticeProject, type EditableKind, type PracticeProject } from "./plc/practiceDocument";
import { isEditableKind, LADDER_DRAG_MIME } from "./plc/ladderDragDrop";
import { type Instruction } from "./components/ide/LadderSymbols";
import { InstructionPalette } from "./components/ide/InstructionPalette";
import { evaluateDemo, initialDemoInputs, type DemoInputs, type InputTag } from "./plc/demoModel";
import { initialDemoBlocks, resetDemoCounters, stepDemoBlocks, type DemoBlockRuntime } from "./plc/timerCounterDemo";
import { SimulationScene } from "./components/ide/SimulationScene";
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
          { type: "tab", id: "editor-mainroutine", name: "MainRoutine.LAD", component: "ladder" },
          { type: "tab", id: "editor-practice", name: "PracticeRoutine.LAD", component: "practice" },
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
  const [editorView, setEditorView] = useState<EditorView>("ladder");
  const [instruction, setInstruction] = useState<Instruction>("XIC");
  const [draggingKind, setDraggingKind] = useState<EditableKind | null>(null);
  const [practice, setPractice] = useState<PracticeProject>(initialPracticeProject);
  const practiceIdCounter = useRef(1);
  const nextPracticeId = useCallback((prefix: string) => `${prefix}-${++practiceIdCounter.current}`, []);
  const [online, setOnline] = useState(false);
  const [demo, setDemo] = useState<DemoMachineState>(() => ({
    inputs: { ...initialDemoInputs },
    motorLatched: false,
    blocks: initialDemoBlocks(),
  }));
  const { inputs, motorLatched, blocks } = demo;

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

  const factory = useCallback(
    (node: TabNode) => {
      switch (node.getComponent()) {
        case "practice":
          return <PracticeEditor project={practice} selectedTool={instruction} draggingKind={draggingKind} onChange={setPractice} nextId={nextPracticeId} />;
        case "ladder":
          return <LadderEditor online={online} inputs={inputs} values={values} blocks={blocks} onTagChange={handleTagChange} onResetCounters={handleResetCounters} />;
        case "tags":
          return <ControllerTags project={practice} onChange={setPractice} online={online} inputs={inputs} values={values} onTagChange={handleTagChange} onResetCounters={handleResetCounters} />;
        case "simulation":
          return <SimulationScene online={online} inputs={inputs} values={values} onTagChange={handleTagChange} />;
        default:
          return <div className="p-4">Panel no disponible</div>;
      }
    },
    [online, inputs, values, blocks, practice, instruction, draggingKind, nextPracticeId, handleTagChange, handleResetCounters],
  );

  const openEditorView = useCallback((view: EditorView) => {
    const tab = view === "ladder"
      ? { id: "editor-mainroutine", name: "MainRoutine.LAD", component: "ladder" }
      : view === "practice"
        ? { id: "editor-practice", name: "PracticeRoutine.LAD", component: "practice" }
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

  const onToolbarDragStart = useCallback((event: DragEvent<HTMLButtonElement>, kind: Instruction) => {
    if (!isEditableKind(kind)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LADDER_DRAG_MIME, kind);
    setInstruction(kind);
    setDraggingKind(kind);
    // Opening the practice tab makes a drop possible even if another tab was active.
    openEditorView("practice");
  }, [openEditorView]);

  const syncTabSelection = useCallback((updatedModel: Model) => {
    const activeTabset = updatedModel.getNodeById("workspace-editor");
    if (!activeTabset || activeTabset.getType() !== "tabset") return;
    const selectedId = (activeTabset as TabSetNode).getSelectedNode()?.getId();
    if (selectedId === "editor-mainroutine") setEditorView("ladder");
    if (selectedId === "editor-practice") setEditorView("practice");
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

      <InstructionPalette
        selectedInstruction={instruction}
        onSelectEditable={(kind) => {
          setInstruction(kind);
          openEditorView("practice");
        }}
        onSelectDemo={(kind) => {
          setInstruction(kind);
          openEditorView("ladder");
        }}
        onDragStart={onToolbarDragStart}
        onDragEnd={() => setDraggingKind(null)}
      />

      <div className="flex min-h-0 flex-1">
        {organizerOpen && (
          <aside className="w-56 shrink-0 overflow-hidden border-r border-slate-700/70 bg-[#17212b] xl:w-64">
            <ControllerOrganizer view={editorView} onSelectView={openEditorView} />
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
        <span className="ml-auto">Etapa 1 · Editor interactivo (preliminar)</span>
      </footer>
    </div>
  );
}
