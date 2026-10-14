import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Plus, Trash2, FileCode2, Tag } from "lucide-react";
import { Coil, Contact, Wire, type Instruction } from "./LadderSymbols";
import { findLadderDropTarget, isEditableKind, LADDER_DRAG_MIME, type LadderDropTarget } from "../../plc/ladderDragDrop";
import {
  changeInstructionTag,
  createRung,
  createTag,
  insertInstruction,
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

export function PracticeEditor({ project, selectedTool, draggingKind, onChange, nextId }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dropPreview, setDropPreview] = useState<(LadderDropTarget & { rungId: string }) | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(760);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    const resize = () => setViewportWidth(root.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!draggingKind) setDropPreview(null);
  }, [draggingKind]);

  const update = (operation: () => PracticeProject) => {
    try {
      onChange(operation());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
    }
  };

  const addRung = () => update(() => createRung(project, nextId("rung")));

  const insertAt = (rungId: string, position: number, kind: EditableKind) => {
    const tag = kind === "OTE"
      ? (project.tags.find((item) => item.name === "Motor_Run")?.name ?? project.tags[0]?.name)
      : project.tags[0]?.name;
    if (!tag) return;
    const instructionId = nextId("instruction");
    update(() => insertInstruction(project, rungId, position, {
      id: instructionId,
      kind,
      tag,
    }));
    setSelected(instructionId);
  };

  // Translate browser coordinates to SVG space so docking/maximizing stays accurate.
  const targetForPointer = (
    event: DragEvent<SVGSVGElement>,
    rungId: string,
    width: number,
    kind: EditableKind,
  ): LadderDropTarget | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * width / bounds.width;
    const y = (event.clientY - bounds.top) * 138 / bounds.height;
    if (y < 13 || y > 130) return null;
    return findLadderDropTarget(project, rungId, kind, x, width);
  };

  const dragOverRung = (event: DragEvent<SVGSVGElement>, rungId: string, width: number) => {
    if (!event.dataTransfer.types.includes(LADDER_DRAG_MIME) || !draggingKind) return;
    event.preventDefault();
    const target = targetForPointer(event, rungId, width, draggingKind);
    event.dataTransfer.dropEffect = target ? "copy" : "none";
    setDropPreview((previous) => {
      if (!target) return null;
      if (previous?.rungId === rungId && previous.kind === target.kind &&
          previous.position === target.position && previous.x === target.x) return previous;
      return { ...target, rungId };
    });
  };

  const dropOnRung = (event: DragEvent<SVGSVGElement>, rungId: string, width: number) => {
    if (!event.dataTransfer.types.includes(LADDER_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const kind = event.dataTransfer.getData(LADDER_DRAG_MIME);
    setDropPreview(null);
    if (!isEditableKind(kind)) return;
    const target = targetForPointer(event, rungId, width, kind);
    if (target) insertAt(rungId, target.position, kind);
  };

  const addNewTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const next = createTag(project, tagName, tagDescription);
      onChange(next);
      setTagName("");
      setTagDescription("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el tag.");
    }
  };

  const selectedInstruction = project.rungs
    .flatMap((rung) => rung.instructions)
    .find((item) => item.id === selected);

  return (
    <section className="flex h-full min-h-0 flex-col bg-white text-slate-800">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f4f6f8] px-4 py-2">
        <div>
          <h2 className="text-xs font-semibold">PracticeRoutine.LAD</h2>
          <p className="mt-1 text-[11px] text-slate-500">Arrastra XIC, XIO u OTE desde la barra superior y suéltala en el rung</p>
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
          {EDITABLE.has(selectedTool) ? " · Arrastra al rung o haz clic en +" : " · Solo disponible en la demo visual"}
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
            const width = Math.max(760, viewportWidth - 28, 450 + contacts.length * 145);
            const y = 87;
            const contactX = (index: number) => 175 + index * 145;
            const coilX = width - 115;
            const wireSegments: Array<[number, number]> = [];
            let cursor = 64;
            contacts.forEach((_, index) => {
              const x = contactX(index);
              wireSegments.push([cursor, x - 22]);
              cursor = x + 22;
            });
            wireSegments.push([cursor, output ? coilX - 24 : width - 31]);

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
                  <svg width={width} height="138" viewBox={"0 0 " + width + " 138"} role="group"
                    onDragOver={(event) => dragOverRung(event, rung.id, width)}
                    onDrop={(event) => dropOnRung(event, rung.id, width)}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setDropPreview((previous) => previous?.rungId === rung.id ? null : previous);
                      }
                    }}
                    aria-label={"Rung editable " + rungIndex + ". Arrastra instrucciones aquí."} className="block">
                    <path d={"M63 15V122 M" + (width - 30) + " 15V122"}
                      stroke="#8898a5" strokeWidth="1.5" fill="none" />
                    {wireSegments.map(([from, to], index) => (
                      <Wire key={index} x1={from} y1={y} x2={to} y2={y} />
                    ))}
                    {output && <Wire x1={coilX + 24} y1={y} x2={width - 30} y2={y} />}
                    {contacts.map((item, index) => {
                      const x = contactX(index);
                      return (
                        <g key={item.id} role="button" tabIndex={0} aria-label={"Editar " + item.kind + " " + item.tag}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelected(item.id)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.id); } }}>
                          {selected === item.id && (
                            <rect x={x - 51} y={y - 64} width="102" height="79" rx="4"
                              fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" />
                          )}
                          <Contact x={x} y={y} kind={item.kind as "XIC" | "XIO"} tag={item.tag}
                            comment={project.tags.find((tag) => tag.name === item.tag)?.description}
                            value={false} online={false} powerIn={false} />
                          <rect x={x - 50} y={y - 67} width="100" height="93" fill="transparent" />
                        </g>
                      );
                    })}
                    {output ? (
                      <g role="button" tabIndex={0} aria-label={"Editar OTE " + output.tag}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelected(output.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(output.id); } }}>
                        {selected === output.id && (
                          <rect x={coilX - 53} y={y - 64} width="106" height="79" rx="4"
                            fill="#eff6ff" stroke="#2563eb" strokeWidth="1.3" />
                        )}
                        <Coil x={coilX} y={y} tag={output.tag}
                          comment={project.tags.find((tag) => tag.name === output.tag)?.description}
                          online={false} live={false} />
                        <rect x={coilX - 53} y={y - 67} width="106" height="93" fill="transparent" />
                      </g>
                    ) : selectedTool === "OTE" && (
                      <g role="button" tabIndex={0} aria-label="Insertar OTE"
                        onClick={() => insertAt(rung.id, contacts.length, "OTE")}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); insertAt(rung.id, contacts.length, "OTE"); } }}
                        style={{ cursor: "pointer" }}>
                        <rect x={coilX - 45} y={y - 14} width="90" height="29"
                          fill="#eff6ff" stroke="#60a5fa" strokeDasharray="3 3" rx="5" />
                        <text x={coilX} y={y + 4} fontFamily="Arial" fontSize="12" textAnchor="middle" fill="#2563eb">
                          + OTE
                        </text>
                      </g>
                    )}
                    {(selectedTool === "XIC" || selectedTool === "XIO") &&
                      Array.from({ length: contacts.length + 1 }, (_, position) => {
                        const x = position === 0 ? 107 : contactX(position - 1) + 69;
                        return (
                          <g key={"slot-" + position} role="button" tabIndex={0}
                            aria-label={"Insertar " + selectedTool + " en posición " + (position + 1)}
                            onClick={() => insertAt(rung.id, position, selectedTool)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                insertAt(rung.id, position, selectedTool);
                              }
                            }} style={{ cursor: "pointer" }}>
                            <circle cx={x} cy={y} r="13" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.3" />
                            <path d={"M" + (x - 5) + " " + y + "h10 M" + x + " " + (y - 5) + "v10"}
                              stroke="#2563eb" strokeWidth="1.7" />
                          </g>
                        );
                      })}
                    {dropPreview?.rungId === rung.id && (
                      <g pointerEvents="none" aria-hidden="true">
                        <rect
                          x={dropPreview.kind === "OTE" ? coilX - 42 : dropPreview.x - 30}
                          y={y - 28}
                          width={dropPreview.kind === "OTE" ? 84 : 60}
                          height="54"
                          rx="5"
                          fill="#dbeafe"
                          fillOpacity="0.9"
                          stroke="#2563eb"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                        <path d={"M" + dropPreview.x + " " + (y - 33) + "v66"}
                          stroke="#0284c7" strokeWidth="2" strokeDasharray="5 3" />
                        <text x={dropPreview.x} y={y + 5} textAnchor="middle"
                          fontSize="11" fontFamily="Arial, sans-serif" fontWeight="700" fill="#1d4ed8">
                          {dropPreview.kind}
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              </article>
            );
          })}
        </div>

        {selectedInstruction && (
          <div className="mx-3 mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-3 text-xs">
            <div className="mb-2 font-semibold text-sky-900">Propiedades de instrucción · {selectedInstruction.kind}</div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-44 flex-col gap-1">
                Tag asociado
                <select value={selectedInstruction.tag}
                  onChange={(event) => update(() => changeInstructionTag(project, selectedInstruction.id, event.target.value))}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-800">
                  {project.tags.map((tag) => <option key={tag.name} value={tag.name}>{tag.name}</option>)}
                </select>
              </label>
              <button type="button" className="rounded border border-red-200 bg-white px-2 py-1.5 text-red-700 hover:bg-red-50"
                onClick={() => {
                  update(() => removeInstruction(project, selectedInstruction.id));
                  setSelected(null);
                }}>
                Eliminar instrucción
              </button>
            </div>
          </div>
        )}

        <details className="mx-3 mb-3 rounded border border-slate-200 bg-[#f8fafc] p-3">
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
        {error && <p role="alert" className="mx-3 mb-3 text-xs text-red-700">{error}</p>}
        <p className="mx-3 mb-5 flex items-center gap-1 text-xs text-slate-500">
          <FileCode2 size={14} /> Editor preliminar con arrastre desde la paleta: contactos en serie, una bobina OTE por rung y tags BOOL.
          Las ramas OR y el motor de ejecución editable se incorporarán después.
        </p>
      </div>
    </section>
  );
}
