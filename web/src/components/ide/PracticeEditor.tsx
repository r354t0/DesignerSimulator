import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, Hammer, Pause, Play, Square, StepForward, XCircle } from "lucide-react";
import { Coil, ResetCoil, Contact, TimerBlock, CounterBlock, ComparisonBlock, MathOutputBlock, LadderRails, Wire, type Instruction } from "./LadderSymbols";
import { CompareOperandEditor, type CompareOperandAnchor } from "./CompareOperandEditor";
import { numericOperandLabel, setComparisonOperand } from "../../plc/practiceCompare";
import { setMathSource, setMathDestination } from "../../plc/practiceMath";
import type { NumericOperand } from "../../plc/practiceDocument";
import { InstructionPalette } from "./InstructionPalette";
import { PracticeTagSelector, type TagSelectorMode, type TagSelectorState } from "./PracticeTagSelector";
import { TimerPresetEditor, type TimerPresetAnchor } from "./TimerPresetEditor";
import { resolveLadderDeleteAction } from "../../plc/ladderShortcuts";
import { getBitMenuTarget, invertInstructionBit } from "../../plc/practiceBitMenu";
import { getOnlineMonitorReadout, type MonitorSelection } from "../../plc/practiceOnlineMonitor";
import { getWrappedRungLayout, findWrappedLadderDropTarget } from "../../plc/ladderWrappedLayout";
import { buildPracticeProject, getPracticeBuildSignature, type BuildDiagnostic, type LadderBuildResult } from "../../plc/practiceBuild";
import { getRunAction, type PracticeScanState, type ScanMode, SCAN_PERIODS_MS } from "../../plc/practiceScanCycle";
import {
  isEditableKind,
  LADDER_DRAG_MIME,
  LADDER_MOVE_MIME,
  LADDER_TAG_MIME,
  LADDER_RUNG_MIME,
  type VisualLadderDropTarget,
} from "../../plc/ladderDragDrop";
import {
  addParallelContact,
  changeInstructionTag,
  copyInstructionTag,
  createIndependentParallelBranch,
  insertIntoIndependentOrUpper,
  moveToIndependentOrUpper,
  removeEmptyOutputBranch,
  fillEmptyOutputBranch,

  getPaletteInsertionTarget,
  insertRungBelow,
  findInstruction,
  insertInstruction,
  moveInstruction,
  moveRung,
  moveInstructionToEmptyOutputBranch,
  moveToParallel,
  removeInstruction,
  removeParallelBranch,
  removeRung,
  isOutputKind,
  isTimerKind,
  isCounterKind,
  isCompareKind,
  isMathKind,
  OR_JUNCTION_KIND,
  setInstructionPreset,
  setRungComment,
  type EditableKind,
  type PracticeProject,
} from "../../plc/practiceDocument";

interface Props {
  project: PracticeProject;
  selectedTool: Instruction;
  draggingKind: EditableKind | null;
  onChange: (next: PracticeProject) => void;
  running: boolean;
  scanMode: ScanMode;
  scanState: PracticeScanState;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onScanPeriodChange: (period: number) => void;
  nextId: (prefix: string) => string;
  onSelectPaletteTool: (kind: EditableKind) => void;
  onSelectDemoTool: (kind: Instruction) => void;
  onPaletteDragStart: (event: DragEvent<HTMLButtonElement>, kind: EditableKind) => void;
  onPaletteDragEnd: () => void;
  onCrossReference: (tag: string) => void;
  navigateToReference: { instructionId: string; rungId: string; branchId?: string; token: number } | null;
}
interface InternalDrag { id: string; kind: EditableKind }

