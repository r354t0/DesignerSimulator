import { useCallback, useState } from "react";
import { Actions, DockLocation, Layout, Model, type IJsonModel, type TabNode, type TabSetNode } from "flexlayout-react";
import { Cpu, Menu, PanelLeftClose, PanelLeftOpen, CircleHelp, BookOpen } from "lucide-react";
import { ControllerOrganizer, type EditorView } from "./components/ide/ControllerOrganizer";
import { LadderEditor, ProgramTags, INSTRUCTIONS, type Instruction } from "./components/ide/LadderEditor";
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
          { type: "tab", id: "editor-tags", name: "Program Tags", component: "tags" },
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

export default function App() {
  const [model] = useState(() => Model.fromJson(layoutConfig));
  const [organizerOpen, setOrganizerOpen] = useState(true);
  const [editorView, setEditorView] = useState<EditorView>("ladder");
  const [instruction, setInstruction] = useState<Instruction>("XIC");

  const factory = useCallback(
    (node: TabNode) => {
      switch (node.getComponent()) {
        case "ladder":
          return <LadderEditor instruction={instruction} />;
        case "tags":
          return <ProgramTags />;
        case "simulation":
          return <SimulationScene />;
        default:
          return <div className="p-4">Panel no disponible</div>;
      }
    },
    [instruction],
  );

  const openEditorView = useCallback((view: EditorView) => {
    const tab = view === "ladder"
      ? { id: "editor-mainroutine", name: "MainRoutine.LAD", component: "ladder" }
      : { id: "editor-tags", name: "Program Tags", component: "tags" };

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

  const syncTabSelection = useCallback((updatedModel: Model) => {
    const editor = updatedModel.getNodeById("editor-mainroutine");
    const tags = updatedModel.getNodeById("editor-tags");
    // While both documents share a tabset, reflect clicks on the actual tabs in the tree.
    if (!editor || !tags || editor.getParent() !== tags.getParent()) return;
    const parent = editor.getParent();
    if (parent?.getType() !== "tabset") return;
    const selectedId = (parent as TabSetNode).getSelectedNode()?.getId();
    if (selectedId === "editor-mainroutine") setEditorView("ladder");
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
          <span className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300">
            OFFLINE
          </span>
          <button type="button" className="ide-icon-button" title="Versión inicial de la interfaz" aria-label="Información">
            <CircleHelp size={18} />
          </button>
        </div>
      </header>

      <div className="flex h-13 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-700/70 bg-[#1b252f] px-3">
        <span className="mr-2 shrink-0 text-[10px] font-bold tracking-widest text-slate-400">LADDER</span>
        {INSTRUCTIONS.map(({ id, symbol, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setInstruction(id);
              openEditorView("ladder");
            }}
            aria-pressed={instruction === id}
            title={label}
            className={`flex min-w-13 shrink-0 flex-col items-center justify-center rounded border px-2 py-1 text-[10px] leading-4 transition-colors ${instruction === id ? "border-sky-500 bg-sky-700/30 text-white" : "border-transparent text-slate-300 hover:border-slate-600 hover:bg-slate-700/50"}`}
          >
            <span className="font-mono text-[14px] font-semibold">{symbol}</span>
            <span>{id}</span>
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 text-[11px] text-slate-400 lg:block">Selección de herramientas · Vista preliminar</span>
      </div>

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
        <span>Sin conexión a controlador</span>
        <span className="ml-auto">Etapa 1 · Interfaz</span>
      </footer>
    </div>
  );
}
