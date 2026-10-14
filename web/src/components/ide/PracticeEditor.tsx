import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { FileCode2, GitBranch, Trash2 } from "lucide-react";
import { Coil, Contact, LadderRails, Wire, type Instruction } from "./LadderSymbols";
import { InstructionPalette } from "./InstructionPalette";
import { PracticeTagSelector, type TagSelectorMode, type TagSelectorState } from "./PracticeTagSelector";
import { resolveLadderDeleteAction } from "../../plc/ladderShortcuts";
import {
  findVisualLadderDropTarget,
  getRungGeometry,
  isEditableKind,
  LADDER_DRAG_MIME,
  LADDER_MOVE_MIME,
  LADDER_TAG_MIME,
  PRACTICE_BRANCH_GAP,
  PRACTICE_MAIN_Y,
  type VisualLadderDropTarget,
} from "../../plc/ladderDragDrop";
import {
  addParallelContact,
  changeInstructionTag,
  copyInstructionTag,
  createParallelBranch,
  getParallelBranchTarget,
  getPaletteInsertionTarget,
  insertRungBelow,
  findInstruction,
  insertInstruction,
  moveInstruction,
  moveToParallel,
  removeInstruction,
  removeParallelBranch,
  removeRung,
  type EditableKind,
  type PracticeProject,
} from "../../plc/practiceDocument";

interface Props {
  project: PracticeProject;
  selectedTool: Instruction;
  draggingKind: EditableKind | null;
  onChange: (next: PracticeProject) => void;
  nextId: (prefix: string) => string;
  onSelectPaletteTool: (kind: "XIC" | "XIO" | "OTE") => void;
  onSelectDemoTool: (kind: Instruction) => void;
  onPaletteDragStart: (event: DragEvent<HTMLButtonElement>, kind: "XIC" | "XIO" | "OTE") => void;
  onPaletteDragEnd: () => void;
}
const EDITABLE = new Set<Instruction>(["XIC", "XIO", "OTE"]);
interface InternalDrag { id: string; kind: EditableKind }

