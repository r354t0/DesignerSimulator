import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, FileCode2, GitBranch, GripVertical, Plus, Tag, Trash2 } from "lucide-react";
import { Coil, Contact, LadderRails, Wire, type Instruction } from "./LadderSymbols";
import { PracticeTagSelector, type TagSelectorMode, type TagSelectorState } from "./PracticeTagSelector";
import {
  findVisualLadderDropTarget,
  getRungGeometry,
  isEditableKind,
  LADDER_DRAG_MIME,
  LADDER_MOVE_MIME,
  LADDER_TAG_MIME,
  PRACTICE_BRANCH_Y,
  PRACTICE_MAIN_Y,
  type VisualLadderDropTarget,
} from "../../plc/ladderDragDrop";
import {
  addParallelContact,
  changeInstructionTag,
  copyInstructionTag,
  createParallelBranch,
  createRung,
  createTag,
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
}
const EDITABLE = new Set<Instruction>(["XIC", "XIO", "OTE"]);
interface InternalDrag { id: string; kind: EditableKind }

export function PracticeEditor({ project, selectedTool, draggingKind, onChange, nextId }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dropPreview, setDropPreview] = useState<(VisualLadderDropTarget & { rungId: string }) | null>(null);
  const [moving, setMoving] = useState<InternalDrag | null>(null);
  const [tagDragSource, setTagDragSource] = useState<string | null>(null);
  const [tagDropTarget, setTagDropTarget] = useState<string | null>(null);
  const [tagFeedback, setTagFeedback] = useState("");
  const [tagSelector, setTagSelector] = useState<TagSelectorState | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
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
  const defaultTag = (kind: EditableKind) => kind === "OTE"
    ? project.tags.find((tag) => tag.name === "Motor_Run")?.name ?? project.tags[0]?.name
    : project.tags[0]?.name;

  const insertAt = (rungId: string, position: number, kind: EditableKind, anchorId?: string) => {
    const tag = defaultTag(kind);
    if (!tag) return;
    const id = nextId("instruction");
    const instruction = { id, tag, kind };
    const done = update(() => anchorId
      ? addParallelContact(project, rungId, anchorId, instruction, position)
      : insertInstruction(project, rungId, position, instruction));
    if (done) setSelected(id);
  };
  const beginMove = (event: DragEvent<HTMLButtonElement>, id: string, kind: EditableKind) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(LADDER_MOVE_MIME, id);
    setMoving({ id, kind });
    setSelected(id);
    setDropPreview(null);
  };

  // Dragging a tag label copies a reference. Dragging the symbol body moves
  // an instruction. Use distinct MIME types so the two actions never mix.
  const beginTagCopy = (event: DragEvent<HTMLButtonElement>, instructionId: string) => {
    const source = findInstruction(project, instructionId);
    if (!source) { event.preventDefault(); return; }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LADDER_TAG_MIME, instructionId);
    setTagDragSource(instructionId);
    setTagDropTarget(null);
    setDropPreview(null);
    setTagFeedback("");
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
    setTagSelector({
      instructionId,
      kind: location.instruction.kind,
      currentTag: location.instruction.tag,
      mode,
      anchor: { left: box.left, top: box.top, bottom: box.bottom },
    });
    setTagFeedback("");
  };

  const assignSelectedTag = (tag: string) => {
    if (!tagSelector) return;
    const location = findInstruction(project, tagSelector.instructionId);
    if (!location) { setTagSelector(null); return; }
    const done = update(() => changeInstructionTag(project, tagSelector.instructionId, tag));
    if (done) {
      setSelected(tagSelector.instructionId);
      setTagFeedback("Variable " + tag + " asignada a " + location.instruction.kind + ".");
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
    if (!source || !target) return;
    if (update(() => copyInstructionTag(project, sourceId, targetId))) {
      setSelected(targetId);
      setTagFeedback("Tag " + source.instruction.tag + " copiado a " + target.instruction.kind +
        " del rung " + project.rungs.findIndex((rung) => rung.id === target.rungId) + ".");
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
          ? moveToParallel(project, sourceId, rungId, target.anchorId, target.position)
          : moveInstruction(project, sourceId, rungId, target.position));
        if (done) setSelected(sourceId);
      } else if (isPalette && isEditableKind(paletteKind)) {
        insertAt(rungId, target.position, paletteKind,
          target.lane === "parallel" ? target.anchorId : undefined);
      }
    }
    setMoving(null);
  };

  const addNewTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update(() => createTag(project, tagName, tagDescription))) {
      setTagName("");
      setTagDescription("");
    }
  };
  // All rows share one horizontal coordinate system so the right rail remains
  // aligned when the editor is docked/maximized or a long OR branch is added.
  const canvasWidth = Math.max(
    760,
    viewportWidth,
    ...project.rungs.map((rung) => getRungGeometry(rung, viewportWidth).width),
  );
  const selectedLocation = selected ? findInstruction(project, selected) : null;
  const selectedInstruction = selectedLocation?.instruction;
  const selectedBranch = selectedLocation ? project.rungs
    .find((rung) => rung.id === selectedLocation.rungId)?.parallelBranches
    ?.find((branch) => branch.anchorId === (
      selectedLocation.lane === "parallel" ? selectedLocation.anchorId : selected)) : undefined;

  const insertSlot = (x: number, y: number, label: string, action: () => void, key: string) => (
    <g key={key} role="button" tabIndex={0} style={{ cursor: "pointer" }}
      aria-label={label}
      onClick={action}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); action();
        }
      }}>
      <circle cx={x} cy={y} r="12" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.3" />
      <path d={"M" + (x - 5) + " " + y + "h10 M" + x + " " + (y - 5) + "v10"}
        stroke="#2563eb" strokeWidth="1.6" />
    </g>
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-white text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f4f6f8] px-4 py-2">
        <div>
          <h2 className="text-xs font-semibold">PracticeRoutine.LAD</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Clic en tag: buscar coincidencias · Doble clic: explorar Program Tags · Arrastrar tag: copiar referencia.
          </p>
        </div>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
          EDICIÓN · SIN EJECUCIÓN
        </span>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs">
        <button type="button" onClick={() => update(() => createRung(project, nextId("rung")))}
          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 font-medium hover:bg-slate-100">
          <Plus size={14} /> Añadir rung
        </button>
        <span className="text-slate-500">
          Herramienta: <strong className="text-sky-800">{selectedTool}</strong>
          {EDITABLE.has(selectedTool) ? " · Arrastrar o pulsar +" : " · Solo demo visual"}
        </span>
        <span className="ml-auto text-slate-500">{project.rungs.length} rungs · {project.tags.length} tags</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white" ref={viewportRef}>
        <div className="min-h-full bg-white" style={{ width: canvasWidth }}>
          {project.rungs.length === 0 && (
            <p className="m-4 rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No hay rungs. Pulsa «Añadir rung» para comenzar.
            </p>
          )}
          {project.rungs.map((rung, rungIndex) => {
            const contacts = rung.instructions.filter((part) => part.kind !== "OTE");
            const output = rung.instructions.find((part) => part.kind === "OTE");
            const geometry = getRungGeometry(rung, canvasWidth);
            const { width, coilX, groups, mainSlots } = geometry;
            const y = PRACTICE_MAIN_Y, branchY = PRACTICE_BRANCH_Y;
            const showLowerLane = Boolean(rung.parallelBranches?.length || draggingKind || moving);
            const svgHeight = showLowerLane ? 204 : 122;
            const unusedAnchor = contacts.find((part) => !rung.parallelBranches
              ?.some((branch) => branch.anchorId === part.id));
            const preferredAnchor = selectedLocation?.rungId === rung.id &&
              selectedLocation.lane === "main" && selectedInstruction?.kind !== "OTE" &&
              !rung.parallelBranches?.some((branch) => branch.anchorId === selected)
              ? selected : unusedAnchor?.id;

            const drawContact = (item: typeof contacts[number], x: number, centerY: number) => (
              <g key={item.id}>
                {selected === item.id && (
                  <rect x={x - 50} y={centerY - 64} width="100" height="82" rx="4"
                    fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" />
                )}
                <Contact x={x} y={centerY} kind={item.kind as "XIC" | "XIO"}
                  tag={item.tag} comment={project.tags.find((tag) => tag.name === item.tag)?.description}
                  value={false} online={false} powerIn={false} />
              </g>
            );
            const dragButton = (item: typeof contacts[number], x: number, centerY: number) => (
              <button key={"drag-" + item.id} type="button" draggable
                aria-label={"Mover instrucción " + item.kind + " " + item.tag}
                title="Arrastra el símbolo para mover la instrucción; arrastra el tag para copiarlo"
                onClick={() => setSelected(item.id)}
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
              <button key={"tag-" + item.id} type="button" draggable
                data-practice-tag-label
                title={"Clic: buscar tag · Doble clic: explorar variables · Arrastrar: copiar " + item.tag}
                aria-label={"Seleccionar variable de " + item.kind + " " + item.tag}
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
                  "absolute z-20 cursor-copy rounded-sm border border-transparent bg-transparent focus-visible:outline-2 focus-visible:outline-sky-500 " +
                  (tagDropTarget === item.id
                    ? "border-sky-500 bg-sky-100/70 ring-2 ring-sky-400"
                    : tagDragSource === item.id
                      ? "border-sky-400 bg-sky-100/35"
                      : "hover:border-dashed hover:border-sky-400 hover:bg-sky-100/20")
                }
                style={{ left: x - 59, top: centerY - 37, width: 118, height: 21 }}>
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
                  onClick={() => setSelectedRungId((current) => current === rung.id ? null : rung.id)}
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
                    if (update(() => removeRung(project, rung.id))) { setSelected(null); setSelectedRungId(null); }
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
                        const branch = rung.parallelBranches?.find((b) => b.anchorId === item.id);
                        const from = index === 0 ? 64 : groups[index - 1].right;
                        return (
                          <g key={item.id}>
                            <Wire x1={from} y1={y} x2={group.x - 22} y2={y} />
                            <Wire x1={group.x + 22} y1={y} x2={group.right} y2={y} />
                            {drawContact(item, group.x, y)}
                            {branch && (
                              <g>
                                <Wire x1={group.left} y1={y} x2={group.left} y2={branchY} />
                                <Wire x1={group.right} y1={branchY} x2={group.right} y2={y} />
                                {branch.instructions.length === 0 ? (
                                  <Wire x1={group.left} y1={branchY} x2={group.right} y2={branchY} />
                                ) : (
                                  <>
                                    {branch.instructions.map((part, branchIndex) => {
                                      const center = group.branchCenters[branchIndex];
                                      const previousX = branchIndex === 0
                                        ? group.left : group.branchCenters[branchIndex - 1] + 22;
                                      return (
                                        <g key={part.id}>
                                          <Wire x1={previousX} y1={branchY} x2={center - 22} y2={branchY} />
                                          {drawContact(part, center, branchY)}
                                        </g>
                                      );
                                    })}
                                    <Wire x1={group.branchCenters.at(-1)! + 22} y1={branchY}
                                      x2={group.right} y2={branchY} />
                                  </>
                                )}
                                {branch.instructions.length === 0 && (
                                  <text x={group.x} y={branchY + 29} fontSize="10"
                                    textAnchor="middle" fill="#64748b">Rama OR vacía</text>
                                )}
                              </g>
                            )}
                          </g>
                        );
                      })}
                      <Wire x1={groups.at(-1)?.right ?? 64} y1={y}
                        x2={output ? coilX - 24 : width - 30} y2={y} />
                      {output && (
                        <g>
                          {selected === output.id && (
                            <rect x={coilX - 52} y={y - 64} width="104" height="83" rx="4"
                              fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" />
                          )}
                          <Coil x={coilX} y={y} tag={output.tag}
                            comment={project.tags.find((tag) => tag.name === output.tag)?.description}
                            online={false} live={false} />
                          <Wire x1={coilX + 24} y1={y} x2={width - 30} y2={y} />
                        </g>
                      )}
                      {/* Insertion hotspots appear on hover/selection/drag, not permanently. */}
                      <g className={
                        selectedRungId === rung.id || draggingKind || moving
                          ? "opacity-100"
                          : "opacity-0 transition-opacity group-hover/practice-rung:opacity-100 group-focus-within:opacity-100"
                      }>
                      {!output && selectedTool === "OTE" && insertSlot(coilX, y, "Insertar OTE",
                        () => insertAt(rung.id, contacts.length, "OTE"), "out-" + rung.id)}

                      {(selectedTool === "XIC" || selectedTool === "XIO") && mainSlots.map((x, index) =>
                        insertSlot(x, y, "Insertar " + selectedTool + " en línea principal",
                          () => insertAt(rung.id, index, selectedTool), "main-" + index))}

                      {/* Every OR path has a permanent "+" slot, even when OTE is selected. */}
                      {(rung.parallelBranches ?? []).map((branch) => {
                          const group = groups.find((item) => item.anchorId === branch.anchorId);
                          if (!group) return null;
                          const centers = group.branchCenters;
                          const slots = centers.length
                            ? [group.left + 20,
                              ...centers.slice(0, -1).map((cx, i) => (cx + centers[i + 1]) / 2),
                              group.right - 20]
                            : [group.x];
                          const kind = selectedTool === "XIO" ? "XIO" : "XIC";
                          return <g key={"slots-" + branch.anchorId}>
                            {slots.map((x, index) => insertSlot(x, branchY,
                              "Insertar " + kind + " en rama OR",
                              () => insertAt(rung.id, index, kind, branch.anchorId),
                              "branch-" + branch.anchorId + "-" + index))}
                          </g>;
                        })}
                      </g>

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
                      const branch = rung.parallelBranches?.find((b) => b.anchorId === contact.id);
                      return [
                        dragButton(contact, group.x, y),
                        tagDragButton(contact, group.x, y),
                        ...(branch?.instructions.flatMap((part, branchIndex) => [
                          dragButton(part, group.branchCenters[branchIndex], branchY),
                          tagDragButton(part, group.branchCenters[branchIndex], branchY),
                        ]) ?? []),
                      ];
                    })}
                    {output && dragButton(output, coilX, y)}
                    {output && tagDragButton(output, coilX, y)}
                    {(rung.parallelBranches ?? []).map((branch) => {
                      const group = groups.find((part) => part.anchorId === branch.anchorId);
                      return group ? (
                        <button key={"remove-" + branch.anchorId} type="button"
                          title="Eliminar toda esta rama OR"
                          onClick={() => {
                            if (update(() => removeParallelBranch(project, rung.id, branch.anchorId))) setSelected(null);
                          }}
                          className="absolute z-20 rounded border border-red-200 bg-white px-1 text-[10px] text-red-700 hover:bg-red-50"
                          style={{ left: group.right + 5, top: branchY + 16 }}>× OR</button>
                      ) : null;
                    })}
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
          {tagFeedback && (
            <p role="status" className="mx-3 mb-2 flex items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <Copy size={13} /> {tagFeedback}
            </p>
          )}
          {selectedInstruction && selectedLocation && (
            <div className="m-3 rounded border border-sky-200 bg-sky-50 p-3 text-xs">
              <div className="mb-2 flex items-center gap-1 font-semibold text-sky-900">
                <GripVertical size={14} /> Propiedades · {selectedInstruction.kind}
                <span className="ml-2 text-sky-600">
                  ({selectedLocation.lane === "parallel" ? "Rama OR" : "Línea principal"})
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-44 flex-col gap-1">
                  Tag asociado
                  <select value={selectedInstruction.tag}
                    onChange={(event) => update(() =>
                      changeInstructionTag(project, selectedInstruction.id, event.target.value))}
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-800">
                    {project.tags.map((tag) =>
                      <option key={tag.name} value={tag.name}>{tag.name}</option>)}
                  </select>
                </label>

                {selectedLocation.lane === "main" && selectedInstruction.kind !== "OTE" && !selectedBranch && (
                  <button type="button"
                    className="flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-1.5 text-sky-800 hover:bg-sky-100"
                    onClick={() => update(() => createParallelBranch(project, selectedLocation.rungId, selectedInstruction.id))}>
                    <GitBranch size={14} /> Crear rama OR vacía
                  </button>
                )}
                {selectedBranch && (
                  <button type="button"
                    className="flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1.5 text-red-700 hover:bg-red-50"
                    onClick={() => {
                      if (update(() => removeParallelBranch(project, selectedLocation.rungId, selectedBranch.anchorId))) {
                        if (selectedLocation.lane === "parallel") setSelected(null);
                      }
                    }}>
                    <Trash2 size={13} /> Eliminar rama OR
                  </button>
                )}
                {selectedLocation.lane === "main" && selectedInstruction.kind !== "OTE" && (
                  <>
                    <button type="button" aria-label="Mover contacto a la izquierda"
                      className="rounded border border-slate-300 bg-white px-2 py-1.5"
                      onClick={() => update(() => moveInstruction(project, selectedInstruction.id,
                        selectedLocation.rungId, selectedLocation.position - 1))}>
                      <ArrowLeft size={14} />
                    </button>
                    <button type="button" aria-label="Mover contacto a la derecha"
                      className="rounded border border-slate-300 bg-white px-2 py-1.5"
                      onClick={() => update(() => moveInstruction(project, selectedInstruction.id,
                        selectedLocation.rungId, selectedLocation.position + 2))}>
                      <ArrowRight size={14} />
                    </button>
                  </>
                )}
                {selectedLocation.lane === "parallel" && selectedLocation.anchorId && (
                  <>
                    <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1.5"
                      aria-label="Mover contacto OR a la izquierda"
                      onClick={() => update(() => moveToParallel(project, selectedInstruction.id,
                        selectedLocation.rungId, selectedLocation.anchorId!, selectedLocation.position - 1))}>
                      <ArrowLeft size={14} />
                    </button>
                    <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1.5"
                      aria-label="Mover contacto OR a la derecha"
                      onClick={() => update(() => moveToParallel(project, selectedInstruction.id,
                        selectedLocation.rungId, selectedLocation.anchorId!, selectedLocation.position + 2))}>
                      <ArrowRight size={14} />
                    </button>
                  </>
                )}
                <label className="flex min-w-36 flex-col gap-1">
                  Mover a otro rung
                  <select value={selectedLocation.rungId}
                    onChange={(event) => update(() =>
                      moveInstruction(project, selectedInstruction.id, event.target.value, Number.MAX_SAFE_INTEGER))}
                    className="rounded border border-slate-300 bg-white px-2 py-1.5">
                    {project.rungs.map((rung, index) =>
                      <option key={rung.id} value={rung.id}>Rung {index}</option>)}
                  </select>
                </label>
                <button type="button"
                  className="rounded border border-red-200 bg-white px-2 py-1.5 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    if (update(() => removeInstruction(project, selectedInstruction.id))) setSelected(null);
                  }}>Eliminar instrucción</button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Las ramas OR pueden quedar vacías y contener varios contactos en serie.
                Al mover un contacto principal, su rama OR viaja con él.
              </p>
            </div>
          )}

          <details className="m-3 rounded border border-slate-200 bg-[#f8fafc] p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <Tag size={14} /> Crear tag BOOL
            </summary>
            <form onSubmit={addNewTag} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
              <label className="flex flex-col gap-1">
                Nombre
                <input value={tagName} onChange={(event) => setTagName(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  placeholder="Sensor_01" required maxLength={40} />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                Comentario
                <input value={tagDescription} onChange={(event) => setTagDescription(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5"
                  placeholder="Descripción opcional" maxLength={120} />
              </label>
              <button type="submit"
                className="flex items-center gap-1 rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800">
                <Plus size={13} /> Crear
              </button>
            </form>
          </details>
          {error && (
            <p role="alert" className="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <p className="mb-5 flex items-center gap-1 px-4 text-xs text-slate-500">
            <FileCode2 size={14} /> Clic en etiqueta: sugerencias; doble clic: tabla de variables; arrastre: copiar tag. El símbolo sigue siendo desplazable.
            Sin OR anidados ni ejecución de PracticeRoutine todavía.
          </p>
        </div>
      </div>
    </section>
  );
}
