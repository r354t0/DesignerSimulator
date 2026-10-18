import type { PracticeProject, TagType } from "../../plc/practiceDocument";

export interface SceneTagDefinition {
  name: string;
  type: TagType;
  direction: "Entrada" | "Salida" | "Interna";
  description: string;
}

/** One consistent map for physical E/S and solution-only auxiliary tags. */
export function SceneTagTable({ specs, project, preview = false }: {
  specs: readonly SceneTagDefinition[];
  project: PracticeProject;
  preview?: boolean;
}) {
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-slate-700">
      <table className="w-full min-w-[570px] text-left text-[11px]">
        <thead className="sticky top-0 bg-[#203449] text-slate-200">
          <tr>{["Tag", "Tipo", "Función", "Descripción", "Valor"].map(name =>
            <th key={name} scope="col" className="px-2.5 py-2 font-semibold">{name}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-700/70">
          {specs.map(spec => {
            const tag = project.tags.find(item => item.name === spec.name);
            const valid = tag?.type === spec.type;
            const value = !valid ? (preview ? "Se creará" : "Revisar")
              : tag.type === "BOOL" ? (tag.value ? "1" : "0")
              : (tag.type === "TIMER" || tag.type === "COUNTER") &&
                typeof tag.value === "object"
                ? String(tag.value.ACC) + " / " + String(tag.value.PRE)
              : String(tag.value);
            return (
              <tr key={spec.name} className="hover:bg-slate-700/20">
                <th scope="row" className="px-2.5 py-2 font-mono font-semibold text-sky-200">
                  {spec.name}
                </th>
                <td className="px-2.5 py-2 font-mono">{spec.type}</td>
                <td className="px-2.5 py-2">{spec.direction}</td>
                <td className="px-2.5 py-2">{tag?.description || spec.description}</td>
                <td className={"px-2.5 py-2 text-right font-mono " +
                  (valid ? "text-emerald-300" : "text-slate-400")}>{value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
