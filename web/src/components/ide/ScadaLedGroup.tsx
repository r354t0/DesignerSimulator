import type { ReactNode } from "react";
import { Activity, Cog, RadioTower } from "lucide-react";

type GroupKind = "status" | "inputs" | "outputs";

const groups = {
  status: { title: "Estado del sistema", icon: Activity },
  inputs: { title: "Entradas digitales", icon: RadioTower },
  outputs: { title: "Salidas digitales", icon: Cog },
} as const;

/** Shared three-category LED board for process SCADA scenes.
 * Presentation only: each scene supplies the live tag/sensor value. */
export function ScadaLedGroup({ kind, children }: {
  kind: GroupKind;
  children: ReactNode;
}) {
  const { title, icon: Icon } = groups[kind];
  return (
    <section aria-label={title}
      className="rounded-md border border-[#344c5e] bg-[#142637] p-2.5">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-sky-200">
        <Icon size={14} aria-hidden="true"/> {title}
      </h4>
      <div className="scada-pilot-grid grid grid-cols-2 gap-2">
        {children}
      </div>
    </section>
  );
}
