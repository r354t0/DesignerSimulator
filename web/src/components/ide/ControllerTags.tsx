import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Search, Trash2 } from "lucide-react";
import {
  createTag, deleteTag, editTag, setTagValue,
  TAG_EXTERNAL_ACCESS, TAG_STYLES, TAG_TYPES,
  type PracticeProject, type PracticeTag, type TagExternalAccess, type TagStyle,
  type TagType, type TagMemberValue,
} from "../../plc/practiceDocument";
import { demoTagMetadata, type DemoInputs, type DemoValues, type InputTag } from "../../plc/demoModel";

interface Props {
  project: PracticeProject;
  onChange: (next: PracticeProject) => void;
  inputs: DemoInputs;
  values: DemoValues;
  online: boolean;
  onTagChange: (tag: InputTag, value: boolean) => void;
  onResetCounters: () => void;
}

type Tab = "monitor" | "edit";
type Scope = "practice" | "demo";

function TextCell({ value, label, onCommit, className = "" }: {
  value: string;
  label: string;
  onCommit: (value: string) => boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return;
    if (!onCommit(draft)) setDraft(value);
  };
  const keydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); }
  };
  return (
    <input type="text" aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={keydown} title={draft}
      className={"w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none " + className}
    />
  );
}

function NumberCell({ value, label, onCommit, disabled = false, style = "Decimal" }: {
  value: number;
  label: string;
  onCommit: (value: number) => boolean;
  disabled?: boolean;
  style?: TagStyle;
}) {
  const shown = style === "Binary" && Number.isInteger(value) ? "0b" + (value >>> 0).toString(2)
    : style === "Hex" && Number.isInteger(value) ? "0x" + (value >>> 0).toString(16).toUpperCase()
      : String(value);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    if (draft === shown) return;
    const raw = draft.trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed) || !onCommit(parsed)) setDraft(shown);
  };
  return (
    <input aria-label={label} type="text" inputMode="decimal" value={draft}
      disabled={disabled} onChange={(event) => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { setDraft(shown); event.currentTarget.blur(); }
      }}
      className="w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
    />
  );
}

const headClass = "sticky top-0 z-10 h-7 whitespace-nowrap border border-[#c7cdd3] bg-[#e6e9ee] px-2 text-left text-[11px] font-semibold text-[#263849]";
const cellClass = "h-7 border border-[#d7dce1] px-1.5 text-[11px]";
const cellWidths = {
  name: "w-[220px] min-w-[220px]",
  value: "w-[112px] min-w-[112px]",
  type: "w-[116px] min-w-[116px]",
  description: "w-[300px] min-w-[300px]",
  external: "w-[125px] min-w-[125px]",
  constant: "w-[80px] min-w-[80px]",
  style: "w-[105px] min-w-[105px]",
  force: "w-[102px] min-w-[102px]",
};