export function PracticeEditor({
  project, selectedTool, draggingKind, onChange, running, scanMode, scanState,
  onStart, onStop, onPause, onResume, onStep, onScanPeriodChange, nextId,
  onSelectPaletteTool, onSelectDemoTool, onPaletteDragStart, onPaletteDragEnd,
  onCrossReference, navigateToReference,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null);
  const [editingRungCommentId,setEditingRungCommentId]=useState<string|null>(null);
  const [selectedOrBranch, setSelectedOrBranch] = useState<{ rungId: string; branchId: string } | null>(null);
  const [error, setError] = useState("");
  const [dropPreview, setDropPreview] = useState<(VisualLadderDropTarget & { rungId: string }) | null>(null);
  const [moving, setMoving] = useState<InternalDrag | null>(null);
  const [draggingRungId, setDraggingRungId] = useState<string | null>(null);
  const [rungDropTarget, setRungDropTarget] = useState<
    { rungId: string; placement: "before" | "after" } | null>(null);
  const [tagDragSource, setTagDragSource] = useState<string | null>(null);
  const [tagDropTarget, setTagDropTarget] = useState<string | null>(null);
  const [tagSelector, setTagSelector] = useState<TagSelectorState | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetAnchor, setEditingPresetAnchor] = useState<TimerPresetAnchor | null>(null);
  const [editingCompare, setEditingCompare] = useState<{
    id: string; side: "A" | "B"; anchor: CompareOperandAnchor;
  } | null>(null);
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
  const [onlineMonitorOpen, setOnlineMonitorOpen] = useState(false);
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
        (rung.parallelBranches?.some((branch) => branch.id === selectedOrBranch.branchId) ||
          rung.emptyOutputBranches?.includes(selectedOrBranch.branchId)))),
      isTextEditing,
      isTagSelectorOpen: Boolean(tagSelector),
      isDragging: Boolean(moving || tagDragSource || draggingKind || draggingRungId),
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
      const outputLane = rung?.emptyOutputBranches?.includes(selectedOrBranch.branchId);
      if ((branch || outputLane) && update(() =>
        branch
          ? removeParallelBranch(project, selectedOrBranch.rungId, branch.anchorId, branch.id)
          : removeEmptyOutputBranch(project, selectedOrBranch.rungId, selectedOrBranch.branchId))) {
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
  // Show only the LAST completed scan. Inputs changed during PAUSE must not
  // create fictitious green paths until STEP/RESUME actually executes.
  const runtimeView = running ? scanState.frame : null;
  const currentBuild = buildRecord?.result ?? null;
  const buildStatus = scanMode === "running" ? "RUN · Scan Cycle" :
    scanMode === "paused" ? "PAUSE · detenido" :
    !buildRecord ? "Sin verificar" :
    buildIsStale ? "Build pendiente" :
      buildRecord.result.success ? "Build correcto" : "Build con errores";

  /**
   * RUN always invokes a fresh Build, even after a failed or stale check.
   * A successful Build starts a periodic browser-based scan session.
   */
  const verifyMainRoutine = (requestedBy: "build" | "run") => {
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
        ? "Build correcto. Scan Cycle periódico activo (Etapa D)."
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

  useEffect(() => {
    if (!navigateToReference) return;
    if (!project.rungs.some(rung => rung.id === navigateToReference.rungId)) return;
    setSelected(navigateToReference.instructionId);
    setSelectedOrBranch(navigateToReference.branchId
      ? { rungId: navigateToReference.rungId, branchId: navigateToReference.branchId } : null);
    setSelectedRungId(null);
    const frame = window.requestAnimationFrame(() => {
      const row = Array.from(viewportRef.current?.querySelectorAll<HTMLElement>("[data-rung-id]") ?? [])
        .find(element => element.dataset.rungId === navigateToReference.rungId);
      row?.scrollIntoView({ block: "center", inline: "nearest" });
      editorRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navigateToReference, project.rungs]);

  const insertAt = (rungId: string, position: number, kind: EditableKind,
    anchorId?: string, branchId?: string) => {
    // Newly inserted instructions start without any operand, as in Logix Designer.
    // The visible "??" is only a placeholder, never the actual tag value.
    const id = nextId("instruction");
    const instruction = { id, tag: "", kind };
    const done = update(() => anchorId
      ? addParallelContact(project, rungId, anchorId, instruction, position, branchId)
      : branchId && isOutputKind(kind)
        ? fillEmptyOutputBranch(project, rungId, branchId, instruction)
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
    if (!currentBitMenuTarget?.editable || !bitMenu) return;
    update(() => invertInstructionBit(project, bitMenu.id, running));
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

  // Whole-rung dragging starts only from the left-number gutter. A separate
  // MIME type keeps this path independent from instruction/tag drag-and-drop.
  const beginRungMove = (event: DragEvent<HTMLButtonElement>, rungId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(LADDER_RUNG_MIME, rungId);
    setDraggingRungId(rungId);
    setRungDropTarget(null);
    setDropPreview(null);
    setMoving(null);
    setTagSelector(null);
    setEditingPresetId(null);
    setEditingCompare(null);
    setBitMenu(null);
    setSelected(null);
    setSelectedOrBranch(null);
    setSelectedRungId(rungId);
  };

  const rungPlacement = (
    event: DragEvent<HTMLElement>,
  ): "before" | "after" => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  const dragOverWholeRung = (event: DragEvent<HTMLElement>, targetId: string) => {
    if (!event.dataTransfer.types.includes(LADDER_RUNG_MIME) || !draggingRungId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const placement = rungPlacement(event);
    setRungDropTarget((previous) =>
      previous?.rungId === targetId && previous.placement === placement
        ? previous : { rungId: targetId, placement });
  };

  const dropWholeRung = (event: DragEvent<HTMLElement>, targetId: string) => {
    if (!event.dataTransfer.types.includes(LADDER_RUNG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData(LADDER_RUNG_MIME);
    const placement = rungPlacement(event);
    if (sourceId && sourceId === draggingRungId &&
        project.rungs.some((rung) => rung.id === sourceId)) {
      const next = moveRung(project, sourceId, targetId, placement);
      if (next !== project) update(() => next);
      setSelected(null);
      setSelectedOrBranch(null);
      setSelectedRungId(sourceId);
    }
    setDraggingRungId(null);
    setRungDropTarget(null);
  };

  const finishRungMove = () => {
    setDraggingRungId(null);
    setRungDropTarget(null);
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
    const done = update(() => isMathKind(location.instruction.kind)
      ? setMathDestination(project, tagSelector.instructionId, tag)
      : changeInstructionTag(project, tagSelector.instructionId, tag));
    if (done) {
      setSelected(tagSelector.instructionId);
      setTagSelector(null);
    }
  };

  const editSelectedTag = (draft: string): string | null => {
    if (!tagSelector) return "No se encontró la instrucción seleccionada.";
    try {
      const found = findInstruction(project, tagSelector.instructionId);
      const next = found && isMathKind(found.instruction.kind) && draft.trim()
        ? setMathDestination(project, tagSelector.instructionId, draft.trim())
        : changeInstructionTag(project, tagSelector.instructionId, draft);
      onChange(next);
      setError("");
      setSelected(tagSelector.instructionId);
      return null;
    } catch (cause) {
      // Invalid edits must never replace the previously assigned operand.
      return cause instanceof Error ? cause.message : "Operando inválido.";
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
        const done = update(() => target.lane === "upper" && target.anchorId
          ? moveToIndependentOrUpper(project, sourceId, rungId, target.anchorId)
          : target.lane === "parallel" && target.anchorId
          ? moveToParallel(project, sourceId, rungId, target.anchorId, target.position, target.branchId)
          : target.branchId && !target.anchorId
            ? moveInstructionToEmptyOutputBranch(project, sourceId, rungId, target.branchId)
            : moveInstruction(project, sourceId, rungId, target.position));
        if (done) {
          setSelected(sourceId);
          setSelectedOrBranch(null);
          editorRef.current?.focus({ preventScroll: true });
        }
      } else if (isPalette && isEditableKind(paletteKind)) {
        if (target.lane === "upper" && target.anchorId) {
          const id = nextId("instruction");
          const anchorId = target.anchorId;
          if (update(() => insertIntoIndependentOrUpper(project, rungId, anchorId, {
            id, tag: "", kind: paletteKind,
          }))) {
            setSelected(id);
            setSelectedOrBranch(null);
            editorRef.current?.focus({ preventScroll: true });
          }
        } else {
          insertAt(rungId, target.position, paletteKind,
            target.lane === "parallel" ? target.anchorId : undefined, target.branchId);
        }
      }
    }
    setMoving(null);
  };

  // Keep the drawing viewport sized to the editor. Wide networks fold into
  // connected continuation rows, instead of stretching every rung sideways.
  const canvasWidth = Math.max(480, viewportWidth);
  const selectedLocation = selected ? findInstruction(project, selected) : null;
  const editingPreset = editingPresetId ? findInstruction(project, editingPresetId)?.instruction : undefined;
  const selectedRungForInsert = selectedLocation?.rungId ?? selectedOrBranch?.rungId ?? selectedRungId;
  const monitorSelection: MonitorSelection = selected
    ? { kind: "instruction", instructionId: selected }
    : selectedOrBranch ? { kind: "branch", ...selectedOrBranch }
      : selectedRungId ? { kind: "rung", rungId: selectedRungId } : null;
  const onlineReadout = onlineMonitorOpen
    ? getOnlineMonitorReadout(project, scanState.frame, scanMode, monitorSelection)
    : null;
  const selectedBranchModel = selectedOrBranch
    ? project.rungs.find((rung) => rung.id === selectedOrBranch.rungId)
      ?.parallelBranches?.find((branch) => branch.id === selectedOrBranch.branchId)
    : null;
  const selectedEmptyOutputBranch = selectedOrBranch &&
    project.rungs.find((rung) => rung.id === selectedOrBranch.rungId)
      ?.emptyOutputBranches?.includes(selectedOrBranch.branchId)
    ? selectedOrBranch : null;

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
    const location = selected ? findInstruction(project, selected) : null;
    const rungId = location?.rungId ?? selectedOrBranch?.rungId ?? selectedRungId;
    if (!rungId) {
      setError("Selecciona una instrucción o el número del rung para insertar un OR independiente.");
      return;
    }
    // A selected main contact identifies the slot AFTER it; selecting a rung
    // places the independent OR at the last main slot, before output coils.
    const after = location?.lane === "main" && !isOutputKind(location.instruction.kind)
      ? location.instruction.id
      : selectedBranchModel?.endId ?? selectedBranchModel?.anchorId;
    let created: PracticeProject | null = null;
    if (update(() => {
      created = createIndependentParallelBranch(project, rungId, after);
      return created;
    }) && created) {
      const previous = new Set(project.rungs.find((r) => r.id === rungId)
        ?.parallelBranches?.map((branch) => branch.id) ?? []);
      const newBranch = (created as PracticeProject).rungs.find((r) => r.id === rungId)
        ?.parallelBranches?.find((branch) => !previous.has(branch.id));
      setSelected(null);
      setSelectedRungId(null);
      setSelectedOrBranch(newBranch ? { rungId, branchId: newBranch.id } : null);
      editorRef.current?.focus({ preventScroll: true });
    }
  };
  const handlePaletteClick = (kind: EditableKind) => {
    onSelectPaletteTool(kind);
    if (selectedEmptyOutputBranch && isOutputKind(kind)) {
      insertAt(selectedEmptyOutputBranch.rungId, 0, kind, undefined,
        selectedEmptyOutputBranch.branchId);
      return;
    }
    if (selected && findInstruction(project, selected)?.instruction.kind === OR_JUNCTION_KIND &&
        !isOutputKind(kind)) {
      const location = findInstruction(project, selected)!;
      if (update(() => insertIntoIndependentOrUpper(project, location.rungId, selected, {
        id: nextId("practice"), kind, tag: "",
      }))) {
        setSelectedRungId(location.rungId);
        setSelected(null);
      }
      return;
    }
    if (selectedOrBranch && selectedBranchModel && !isOutputKind(kind)) {
      if (selectedBranchModel.instructions.length === 0) {
        // First instruction is placed in the empty lower lane.
        insertAt(selectedOrBranch.rungId, 0, kind,
          selectedBranchModel.anchorId, selectedBranchModel.id);
      } else {
        // Once the lower OR has content, clicking the OR conductor then a
        // palette instruction continues the main path AFTER the reunion.
        const rung = project.rungs.find((item) => item.id === selectedOrBranch.rungId)!;
        const endId = selectedBranchModel.endId ?? selectedBranchModel.anchorId;
        const position = rung.instructions.filter((item) => !isOutputKind(item.kind))
          .findIndex((item) => item.id === endId) + 1;
        insertAt(rung.id, position, kind);
      }
      setSelectedRungId(selectedOrBranch.rungId);
      setSelectedOrBranch(null);
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
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-[#e9eef4] px-3 py-1.5 text-xs">
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => verifyMainRoutine("build")}
            title="Verificar MainRoutine sin iniciar el scan"
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
            <Hammer size={14} /> Build
          </button>
          <button type="button"
            disabled={scanMode === "running"}
            onClick={() => {
              const action = getRunAction(scanMode);
              if (action === "resume") onResume();
              else if (action === "build-and-start") verifyMainRoutine("run");
            }}
            title={scanMode === "paused"
              ? "Reanudar la simulación pausada, conservando el contador de scans"
              : "Ejecutar Build automáticamente e iniciar RUN"}
            className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Play size={14} /> RUN
          </button>
          <button type="button" onClick={onStop} disabled={!running}
            title="Detener el Scan Cycle y desactivar las salidas OTE"
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
            <Square size={13} /> STOP
          </button>
          <button type="button" onClick={onPause} disabled={scanMode !== "running"}
            title="Pausar el Scan Cycle y mantener las salidas congeladas"
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
            <Pause size={13} /> PAUSE
          </button>
          <button type="button" onClick={onStep} disabled={scanMode !== "paused"}
            title="Ejecutar exactamente un scan mientras está en PAUSE"
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
            <StepForward size={14} /> SCAN
          </button>
        </div>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            Ciclo
            <select aria-label="Período del Scan Cycle" value={scanState.scanPeriodMs}
              onChange={(event) => onScanPeriodChange(Number(event.target.value))}
              className="rounded border border-slate-300 bg-white px-1 py-1 text-[11px] text-slate-800">
              {SCAN_PERIODS_MS.map((period) =>
                <option key={period} value={period}>{period} ms</option>)}
            </select>
          </label>
          <span title="Duración del último cálculo Ladder en JavaScript (no incluye la espera ni el renderizado)"
            className="hidden font-mono text-[11px] tabular-nums text-slate-600 lg:inline">
            Último: {scanState.lastScanDurationMs.toFixed(2)} ms
          </span>
          <span aria-live="polite"
            className={"rounded border px-2 py-1 text-[11px] font-semibold " +
              (scanMode === "running"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : scanMode === "paused"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : !buildRecord || buildIsStale
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : currentBuild?.success
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800")}>
            {buildStatus}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-[#f8fafc] px-3 py-0.5 text-[11px] text-slate-500">
        <span>Herramienta: <strong className="text-sky-800">{selectedTool}</strong></span>
        <div className="flex items-center gap-2">
          <button type="button" aria-pressed={onlineMonitorOpen}
            title={onlineMonitorOpen ? "Cerrar monitor de la selección" : "Monitorear la instrucción o rama seleccionada"}
            onClick={() => {
              setOnlineMonitorOpen((open) => !open);
              setBuildOutputOpen(false);
            }}
            className={"inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] " +
              (onlineMonitorOpen ? "bg-sky-100 text-sky-800" : "text-slate-600 hover:bg-slate-200")}>
            {onlineMonitorOpen ? <EyeOff size={13} /> : <Eye size={13} />} Monitor
          </button>
          <span>{project.rungs.length} rungs · {project.tags.length} tags</span>
        </div>
      </div>
      <InstructionPalette
        selectedInstruction={selectedTool}
        onSelectEditable={handlePaletteClick}
        onSelectDemo={onSelectDemoTool}
        onDragStart={onPaletteDragStart}
        onDragEnd={onPaletteDragEnd}
        onInsertRung={insertSelectedRungBelow}
        onInsertParallel={insertSelectedParallelBranch}
        canInsertParallel={Boolean(selected || selectedOrBranch || selectedRungId)}
        outputSelected={false}
      />

      <div className="min-h-0 flex-1 overflow-auto bg-white" ref={viewportRef}>
        <div className="min-h-full bg-white" style={{ width: canvasWidth }}>
          {project.rungs.length === 0 && (
            <p className="m-4 rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No hay rungs. Usa el primer ícono de la paleta para crear uno.
            </p>
          )}
          {project.rungs.map((rung, rungIndex) => {
            const contacts = rung.instructions.filter((part) => !isOutputKind(part.kind));
            const outputs = rung.instructions.filter((part) => isOutputKind(part.kind));
            const hasTimerOutputs = outputs.some((part) =>
              (isTimerKind(part.kind) && part.kind !== "RES") ||
              part.kind === "GEAR_SEQ" ||
              isCounterKind(part.kind) || isMathKind(part.kind));
            const emptyOutputBranches = rung.emptyOutputBranches ?? [];
            // Keep every rung at its persisted height while dragging.
            // Insertion is shown as a non-layout-changing SVG overlay only.
            const layout = getWrappedRungLayout(rung, canvasWidth);
            const { width, coilX, coilY, outputYs, emptyOutputYs, groups, rows } = layout;
            const svgHeight = layout.height;
            const rungLive = running && Boolean(runtimeView?.rungPower[rung.id]);
            const drawContact = (item: typeof contacts[number], x: number, centerY: number) => {
              const flow = runtimeView?.instructionFlow[item.id];
              // A Studio 5000-style branch has only conductors and contacts.
              // Keep the junction in the data model for hit-testing, but do
              // not draw an OR box, label or any permanent placeholder.
              if (item.kind === OR_JUNCTION_KIND) return <g key={item.id} />;
              if (isCompareKind(item.kind)) return (
                <ComparisonBlock key={item.id} x={x} y={centerY} kind={item.kind}
                  sourceA={numericOperandLabel(item.compareA)}
                  sourceB={numericOperandLabel(item.compareB)}
                  selected={selected === item.id} online={running}
                  condition={flow?.condition ?? false} live={flow?.powerOut ?? false}/>
              );
              return (
                <Contact key={item.id} x={x} y={centerY} kind={item.kind as "XIC" | "XIO" | "ONS"}
                  tag={item.tag || "??"} comment={project.tags.find((tag) => tag.name === item.tag)?.description}
                  labelWidth={96} selected={selected === item.id}
                  value={flow?.value ?? false} online={running} powerIn={flow?.powerIn ?? false}
                  flowOut={flow?.powerOut ?? false} />
              );
            };
            const compareHotspots = (item: typeof contacts[number], x: number, centerY: number) =>
              (["A", "B"] as const).map((side, index) => (
                <button key={"compare-" + item.id + "-" + side} type="button"
                  aria-label={"Editar Source " + side + " de " + item.kind}
                  title={"Source " + side + ": número o variable DINT/REAL"}
                  className="absolute z-30 cursor-text rounded border border-transparent bg-transparent hover:border-sky-500 hover:bg-sky-100/25 focus-visible:outline-2 focus-visible:outline-sky-500"
                  style={{ left: x - 23, top: centerY + (index === 0 ? -6 : 9),
                    width: 60, height: 14 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(item.id);
                    setSelectedRungId(null);
                    setSelectedOrBranch(null);
                    setEditingPresetId(null);
                    const rect = event.currentTarget.getBoundingClientRect();
                    setEditingCompare({ id: item.id, side,
                      anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
                  }}>
                  <span className="sr-only">Editar Source {side}</span>
                </button>
              ));
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
            // Invisible header drag surface: native dragstart remains usable
            // even when PRE/Source/Dest edit hotspots cover the block body.
            // This keeps the Studio 5000-style graphic free of grip icons.
            const structuredDragHandle = (
              item: typeof contacts[number], x: number, centerY: number,
            ) => (
              <button key={"grip-" + item.id} type="button" draggable
                aria-label={"Arrastrar instrucción " + item.kind + " a otra posición o rung"}
                title={"Mover " + item.kind + " (conserva los operandos)"}
                onDragStart={(event) => beginMove(event, item.id, item.kind)}
                onDragEnd={() => { setMoving(null); setDropPreview(null); }}
                onClick={() => {
                  setSelected(item.id);
                  setSelectedOrBranch(null);
                  setSelectedRungId(null);
                  setBitMenu(null);
                }}
                data-ladder-drag-surface
                className="absolute z-40 cursor-grab rounded border-0 bg-transparent p-0 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-sky-600"
                style={{
                  left: x + (isOutputKind(item.kind) ? -116 : -38),
                  top: centerY - 26,
                  width: isOutputKind(item.kind) ? 60 : 36,
                  height: 18,
                }}>
                <span className="sr-only">Arrastrar {item.kind}</span>
              </button>
            );
            // The SVG keeps rendering the label; this invisible HTML hotspot
            // captures native dragstart reliably on top of the tag text only.
            const tagDragButton = (item: typeof contacts[number], x: number, centerY: number) => (
              <button key={"tag-" + item.id} type="button" draggable={Boolean(item.tag)}
                data-practice-tag-label
                title={item.tag
                  ? "Clic: editar texto · Doble clic: explorar variables · Arrastrar: copiar " + item.tag
                  : "Sin tag · Clic para asignar variable · Doble clic para explorar variables"}
                aria-label={(item.tag ? "Editar variable de " : "Seleccionar variable de ") +
                  item.kind + " " + (item.tag || "sin asignar")}
                onClick={(event) => {
                  if (event.detail <= 1) openTagSelector(event, item.id,
                    item.tag ? "edit" : "suggestions");
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
                className={"group/practice-rung relative border-b border-slate-100 bg-white " +
                  (draggingRungId === rung.id ? "opacity-60" : "")}
                style={{ width: Math.max(canvasWidth, width) }}
                aria-label={"Rung " + rungIndex}
                onDragOver={(event) => dragOverWholeRung(event, rung.id)}
                onDrop={(event) => dropWholeRung(event, rung.id)}
                onDragLeave={(event) => {
                  if (event.dataTransfer.types.includes(LADDER_RUNG_MIME) &&
                      !event.currentTarget.contains(event.relatedTarget as Node)) {
                    setRungDropTarget((previous) =>
                      previous?.rungId === rung.id ? null : previous);
                  }
                }}
              >
                {(rung.comment?.trim()||editingRungCommentId===rung.id)?
                  <div className="ml-[50px] flex min-h-[24px] items-start gap-2 border-b border-slate-100 bg-[#f8fafc] px-2 py-1">
                    {editingRungCommentId===rung.id?
                      <textarea autoFocus rows={2} maxLength={240}
                        aria-label={"Comentario del rung "+rungIndex}
                        value={rung.comment??""}
                        onChange={e=>onChange(setRungComment(project,rung.id,e.target.value))}
                        onKeyDown={e=>{
                          e.stopPropagation();
                          if(e.key==="Escape"){
                            e.preventDefault();setEditingRungCommentId(null);
                          }
                        }}
                        onBlur={()=>setEditingRungCommentId(null)}
                        placeholder="Escribe el comentario de este rung..."
                        className="min-h-[40px] w-full max-w-2xl resize-y rounded border border-sky-400 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 outline-none focus:ring-1 focus:ring-sky-500"/>:
                      <button type="button"
                        title="Editar comentario del rung"
                        aria-label={"Editar comentario del rung "+rungIndex}
                        onClick={()=>setEditingRungCommentId(rung.id)}
                        className="min-w-0 whitespace-pre-wrap break-words text-left font-mono text-[11px] font-medium leading-snug text-sky-900 hover:text-sky-700">
                        {rung.comment}
                      </button>}
                  </div>:
                  <button type="button"
                    title="Añadir comentario al rung"
                    aria-label={"Añadir comentario al rung "+rungIndex}
                    onClick={()=>setEditingRungCommentId(rung.id)}
                    className="absolute right-14 top-1 z-30 rounded border border-sky-300 bg-white/95 px-1.5 py-0.5 text-[10px] text-sky-700 opacity-0 shadow-sm hover:bg-sky-50 focus:opacity-100 group-hover/practice-rung:opacity-100">
                    + Comentario
                  </button>}
                {rungDropTarget?.rungId === rung.id && draggingRungId !== rung.id && (
                  <div aria-hidden="true" className={
                    "pointer-events-none absolute inset-x-0 z-40 border-t-[3px] border-sky-500 " +
                    (rungDropTarget.placement === "before" ? "top-0" : "bottom-0")
                  }>
                    <span className="absolute left-[54px] -top-[13px] rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                      {rungDropTarget.placement === "before" ? "Antes" : "Después"} del rung {rungIndex}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  draggable={project.rungs.length > 1}
                  aria-label={"Seleccionar o arrastrar rung " + rungIndex}
                  aria-pressed={selectedRungId === rung.id}
                  title="Clic: seleccionar · Arrastrar número: mover rung completo · Alt+↑/↓: subir/bajar"
                  onDragStart={(event) => beginRungMove(event, rung.id)}
                  onDragEnd={finishRungMove}
                  onKeyDown={(event) => {
                    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const nextIndex = rungIndex + (event.key === "ArrowUp" ? -1 : 1);
                    const targetRung = project.rungs[nextIndex];
                    if (!targetRung) return;
                    if (update(() => moveRung(project, rung.id, targetRung.id,
                      event.key === "ArrowUp" ? "before" : "after"))) {
                      setSelected(null);
                      setSelectedOrBranch(null);
                      setSelectedRungId(rung.id);
                    }
                  }}
                  onClick={() => {
                    setSelected(null);
                    setSelectedOrBranch(null);
                    setSelectedRungId((current) => current === rung.id ? null : rung.id);
                    editorRef.current?.focus({ preventScroll: true });
                  }}
                  className={
                    "absolute inset-y-0 left-0 z-20 flex w-[49px] cursor-grab select-none items-center justify-center border-r border-slate-200 font-mono text-xs active:cursor-grabbing " +
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
                        const to = lastRow && (outputs.length || emptyOutputBranches.length)
                          ? coilX - (hasTimerOutputs ? 142 : 75) : width - 30;
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
                                    x2={group.mainCenters[0] -
                                      (mainItems[0]?.kind === OR_JUNCTION_KIND ? 0 :
                                        isCompareKind(mainItems[0]?.kind) ? 41 : 22)}
                                    y2={row.mainY} live={inputPower} />
                                  {mainItems.map((contact, mainIndex) => {
                                    const center = group.mainCenters[mainIndex];
                                    const following = mainIndex + 1 < mainItems.length
                                      ? group.mainCenters[mainIndex + 1] -
                                        (isCompareKind(mainItems[mainIndex + 1].kind) ? 41 : 22)
                                      : group.right;
                                    const power = running &&
                                      Boolean(runtimeView?.instructionFlow[contact.id]?.powerOut);
                                    return (
                                      <g key={contact.id}>
                                        {drawContact(contact, center, row.mainY)}
                                        <Wire x1={center +
                                            (contact.kind === OR_JUNCTION_KIND ? 0 :
                                              isCompareKind(contact.kind) ? 41 : 22)}
                                          y1={row.mainY} x2={following} y2={row.mainY} live={power} />
                                        <line x1={center +
                                            (contact.kind === OR_JUNCTION_KIND ? 0 :
                                              isCompareKind(contact.kind) ? 41 : 22)}
                                          y1={row.mainY}
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
                                                    ? group.left : lane.centers[partIndex - 1] +
                                                    (isCompareKind(branch.instructions[partIndex - 1].kind) ? 41 : 22);
                                                  return (
                                                    <g key={part.id}>
                                                      <Wire x1={previous} y1={laneY}
                                                        x2={center - (isCompareKind(part.kind) ? 41 : 22)} y2={laneY}
                                                        live={running &&
                                                          Boolean(runtimeView?.instructionFlow[part.id]?.powerIn)} />
                                                      {drawContact(part, center, laneY)}
                                                    </g>
                                                  );
                                                })}
                                                <Wire x1={lane.centers.at(-1)! +
                                                  (isCompareKind(branch.instructions.at(-1)!.kind) ? 41 : 22)} y1={laneY}
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
                            {lastRow && (outputs.length > 0 || emptyOutputBranches.length > 0) && (
                              <g>
                                {/* Both sides of the OTE bank share the same input
                                    power: every output is a PARALLEL end branch. */}
                                {outputs.length + emptyOutputBranches.length > 1 && (
                                  <Wire x1={coilX - (hasTimerOutputs ? 142 : 75)} y1={coilY}
                                    x2={coilX - (hasTimerOutputs ? 142 : 75)}
                                    y2={emptyOutputYs.at(-1) ?? outputYs.at(-1)!}
                                    live={rungLive} />
                                )}
                                {emptyOutputBranches.map((branchId, index) => {
                                  const laneY = emptyOutputYs[index];
                                  const selectedLane = selectedOrBranch?.rungId === rung.id &&
                                    selectedOrBranch.branchId === branchId;
                                  return (
                                    <g key={branchId}>
                                      {selectedLane && <rect x={coilX - 83} y={laneY - 28}
                                        width="125" height="53" rx="4" fill="#dbeafe" fillOpacity="0.6"
                                        stroke="#0284c7" strokeWidth="1.5" strokeDasharray="4 3"
                                        pointerEvents="none" />}
                                      <Wire x1={coilX - (hasTimerOutputs ? 142 : 75)} y1={laneY}
                                        x2={coilX - 29} y2={laneY} />
                                      <Wire x1={coilX + 29} y1={laneY}
                                        x2={width - 30} y2={laneY} />
                                      <rect x={coilX - 29} y={laneY - 12}
                                        width="58" height="24" rx="3" fill="#ffffff"
                                        stroke="#94a3b8" strokeWidth="1.3" strokeDasharray="4 3"
                                        pointerEvents="none" />
                                      <text x={coilX} y={laneY - 17} textAnchor="middle"
                                        fontSize="10" fill="#64748b">Rama OR vacía</text>
                                      <text x={coilX} y={laneY + 4} textAnchor="middle"
                                        fontSize="11" fill="#64748b">Vacía</text>
                                    </g>
                                  );
                                })}
                                {outputs.map((output, index) => {
                                  const coilRowY = outputYs[index];
                                  const assignedTag = project.tags.find((tag) => tag.name === output.tag);
                                  return (
                                    <g key={output.id}>
                                      {output.kind === "GEAR_SEQ" ? (
                                        <>
                                          <Wire x1={coilX - 142} y1={coilRowY}
                                            x2={coilX - 122} y2={coilRowY} live={rungLive}/>
                                          <rect x={coilX - 122} y={coilRowY - 39} width="180"
                                            height="79" rx="5" fill="#eff6ff"
                                            stroke={selected===output.id?"#0284c7":"#36536b"}
                                            strokeWidth={selected===output.id?2:1.5}/>
                                          <text x={coilX - 115} y={coilRowY - 23} fontSize="10"
                                            fontWeight="700" fill="#0f3654">
                                            FB_GearSpray_Sequence
                                          </text>
                                          <text x={coilX - 115} y={coilRowY - 8} fontSize="9"
                                            fill="#334155">i_Run · ST_Run_Rly</text>
                                          <text x={coilX - 115} y={coilRowY + 6} fontSize="9"
                                            fill="#334155">o_CycleRun · {output.tag}</text>
                                          <text x={coilX - 115} y={coilRowY + 21} fontSize="9"
                                            fontWeight="700" fill="#0f3654">
                                            Estado: {String(project.tags.find(t=>t.name==="SM_Cycle_State")?.value??0)}
                                          </text>
                                          <text x={coilX + 51} y={coilRowY + 21}
                                            textAnchor="end" fontSize="8" fill="#334155">
                                            {project.tags.find(t=>t.name==="SM_Cycle_Blocked")?.value===true?
                                              "BLOQUEO":"OPERATIVO"}
                                          </text>
                                          <Wire x1={coilX + 58} y1={coilRowY}
                                            x2={width - 30} y2={coilRowY} live={rungLive}/>
                                        </>
                                      ) : isMathKind(output.kind) ? (
                                        <>
                                          <Wire x1={coilX - 142} y1={coilRowY}
                                            x2={coilX - 120} y2={coilRowY} live={rungLive}/>
                                          <MathOutputBlock x={coilX - 52} y={coilRowY}
                                            kind={output.kind}
                                            sourceA={numericOperandLabel(output.compareA)}
                                            sourceB={numericOperandLabel(output.compareB)}
                                            destination={output.tag || "??"}
                                            selected={selected === output.id}
                                            online={running}
                                            valid={runtimeView?.instructionFlow[output.id]?.condition ?? false}
                                            live={runtimeView?.instructionFlow[output.id]?.powerOut ?? false}/>
                                          <Wire x1={coilX + 16} y1={coilRowY}
                                            x2={width - 30} y2={coilRowY} live={rungLive}/>
                                        </>
                                      ) : output.kind === "RES" ? (
                                        <>
                                          <Wire x1={coilX - (hasTimerOutputs ? 142 : 75)} y1={coilRowY}
                                            x2={coilX - 24} y2={coilRowY} live={rungLive}/>
                                          <ResetCoil x={coilX} y={coilRowY} tag={output.tag || "??"}
                                            comment={assignedTag?.description} labelWidth={96}
                                            selected={selected === output.id} online={running}
                                            live={runtimeView?.instructionFlow[output.id]?.powerOut ?? false}/>
                                          <Wire x1={coilX + 24} y1={coilRowY}
                                            x2={width - 30} y2={coilRowY} live={rungLive}/>
                                        </>
                                      ) : isCounterKind(output.kind) ? (
                                        <>
                                          <Wire x1={coilX - 142} y1={coilRowY}
                                            x2={coilX - 120} y2={coilRowY} live={rungLive}/>
                                          <CounterBlock x={coilX - 52} y={coilRowY}
                                            kind={output.kind as "CTU" | "CTD"}
                                            tag={output.tag || "??"}
                                            presetLabel={output.preset?.mode === "literal"
                                              ? String(output.preset.value)
                                              : output.preset?.mode === "tag" ? output.preset.tag : undefined}
                                            preset={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object"
                                                ? Number(assignedTag.value.PRE) : 0}
                                            accumulated={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object"
                                                ? Number(assignedTag.value.ACC) : 0}
                                            cu={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object" && assignedTag.value.CU === true}
                                            cd={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object" && assignedTag.value.CD === true}
                                            dn={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object" && assignedTag.value.DN === true}
                                            ov={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object" && assignedTag.value.OV === true}
                                            un={assignedTag?.type === "COUNTER" &&
                                              typeof assignedTag.value === "object" && assignedTag.value.UN === true}
                                            selected={selected === output.id}
                                            online={running} live={rungLive}/>
                                          {(output.doneTag||output.resetTag)&&
                                            <text x={coilX - 112} y={coilRowY + 54} fontSize="9"
                                              fontFamily="monospace" fill="#0f3654">
                                              {output.doneTag?"Q → "+output.doneTag:""}
                                              {output.resetTag?"  RESET ← "+output.resetTag:""}
                                            </text>}
                                          <Wire x1={coilX + 16} y1={coilRowY}
                                            x2={width - 30} y2={coilRowY} live={rungLive}/>
                                        </>
                                      ) : isTimerKind(output.kind) ? (
                                        <>
                                          <Wire x1={coilX - 142} y1={coilRowY}
                                            x2={coilX - 120} y2={coilRowY} live={rungLive}/>
                                          <TimerBlock x={coilX - 52} y={coilRowY}
                                            kind={output.kind} tag={output.tag || "??"}
                                            presetLabel={output.preset?.mode === "literal"
                                              ? String(output.preset.value)
                                              : output.preset?.mode === "tag" ? output.preset.tag : undefined}
                                            preset={assignedTag?.type === "TIMER" &&
                                              typeof assignedTag.value === "object"
                                                ? Number(assignedTag.value.PRE) : 0}
                                            accumulated={assignedTag?.type === "TIMER" &&
                                              typeof assignedTag.value === "object"
                                                ? Number(assignedTag.value.ACC) : 0}
                                            en={assignedTag?.type === "TIMER" &&
                                              typeof assignedTag.value === "object" &&
                                              assignedTag.value.EN === true}
                                            tt={assignedTag?.type === "TIMER" &&
                                              typeof assignedTag.value === "object" &&
                                              assignedTag.value.TT === true}
                                            dn={assignedTag?.type === "TIMER" &&
                                              typeof assignedTag.value === "object" &&
                                              assignedTag.value.DN === true}
                                            selected={selected === output.id}
                                            online={running} live={rungLive}/>
                                          {(output.doneTag||output.resetTag)&&
                                            <text x={coilX - 112} y={coilRowY + 54} fontSize="9"
                                              fontFamily="monospace" fill="#0f3654">
                                              {output.doneTag?"Q → "+output.doneTag:""}
                                              {output.resetTag?"  RESET ← "+output.resetTag:""}
                                            </text>}
                                          <Wire x1={coilX + 16} y1={coilRowY}
                                            x2={width - 30} y2={coilRowY} live={rungLive}/>
                                        </>
                                      ) : (
                                        <>
                                          <Wire x1={coilX - (hasTimerOutputs ? 142 : 75)} y1={coilRowY}
                                            x2={coilX - 24} y2={coilRowY} live={rungLive} />
                                          <Coil x={coilX} y={coilRowY} kind={output.kind as "OTE" | "OTL" | "OTU"} tag={output.tag || "??"}
                                            comment={assignedTag?.description}
                                            storedValue={assignedTag?.type === "BOOL" && assignedTag.value === true}
                                            labelWidth={96} selected={selected === output.id}
                                            online={running} live={rungLive} />
                                          <Wire x1={coilX + 24} y1={coilRowY}
                                            x2={width - 30} y2={coilRowY} live={rungLive} />
                                        </>
                                      )}
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
                          {isOutputKind(dropPreview.kind) && outputs.length > 0 &&
                            !dropPreview.branchId ? (
                              // Mark a pending additional output without drawing below
                              // the current rung or changing its height.
                              <g>
                                <circle cx={width - 50} cy={outputYs.at(-1) ?? coilY}
                                  r="11" fill="#dbeafe" stroke="#2563eb"
                                  strokeWidth="1.5" strokeDasharray="3 2"/>
                                <path d={"M" + (width - 56) + " " + (outputYs.at(-1) ?? coilY) +
                                  "h12 M" + (width - 50) + " " +
                                  ((outputYs.at(-1) ?? coilY) - 6) + "v12"}
                                  stroke="#2563eb" strokeWidth="2"/>
                                <title>Añadir salida paralela al soltar</title>
                              </g>
                            ) : (
                              <g>
                                <rect x={dropPreview.x - (isOutputKind(dropPreview.kind) ? 42 : 32)}
                                  y={dropPreview.y - 27}
                                  width={isOutputKind(dropPreview.kind) ? 84 : 64}
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
                          ...(contact.kind === OR_JUNCTION_KIND ? [] :
                            [dragButton(contact, group.mainCenters[index], group.mainY)]),
                          ...(isCompareKind(contact.kind)
                            ? [structuredDragHandle(contact, group.mainCenters[index], group.mainY)]
                            : []),
                          ...(contact.kind === OR_JUNCTION_KIND
                            ? [<button key={"or-node-" + contact.id} type="button"
                                aria-label="Seleccionar unión OR e insertar en la trayectoria superior"
                                title="Clic + instrucción: insertar en trayectoria superior del OR"
                                className="absolute z-30 cursor-pointer rounded border border-transparent hover:border-sky-500 focus-visible:outline-2 focus-visible:outline-sky-500"
                                style={{ left: group.mainCenters[index] - 20,
                                  top: group.mainY - 20, width: 40, height: 40 }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelected(contact.id);
                                  setSelectedOrBranch(null);
                                  setSelectedRungId(null);
                                }}/>]
                            : isCompareKind(contact.kind)
                              ? compareHotspots(contact, group.mainCenters[index], group.mainY)
                              : [tagDragButton(contact, group.mainCenters[index], group.mainY)]),
                        ]),
                        ...branches.flatMap((branch, laneIndex) => {
                          const lane = group.branchLanes[laneIndex];
                          return branch.instructions.flatMap((part, partIndex) => [
                            dragButton(part, lane.centers[partIndex], lane.y),
                            ...(isCompareKind(part.kind)
                              ? [structuredDragHandle(part, lane.centers[partIndex], lane.y)]
                              : []),
                            ...(isCompareKind(part.kind)
                              ? compareHotspots(part, lane.centers[partIndex], lane.y)
                              : [tagDragButton(part, lane.centers[partIndex], lane.y)]),
                          ]);
                        }),
                      ];
                    })}
                    {outputs.flatMap((output, index) => [
                      dragButton(output, coilX, outputYs[index]),
                      ...(((isTimerKind(output.kind) && output.kind !== "RES") ||
                        isCounterKind(output.kind) || isMathKind(output.kind))
                        ? [structuredDragHandle(output, coilX, outputYs[index])] : []),
                      ...(!isMathKind(output.kind) ? [tagDragButton(output, coilX, outputYs[index])] :
                        (["A", ...(output.kind === "MOV" ? [] : ["B"]), "Dest"] as Array<"A" | "B" | "Dest">)
                        .map((side) => {
                          const centerY = outputYs[index];
                          const offsetY = side === "A" ? -8 : side === "B" ? 8 :
                            output.kind === "MOV" ? 19 : 35;
                          return <button key={"math-" + output.id + "-" + side} type="button"
                            aria-label={"Editar " + (side === "Dest" ? "Dest" : "Source " + side) +
                              " de " + output.kind}
                            title={side === "Dest" ? "Dest: INT, DINT o REAL, independientemente de Source A y B" :
                              "Source: número o variable INT, DINT o REAL"}
                            className="absolute z-30 cursor-text rounded border border-transparent bg-transparent hover:border-sky-500 hover:bg-sky-100/25 focus-visible:outline-2 focus-visible:outline-sky-500"
                            style={{ left: coilX - 112, top: centerY + offsetY,
                              width: 125, height: 16 }}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(output.id);
                              setSelectedOrBranch(null);
                              setSelectedRungId(null);
                              setEditingPresetId(null);
                              if (side === "Dest") {
                                setEditingCompare(null);
                                openTagSelector(event, output.id, "suggestions");
                              } else {
                                setTagSelector(null);
                                const rect = event.currentTarget.getBoundingClientRect();
                                setEditingCompare({ id: output.id, side,
                                  anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
                              }
                            }}>
                            <span className="sr-only">{side === "Dest" ? "Seleccionar Dest" : "Editar Source " + side}</span>
                          </button>;
                        })),
                    ])}
                    {outputs.filter((item) => ["TON", "TOF", "RTO", "CTU", "CTD"].includes(item.kind))
                      .map((item) => {
                        const index = outputs.findIndex((output) => output.id === item.id);
                        return (
                          <button key={"pre-" + item.id} type="button"
                            aria-label={"Editar PRE de " + item.kind + " " + (item.tag || "sin asignar")}
                            title="Clic para escribir PRE o seleccionar una variable INT o DINT"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(item.id);
                              const rect = event.currentTarget.getBoundingClientRect();
                              setEditingPresetAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom });
                              setEditingPresetId(item.id);
                              setTagSelector(null);
                            }}
                            className="absolute z-30 cursor-text rounded border border-transparent bg-transparent hover:border-sky-500 hover:bg-sky-100/25 focus-visible:outline-2 focus-visible:outline-sky-500"
                            style={{ left: coilX - 110, top: outputYs[index] - 8,
                              width: 122, height: 19 }}>
                            <span className="sr-only">Editar PRE</span>
                          </button>
                        );
                      })}
                    {emptyOutputBranches.map((branchId, index) => (
                      <button key={branchId} type="button"
                        aria-label={"Seleccionar rama de salida OR vacía " + (index + 1)}
                        title="Rama de salida vacía. Selecciona y pulsa OTE o arrastra una bobina; Supr elimina la rama."
                        className={"absolute z-10 rounded border focus-visible:outline-2 focus-visible:outline-sky-500 " +
                          (selectedOrBranch?.branchId === branchId
                            ? "border-sky-500 bg-sky-100/20" : "border-transparent hover:border-sky-400")}
                        style={{ left: coilX - 39, top: emptyOutputYs[index] - 18,
                          width: 78, height: 38 }}
                        onClick={() => {
                          setSelected(null);
                          setSelectedRungId(null);
                          setSelectedOrBranch({ rungId: rung.id, branchId });
                          editorRef.current?.focus({ preventScroll: true });
                        }}
                      >
                        <span className="sr-only">Seleccionar rama OR de salida vacía</span>
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}

          {/* Final program delimiter, like Studio 5000. No instructional text
              occupies the bottom of the Ladder workspace. */}
          <div role="group" aria-label="Fin de la rutina Ladder"
            className="relative bg-white" style={{ width: canvasWidth, height: 90 }}>
            <svg width={canvasWidth} height={90} viewBox={"0 0 " + canvasWidth + " 90"}
              aria-hidden="true" className="block">
              <path d={"M63 0 V74 M" + (canvasWidth - 30) + " 0 V74" +
                " M63 53 H" + (canvasWidth - 30)}
                fill="none" stroke="#64748b" strokeWidth="1.25" />
              <text x={9} y={49} fontSize={11} fontFamily="Arial, sans-serif"
                fill="#94a3b8">(End)</text>
            </svg>
          </div>

          {tagSelector && (
            <PracticeTagSelector
              key={tagSelector.instructionId + "-" + tagSelector.mode}
              tags={project.tags}
              selector={tagSelector}
              onSelect={assignSelectedTag}
              onEdit={editSelectedTag}
              onBrowse={() => setTagSelector((current) =>
                current ? { ...current, mode: "dialog" } : null)}
              onClose={() => setTagSelector(null)}
            />
          )}
          {error && (
            <p role="alert" className="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      {editingCompare && (() => {
        const found = findInstruction(project, editingCompare.id);
        if (!found || (!isCompareKind(found.instruction.kind) && !isMathKind(found.instruction.kind))) return null;
        return <CompareOperandEditor
          key={editingCompare.id + "-" + editingCompare.side}
          kind={found.instruction.kind} side={editingCompare.side}
          operand={editingCompare.side === "A" ? found.instruction.compareA : found.instruction.compareB}
          tags={project.tags} anchor={editingCompare.anchor}
          onSave={(operand) => {
            if (update(() => isMathKind(found.instruction.kind)
              ? setMathSource(project, editingCompare.id, editingCompare.side, operand as NumericOperand)
              : setComparisonOperand(project, editingCompare.id, editingCompare.side, operand))) {
              setEditingCompare(null);
            }
          }}
          onClose={() => setEditingCompare(null)}
        />;
      })()}
      {editingPreset && editingPresetId && editingPresetAnchor &&
        ["TON", "TOF", "RTO", "CTU", "CTD"].includes(editingPreset.kind) && (
          <TimerPresetEditor key={editingPresetId}
            instruction={editingPreset}
            anchor={editingPresetAnchor}
            tags={project.tags}
            onSave={(preset) => {
              if (update(() => setInstructionPreset(project, editingPresetId, preset))) {
                setEditingPresetId(null);
              }
            }}
            onClose={() => setEditingPresetId(null)}
          />
        )}
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
          <button type="button" role="menuitem"
            onClick={() => {
              onCrossReference(currentBitMenuTarget.tagName);
              setBitMenu(null);
            }}
            className="w-full rounded border-t border-slate-200 px-2 py-2 text-left text-xs font-medium hover:bg-sky-50">
            Cross Reference
          </button>
          {currentBitMenuTarget.reason && (
            <p className="border-t border-slate-200 px-2 py-2 text-[11px] text-amber-800">
              {currentBitMenuTarget.reason}
            </p>
          )}
        </div>, document.body,
      )}
      {onlineMonitorOpen && (
        <section aria-label="Monitor Online" className="flex shrink-0 flex-col gap-2 border-t-2 border-slate-300 bg-[#f4f7fa] px-3 py-2 text-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <Eye size={14} className="text-sky-700" />
              <strong>Monitor Online</strong>
              {onlineReadout && <span className="truncate font-medium text-slate-700">
                {onlineReadout.label} · {onlineReadout.location}
              </span>}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={scanMode === "running" ? "text-emerald-700" :
                scanMode === "paused" ? "text-amber-700" : "text-slate-500"}>
                {scanMode === "running" ? "RUN" : scanMode === "paused" ? "PAUSE" : "STOP"}
              </span>
              <button type="button" onClick={() => setOnlineMonitorOpen(false)}
                aria-label="Cerrar Monitor Online" title="Cerrar Monitor Online"
                className="rounded p-0.5 text-slate-500 hover:bg-slate-200">
                <ChevronDown size={15} />
              </button>
            </div>
          </div>
          {onlineReadout ? (
            <>
              {onlineReadout.fields.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                  {onlineReadout.fields.map((field) => (
                    <div key={field.label} className="min-w-0 text-[11px]">
                      <div className="text-slate-500">{field.label}</div>
                      <div className={"truncate font-mono font-medium " +
                        (field.changed ? "text-amber-700" : "text-slate-800")}>
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-600">
                {onlineReadout.explanation}
                {onlineReadout.pendingInputs > 0 && (
                  <span className="ml-2 font-semibold text-amber-700">
                    {onlineReadout.pendingInputs} entrada(s) pendiente(s) de scan
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-600">
              Selecciona un contacto, bobina, rama OR o número de rung para ver su estado en el último scan.
            </p>
          )}
        </section>
      )}
      {buildOutputOpen && buildRecord && (
        <section aria-label="Resultados de Build" className="flex max-h-[224px] min-h-[110px] shrink-0 flex-col border-t-2 border-[#8294a8] bg-[#f4f7fa] text-slate-800">
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-1.5 text-xs">
            <Hammer size={14} />
            <strong>Build Output</strong>
            <span className="font-mono text-[11px] text-slate-500">MainRoutine.LAD</span>
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
