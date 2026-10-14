import type { ReactNode } from "react";

export type Instruction = "XIC" | "XIO" | "OTE" | "OTL" | "OTU" | "TON" | "TOF" | "TONOFF" | "CTU" | "CTD";

export const INSTRUCTIONS: { id: Instruction; label: string }[] = [
  { id: "XIC", label: "Examine If Closed" },
  { id: "XIO", label: "Examine If Open" },
  { id: "OTE", label: "Output Energize" },
  { id: "OTL", label: "Output Latch" },
  { id: "OTU", label: "Output Unlatch" },
  { id: "TON", label: "Timer On Delay" },
  { id: "TOF", label: "Timer Off Delay" },
  { id: "TONOFF", label: "Dual On/Off Delay (custom simulator block)" },
  { id: "CTU", label: "Count Up" },
  { id: "CTD", label: "Count Down" },
];

const BASE = "#58636f";
const HOT = "#00c83a";
// Online green: 25% thinner than the previous 4px stroke.
const ACTIVE_STROKE = 3;
const SYMBOL_BASE_STROKE = 1.8;

// Comment labels are independent of the rung stroke and use a fixed, compact
// text column. Native SVG text has no automatic wrapping, so generate tspans.
const COMMENT_WIDTH = 130;
const COMMENT_LINE_HEIGHT = 13;
const COMMENT_MAX_LINES = 2;

