import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu, Folder, FileCode2, Tags, Settings2 } from "lucide-react";

export type EditorView = "ladder" | "practice" | "tags";

interface Props {
  view: EditorView;
  onSelectView: (view: EditorView) => void;
}

export function ControllerOrganizer({ view, onSelectView }: Props) {
  const [tasksOpen, setTasksOpen] = useState(true);
  const [programOpen, setProgramOpen] = useState(true);

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="border-b border-slate-700/70 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Cpu size={15} className="text-sky-400" /> Controller Organizer
        </div>
        <p className="mt-1 pl-6 text-[11px] text-slate-400">VirtualPLC</p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Estructura del controlador">
        <div className="ide-tree-row font-medium"><Settings2 size={14} /> Controller Properties</div>
        <button type="button" className="ide-tree-row w-full" onClick={() => setTasksOpen((v) => !v)}>
          {tasksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Folder size={14} className="text-amber-300" /> Tasks
        </button>
        {tasksOpen && (
          <div className="ml-3 border-l border-slate-700/70 pl-2">
            <button type="button" className="ide-tree-row w-full" onClick={() => setProgramOpen((v) => !v)}>
              {programOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Folder size={14} className="text-amber-300" /> MainTask
            </button>
            {programOpen && (
              <div className="ml-3 border-l border-slate-700/70 pl-2">
                <div className="ide-tree-row"><Folder size={14} className="text-amber-300" /> MainProgram</div>
                <button
                  type="button"
                  onClick={() => onSelectView("ladder")}
                  className={`ide-tree-row ml-2 w-[calc(100%-0.5rem)] ${view === "ladder" ? "ide-tree-selected" : ""}`}
                >
                  <FileCode2 size={14} /> MainRoutine.LAD
                </button>
                <button
                  type="button"
                  onClick={() => onSelectView("practice")}
                  className={`ide-tree-row ml-2 w-[calc(100%-0.5rem)] ${view === "practice" ? "ide-tree-selected" : ""}`}
                >
                  <FileCode2 size={14} /> PracticeRoutine.LAD
                </button>
                <button
                  type="button"
                  onClick={() => onSelectView("tags")}
                  className={`ide-tree-row ml-2 w-[calc(100%-0.5rem)] ${view === "tags" ? "ide-tree-selected" : ""}`}
                >
                  <Tags size={14} /> Program Tags
                </button>
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="border-t border-slate-700/70 p-3 text-[11px] text-slate-400">
        Proyecto de práctica · V1
      </div>
    </div>
  );
}
