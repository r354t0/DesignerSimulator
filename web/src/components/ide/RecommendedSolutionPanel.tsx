import type { ReactNode } from "react";
import type { PracticeProject } from "../../plc/practiceDocument";
import { SceneTagTable, type SceneTagDefinition } from "./SceneTagTable";

export function RecommendedSolutionPanel({
  project, specs, onImplement, onReset, children,
}: {
  project: PracticeProject;
  specs: readonly SceneTagDefinition[];
  onImplement: () => void;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <section aria-label="Solución Recomendada"
      className="rounded-lg border border-slate-700 bg-[#1a2b3b] p-3 text-xs">
      <h3 className="mb-2 font-semibold text-sky-200">Solución Recomendada</h3>
      <p className="mb-3 leading-relaxed text-slate-300">
        Implementa el ejemplo para estudiar sus rungs y sus variables auxiliares.
        Después puedes recuperar la programación anterior para resolver el ejercicio por tu cuenta.
      </p>
      <h4 className="mb-2 font-semibold text-slate-200">
        Variables adicionales de la solución
      </h4>
      <SceneTagTable specs={specs} project={project} preview/>
      <p className="mt-1.5 text-[10px] text-slate-400">
        Solo se crean al implementar la solución. ACC / PRE se expresa en sus unidades de programación.
      </p>
      {children && (
        <details className="mt-3 rounded border border-slate-600/70 p-2">
          <summary className="cursor-pointer font-semibold text-sky-300">
            Ver explicación de la programación Ladder
          </summary>
          <div className="mt-2">{children}</div>
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onImplement}
          className="rounded border border-sky-500 bg-sky-900/40 px-3 py-2 font-semibold text-sky-100 hover:bg-sky-800">
          Implementar Solución Recomendada
        </button>
        <button type="button" onClick={onReset}
          className="rounded border border-slate-500 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-700">
          Reiniciar programación para practicar
        </button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Ambas acciones solicitan confirmación y solo afectan al programa de esta escena.
        El reinicio restaura el programa anterior a la implementación, si existe.
      </p>
    </section>
  );
}
