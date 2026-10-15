import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileCode2, Hammer, Play, Square, XCircle } from "lucide-react";
import { Coil, Contact, LadderRails, Wire, type Instruction } from "./LadderSymbols";
import { InstructionPalette } from "./InstructionPalette";
import { PracticeTagSelector, type TagSelectorMode, type TagSelectorState } from "./PracticeTagSelector";
import { resolveLadderDeleteAction } from "../../plc/ladderShortcuts";
import { getBitMenuTarget } from "../../plc/practiceBitMenu";
import { getWrappedRungLayout, findWrappedLadderDropTarget } from "../../plc/ladderWrappedLayout";
import { buildPracticeProject, getPracticeBuildSignature, type BuildDiagnostic, type LadderBuildResult } from "../../plc/practiceBuild";
import { evaluateSeriesScan } from "../../plc/practiceRuntime";
import {
  isEditableKind,
  LADDER_DRAG_MIME,
  LADDER_MOVE_MIME,
  LADDER_TAG_MIME,
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
  setTagValue,
  type EditableKind,
  type PracticeProject,
} from "../../plc/practiceDocument";

interface Props {
  project: PracticeProject;
  selectedTool: Instruction;
  draggingKind: EditableKind | null;
  onChange: (next: PracticeProject) => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  nextId: (prefix: string) => string;
  onSelectPaletteTool: (kind: "XIC" | "XIO" | "OTE") => void;
  onSelectDemoTool: (kind: Instruction) => void;
  onPaletteDragStart: (event: DragEvent<HTMLButtonElement>, kind: "XIC" | "XIO" | "OTE") => void;
  onPaletteDragEnd: () => void;
}
interface InternalDrag { id: string; kind: EditableKind }

