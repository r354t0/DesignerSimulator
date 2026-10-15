import type { EditableKind } from "../../plc/practiceDocument";
import { useRef, useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight, Grip, Info } from "lucide-react";
import { INSTRUCTIONS, ToolbarSymbol, type Instruction } from "./LadderSymbols";
import {
  getPaletteCategory, isImplementedPaletteInstruction,
  PALETTE_CATEGORIES, type PaletteCategoryId, type PaletteTool,
} from "../../plc/instructionPalette";

interface Props {
  selectedInstruction: Instruction;
  onSelectEditable: (kind: EditableKind) => void;
  onSelectDemo: (kind: Instruction) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, kind: EditableKind) => void;
  onDragEnd: () => void;
  onInsertRung: () => void;
  onInsertParallel: () => void;
  canInsertParallel: boolean;
  outputSelected?: boolean;
}

/** First two commands from the Studio 5000 rung instruction strip. */
function StructuralGlyph({ parallel }: { parallel: boolean }) {
  return (
    <svg width="43" height="27" viewBox="0 0 86 54" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="square">
        <path d="M8 9V45 M78 9V45" />
        {parallel ? (
          <>
            <path d="M8 20H78 M23 20V39 M63 20V39 M23 39H63" />
          </>
        ) : <path d="M8 27H78" />}
      </g>
    </svg>
  );
}

function PaletteGlyph({ tool }: { tool: PaletteTool }) {
  const known = INSTRUCTIONS.some((item) => item.id === tool.id);
  if (known) {
    return <ToolbarSymbol kind={tool.id as Instruction} />;
  }
  // Symbolic preview for categories which have no editable instructions yet.
  // Text is a schematic representation, NOT an implemented function block.
  return (
    <svg width="46" height="28" viewBox="0 0 92 50" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M2 25H18 M74 25H90 M18 6H74V44H18Z" />
      </g>
      <text x="46" y="29" textAnchor="middle" fill="currentColor"
        fontFamily="Arial, sans-serif" fontWeight="700" fontSize={tool.id.length > 3 ? 11 : 13}>
        {tool.id}
      </text>
    </svg>
  );
}