export function ControllerTags({
  project, onChange, inputs, values, online, onTagChange, onResetCounters,
}: Props) {
  const [tab, setTab] = useState<Tab>("monitor");
  const [scope, setScope] = useState<Scope>("practice");
  const [show, setShow] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<TagType>("BOOL");
  const [newDescription, setNewDescription] = useState("");
  const [newAccess, setNewAccess] = useState<TagExternalAccess>("Read/Write");
  const [newConstant, setNewConstant] = useState(false);
  const [newStyle, setNewStyle] = useState<TagStyle>("Decimal");

  const update = (operation: () => PracticeProject, message?: string): boolean => {
    try {
      onChange(operation());
      setError("");
      setNotice(message ?? "");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el cambio.");
      setNotice("");
      return false;
    }
  };

  const allRows = useMemo(() => (scope === "practice"
    ? project.tags
    : demoTagMetadata.map((tag) => ({
      name: tag.name, type: "BOOL" as TagType, description: tag.description,
      value: values[tag.name], constant: tag.access !== "input",
      style: "Decimal" as TagStyle, externalAccess: "Read/Write" as TagExternalAccess,
    }))), [project.tags, scope, values]);

  const rows = useMemo(() => allRows
    .filter((tag) => show === "all" || tag.type === show)
    .filter((tag) => (tag.name + " " + tag.description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [allRows, show, query]);

  const applyValue = (name: string, value: TagMemberValue, member?: string): boolean =>
    update(() => setTagValue(project, name, value, member));
  const updateProperty = (name: string, patch: Parameters<typeof editTag>[2]): boolean =>
    update(() => editTag(project, name, patch));

  const createNew = () => {
    try {
      let next = createTag(project, newName, newDescription, newType);
      next = editTag(next, newName.trim(), {
        externalAccess: newAccess, constant: newConstant, style: newStyle,
      });
      onChange(next);
      setError("");
      setNotice("Tag " + newName.trim() + " creado.");
      setNewName("");
      setNewDescription("");
      setNewType("BOOL");
      setNewAccess("Read/Write");
      setNewConstant(false);
      setNewStyle("Decimal");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear el tag.");
    }
  };

  const toggleExpand = (name: string) => setExpanded((previous) =>
    previous.includes(name) ? previous.filter((x) => x !== name) : [...previous, name]);

  const boolValue = (name: string, value: boolean, disabled: boolean, member?: string) => (
    <button type="button" aria-label={"Cambiar valor de " + name + (member ? "." + member : "")}
      aria-pressed={value} disabled={disabled}
      onClick={() => applyValue(name, !value, member)}
      className="w-full rounded px-1 py-0.5 text-right font-mono text-[11px] hover:bg-sky-100 disabled:cursor-not-allowed disabled:text-slate-500">
      {value ? 1 : 0}
    </button>
  );

  const valueCell = (tag: PracticeTag, member?: string) => {
    const sourceValue = member && typeof tag.value === "object" ? tag.value[member] : tag.value;
    if (typeof sourceValue === "boolean") return boolValue(tag.name, sourceValue, tag.constant, member);
    if (typeof sourceValue === "number") {
      return <NumberCell key={tag.name + (member ?? "") + tag.type}
        value={sourceValue} label={"Valor de " + tag.name + (member ? "." + member : "")}
        disabled={tag.constant} style={member ? "Decimal" : tag.style}
        onCommit={(value) => applyValue(tag.name, value, member)} />;
    }
    return <span className="block text-right font-mono text-slate-500">{"{...}"}</span>;
  };

  const editSelect = <T extends string>(value: T, label: string, options: readonly T[], onCommit: (newValue: T) => void) => (
    <select value={value} aria-label={label} onChange={(event) => onCommit(event.target.value as T)}
      className="w-full min-w-0 bg-transparent py-1 text-[11px] outline-none focus:bg-white focus:ring-1 focus:ring-sky-500">
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );

  const monitorHeaders: ReactNode = <>
    <th className={headClass + " " + cellWidths.name}>Name</th>
    <th className={headClass + " " + cellWidths.value}>Value</th>
    <th className={headClass + " " + cellWidths.force}>Force Mask</th>
    <th className={headClass + " " + cellWidths.style}>Style</th>
    <th className={headClass + " " + cellWidths.type}>Data Type</th>
    <th className={headClass + " " + cellWidths.description}>Description</th>
    <th className={headClass + " " + cellWidths.constant}>Constant</th>
  </>;

  const editHeaders: ReactNode = <>
    <th className={headClass + " " + cellWidths.name}>Name</th>
    <th className={headClass + " " + cellWidths.type}>Data Type</th>
    <th className={headClass + " " + cellWidths.description}>Description</th>
    <th className={headClass + " " + cellWidths.external}>External Access</th>
    <th className={headClass + " " + cellWidths.constant}>Constant</th>
    <th className={headClass + " " + cellWidths.style}>Style</th>
    <th className={headClass + " w-[55px] min-w-[55px]"} aria-label="Acciones"> </th>
  </>;

  const tableRows = rows.map((tag) => {
    const isStructured = typeof tag.value === "object";
    const display = tab === "monitor" ? (
      <>
        <tr key={tag.name} className="bg-white hover:bg-[#edf4ff]">
          <td className={cellClass + " font-mono"}>
            <div className="flex items-center gap-1">
              {isStructured && <button type="button" aria-label={(expanded.includes(tag.name) ? "Contraer " : "Expandir ") + tag.name}
                onClick={() => toggleExpand(tag.name)} className="rounded hover:bg-slate-200">
                {expanded.includes(tag.name) ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
              </button>}
              <span className="truncate" title={tag.name}>{tag.name}</span>
            </div>
          </td>
          <td className={cellClass + " text-right"}>
            {scope === "demo"
              ? tag.constant ? <span className="block pr-1 font-mono">{values[tag.name as keyof DemoValues] ? 1 : 0}</span>
                : <button type="button" aria-label={"Alternar " + tag.name}
                    className="w-full text-right font-mono hover:bg-sky-100"
                    onClick={() => onTagChange(tag.name as InputTag, !inputs[tag.name as InputTag])}>
                    {values[tag.name as keyof DemoValues] ? 1 : 0}
                  </button>
              : valueCell(tag)}
          </td>
          <td className={cellClass + " text-center text-slate-400"}>—</td>
          <td className={cellClass}>{tag.style}</td>
          <td className={cellClass + " font-mono"}>{tag.type}</td>
          <td className={cellClass + " truncate"} title={tag.description}>{tag.description}</td>
          <td className={cellClass + " text-center"}>
            <input type="checkbox" disabled checked={tag.constant} aria-label={"Constante " + tag.name}/>
          </td>
        </tr>
        {expanded.includes(tag.name) && isStructured && Object.entries(tag.value as Record<string,TagMemberValue>).map(([member, value]) => (
          <tr key={tag.name + "." + member} className="bg-[#f7f9fb]">
            <td className={cellClass + " pl-8 font-mono text-slate-600"}>{tag.name}.{member}</td>
            <td className={cellClass + " text-right"}>{scope === "practice" ? valueCell(tag, member) : String(Number(value))}</td>
            <td className={cellClass + " text-center text-slate-400"}>—</td>
            <td className={cellClass}>Decimal</td>
            <td className={cellClass}>{typeof value === "boolean" ? "BOOL" : "DINT"}</td>
            <td className={cellClass + " text-slate-500"}>Miembro de {tag.type}</td>
            <td className={cellClass}></td>
          </tr>
        ))}
      </>
    ) : (
      <tr key={tag.name} className="bg-white hover:bg-[#edf4ff]">
        <td className={cellClass}>
          {scope === "practice"
            ? <TextCell key={tag.name} label={"Nombre de " + tag.name} value={tag.name}
                onCommit={(value) => updateProperty(tag.name, { name: value })} className="font-mono"/>
            : <span className="font-mono">{tag.name}</span>}
        </td>
        <td className={cellClass}>
          {scope === "practice" ? editSelect(tag.type, "Tipo " + tag.name, TAG_TYPES,
            (type) => updateProperty(tag.name, { type })) : tag.type}
        </td>
        <td className={cellClass}>
          {scope === "practice"
            ? <TextCell label={"Descripción de " + tag.name} value={tag.description}
                onCommit={(description) => updateProperty(tag.name, { description })}/>
            : tag.description}
        </td>
        <td className={cellClass}>
          {scope === "practice"
            ? editSelect(tag.externalAccess, "Acceso externo " + tag.name, TAG_EXTERNAL_ACCESS,
              (externalAccess) => updateProperty(tag.name, { externalAccess }))
            : tag.externalAccess}
        </td>
        <td className={cellClass + " text-center"}>
          <input type="checkbox" checked={tag.constant} disabled={scope !== "practice"}
            aria-label={"Constante " + tag.name}
            onChange={(event) => updateProperty(tag.name, { constant: event.target.checked })}/>
        </td>
        <td className={cellClass}>
          {scope === "practice" ? editSelect(tag.style, "Formato " + tag.name, TAG_STYLES,
            (style) => updateProperty(tag.name, { style })) : tag.style}
        </td>
        <td className={cellClass + " text-center"}>
          {scope === "practice" && <button type="button" aria-label={"Eliminar tag " + tag.name}
            title="Eliminar tag si no tiene referencias en Ladder"
            onClick={() => {
              if (window.confirm("¿Eliminar el tag " + tag.name + "?")) update(() => deleteTag(project, tag.name));
            }}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13}/></button>}
        </td>
      </tr>
    );
    return display;
  });

  const footer = scope === "practice" && tab === "edit" ? (
    <tfoot className="sticky bottom-0 z-10 bg-[#eaf4ff] shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
      <tr className="bg-[#eaf4ff]">
        <td className={cellClass}>
          <input aria-label="Nombre del nuevo tag" placeholder="<Nuevo tag>" value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") createNew(); }}
            className="w-full bg-white px-1 py-1 text-[11px] font-mono outline outline-1 outline-slate-300 focus:outline-sky-500"/>
        </td>
        <td className={cellClass}>{editSelect(newType, "Tipo de nuevo tag", TAG_TYPES, setNewType)}</td>
        <td className={cellClass}>
          <input aria-label="Descripción del nuevo tag" placeholder="Descripción opcional" value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") createNew(); }}
            className="w-full bg-transparent px-1 text-[11px] outline-none focus:bg-white"/>
        </td>
        <td className={cellClass}>{editSelect(newAccess, "Acceso externo de nuevo tag", TAG_EXTERNAL_ACCESS, setNewAccess)}</td>
        <td className={cellClass + " text-center"}>
          <input aria-label="Constante nuevo tag" checked={newConstant} onChange={(event) => setNewConstant(event.target.checked)} type="checkbox"/>
        </td>
        <td className={cellClass}>{editSelect(newStyle, "Estilo de nuevo tag", TAG_STYLES, setNewStyle)}</td>
        <td className={cellClass}>
          <button type="button" aria-label="Crear tag" disabled={!newName.trim()} onClick={createNew}
            className="w-full rounded bg-sky-700 px-1.5 py-1 text-[10px] font-semibold text-white hover:bg-sky-800 disabled:bg-slate-400">+</button>
        </td>
      </tr>
    </tfoot>
  ) : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-300 bg-[#f0f2f5] px-3 py-2 text-xs">
        <strong className="text-[12px]">Controller Tags</strong>
        <label className="flex items-center gap-1">
          Scope:
          <select aria-label="Scope tags" value={scope} onChange={(event) => {
            setScope(event.target.value as Scope); setError(""); setNotice(""); setShow("all");
          }} className="rounded border border-slate-300 bg-white px-2 py-1">
            <option value="practice">PracticeRoutine (controller)</option>
            <option value="demo">MainRoutine (demo)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Show:
          <select aria-label="Filtrar tipos de tags" value={show} onChange={(event) => setShow(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1">
            <option value="all">All Tags</option>
            {TAG_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="ml-auto flex min-w-[170px] max-w-md flex-1 items-center gap-1 rounded border border-slate-300 bg-white px-2">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input aria-label="Filtrar nombre o descripción de tags" value={query}
            placeholder="Enter Name Filter…" onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 py-1 text-xs outline-none"/>
          {query && <button type="button" aria-label="Limpiar filtro" onClick={() => setQuery("")}>×</button>}
        </label>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto bg-[#fafafa]" role="region" aria-label="Tabla de Controller Tags" tabIndex={0}>
          <table className="w-max min-w-full table-fixed border-collapse text-slate-800">
            <thead><tr>{tab === "monitor" ? monitorHeaders : editHeaders}</tr></thead>
            <tbody>{tableRows}</tbody>
            {footer}
          </table>
          {rows.length === 0 && <p className="p-5 text-xs text-slate-500">No hay tags que coincidan con el filtro.</p>}
        </div>
        {error && <p role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
        {notice && !error && <p role="status" className="shrink-0 bg-sky-50 px-3 py-1 text-[11px] text-sky-800">{notice}</p>}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-300 bg-[#e9edf2] px-2">
          <div className="flex items-end gap-1 self-stretch">
            <button type="button" onClick={() => setTab("monitor")} aria-selected={tab === "monitor"}
              className={"border-x border-t px-3 py-1 text-[11px] " + (tab === "monitor"
                ? "border-slate-300 bg-white font-semibold" : "border-transparent bg-[#e1e5eb] hover:bg-white")}>
              Monitor Tags
            </button>
            <button type="button" onClick={() => setTab("edit")} aria-selected={tab === "edit"}
              className={"border-x border-t px-3 py-1 text-[11px] " + (tab === "edit"
                ? "border-slate-300 bg-white font-semibold" : "border-transparent bg-[#e1e5eb] hover:bg-white")}>
              Edit Tags
            </button>
          </div>
          <span className="truncate text-[10px] text-slate-600">
            {rows.length} de {allRows.length} tags · {scope === "practice"
              ? "Valores locales de práctica (sin ejecución PLC)"
              : online ? "DEMO · REM RUN" : "DEMO · OFFLINE"}
          </span>
          {scope === "demo" && tab === "monitor" && <button type="button" onClick={onResetCounters}
            className="flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] hover:bg-slate-50">
            <RotateCcw size={11}/> Reset contadores
          </button>}
        </div>
        {scope === "demo" && tab === "edit" && <p className="shrink-0 border-t border-slate-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800">
          Los tags fijos del programa DEMO no se pueden modificar desde esta vista; cambia Scope a PracticeRoutine para crear o editar tags.
        </p>}
      </div>
    </section>
  );
}