export function PracticeEditor({
  project, selectedTool, draggingKind, onChange, running, onStart, onStop, nextId,
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
  const [bitMenu, setBitMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(760);
  const [buildRecord, setBuildRecord] = useState<{
    signature: string;
    result: LadderBuildResult;
    requestedBy: "build" | "run";
  } | null>(null);
  const [buildOutputOpen, setBuildOutputOpen] = useState(false);
  const [buildMessage, setBuildMessage] = useState("");

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
  useEffect(() => {
    if (!bitMenu) return;
    const closeMenu = () => setBitMenu(null);
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeWithEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [bitMenu]);

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

  const buildIsStale = Boolean(buildRecord && buildRecord.signature !== getPracticeBuildSignature(project));
  // Pure evaluation also provides live power-flow data for visual monitoring.
  const runtimeView = running ? evaluateSeriesScan(project) : null;
  const currentBuild = buildRecord?.result ?? null;
  const buildStatus = running ? "RUN · AND/OR" : !buildRecord ? "Sin verificar" :
    buildIsStale ? "Build pendiente" :
      buildRecord.result.success ? "Build correcto" : "Build con errores";

  /**
   * RUN always invokes the same Build verifier, even after a failed or stale
   * check. Stage A deliberately never claims to run a PLC scan.
   */
  const verifyPracticeRoutine = (requestedBy: "build" | "run") => {
    const result = buildPracticeProject(project);
    // RUN always performs a fresh Build, including for OR branch networks.
    if (requestedBy === "run") {
      if (result.success) onStart();
      else if (running) onStop();
    }
    setBuildRecord({ signature: getPracticeBuildSignature(project), result, requestedBy });
    setBuildOutputOpen(true);
    setBuildMessage(requestedBy === "run"
      ? result.success
        ? "Build correcto. Ejecución de XIC/XIO/OTE y ramas OR activa (Etapa C)."
        : "RUN no iniciado: corrige los errores del Build antes de ejecutar."
      : result.success
        ? "Build finalizado correctamente. Programa verificado."
        : "Build finalizado con errores. Revisa los diagnósticos.");
  };

  const navigateToDiagnostic = (diagnostic: BuildDiagnostic) => {
    if (!diagnostic.rungId) return;
    const exists = project.rungs.some((rung) => rung.id === diagnostic.rungId);
    if (!exists) return;
    setSelected(diagnostic.instructionId ?? null);
    setSelectedOrBranch(diagnostic.branchId
      ? { rungId: diagnostic.rungId, branchId: diagnostic.branchId } : null);
    setSelectedRungId(diagnostic.instructionId || diagnostic.branchId
      ? null : diagnostic.rungId);
    const row = Array.from(viewportRef.current?.querySelectorAll<HTMLElement>("[data-rung-id]") ?? [])
      .find((element) => element.dataset.rungId === diagnostic.rungId);
    row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    editorRef.current?.focus({ preventScroll: true });
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
  const openBitContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, instructionId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setTagSelector(null);
    setSelected(instructionId);
    setSelectedOrBranch(null);
    setBitMenu({
      id: instructionId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 242)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 168)),
    });
  };

  const currentBitMenuTarget = bitMenu ? getBitMenuTarget(project, bitMenu.id, running) : null;
  const toggleContextBit = () => {
    if (!currentBitMenuTarget?.editable) return;
    update(() => setTagValue(project, currentBitMenuTarget.tagName, !currentBitMenuTarget.value));
    setBitMenu(null);
  };

  const beginMove = (event: DragEvent<HTMLButtonElement>, id: string, kind: EditableKind) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(LADDER_MOVE_MIME, id);
    setMoving({ id, kind });
    setSelected(id);
    setSelectedOrBranch(null);
    setBitMenu(null);
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
    return findWrappedLadderDropTarget(project, rungId, kind, x, y, width, moving?.id);
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

  // Keep the drawing viewport sized to the editor. Wide networks fold into
  // connected continuation rows, instead of stretching every rung sideways.
  const canvasWidth = Math.max(480, viewportWidth);
  const selectedLocation = selected ? findInstruction(project, selected) : null;
  const selectedRungForInsert = selectedLocation?.rungId ?? selectedOrBranch?.rungId ?? selectedRungId;
  const selectedBranchModel = selectedOrBranch
    ? project.rungs.find((rung) => rung.id === selectedOrBranch.rungId)
      ?.parallelBranches?.find((branch) => branch.id === selectedOrBranch.branchId)
    : null;
  const selectedOutputLocation = selectedLocation?.instruction.kind === "OTE" ? selectedLocation : null;
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
    if (selectedOutputLocation) {
      // Studio-style output OR: another independently-addressed OTE sharing
      // this rung's logic, initially ?? so its tag can be assigned normally.
      insertAt(selectedOutputLocation.rungId, 0, "OTE");
      setSelectedRungId(selectedOutputLocation.rungId);
      return;
    }
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-[#e9eef4] px-2.5 py-1.5 text-xs">
        <button type="button" onClick={() => verifyPracticeRoutine("build")}
          title="Verificar todo PracticeRoutine sin ejecutar"
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
          <Hammer size={14} /> Build
        </button>
        <button type="button" onClick={() => verifyPracticeRoutine("run")}
          title="Ejecutar Build automáticamente; el motor de PLC se implementará en la Etapa B"
          className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-800">
          <Play size={14} /> RUN
        </button>
        <button type="button" onClick={onStop} disabled={!running}
          title="Detener el motor de práctica y desactivar las salidas OTE"
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
          <Square size={13} /> STOP
        </button>
        <span aria-live="polite"
          className={"rounded border px-2 py-1 text-[11px] font-semibold " +
            (running
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : !buildRecord || buildIsStale
                ? "border-amber-200 bg-amber-50 text-amber-800"
              : currentBuild?.success
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800")}>
          {buildStatus}
        </span>
        <span className="hidden min-w-0 truncate text-slate-500 md:inline">Herramienta: <strong className="text-sky-800">{selectedTool}</strong></span>
        <span className="ml-auto text-slate-500">{project.rungs.length} rungs · {project.tags.length} tags</span>
      </div>
      <InstructionPalette
        selectedInstruction={selectedTool}
        onSelectEditable={handlePaletteClick}
        onSelectDemo={onSelectDemoTool}
        onDragStart={onPaletteDragStart}
        onDragEnd={onPaletteDragEnd}
        onInsertRung={insertSelectedRungBelow}
        onInsertParallel={insertSelectedParallelBranch}
        canInsertParallel={Boolean(parallelTarget || selectedOutputLocation)}
      />

      <div className="min-h-0 flex-1 overflow-auto bg-white" ref={viewportRef}>
        <div className="min-h-full bg-white" style={{ width: canvasWidth }}>
          {project.rungs.length === 0 && (
            <p className="m-4 rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No hay rungs. Usa el primer ícono de la paleta para crear uno.
            </p>
          )}
          {project.rungs.map((rung, rungIndex) => {
            const contacts = rung.instructions.filter((part) => part.kind !== "OTE");
            const outputs = rung.instructions.filter((part) => part.kind === "OTE");
            const layout = getWrappedRungLayout(rung, canvasWidth, Boolean(draggingKind || moving));
            const { width, coilX, coilY, outputYs, groups, rows } = layout;
            const svgHeight = layout.height;
            const rungLive = running && Boolean(runtimeView?.rungPower[rung.id]);
            const drawContact = (item: typeof contacts[number], x: number, centerY: number) => {
              const flow = runtimeView?.instructionFlow[item.id];
              return (
              <g key={item.id}>
                <Contact x={x} y={centerY} kind={item.kind as "XIC" | "XIO"}
                  tag={item.tag || "??"} comment={project.tags.find((tag) => tag.name === item.tag)?.description}
                  labelWidth={96} selected={selected === item.id}
                  value={flow?.value ?? false} online={running} powerIn={flow?.powerIn ?? false} />
              </g>
              );
            };
            const dragButton = (item: typeof contacts[number], x: number, centerY: number) => (
              <button key={"drag-" + item.id} type="button" draggable
                aria-label={"Mover instrucción " + item.kind + " " + item.tag}
                title="Arrastra el símbolo para mover la instrucción; arrastra el tag para copiarlo"
                onClick={() => { setSelected(item.id); setSelectedOrBranch(null); setBitMenu(null); }}
                onContextMenu={(event) => openBitContextMenu(event, item.id)}
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
                onContextMenu={(event) => openBitContextMenu(event, item.id)}
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
                data-rung-id={rung.id}
                className="group/practice-rung relative border-b border-slate-100 bg-white"
                style={{ width: Math.max(canvasWidth, width) }}
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
                      <LadderRails leftX={63} rightX={width - 30} top={0} bottom={svgHeight} live={running} />

                      {rows.map((row, rowIndex) => {
                        const previousRow = rows[rowIndex - 1];
                        const priorId = previousRow?.groups.at(-1)?.anchorId;
                        const incomingPower = rowIndex === 0 ? running :
                          running && (priorId
                            ? Boolean(runtimeView?.joinedPower[priorId])
                            : Boolean(runtimeView?.rungPower[rung.id]));
                        const outgoingId = row.groups.at(-1)?.anchorId;
                        const outgoingPower = running && (outgoingId
                          ? Boolean(runtimeView?.joinedPower[outgoingId]) : incomingPower);
                        const lastRow = rowIndex === rows.length - 1;
                        const from = row.groups.at(-1)?.right ?? 64;
                        const to = lastRow && outputs.length ? coilX - 75 : width - 30;
                        return (
                          <g key={"wrap-row-" + row.index}>
                            {/* A new continuation line begins at the left rail; the
                                previous line exits at the right rail with arrows. */}
                            {rowIndex > 0 && (
                              <g stroke="#8796a6" fill="none" strokeWidth="1.4" pointerEvents="none">
                                <path d={"M" + 73 + " " + (row.mainY - 22) + "v16m-4 -5l4 5 4 -5"} />
                              </g>
                            )}
                            {row.groups.map((group, groupIndex) => {
                              const mainItems = group.mainIds.map((id) =>
                                contacts.find((contact) => contact.id === id)!).filter(Boolean);
                              const branches = (rung.parallelBranches ?? [])
                                .filter((branch) => branch.anchorId === group.anchorId);
                              const before = groupIndex === 0 ? 64 : row.groups[groupIndex - 1].right;
                              const inputPower = running && Boolean(runtimeView?.instructionFlow[mainItems[0]?.id]?.powerIn);
                              const mergedPower = running && Boolean(runtimeView?.joinedPower[group.anchorId]);
                              const selectUpperWire = (instructionId: string) => {
                                setSelected(instructionId);
                                setSelectedOrBranch(null);
                                setSelectedRungId(null);
                                editorRef.current?.focus({ preventScroll: true });
                              };
                              return (
                                <g key={group.anchorId}>
                                  <Wire x1={before} y1={row.mainY} x2={group.left} y2={row.mainY}
                                    live={inputPower} />
                                  <Wire x1={group.left} y1={row.mainY}
                                    x2={group.mainCenters[0] - 22} y2={row.mainY} live={inputPower} />
                                  {mainItems.map((contact, mainIndex) => {
                                    const center = group.mainCenters[mainIndex];
                                    const following = mainIndex + 1 < mainItems.length
                                      ? group.mainCenters[mainIndex + 1] - 22 : group.right;
                                    const power = running &&
                                      Boolean(runtimeView?.instructionFlow[contact.id]?.powerOut);
                                    return (
                                      <g key={contact.id}>
                                        {drawContact(contact, center, row.mainY)}
                                        <Wire x1={center + 22} y1={row.mainY}
                                          x2={following} y2={row.mainY} live={power} />
                                        <line x1={center + 22} y1={row.mainY}
                                          x2={following} y2={row.mainY}
                                          stroke="transparent" strokeWidth="16" pointerEvents="stroke"
                                          role="button" tabIndex={0}
                                          aria-label={"Insertar después de " + (contact.tag || contact.id) + " en la línea principal"}
                                          style={{ cursor: "pointer" }}
                                          onClick={(event) => {
                                            event.stopPropagation(); selectUpperWire(contact.id);
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                              event.preventDefault(); selectUpperWire(contact.id);
                                            }
                                          }} />
                                      </g>
                                    );
                                  })}
                                  {branches.length > 0 && (
                                    <g>
                                      <Wire x1={group.left} y1={row.mainY} x2={group.left}
                                        y2={group.branchLanes.at(-1)!.y} live={inputPower} />
                                      <Wire x1={group.right} y1={row.mainY} x2={group.right}
                                        y2={group.branchLanes.at(-1)!.y} live={mergedPower} />
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
                                                  pointerEvents="none" />
                                              )}
                                            {branch.instructions.length === 0 ? (
                                              <Wire x1={group.left} y1={laneY} x2={group.right}
                                                y2={laneY}
                                                live={running && Boolean(runtimeView?.branchInput[branch.id])} />
                                            ) : (
                                              <>
                                                {branch.instructions.map((part, partIndex) => {
                                                  const center = lane.centers[partIndex];
                                                  const previous = partIndex === 0
                                                    ? group.left : lane.centers[partIndex - 1] + 22;
                                                  return (
                                                    <g key={part.id}>
                                                      <Wire x1={previous} y1={laneY}
                                                        x2={center - 22} y2={laneY}
                                                        live={running &&
                                                          Boolean(runtimeView?.instructionFlow[part.id]?.powerIn)} />
                                                      {drawContact(part, center, laneY)}
                                                    </g>
                                                  );
                                                })}
                                                <Wire x1={lane.centers.at(-1)! + 22} y1={laneY}
                                                  x2={group.right} y2={laneY}
                                                  live={running && Boolean(runtimeView?.branchPower[branch.id])} />
                                              </>
                                            )}
                                            {branch.instructions.length === 0 && (
                                              <text x={group.x} y={laneY + 29} fontSize="10"
                                                textAnchor="middle" fill="#64748b">
                                                Rama OR {laneIndex + 1} vacía
                                              </text>
                                            )}
                                            <path d={"M" + group.left + " " + laneY + "H" + group.right}
                                              stroke="transparent" strokeWidth="14" fill="none"
                                              pointerEvents="stroke" role="button" tabIndex={0}
                                              aria-label={"Seleccionar rama OR " + (laneIndex + 1) +
                                                " del rung " + rungIndex + " para eliminar con Supr"}
                                              style={{ cursor: "pointer" }}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setSelected(null); setSelectedRungId(null);
                                                setSelectedOrBranch({ rungId: rung.id, branchId: branch.id });
                                                editorRef.current?.focus({ preventScroll: true });
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                  event.preventDefault();
                                                  setSelected(null); setSelectedRungId(null);
                                                  setSelectedOrBranch({ rungId: rung.id, branchId: branch.id });
                                                  editorRef.current?.focus({ preventScroll: true });
                                                }
                                              }}>
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
                            <Wire x1={from} y1={row.mainY} x2={to} y2={row.mainY}
                              live={outgoingPower} />
                            {!lastRow && (
                              <g stroke="#8796a6" fill="none" strokeWidth="1.4" pointerEvents="none">
                                <path d={"M" + (width - 40) + " " + (row.mainY + 5) +
                                  "v20m-4 -5l4 5 4 -5"} />
                              </g>
                            )}
                            {lastRow && outputs.length > 0 && (
                              <g>
                                {/* Both sides of the OTE bank share the same input
                                    power: every output is a PARALLEL end branch. */}
                                {outputs.length > 1 && (
                                  <Wire x1={coilX - 75} y1={coilY}
                                    x2={coilX - 75} y2={outputYs.at(-1)!} live={rungLive} />
                                )}
                                {outputs.map((output, index) => {
                                  const coilRowY = outputYs[index];
                                  return (
                                    <g key={output.id}>
                                      <Wire x1={coilX - 75} y1={coilRowY}
                                        x2={coilX - 24} y2={coilRowY} live={rungLive} />
                                      <Coil x={coilX} y={coilRowY} tag={output.tag || "??"}
                                        comment={project.tags.find((tag) => tag.name === output.tag)?.description}
                                        labelWidth={96} selected={selected === output.id}
                                        online={running} live={rungLive} />
                                      <Wire x1={coilX + 24} y1={coilRowY}
                                        x2={width - 30} y2={coilRowY} live={rungLive} />
                                    </g>
                                  );
                                })}
                              </g>
                            )}
                          </g>
                        );
                      })}
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
                    {groups.flatMap((group) => {
                      const mainItems = group.mainIds.map((id) =>
                        contacts.find((contact) => contact.id === id)!).filter(Boolean);
                      const branches = (rung.parallelBranches ?? [])
                        .filter((branch) => branch.anchorId === group.anchorId);
                      return [
                        ...mainItems.flatMap((contact, index) => [
                          dragButton(contact, group.mainCenters[index], group.mainY),
                          tagDragButton(contact, group.mainCenters[index], group.mainY),
                        ]),
                        ...branches.flatMap((branch, laneIndex) => {
                          const lane = group.branchLanes[laneIndex];
                          return branch.instructions.flatMap((part, partIndex) => [
                            dragButton(part, lane.centers[partIndex], lane.y),
                            tagDragButton(part, lane.centers[partIndex], lane.y),
                          ]);
                        }),
                      ];
                    })}
                    {outputs.flatMap((output, index) => [
                      dragButton(output, coilX, outputYs[index]),
                      tagDragButton(output, coilX, outputYs[index]),
                    ])}
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
            RUN ejecuta XIC/XIO/OTE con AND y ramas OR; el scan periódico corresponde a la siguiente etapa.
          </p>
        </div>
      </div>

      {bitMenu && currentBitMenuTarget && createPortal(
        <div role="menu" aria-label={"Valor BOOL de " + currentBitMenuTarget.tagName}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          style={{ position: "fixed", left: bitMenu.x, top: bitMenu.y, zIndex: 9999 }}
          className="w-[224px] rounded border border-slate-300 bg-white p-1.5 text-slate-800 shadow-xl">
          <div className="border-b border-slate-200 px-2 py-1.5 text-xs font-semibold">
            {currentBitMenuTarget.tagName}
            <span className="ml-2 font-mono text-sky-700">{Number(currentBitMenuTarget.value)}</span>
          </div>
          <button type="button" role="menuitem" disabled={!currentBitMenuTarget.editable}
            onClick={toggleContextBit}
            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-400">
            Invertir valor del bit ({Number(currentBitMenuTarget.value)} → {Number(!currentBitMenuTarget.value)})
          </button>
          {currentBitMenuTarget.reason && (
            <p className="border-t border-slate-200 px-2 py-2 text-[11px] text-amber-800">
              {currentBitMenuTarget.reason}
            </p>
          )}
        </div>, document.body,
      )}
      {buildOutputOpen && buildRecord && (
        <section aria-label="Resultados de Build" className="flex max-h-[224px] min-h-[110px] shrink-0 flex-col border-t-2 border-[#8294a8] bg-[#f4f7fa] text-slate-800">
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-1.5 text-xs">
            <Hammer size={14} />
            <strong>Build Output</strong>
            <span className="font-mono text-[11px] text-slate-500">PracticeRoutine.LAD</span>
            <span className="ml-auto flex items-center gap-1 text-red-700">
              <XCircle size={13} /> {currentBuild?.errors ?? 0} errores
            </span>
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle size={13} /> {currentBuild?.warnings ?? 0} advertencias
            </span>
            <button type="button" aria-label="Ocultar resultados de Build"
              onClick={() => setBuildOutputOpen(false)}
              title="Ocultar Build Output" className="rounded p-1 hover:bg-slate-200">
              <ChevronDown size={15}/>
            </button>
          </header>
          <p role="status"
            className={"shrink-0 px-3 py-1 text-[11px] " +
              (buildIsStale ? "bg-amber-50 text-amber-800" : "text-slate-600")}>
            {buildIsStale ? "Se modificó el proyecto desde el último Build. Vuelve a verificar antes de RUN."
              : buildMessage}
          </p>
          <div className="min-h-0 flex-1 overflow-auto" role="list" aria-label="Diagnósticos de Build">
            {currentBuild?.diagnostics.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-emerald-800">
                <CheckCircle2 size={15}/> Sin errores ni advertencias.
              </div>
            ) : currentBuild?.diagnostics.map((diagnostic) => (
              <button key={diagnostic.id} type="button" role="listitem"
                disabled={!diagnostic.rungId}
                onClick={() => navigateToDiagnostic(diagnostic)}
                title={diagnostic.rungId ? "Ir al rung o instrucción afectada" : diagnostic.message}
                className="flex w-full items-start gap-2 border-b border-slate-200 px-3 py-2 text-left text-[11px] hover:bg-sky-50 disabled:cursor-default disabled:hover:bg-transparent">
                {diagnostic.severity === "error"
                  ? <XCircle size={14} className="mt-0.5 shrink-0 text-red-700"/>
                  : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700"/>}
                <span className="shrink-0 font-mono text-slate-500">{diagnostic.code}</span>
                <span className="min-w-0 flex-1">{diagnostic.message}</span>
                {diagnostic.rungId && <span className="shrink-0 text-sky-700">Ir al rung →</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      {!buildOutputOpen && buildRecord && (
        <button type="button" onClick={() => setBuildOutputOpen(true)}
          className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-[#edf2f7] px-3 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100">
          <span>Build Output · {currentBuild?.errors ?? 0} errores · {currentBuild?.warnings ?? 0} advertencias{buildIsStale ? " · Pendiente" : ""}</span>
          <ChevronUp size={15} />
        </button>
      )}
    </section>
  );
}