export function InstructionPalette({
  selectedInstruction, onSelectEditable, onSelectDemo, onDragStart, onDragEnd,
  onInsertRung, onInsertParallel, canInsertParallel, outputSelected = false,
}: Props) {
  const [categoryId, setCategoryId] = useState<PaletteCategoryId>("favorites");
  const iconsRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const category = getPaletteCategory(categoryId);
  const supported = category.tools.filter((tool) => tool.editable).length;

  const selectTool = (tool: PaletteTool) => {
    if (isImplementedPaletteInstruction(tool.id) && tool.editable) {
      onSelectEditable(tool.id);
    } else if (tool.previewOnly) {
      onSelectDemo(tool.id as Instruction);
    }
  };

  const selectTab = (id: PaletteCategoryId) => {
    setCategoryId(id);
    iconsRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  return (
    <div className="flex h-[69px] shrink-0 flex-col border-b border-[#abb8c9] bg-[#dbe2ed] text-[#354357]"
      aria-label="Paleta de instrucciones Ladder estilo Studio 5000">
      <div className="flex min-h-0 flex-1 items-center gap-0.5 border-b border-[#c0c9d6] px-1.5">
        <button type="button" aria-label="Desplazar símbolos a la izquierda"
          title="Desplazar símbolos"
          onClick={() => iconsRef.current?.scrollBy({ left: -230, behavior: "smooth" })}
          className="flex size-6 shrink-0 items-center justify-center rounded text-[#637389] hover:bg-[#c8d4e3]">
          <ChevronLeft size={15}/>
        </button>
        <div ref={iconsRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={onInsertRung}
            title="Insertar rung debajo del seleccionado (sin selección, al final)"
            aria-label="Insertar rung debajo del seleccionado"
            className="flex h-[42px] min-w-[50px] shrink-0 flex-col items-center justify-center rounded-sm border border-transparent text-[10px] leading-[12px] text-[#37475b] hover:border-[#b0c0d4] hover:bg-[#eef3f9]"
          >
            <StructuralGlyph parallel={false} />
            <span className="font-medium">Rung</span>
          </button>
          <button type="button" onClick={onInsertParallel}
            disabled={!canInsertParallel}
            title={outputSelected
              ? "Crear una rama de salida paralela VACÍA para OTE, OTL u OTU"
              : canInsertParallel
                ? "Crear una rama OR vacía bajo el contacto seleccionado"
                : "Selecciona un contacto, una OTE o un rung válido"}
            aria-label={outputSelected ? "Crear rama paralela de salida vacía" : "Crear rama paralela OR"}
            className="flex h-[42px] min-w-[50px] shrink-0 flex-col items-center justify-center rounded-sm border border-transparent text-[10px] leading-[12px] text-[#37475b] hover:border-[#b0c0d4] hover:bg-[#eef3f9] disabled:cursor-not-allowed disabled:text-[#a0aab8] disabled:hover:border-transparent disabled:hover:bg-transparent"
          >
            <StructuralGlyph parallel />
            <span className="font-medium">OR</span>
          </button>
          <div aria-hidden="true" className="mx-1 h-7 w-px shrink-0 bg-[#b5c2d2]" />
          {category.tools.map((tool) => {
            const active = tool.editable && tool.id === selectedInstruction;
            const interactive = tool.editable || tool.previewOnly;
            const tip = tool.editable
              ? tool.title + " · Arrastra al rung o haz clic para seleccionar"
              : tool.previewOnly
                ? tool.title + " · Clic para ver el ejemplo; todavía no se puede insertar"
                : tool.title + " · Pendiente de implementar en PracticeRoutine";
            return (
              <button key={tool.id} type="button"
                draggable={tool.editable}
                disabled={!interactive}
                aria-pressed={active}
                aria-label={tool.id + (tool.editable ? " · disponible" : tool.previewOnly ? " · solo demo" : " · no disponible todavía")}
                title={tip}
                onClick={() => selectTool(tool)}
                onDragStart={(event) => {
                  if (isImplementedPaletteInstruction(tool.id) && tool.editable) {
                    onDragStart(event, tool.id);
                  } else event.preventDefault();
                }}
                onDragEnd={onDragEnd}
                className={
                  "flex h-[42px] min-w-[50px] shrink-0 flex-col items-center justify-center rounded-sm border text-[10px] leading-[12px] transition-colors " +
                  (active
                    ? "border-[#7e9ec7] bg-[#f6f9ff] text-[#1c456f] shadow-sm"
                    : tool.editable
                      ? "cursor-grab border-transparent text-[#37475b] hover:border-[#b0c0d4] hover:bg-[#eef3f9] active:cursor-grabbing"
                      : tool.previewOnly
                        ? "border-transparent text-[#677b95] hover:bg-[#eef3f9]"
                        : "cursor-not-allowed border-transparent text-[#a0aab8]")
                }>
                <PaletteGlyph tool={tool}/>
                <span className="text-center font-medium">{tool.id}</span>
              </button>
            );
          })}
        </div>
        <button type="button" aria-label="Desplazar símbolos a la derecha"
          title="Desplazar símbolos"
          onClick={() => iconsRef.current?.scrollBy({ left: 230, behavior: "smooth" })}
          className="flex size-6 shrink-0 items-center justify-center rounded text-[#637389] hover:bg-[#c8d4e3]">
          <ChevronRight size={15}/>
        </button>
        <div className="hidden max-w-[164px] shrink-0 items-center gap-1 border-l border-[#c4cedb] pl-2 text-[10px] leading-3 text-[#627084] xl:flex"
          title="Instrucciones Bit disponibles en PracticeRoutine">
          {supported ? <Grip size={13} className="shrink-0"/> : <Info size={13} className="shrink-0"/>}
          <span>{supported ? "XIC / XIO / ONS / OTE / OTL / OTU" : "Funciones pendientes o solo demo"}</span>
        </div>
      </div>
      <div className="flex h-[24px] shrink-0 items-stretch border-t border-[#f4f7fa] bg-[#d1dae7] px-1">
        <button type="button" aria-label="Desplazar categorías a la izquierda"
          onClick={() => tabsRef.current?.scrollBy({ left: -240, behavior: "smooth" })}
          className="flex w-5 shrink-0 items-center justify-center text-[#6d7d91] hover:bg-[#becbdb]">
          <ChevronLeft size={13}/>
        </button>
        <div role="tablist" aria-label="Categorías de instrucciones Ladder"
          ref={tabsRef}
          className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PALETTE_CATEGORIES.map((item) => (
            <button key={item.id} type="button" role="tab"
              id={"instruction-tab-" + item.id}
              aria-controls="ladder-instruction-toolbar"
              aria-selected={categoryId === item.id}
              title={"Instrucciones: " + item.label}
              onClick={() => selectTab(item.id)}
              className={
                "shrink-0 whitespace-nowrap border-x px-2.5 text-[11px] transition-colors " +
                (categoryId === item.id
                  ? "border-[#abb9cc] bg-[#f1f5fa] font-semibold text-[#132d4f] shadow-[inset_0_2px_0_#4876ad]"
                  : "border-transparent text-[#243d5a] hover:bg-[#e6edf6]")
              }>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Desplazar categorías a la derecha"
          onClick={() => tabsRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
          className="flex w-5 shrink-0 items-center justify-center text-[#6d7d91] hover:bg-[#becbdb]">
          <ChevronRight size={13}/>
        </button>
      </div>
      <span id="ladder-instruction-toolbar" className="sr-only">
        Categoría {category.label}. {supported} instrucciones editables en esta categoría.
      </span>
    </div>
  );
}