export function PracticeEditor({
  project, selectedTool, draggingKind, onChange, nextId,
  onSelectPaletteTool, onSelectDemoTool, onPaletteDragStart, onPaletteDragEnd,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null);
  const [selectedOrBranch, setSelectedOrBranch] = useState<{ rungId: string; branchId: string } | null>(null);
  const [error, setError] = useState("");
  const [dropPreview, setDropPreview] = useState<(VisualLadderDropTarget & { rungId: string }) | null>(null);
  const [moving, setMoving] = useState<InternalDrag | null>(null);
  const [tagDragSource, setTagDragSource] = useState<string | null>(null);
  const [tagDropTarget, setTagDropTarget] = useState<string | null>(null);
  const [tagSelector, setTagSelector] = useState<TagSelectorState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(760);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const updateSize = () => setViewportWidth(node.clientWidth);
    updateSize();
    const resize = new ResizeObserver(updateSize);
    resize.observe(node);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (!draggingKind && !moving) setDropPreview(null);
  }, [draggingKind, moving]);

  const update = (operation: () => PracticeProject): boolean => {
    try {
      onChange(operation());
      setError("");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
      return false;
    }
  };
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // A focused input or pop-up must keep the native Delete key behavior.
    const target = event.target;
    const isTextEditing = target instanceof Element && Boolean(
      target.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]'),
    );
    const action = resolveLadderDeleteAction({
      key: event.key,
      hasSelectedInstruction: Boolean(selected && findInstruction(project, selected)),
      hasSelectedRung: Boolean(selectedRungId && project.rungs.some((rung) => rung.id === selectedRungId)),
      hasSelectedBranch: Boolean(selectedOrBranch && project.rungs.some((rung) =>
        rung.id === selectedOrBranch.rungId &&
        rung.parallelBranches?.some((branch) => branch.id === selectedOrBranch.branchId))),
      isTextEditing,
      isTagSelectorOpen: Boolean(tagSelector),
      isDragging: Boolean(moving || tagDragSource || draggingKind),
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (action === "instruction" && selected) {
      if (update(() => removeInstruction(project, selected))) {
        setSelected(null);
        setTagDropTarget(null);
      }
    } else if (action === "branch" && selectedOrBranch) {
      const rung = project.rungs.find((item) => item.id === selectedOrBranch.rungId);
      const branch = rung?.parallelBranches?.find((item) => item.id === selectedOrBranch.branchId);
      if (branch && update(() =>
        removeParallelBranch(project, selectedOrBranch.rungId, branch.anchorId, branch.id))) {
        setSelectedOrBranch(null);
        setDropPreview(null);
      }
    } else if (action === "rung" && selectedRungId) {
      // Removing the rung also removes its contacts, coil and all OR branches.
      if (update(() => removeRung(project, selectedRungId))) {
        setSelected(null);
        setSelectedRungId(null);
        setSelectedOrBranch(null);
        setTagDropTarget(null);
        setDropPreview(null);
      }
    }
  };

  const insertAt = (rungId: string, position: number, kind: EditableKind,
    anchorId?: string, branchId?: string) => {
    // Newly inserted instructions start without any operand, as in Logix Designer.
    // The visible "??" is only a placeholder, never the actual tag value.
    const id = nextId("instruction");
    const instruction = { id, tag: "", kind };
    const done = update(() => anchorId
      ? addParallelContact(project, rungId, anchorId, instruction, position, branchId)
      : insertInstruction(project, rungId, position, instruction));
    if (done) {
      setSelected(id);
      setSelectedOrBranch(null);
      // After dropping from the toolbar, give the editable routine keyboard focus.
      editorRef.current?.focus({ preventScroll: true });
    }
  };
  const beginMove = (event: DragEvent<HTMLButtonElement>, id: string, kind: EditableKind) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(LADDER_MOVE_MIME, id);
    setMoving({ id, kind });
    setSelected(id);
    setSelectedOrBranch(null);
    setDropPreview(null);
  };

  // Dragging a tag label copies a reference. Dragging the symbol body moves
  // an instruction. Use distinct MIME types so the two actions never mix.
  const beginTagCopy = (event: DragEvent<HTMLButtonElement>, instructionId: string) => {
    const source = findInstruction(project, instructionId);
    if (!source?.instruction.tag) { event.preventDefault(); return; }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LADDER_TAG_MIME, instructionId);
    setTagDragSource(instructionId);
    setTagDropTarget(null);
    setDropPreview(null);
    setTagSelector(null);
  };

  const openTagSelector = (
    event: ReactMouseEvent<HTMLButtonElement>,
    instructionId: string,
    mode: TagSelectorMode,
  ) => {
    event.stopPropagation();
    const location = findInstruction(project, instructionId);
    if (!location) return;
    const box = event.currentTarget.getBoundingClientRect();
    setSelected(instructionId);
    setSelectedOrBranch(null);
    setTagSelector({
      instructionId,
      kind: location.instruction.kind,
      currentTag: location.instruction.tag,
      mode,
      anchor: { left: box.left, top: box.top, bottom: box.bottom },
    });
  };

  const assignSelectedTag = (tag: string) => {
    if (!tagSelector) return;
    const location = findInstruction(project, tagSelector.instructionId);
    if (!location) { setTagSelector(null); return; }
    const done = update(() => changeInstructionTag(project, tagSelector.instructionId, tag));
    if (done) {
      setSelected(tagSelector.instructionId);
      setTagSelector(null);
    }
  };

  const dragOverTagTarget = (event: DragEvent<HTMLButtonElement>, targetId: string) => {
    if (!event.dataTransfer.types.includes(LADDER_TAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const allowed = Boolean(tagDragSource && tagDragSource !== targetId);
    event.dataTransfer.dropEffect = allowed ? "copy" : "none";
    setTagDropTarget(allowed ? targetId : null);
  };

  const finishTagCopy = (event: DragEvent<HTMLButtonElement>, targetId: string) => {
    if (!event.dataTransfer.types.includes(LADDER_TAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    // The payload carries an instruction ID, never untrusted arbitrary text.
    const sourceId = event.dataTransfer.getData(LADDER_TAG_MIME);
    setTagDropTarget(null);
    setTagDragSource(null);
    if (!sourceId || sourceId === targetId) return;
    const source = findInstruction(project, sourceId);
    const target = findInstruction(project, targetId);
    if (!source?.instruction.tag || !target) return;
    if (update(() => copyInstructionTag(project, sourceId, targetId))) {
      setSelected(targetId);
      setSelectedOrBranch(null);
    }
  };

  const getTarget = (event: DragEvent<HTMLDivElement>, rungId: string, width: number) => {
    const kind = moving?.kind ?? draggingKind;
    if (!kind) return null;
    const area = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - area.left) * width / area.width;
    const y = event.clientY - area.top;
    return findVisualLadderDropTarget(project, rungId, kind, x, y, width, moving?.id);
  };
  const onDragOverRung = (event: DragEvent<HTMLDivElement>, rungId: string, width: number) => {
    if (event.dataTransfer.types.includes(LADDER_TAG_MIME)) return;
    if (!event.dataTransfer.types.includes(LADDER_MOVE_MIME) &&
        !event.dataTransfer.types.includes(LADDER_DRAG_MIME)) return;
    event.preventDefault();
    const target = getTarget(event, rungId, width);
    event.dataTransfer.dropEffect = target ? (moving ? "move" : "copy") : "none";
    setDropPreview((previous) =>
      previous?.rungId === rungId && previous.lane === target?.lane &&
      previous.position === target?.position && previous.anchorId === target?.anchorId &&
      previous.branchId === target?.branchId &&
      previous.x === target?.x ? previous : target ? { ...target, rungId } : null);
  };
  const onDropRung = (event: DragEvent<HTMLDivElement>, rungId: string, width: number) => {
    if (event.dataTransfer.types.includes(LADDER_TAG_MIME)) return;
    const isMove = event.dataTransfer.types.includes(LADDER_MOVE_MIME);
    const isPalette = event.dataTransfer.types.includes(LADDER_DRAG_MIME);
    if (!isMove && !isPalette) return;
    event.preventDefault();
    event.stopPropagation();
    const target = getTarget(event, rungId, width);
    const sourceId = event.dataTransfer.getData(LADDER_MOVE_MIME);
    const paletteKind = event.dataTransfer.getData(LADDER_DRAG_MIME);
    setDropPreview(null);
    if (target) {
      if (isMove && sourceId && findInstruction(project, sourceId)) {
        const done = update(() => target.lane === "parallel" && target.anchorId
          ? moveToParallel(project, sourceId, rungId, target.anchorId, target.position, target.branchId)
          : moveInstruction(project, sourceId, rungId, target.position));
        if (done) {
          setSelected(sourceId);
          setSelectedOrBranch(null);
          editorRef.current?.focus({ preventScroll: true });
        }
      } else if (isPalette && isEditableKind(paletteKind)) {
        insertAt(rungId, target.position, paletteKind,
          target.lane === "parallel" ? target.anchorId : undefined, target.branchId);
      }
    }
    setMoving(null);
  };

  // All rows share one horizontal coordinate system so the right rail remains
  // aligned when the editor is docked/maximized or a long OR branch is added.
  const canvasWidth = Math.max(
    480,
    viewportWidth,
    ...project.rungs.map((rung) => getRungGeometry(rung, viewportWidth).width),
  );
  const selectedLocation = selected ? findInstruction(project, selected) : null;
  const selectedRungForInsert = selectedLocation?.rungId ?? selectedOrBranch?.rungId ?? selectedRungId;
  const selectedBranchModel = selectedOrBranch
    ? project.rungs.find((rung) => rung.id === selectedOrBranch.rungId)
      ?.parallelBranches?.find((branch) => branch.id === selectedOrBranch.branchId)
    : null;
  const parallelTarget = selectedOrBranch && selectedBranchModel
    ? { rungId: selectedOrBranch.rungId, anchorId: selectedBranchModel.anchorId }
    : getParallelBranchTarget(project, selected, selectedRungId);

  const insertSelectedRungBelow = () => {
    const id = nextId("rung");
    if (update(() => insertRungBelow(project, id, selectedRungForInsert))) {
      setSelected(null);
      setSelectedOrBranch(null);
      setSelectedRungId(id);
      editorRef.current?.focus({ preventScroll: true });
    }
  };

  const insertSelectedParallelBranch = () => {
    if (!parallelTarget) {
      setError("Selecciona un contacto principal o un rung con un contacto disponible para crear una rama OR.");
      return;
    }
    if (update(() => createParallelBranch(project, parallelTarget.rungId, parallelTarget.anchorId))) {
      setSelectedRungId(parallelTarget.rungId);
      setSelectedOrBranch(null);
      editorRef.current?.focus({ preventScroll: true });
    }
  };
  const handlePaletteClick = (kind: "XIC" | "XIO" | "OTE") => {
    onSelectPaletteTool(kind);
    if (selectedOrBranch && selectedBranchModel && kind !== "OTE") {
      insertAt(selectedOrBranch.rungId, selectedBranchModel.instructions.length, kind,
        selectedBranchModel.anchorId, selectedBranchModel.id);
      setSelectedRungId(selectedOrBranch.rungId);
      return;
    }
    const target = getPaletteInsertionTarget(project, selected, selectedOrBranch?.rungId ?? selectedRungId, kind);
    if (!target) {
      // Without selection, a palette click only arms the tool for drag/drop.
      setError("");
      return;
    }
    insertAt(target.rungId, target.position, kind, target.anchorId, target.branchId);
    setSelectedRungId(target.rungId);
  };


  return (
    <section
      ref={editorRef}
      tabIndex={-1}
      onKeyDown={handleEditorKeyDown}
      className="flex h-full min-h-0 flex-col bg-white text-slate-800 outline-none"
    >
      <InstructionPalette
        selectedInstruction={selectedTool}
        onSelectEditable={handlePaletteClick}
        onSelectDemo={onSelectDemoTool}
        onDragStart={onPaletteDragStart}
        onDragEnd={onPaletteDragEnd}
        onInsertRung={insertSelectedRungBelow}
        onInsertParallel={insertSelectedParallelBranch}
        canInsertParallel={Boolean(parallelTarget)}
      />
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f4f6f8] px-4 py-2">
        <div>
          <h2 className="text-xs font-semibold">PracticeRoutine.LAD</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Primer ícono: nuevo rung debajo · Segundo: rama OR · Selecciona el conductor de una rama y pulsa Supr para eliminarla.
          </p>
        </div>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
          EDICIÓN · SIN EJECUCIÓN
        </span>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs">
        <span className="text-slate-500">
          Herramienta: <strong className="text-sky-800">{selectedTool}</strong>
          {EDITABLE.has(selectedTool) ? " · Clic para insertar según selección o arrastrar" : " · Solo demo visual"}
        </span>
        <span className="ml-auto text-slate-500">{project.rungs.length} rungs · {project.tags.length} tags</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white" ref={viewportRef}>
        <div className="min-h-full bg-white" style={{ width: canvasWidth }}>
          {project.rungs.length === 0 && (
            <p className="m-4 rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No hay rungs. Usa el primer ícono de la paleta para crear uno.
            </p>
          )}
          {project.rungs.map((rung, rungIndex) => {
            const contacts = rung.instructions.filter((part) => part.kind !== "OTE");
            const output = rung.instructions.find((part) => part.kind === "OTE");
            const geometry = getRungGeometry(rung, canvasWidth);
            const { width, coilX, groups } = geometry;
            const y = PRACTICE_MAIN_Y;
            const maxLanes = Math.max(0, ...groups.map((group) => group.branchLanes.length));
            const showLowerLane = Boolean(maxLanes || draggingKind || moving);
            const svgHeight = showLowerLane ? 204 + Math.max(0, maxLanes - 1) * PRACTICE_BRANCH_GAP : 122;
            const preferredAnchor = selectedLocation?.rungId === rung.id &&
              selectedLocation.lane === "main" && selectedLocation.instruction.kind !== "OTE"
              ? selected : contacts[0]?.id;

            const drawContact = (item: typeof contacts[number], x: number, centerY: number) => (
              <g key={item.id}>
                <Contact x={x} y={centerY} kind={item.kind as "XIC" | "XIO"}
                  tag={item.tag || "??"} comment={project.tags.find((tag) => tag.name === item.tag)?.description}
                  labelWidth={96} selected={selected === item.id}
                  value={false} online={false} powerIn={false} />
              </g>
            );
            const dragButton = (item: typeof contacts[number], x: number, centerY: number) => (
              <button key={"drag-" + item.id} type="button" draggable
                aria-label={"Mover instrucción " + item.kind + " " + item.tag}
                title="Arrastra el símbolo para mover la instrucción; arrastra el tag para copiarlo"
                onClick={() => { setSelected(item.id); setSelectedOrBranch(null); }}
                onDragStart={(event) => beginMove(event, item.id, item.kind)}
                onDragEnd={() => { setMoving(null); setDropPreview(null); }}
                onDragOver={(event) => dragOverTagTarget(event, item.id)}
                onDrop={(event) => finishTagCopy(event, item.id)}
                onDragLeave={() => setTagDropTarget((current) => current === item.id ? null : current)}
                className={
                  "absolute z-10 cursor-grab rounded border bg-transparent active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-sky-500 " +
                  (tagDropTarget === item.id
                    ? "border-sky-500 bg-sky-100/70 ring-2 ring-sky-400"
                    : "border-transparent hover:border-sky-300 hover:bg-sky-100/20")
                }
                style={{ left: x - 32, top: centerY - 13, width: 64, height: 42 }}>
                <span className="sr-only">Mover {item.tag}</span>
              </button>
            );
            // The SVG keeps rendering the label; this invisible HTML hotspot
            // captures native dragstart reliably on top of the tag text only.
            const tagDragButton = (item: typeof contacts[number], x: number, centerY: number) => (
              <button key={"tag-" + item.id} type="button" draggable={Boolean(item.tag)}
                data-practice-tag-label
                title={item.tag
                  ? "Clic: buscar tag · Doble clic: explorar variables · Arrastrar: copiar " + item.tag
                  : "Sin tag · Clic para asignar variable · Doble clic para explorar variables"}
                aria-label={"Seleccionar variable de " + item.kind + " " + (item.tag || "sin asignar")}
                onClick={(event) => {
                  if (event.detail <= 1) openTagSelector(event, item.id, "suggestions");
                }}
                onDoubleClick={(event) => openTagSelector(event, item.id, "dialog")}
                onDragStart={(event) => beginTagCopy(event, item.id)}
                onDragEnd={() => { setTagDragSource(null); setTagDropTarget(null); }}
                onDragOver={(event) => dragOverTagTarget(event, item.id)}
                onDrop={(event) => finishTagCopy(event, item.id)}
                onDragLeave={() => setTagDropTarget((current) => current === item.id ? null : current)}
                className={
                  "absolute z-20 rounded-sm border border-transparent bg-transparent focus-visible:outline-2 focus-visible:outline-sky-500 " +
                  (item.tag ? "cursor-copy " : "cursor-pointer ") +
                  (tagDropTarget === item.id
                    ? "border-sky-500 bg-sky-100/70 ring-2 ring-sky-400"
                    : tagDragSource === item.id
                      ? "border-sky-400 bg-sky-100/35"
                      : "hover:border-dashed hover:border-sky-400 hover:bg-sky-100/20")
                }
                style={{ left: x - 48, top: centerY - 37, width: 96, height: 21 }}>
                <span className="sr-only">Copiar referencia de {item.tag}</span>
              </button>
            );

            return (
              <article
                key={rung.id}
                className="group/practice-rung relative border-b border-slate-100 bg-white"
                style={{ width: canvasWidth }}
                aria-label={"Rung " + rungIndex}
              >
                <button
                  type="button"
                  aria-label={"Seleccionar rung " + rungIndex}
                  aria-pressed={selectedRungId === rung.id}
                  onClick={() => {
                    setSelected(null);
                    setSelectedOrBranch(null);
                    setSelectedRungId((current) => current === rung.id ? null : rung.id);
                    editorRef.current?.focus({ preventScroll: true });
                  }}
                  className={
                    "absolute inset-y-0 left-0 z-20 flex w-[49px] items-center justify-center border-r border-slate-200 font-mono text-xs " +
                    (selectedRungId === rung.id
                      ? "bg-[#087bd1] text-white"
                      : "bg-[#f4f7fa] text-slate-500 hover:bg-sky-100")
                  }
                >
                  {rungIndex}
                </button>
                <div className="absolute left-[77px] top-1 z-30 flex items-center gap-1 opacity-60 transition-opacity group-hover/practice-rung:opacity-100 focus-within:opacity-100">
                  <button type="button" disabled={!preferredAnchor}
                    onClick={() => { if (preferredAnchor) update(() => createParallelBranch(project, rung.id, preferredAnchor)); }}
                    title={preferredAnchor ? "Crear una rama OR vacía bajo un contacto" : "Inserta primero un contacto en la línea principal"}
                    aria-label={"Añadir rama OR al rung " + rungIndex}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-sky-700 hover:bg-sky-50 disabled:text-slate-300">
                    <GitBranch size={12} /> OR
                  </button>
                  <button type="button" onClick={() => {
                    if (update(() => removeRung(project, rung.id))) { setSelected(null); setSelectedRungId(null); setSelectedOrBranch(null); }
                  }} title={"Eliminar rung " + rungIndex} aria-label={"Eliminar rung " + rungIndex}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-700">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div>
                  <div className="relative" style={{ width, height: svgHeight }}
                    onDragOver={(event) => onDragOverRung(event, rung.id, width)}
                    onDrop={(event) => onDropRung(event, rung.id, width)}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setDropPreview((previous) => previous?.rungId === rung.id ? null : previous);
                      }
                    }}>
                    <svg width={width} height={svgHeight} viewBox={"0 0 " + width + " " + svgHeight}
                      role="group" aria-label={"Rung editable " + rungIndex} className="block">
                      <rect width={width} height={svgHeight} fill="transparent" pointerEvents="all" />
                      <LadderRails leftX={63} rightX={width - 30} top={0} bottom={svgHeight} />

                      {groups.map((group, index) => {
                        const item = contacts[index];
                        const branches = (rung.parallelBranches ?? [])
                          .filter((branch) => branch.anchorId === item.id);
                        const from = index === 0 ? 64 : groups[index - 1].right;
                        return (
                          <g key={item.id}>
                            <Wire x1={from} y1={y} x2={group.x - 22} y2={y} />
                            <Wire x1={group.x + 22} y1={y} x2={group.right} y2={y} />
                            {drawContact(item, group.x, y)}
                            {branches.length > 0 && (
                              <g>
                                <Wire x1={group.left} y1={y} x2={group.left}
                                  y2={group.branchLanes.at(-1)!.y} />
                                <Wire x1={group.right} y1={y} x2={group.right}
                                  y2={group.branchLanes.at(-1)!.y} />
                                {branches.map((branch, laneIndex) => {
                                  const lane = group.branchLanes[laneIndex];
                                  const laneY = lane.y;
                                  return (
                                    <g key={branch.id}>
                                      {selectedOrBranch?.rungId === rung.id &&
                                        selectedOrBranch.branchId === branch.id && (
                                          <rect x={group.left - 7} y={laneY - 17}
                                            width={group.right - group.left + 14} height="34" rx="5"
                                            fill="#dbeafe" fillOpacity="0.75"
                                            stroke="#0284c7" strokeWidth="1.5" strokeDasharray="4 3"
                                            pointerEvents="none"/>
                                        )}
                                      {branch.instructions.length === 0 ? (
                                        <Wire x1={group.left} y1={laneY}
                                          x2={group.right} y2={laneY} />
                                      ) : (
                                        <>
                                          {branch.instructions.map((part, partIndex) => {
                                            const center = lane.centers[partIndex];
                                            const previous = partIndex === 0
                                              ? group.left : lane.centers[partIndex - 1] + 22;
                                            return (
                                              <g key={part.id}>
                                                <Wire x1={previous} y1={laneY}
                                                  x2={center - 22} y2={laneY} />
                                                {drawContact(part, center, laneY)}
                                              </g>
                                            );
                                          })}
                                          <Wire x1={lane.centers.at(-1)! + 22} y1={laneY}
                                            x2={group.right} y2={laneY} />
                                        </>
                                      )}
                                      {branch.instructions.length === 0 && (
                                        <text x={group.x} y={laneY + 29} fontSize="10"
                                          textAnchor="middle" fill="#64748b">
                                          Rama OR {laneIndex + 1} vacía
                                        </text>
                                      )}
                                      {/* The wire itself selects the OR path; no extra × OR buttons. */}
                                      <path d={"M" + group.left + " " + laneY +
                                        "H" + group.right}
                                        stroke="transparent" strokeWidth="14" fill="none"
                                        pointerEvents="stroke"
                                        role="button" tabIndex={0}
                                        aria-label={"Seleccionar rama OR " + (laneIndex + 1) +
                                          " del rung " + rungIndex + " para eliminar con Supr"}
                                        style={{ cursor: "pointer" }}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setSelected(null);
                                          setSelectedRungId(null);
                                          setSelectedOrBranch({ rungId: rung.id, branchId: branch.id });
                                          editorRef.current?.focus({ preventScroll: true });
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setSelected(null);
                                            setSelectedRungId(null);
                                            setSelectedOrBranch({ rungId: rung.id, branchId: branch.id });
                                            editorRef.current?.focus({ preventScroll: true });
                                          }
                                        }}
                                      >
                                        <title>Seleccionar rama OR · Supr para eliminarla</title>
                                      </path>
                                    </g>
                                  );
                                })}
                              </g>
                            )}
                          </g>
                        );
                      })}
                      <Wire x1={groups.at(-1)?.right ?? 64} y1={y}
                        x2={output ? coilX - 24 : width - 30} y2={y} />
                      {output && (
                        <g>
                          <Coil x={coilX} y={y} tag={output.tag || "??"}
                            comment={project.tags.find((tag) => tag.name === output.tag)?.description}
                            labelWidth={96} selected={selected === output.id}
                            online={false} live={false} />
                          <Wire x1={coilX + 24} y1={y} x2={width - 30} y2={y} />
                        </g>
                      )}
                      {dropPreview?.rungId === rung.id && (
                        <g pointerEvents="none">
                          <rect x={dropPreview.x - (dropPreview.kind === "OTE" ? 42 : 32)}
                            y={dropPreview.y - 27} width={dropPreview.kind === "OTE" ? 84 : 64}
                            height="54" rx="5" fill="#dbeafe" fillOpacity="0.88"
                            stroke="#2563eb" strokeWidth="1.4" strokeDasharray="4 3" />
                          <path d={"M" + dropPreview.x + " " + (dropPreview.y - 33) + "v66"}
                            stroke="#0284c7" strokeWidth="2" strokeDasharray="5 3" />
                          <text x={dropPreview.x} y={dropPreview.y + 5} textAnchor="middle"
                            fontSize="11" fontWeight="700" fill="#1d4ed8">{dropPreview.kind}</text>
                          {dropPreview.lane === "parallel" && (
                            <text x={dropPreview.x} y={dropPreview.y + 44}
                              textAnchor="middle" fontSize="10" fill="#2563eb">Rama OR</text>
                          )}
                        </g>
                      )}
                    </svg>

                    {/* Native HTML buttons enable dragstart consistently across browsers. */}
                    {groups.flatMap((group, index) => {
                      const contact = contacts[index];
                      const branches = (rung.parallelBranches ?? [])
                        .filter((branch) => branch.anchorId === contact.id);
                      return [
                        dragButton(contact, group.x, y),
                        tagDragButton(contact, group.x, y),
                        ...branches.flatMap((branch, laneIndex) => {
                          const lane = group.branchLanes[laneIndex];
                          return branch.instructions.flatMap((part, partIndex) => [
                            dragButton(part, lane.centers[partIndex], lane.y),
                            tagDragButton(part, lane.centers[partIndex], lane.y),
                          ]);
                        }),
                      ];
                    })}
                    {output && dragButton(output, coilX, y)}
                    {output && tagDragButton(output, coilX, y)}
                  </div>
                </div>
              </article>
            );
          })}

          {tagSelector && (
            <PracticeTagSelector
              key={tagSelector.instructionId + "-" + tagSelector.mode}
              tags={project.tags}
              selector={tagSelector}
              onSelect={assignSelectedTag}
              onClose={() => setTagSelector(null)}
            />
          )}
          {error && (
            <p role="alert" className="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <p className="mb-5 flex items-center gap-1 px-4 text-xs text-slate-500">
            <FileCode2 size={14} /> Clic en etiqueta: buscar tag; doble clic: tabla de variables; arrastre: copiar tag. Clic en conductor OR + Supr: borrar rama.
            Sin OR anidados ni ejecución de PracticeRoutine todavía.
          </p>
        </div>
      </div>
    </section>
  );
}