function approximateSvgTextWidth(value: string): number {
  return Array.from(value).reduce((width, char) => {
    if (char === " ") return width + 3.1;
    if (/[.,:;!|iIl'´]/.test(char)) return width + 2.8;
    if (/[MW@%]/.test(char)) return width + 9;
    if (/[ABCDEFGHJKLMNOPQRSTUVWXYZ]/.test(char)) return width + 7.2;
    return width + 5.8;
  }, 0);
}

function wrapSvgComment(comment: string): string[] {
  const words = comment.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  // Break an exceptionally long word as well, so nothing escapes the column.
  for (const word of words) {
    if (approximateSvgTextWidth(word) <= COMMENT_WIDTH) {
      chunks.push(word);
      continue;
    }
    let chunk = "";
    for (const letter of Array.from(word)) {
      if (chunk && approximateSvgTextWidth(chunk + letter) > COMMENT_WIDTH) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += letter;
    }
    if (chunk) chunks.push(chunk);
  }

  const lines: string[] = [];
  let current = "";
  for (const chunk of chunks) {
    const candidate = current ? current + " " + chunk : chunk;
    if (current && approximateSvgTextWidth(candidate) > COMMENT_WIDTH) {
      lines.push(current);
      current = chunk;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= COMMENT_MAX_LINES) return lines;

  const visible = lines.slice(0, COMMENT_MAX_LINES);
  let last = visible[COMMENT_MAX_LINES - 1];
  while (last.length > 0 && approximateSvgTextWidth(last + "…") > COMMENT_WIDTH) {
    last = last.slice(0, -1);
  }
  visible[COMMENT_MAX_LINES - 1] = last.trimEnd() + "…";
  return visible;
}

function SvgComment({ x, y, comment }: { x: number; y: number; comment?: string }) {
  if (!comment?.trim()) return null;
  const lines = wrapSvgComment(comment);
  return (
    <g>
      <title>{comment}</title>
      <text
        x={x}
        y={y - 40 - (lines.length - 1) * COMMENT_LINE_HEIGHT}
        fontSize="11"
        textAnchor="middle"
        fill="#788694"
        fontFamily="Arial, sans-serif"
      >
        {lines.map((line, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : COMMENT_LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

// Compact editor prototype: halve the geometry, without shrinking the tag text.
// One value controls contacts and coils consistently.
export const SYMBOL_SCALE = 0.5;

export function ToolbarSymbol({ kind }: { kind: Instruction }) {
  const isContact = kind === "XIC" || kind === "XIO";
  const isBlock = ["TON", "TOF", "TONOFF", "CTU", "CTD"].includes(kind);
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
        <text x="46" y="30" textAnchor="middle" fill="currentColor" fontSize={kind === "TONOFF" ? 8.5 : isBlock ? 12 : 16} fontWeight="600" fontFamily="Arial, sans-serif">
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
  const halfBarGap = 14 * SYMBOL_SCALE;
  const halfBarHeight = 15 * SYMBOL_SCALE;
  const leadLength = 30 * SYMBOL_SCALE;
  const terminalX = halfBarGap + leadLength;
  return (
    <g>
      {/* Tags and wrapped comments always stay above the instruction. No duplicate status text below. */}
      <g fill={BASE} textAnchor="middle" fontFamily="Arial, sans-serif">
        <SvgComment x={x} y={y} comment={comment} />
        <text x={x} y={y - 23} fontSize="12" fill="#1c354b">{tag}</text>
      </g>
      <g
        fill="none"
        stroke={activeSymbol ? HOT : BASE}
        strokeWidth={activeSymbol ? ACTIVE_STROKE : SYMBOL_BASE_STROKE}
        strokeLinecap="square"
      >
        <path d={"M" + (x - halfBarGap) + " " + (y - halfBarHeight) + "v" + (2 * halfBarHeight) +
          " M" + (x + halfBarGap) + " " + (y - halfBarHeight) + "v" + (2 * halfBarHeight)} />
        {kind === "XIO" && <path d={"M" + (x - halfBarGap) + " " + (y + halfBarHeight) +
          "L" + (x + halfBarGap) + " " + (y - halfBarHeight)} />}
      </g>
      <Wire x1={x - terminalX} y1={y} x2={x - halfBarGap} y2={y} live={online && powerIn} />
      <Wire x1={x + halfBarGap} y1={y} x2={x + terminalX} y2={y} live={online && flow} />
    </g>
  );
}

export function Coil({
  x, y, tag, comment, online, live,
}: {
  x: number; y: number; tag: string; comment?: string; online: boolean; live: boolean;
}) {
  const activeSymbol = online && live;
  const curveEdge = 14 * SYMBOL_SCALE;
  const curveControl = 26 * SYMBOL_SCALE;
  const halfHeight = 15 * SYMBOL_SCALE;
  const curveControlY = 5 * SYMBOL_SCALE;
  const wireStart = 22 * SYMBOL_SCALE;
  const wireEnd = 48 * SYMBOL_SCALE;
  return (
    <g>
      {/* Tags and wrapped comments always stay above the instruction. No duplicate status text below. */}
      <g fill={BASE} textAnchor="middle" fontFamily="Arial, sans-serif">
        <SvgComment x={x} y={y} comment={comment} />
        <text x={x} y={y - 23} fontSize="12" fill="#1c354b">{tag}</text>
      </g>
      <g
        fill="none"
        stroke={activeSymbol ? HOT : BASE}
        strokeWidth={activeSymbol ? ACTIVE_STROKE : SYMBOL_BASE_STROKE}
        strokeLinecap="square"
      >
        <path d={"M" + (x - curveEdge) + " " + (y - halfHeight) +
          "C" + (x - curveControl) + " " + (y - curveControlY) + " " +
          (x - curveControl) + " " + (y + curveControlY) + " " +
          (x - curveEdge) + " " + (y + halfHeight)} />
        <path d={"M" + (x + curveEdge) + " " + (y - halfHeight) +
          "C" + (x + curveControl) + " " + (y - curveControlY) + " " +
          (x + curveControl) + " " + (y + curveControlY) + " " +
          (x + curveEdge) + " " + (y + halfHeight)} />
      </g>
      <Wire x1={x - wireEnd} y1={y} x2={x - wireStart} y2={y} live={activeSymbol} />
      <Wire x1={x + wireStart} y1={y} x2={x + wireEnd} y2={y} live={activeSymbol} />
    </g>
  );
}

export function RungFrame({
  index, y, selected = false, live, children, onSelect, width = 712,
}: {
  index: number;
  y: number;
  selected?: boolean;
  live?: boolean;
  children: ReactNode;
  onSelect?: () => void;
  width?: number;
}) {
  const blockRow = index >= 3;
  const top = blockRow ? 70 : 47;
  // The first rung has a lower OR branch, so its selection gutter spans both paths.
  const bottom = blockRow ? 70 : index === 0 ? 143 : 40;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={"Seleccionar rung " + index}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <rect x="1" y={y - top} width={width} height={top + bottom} fill="transparent" />
      {selected && <rect x="1" y={y - top} width="48" height={top + bottom} fill="#087bd1" />}
      <text
        x="25"
        y={y + 4}
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="13"
        fill={selected ? "#fff" : "#7c8793"}
      >
        {index}
      </text>
      <Wire x1={60} y1={y} x2={100} y2={y} live={live} />
      {children}
    </g>
  );
}
