import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowDown, ArrowUp, FileCode2, GitBranch, GripVertical, Plus, Tag, Trash2 } from "lucide-react";
import { Coil, Contact, Wire, type Instruction } from "./LadderSymbols";
import {
  findVisualLadderDropTarget,
  isEditableKind,
  LADDER_DRAG_MIME,
  LADDER_MOVE_MIME,
  PRACTICE_BRANCH_Y,
  PRACTICE_MAIN_Y,
  type VisualLadderDropTarget,
} from "../../plc/ladderDragDrop";
import {
  addParallelContact,
  changeInstructionTag,
  createRung,
  createTag,
  findInstruction,
  insertInstruction,
  moveInstruction,
  moveToParallel,
  removeInstruction,
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
  const [error, setError] = useState("");
  const [dropPreview, setDropPreview] = useState<(VisualLadderDropTarget & { rungId: string }) | null>(null);
  const [moving, setMoving] = useState<InternalDrag | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(760);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    const updateSize = () => setViewportWidth(root.clientWidth);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!draggingKind && !moving) setDropPreview(null);
  }, [draggingKind, moving]);

  const update = (operation: () => PracticeProject): boolean => {
    try {
      const next = operation();
      onChange(next);
      setError("");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la acción.");
      return false;
    }
  };

  const addRung = () => update(() => createRung(project, nextId("rung")));

  const initialTag = (kind: EditableKind) => kind === "OTE"
    ? (project.tags.find((item) => item.name === "Motor_Run")?.name ?? project.tags[0]?.name)
    : project.tags[0]?.name;

  const insertAt = (rungId: string, position: number, kind: EditableKind, anchorId?: string) => {
    const tag = initialTag(kind);
    if (!tag) return;
    const id = nextId("instruction");
    const instruction = { id, kind, tag };
    const done = update(() => anchorId
      ? addParallelContact(project, rungId, anchorId, instruction)
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

  // Browser client coordinates are converted to the unscaled SVG coordinate space.
  // Both palette drops and moves use this one snapping algorithm.
  const getTarget = (
    event: DragEvent<HTMLDivElement>,
    rungId: string,
    width: number,
  ): VisualLadderDropTarget | null => {
    const kind = moving?.kind ?? draggingKind;
    if (!kind) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * width / bounds.width;
    const y = (event.clientY - bounds.top);
    return findVisualLadderDropTarget(project, rungId, kind, x, y, width, moving?.id);
  };

  const onDragOverRung = (event: DragEvent<HTMLDivElement>, rungId: string, width: number) => {
    const validPayload = event.dataTransfer.types.includes(LADDER_MOVE_MIME)
      || event.dataTransfer.types.includes(LADDER_DRAG_MIME);
    if (!validPayload) return;
    event.preventDefault();
    const target = getTarget(event, rungId, width);
    event.dataTransfer.dropEffect = target ? (moving ? "move" : "copy") : "none";
    setDropPreview((previous) => {
      if (!target) return null;
      if (previous && previous.rungId === rungId && previous.lane === target.lane &&
          previous.position === target.position && previous.anchorId === target.anchorId &&
          previous.x === target.x && previous.kind === target.kind) return previous;
      return { ...target, rungId };
    });
  };

  const onDropRung = (event: DragEvent<HTMLDivElement>, rungId: string, width: number) => {
    const isMove = event.dataTransfer.types.includes(LADDER_MOVE_MIME);
    const isPalette = event.dataTransfer.types.includes(LADDER_DRAG_MIME);
    if (!isMove && !isPalette) return;
    event.preventDefault();
    event.stopPropagation();
    const target = getTarget(event, rungId, width);
    const sourceId = event.dataTransfer.getData(LADDER_MOVE_MIME);
    const paletteKind = event.dataTransfer.getData(LADDER_DRAG_MIME);
    setDropPreview(null);
    if (!target) return;
    if (isMove && sourceId && findInstruction(project, sourceId)) {
      const done = update(() => target.lane === "parallel" && target.anchorId
        ? moveToParallel(project, sourceId, rungId, target.anchorId)
        : moveInstruction(project, sourceId, rungId, target.position));
      if (done) setSelected(sourceId);
    } else if (isPalette && isEditableKind(paletteKind)) {
      insertAt(rungId, target.position, paletteKind,
        target.lane === "parallel" ? target.anchorId : undefined);
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

  const selectedLocation = selected ? findInstruction(project, selected) : null;
  const selectedInstruction = selectedLocation?.instruction;
  const selectedHasBranch = selectedLocation?.lane === "main" && project.rungs.some((rung) =>
    (rung.parallelBranches ?? []).some((branch) => branch.anchorId === selected));

  const moveByButton = (rungId: string, position: number) => {
    if (!selected) return;
    update(() => moveInstruction(project, selected, rungId, position));
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-white text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f4f6f8] px-4 py-2">
        <div>
          <h2 className="text-xs font-semibold">PracticeRoutine.LAD</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Arrastra instrucciones de la paleta o mueve una instrucción existente entre rungs. Suelta un contacto debajo de otro para crear OR.
          </p>
        </div>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
          EDICIÓN · SIN EJECUCIÓN
        </span>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs">
        <button type="button" onClick={addRung}
          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 font-medium hover:bg-slate-100">
          <Plus size={14} /> Añadir rung
        </button>
        <span className="text-slate-500">
          Herramienta: <strong className="text-sky-800">{selectedTool}</strong>
          {EDITABLE.has(selectedTool) ? " · Clic en + o arrastrar" : " · Solo demo visual"}
        </span>
        <span className="ml-auto text-slate-500">{project.rungs.length} rungs · {project.tags.length} tags</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" ref={viewportRef}>
        <div className="px-3 py-3">
          {project.rungs.length === 0 && (
            <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No hay rungs. Pulsa «Añadir rung» para comenzar.
            </p>
          )}
          {project.rungs.map((rung, rungIndex) => {
            const contacts = rung.instructions.filter((item) => item.kind !== "OTE");
            const output = rung.instructions.find((item) => item.kind === "OTE");
            const width = Math.max(760, viewportWidth - 28, 475 + contacts.length * 145);
            const y = PRACTICE_MAIN_Y;
            const branchY = PRACTICE_BRANCH_Y;
            const contactX = (index: number) => 175 + index * 145;
            const coilX = width - 115;
            const showLowerLane = Boolean(rung.parallelBranches?.length || draggingKind || moving);
            const svgHeight = showLowerLane ? 226 : 138;
            const wireSegments: Array<[number, number]> = [];
            let cursor = 64;
            contacts.forEach((_, index) => {
              const x = contactX(index);
              wireSegments.push([cursor, x - 22]);
              cursor = x + 22;
            });
            wireSegments.push([cursor, output ? coilX - 24 : width - 31]);

            const buttonAt = (id: string, kind: EditableKind, x: number, centerY: number) => (
              <button
                key={"drag-" + id}
                type="button"
                draggable
                aria-label={"Seleccionar o arrastrar " + kind + " a otro punto o rung"}
                title="Clic para editar · Arrastra para mover"
                onClick={() => setSelected(id)}
                onDragStart={(event) => beginMove(event, id, kind)}
                onDragEnd={() => { setMoving(null); setDropPreview(null); }}
                className="absolute z-10 cursor-grab rounded border border-transparent bg-transparent hover:border-sky-300 hover:bg-sky-100/20 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-sky-500"
                style={{ left: x - 48, top: centerY - 62, width: 96, height: 89 }}
              >
                <span className="sr-only">Mover {kind}</span>
              </button>
            );

            return (
              <article key={rung.id} className="mb-2 overflow-hidden rounded border border-slate-200 bg-white">
                <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-[#f6f8fa] px-3">
                  <span className="font-mono text-xs font-semibold text-slate-600">Rung {rungIndex}</span>
                  <button type="button" onClick={() => {
                    update(() => removeRung(project, rung.id));
                    setSelected(null);
                  }} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-700">
                    <Trash2 size={12} /> Eliminar rung
                  </button>
                </div>

                <div className="overflow-x-auto">
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
                      <path d={"M63 15V" + (svgHeight - 15) + " M" + (width - 30) + " 15V" + (svgHeight - 15)}
                        stroke="#8898a5" strokeWidth="1.5" fill="none" />
                      {wireSegments.map(([from, to], index) => (
                        <Wire key={index} x1={from} y1={y} x2={to} y2={y} />
                      ))}
                      {output && <Wire x1={coilX + 24} y1={y} x2={width - 30} y2={y} />}

                      {contacts.map((item, index) => {
                        const x = contactX(index);
                        const branch = rung.parallelBranches?.find((entry) => entry.anchorId === item.id);
                        return (
                          <g key={item.id}>
                            {selected === item.id && (
                              <rect x={x - 51} y={y - 66} width="102" height="85" rx="4"
                                fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" />
                            )}
                            <Contact x={x} y={y} kind={item.kind as "XIC" | "XIO"} tag={item.tag}
                              comment={project.tags.find((tag) => tag.name === item.tag)?.description}
                              value={false} online={false} powerIn={false} />
                            {branch && (
                              <g>
                                <Wire x1={x - 57} y1={y} x2={x - 57} y2={branchY} />
                                <Wire x1={x - 57} y1={branchY} x2={x - 22} y2={branchY} />
                                <Wire x1={x + 22} y1={branchY} x2={x + 57} y2={branchY} />
                                <Wire x1={x + 57} y1={branchY} x2={x + 57} y2={y} />
                                {selected === branch.contact.id && (
                                  <rect x={x - 51} y={branchY - 61} width="102" height="79"
                                    fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" rx="4" />
                                )}
                                <Contact x={x} y={branchY}
                                  kind={branch.contact.kind as "XIC" | "XIO"}
                                  tag={branch.contact.tag}
                                  comment={project.tags.find((tag) => tag.name === branch.contact.tag)?.description}
                                  value={false} online={false} powerIn={false} />
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {output ? (
                        <g>
                          {selected === output.id && (
                            <rect x={coilX - 52} y={y - 64} width="104" height="83"
                              fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" rx="4" />
                          )}
                          <Coil x={coilX} y={y} tag={output.tag}
                            comment={project.tags.find((tag) => tag.name === output.tag)?.description}
                            online={false} live={false} />
                        </g>
                      ) : selectedTool === "OTE" && (
                        <g role="button" tabIndex={0} aria-label="Insertar OTE"
                          onClick={() => insertAt(rung.id, contacts.length, "OTE")}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault(); insertAt(rung.id, contacts.length, "OTE");
                          } }}>
                          <rect x={coilX - 45} y={y - 14} width="90" height="29"
                            fill="#eff6ff" stroke="#60a5fa" strokeDasharray="3 3" rx="5" />
                          <text x={coilX} y={y + 4} fontFamily="Arial" fontSize="12" textAnchor="middle" fill="#2563eb">+ OTE</text>
                        </g>
                      )}

                      {(selectedTool === "XIC" || selectedTool === "XIO") &&
                        Array.from({ length: contacts.length + 1 }, (_, position) => {
                          const x = position === 0 ? 107 : contactX(position - 1) + 69;
                          return (
                            <g key={"slot-" + position} role="button" tabIndex={0}
                              aria-label={"Insertar " + selectedTool + " en posición " + (position + 1)}
                              onClick={() => insertAt(rung.id, position, selectedTool)}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault(); insertAt(rung.id, position, selectedTool);
                              } }}>
                              <circle cx={x} cy={y} r="13" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.3" />
                              <path d={"M" + (x - 5) + " " + y + "h10 M" + x + " " + (y - 5) + "v10"}
                                stroke="#2563eb" strokeWidth="1.7" />
                            </g>
                          );
                        })}

                      {dropPreview?.rungId === rung.id && (
                        <g pointerEvents="none">
                          <rect x={dropPreview.x - (dropPreview.kind === "OTE" ? 42 : 32)}
                            y={dropPreview.y - 27}
                            width={dropPreview.kind === "OTE" ? 84 : 64} height="54" rx="5"
                            fill="#dbeafe" fillOpacity="0.88" stroke="#2563eb"
                            strokeWidth="1.4" strokeDasharray="4 3" />
                          <path d={"M" + dropPreview.x + " " + (dropPreview.y - 33) + "v66"}
                            stroke="#0284c7" strokeWidth="2" strokeDasharray="5 3" />
                          <text x={dropPreview.x} y={dropPreview.y + 5} textAnchor="middle"
                            fontSize="11" fontWeight="700" fill="#1d4ed8">{dropPreview.kind}</text>
                          {dropPreview.lane === "parallel" && (
                            <text x={dropPreview.x} y={dropPreview.y + 44} textAnchor="middle"
                              fontSize="10" fill="#2563eb">Rama OR</text>
                          )}
                        </g>
                      )}
                    </svg>

                    {/* Native HTML buttons provide reliable dragstart on desktop browsers.
                        SVG <g draggable> is inconsistent across engines. */}
                    {contacts.map((item, index) => {
                      const branch = rung.parallelBranches?.find((entry) => entry.anchorId === item.id);
                      return [
                        buttonAt(item.id, item.kind, contactX(index), y),
                        ...(branch ? [buttonAt(branch.contact.id, branch.contact.kind, contactX(index), branchY)] : []),
                      ];
                    })}
                    {output && buttonAt(output.id, output.kind, coilX, y)}
                  </div>
                </div>
              </article>
            );
          })}

          {selectedInstruction && selectedLocation && (
            <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-3 text-xs">
              <div className="mb-2 flex items-center gap-1 font-semibold text-sky-900">
                <GripVertical size={14} /> Propiedades de instrucción · {selectedInstruction.kind}
                <span className="ml-2 text-sky-600">({selectedLocation.lane === "parallel" ? "Rama OR" : "Línea principal"})</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-44 flex-col gap-1">
                  Tag asociado
                  <select value={selectedInstruction.tag}
                    onChange={(event) => update(() => changeInstructionTag(project, selectedInstruction.id, event.target.value))}
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-800">
                    {project.tags.map((tag) => <option key={tag.name} value={tag.name}>{tag.name}</option>)}
                  </select>
                </label>
                {selectedInstruction.kind !== "OTE" && selectedLocation.lane === "main" && !selectedHasBranch && (
                  <button type="button"
                    className="flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-1.5 text-sky-800 hover:bg-sky-100"
                    onClick={() => {
                      const kind = selectedTool === "XIO" ? "XIO" : "XIC";
                      insertAt(selectedLocation.rungId, selectedLocation.position, kind, selectedInstruction.id);
                    }}>
                    <GitBranch size={14} /> Añadir rama OR
                  </button>
                )}
                {selectedLocation.lane === "main" && selectedInstruction.kind !== "OTE" && (
                  <>
                    <button type="button" title="Mover contacto una posición a la izquierda"
                      className="rounded border border-slate-300 bg-white px-2 py-1.5"
                      onClick={() => moveByButton(selectedLocation.rungId, selectedLocation.position - 1)}>
                      <ArrowUp size={14} className="-rotate-90" />
                    </button>
                    <button type="button" title="Mover contacto una posición a la derecha"
                      className="rounded border border-slate-300 bg-white px-2 py-1.5"
                      onClick={() => moveByButton(selectedLocation.rungId, selectedLocation.position + 2)}>
                      <ArrowDown size={14} className="-rotate-90" />
                    </button>
                  </>
                )}
                <label className="flex min-w-36 flex-col gap-1">
                  Mover a otro rung
                  <select value={selectedLocation.rungId}
                    onChange={(event) => moveByButton(event.target.value, Number.MAX_SAFE_INTEGER)}
                    className="rounded border border-slate-300 bg-white px-2 py-1.5">
                    {project.rungs.map((r, index) =>
                      <option key={r.id} value={r.id}>Rung {index}</option>)}
                  </select>
                </label>
                <button type="button" className="rounded border border-red-200 bg-white px-2 py-1.5 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    if (update(() => removeInstruction(project, selectedInstruction.id))) setSelected(null);
                  }}>
                  Eliminar instrucción
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                También puedes arrastrar el símbolo. Una rama OR se mueve junto con su contacto principal.
                Si eliminas ese contacto, el paralelo se convierte en el contacto principal.
              </p>
            </div>
          )}

          <details className="mb-3 rounded border border-slate-200 bg-[#f8fafc] p-3">
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
              <button type="submit" className="flex items-center gap-1 rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800">
                <Plus size={13} /> Crear
              </button>
            </form>
          </details>

          {error && <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <p className="mb-5 flex items-center gap-1 text-xs text-slate-500">
            <FileCode2 size={14} /> Edición preliminar: XIC, XIO, OTE; una rama OR por contacto, sin ramas anidadas.
            MainRoutine y los bloques TON/CTU de demostración permanecen intactos. La ejecución de PracticeRoutine aún no está habilitada.
          </p>
        </div>
      </div>
    </section>
  );
}
