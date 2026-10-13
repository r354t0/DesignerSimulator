import type { ReactNode } from "react";

export type Instruction = "XIC" | "XIO" | "OTE" | "OTL" | "OTU" | "TON" | "CTU";

export const INSTRUCTIONS: { id: Instruction; label: string }[] = [
  { id: "XIC", label: "Examine If Closed" },
  { id: "XIO", label: "Examine If Open" },
  { id: "OTE", label: "Output Energize" },
  { id: "OTL", label: "Output Latch" },
  { id: "OTU", label: "Output Unlatch" },
  { id: "TON", label: "Timer On Delay" },
  { id: "CTU", label: "Count Up" },
];

const BASE = "#58636f";
const HOT = "#00c83a";
const ACTIVE_STROKE = 4;
const SYMBOL_BASE_STROKE = 1.8;

export function ToolbarSymbol({ kind }: { kind: Instruction }) {
  const isContact = kind === "XIC" || kind === "XIO";
  const isBlock = kind === "TON" || kind === "CTU";
  return (
    <svg width="46" height="28" viewBox="0 0 92 50" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="square">
        {isContact ? (
          <>
            <path d="M4 25H34 M58 25H88 M34 8V42 M58 8V42" />
            {kind === "XIO" && <path d="M34 42L58 8" />}
          </>
        ) : isBlock ? (
          <path d="M4 25H23 M69 25H88 M23 4H69V46H23Z" />
        ) : (
          <>
            <path d="M4 25H31 M61 25H88 M38 7C27 18 27 32 38 43 M54 7C65 18 65 32 54 43" />
          </>
        )}
      </g>
      {(kind === "OTL" || kind === "OTU" || isBlock) && (
        <text x="46" y="30" textAnchor="middle" fill="currentColor" fontSize={isBlock ? 12 : 16} fontWeight="600" fontFamily="Arial, sans-serif">
          {isBlock ? kind : kind === "OTL" ? "L" : "U"}
        </text>
      )}
    </svg>
  );
}

export function Wire({
  x1, y1, x2, y2, live = false,
}: { x1: number; y1: number; x2: number; y2: number; live?: boolean }) {
  // One SVG path per wire: active flow recolors the original centerline.
  // Do not render a second shifted highlight line.
  return (
    <path
      d={"M" + x1 + " " + y1 + " L" + x2 + " " + y2}
      fill="none"
      stroke={live ? HOT : "#b5bbc2"}
      strokeWidth={live ? ACTIVE_STROKE : 1.5}
      strokeLinecap="square"
    />
  );
}

export function Contact({
  x, y, kind, tag, comment, value, online, powerIn,
}: {
  x: number; y: number; kind: "XIC" | "XIO"; tag: string; comment?: string;
  value: boolean; online: boolean; powerIn: boolean;
}) {
  // Logix semantics: XIC = bit TRUE; XIO = bit FALSE.
  const condition = kind === "XIC" ? value : !value;
  const flow = powerIn && condition;
  const activeSymbol = online && condition;
  return (
    <g>
      <g fill={BASE} textAnchor="middle" fontFamily="Arial, sans-serif">
        {comment && <text x={x} y={y - 55} fontSize="12" fill="#8b949e">{comment}</text>}
        <text x={x} y={y - 36} fontSize="14" fill="#1c354b">{tag}</text>
        <text x={x} y={y + 33} fontSize="11" fill="#66717c">{kind} · {value ? "1" : "0"}</text>
      </g>
      <g
        fill="none"
        stroke={activeSymbol ? HOT : BASE}
        strokeWidth={activeSymbol ? ACTIVE_STROKE : SYMBOL_BASE_STROKE}
        strokeLinecap="square"
      >
        <path d={"M" + (x - 14) + " " + (y - 15) + "v30 M" + (x + 14) + " " + (y - 15) + "v30"} />
        {kind === "XIO" && <path d={"M" + (x - 14) + " " + (y + 15) + "L" + (x + 14) + " " + (y - 15)} />}
      </g>
      <Wire x1={x - 44} y1={y} x2={x - 14} y2={y} live={online && powerIn} />
      <Wire x1={x + 14} y1={y} x2={x + 44} y2={y} live={online && flow} />
    </g>
  );
}

export function Coil({
  x, y, tag, comment, online, live,
}: {
  x: number; y: number; tag: string; comment?: string; online: boolean; live: boolean;
}) {
  const activeSymbol = online && live;
  return (
    <g>
      <g fill={BASE} textAnchor="middle" fontFamily="Arial, sans-serif">
        {comment && <text x={x} y={y - 55} fontSize="12" fill="#8b949e">{comment}</text>}
        <text x={x} y={y - 36} fontSize="14" fill="#1c354b">{tag}</text>
        <text x={x} y={y + 33} fontSize="11" fill="#66717c">OTE</text>
      </g>
      <g
        fill="none"
        stroke={activeSymbol ? HOT : BASE}
        strokeWidth={activeSymbol ? ACTIVE_STROKE : SYMBOL_BASE_STROKE}
        strokeLinecap="square"
      >
        <path d={"M" + (x - 14) + " " + (y - 15) + "C" + (x - 26) + " " + (y - 5) + " " + (x - 26) + " " + (y + 5) + " " + (x - 14) + " " + (y + 15)} />
        <path d={"M" + (x + 14) + " " + (y - 15) + "C" + (x + 26) + " " + (y - 5) + " " + (x + 26) + " " + (y + 5) + " " + (x + 14) + " " + (y + 15)} />
      </g>
      <Wire x1={x - 48} y1={y} x2={x - 22} y2={y} live={online && live} />
      <Wire x1={x + 22} y1={y} x2={x + 48} y2={y} live={online && live} />
    </g>
  );
}

export function RungFrame({
  index, y, selected, live, children,
}: { index: number; y: number; selected?: boolean; live?: boolean; children: ReactNode }) {
  return (
    <g>
      {selected && <rect x="1" y={y - 55} width="53" height="116" fill="#087bd1" />}
      <text x="25" y={y + 4} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fill={selected ? "#fff" : "#7c8793"}>
        {index}
      </text>
      <Wire x1={62} y1={y} x2={92} y2={y} live={live} />
      {children}
    </g>
  );
}
