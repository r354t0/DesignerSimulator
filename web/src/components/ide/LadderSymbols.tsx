import { getCoilVisualState } from "../../plc/ladderCoilVisual";
import type { ReactNode } from "react";
import { getInstructionSelectionFrame, LADDER_SELECTION_BLUE } from "../../plc/ladderSelection";

export type Instruction = "XIC" | "XIO" | "ONS" | "OTE" | "OTL" | "OTU" | "TON" | "TOF" | "RTO" | "RES" | "TONOFF" | "CTU" | "CTD" | "EQU" | "NEQ" | "LES" | "LEQ" | "GRT" | "GEQ" | "MOV" | "ADD" | "SUB" | "MUL" | "DIV";

export const INSTRUCTIONS: { id: Instruction; label: string }[] = [
  { id: "XIC", label: "Examine If Closed" },
  { id: "XIO", label: "Examine If Open" },
  { id: "ONS", label: "One Shot Rising Storage" },
  { id: "OTE", label: "Output Energize" },
  { id: "OTL", label: "Output Latch" },
  { id: "OTU", label: "Output Unlatch" },
  { id: "TON", label: "Timer On Delay" },
  { id: "TOF", label: "Timer Off Delay" },
  { id: "RTO", label: "Retentive Timer" },
  { id: "RES", label: "Reset Timer" },
  { id: "TONOFF", label: "Dual On/Off Delay (custom simulator block)" },
  { id: "CTU", label: "Count Up" },
  { id: "CTD", label: "Count Down" },
  { id: "EQU", label: "Equal" },
  { id: "NEQ", label: "Not Equal" },
  { id: "LES", label: "Less Than" },
  { id: "LEQ", label: "Less Than or Equal" },
  { id: "GRT", label: "Greater Than" },
  { id: "GEQ", label: "Greater Than or Equal" },
  { id: "MOV", label: "Move" },
  { id: "ADD", label: "Add" },
  { id: "SUB", label: "Subtract" },
  { id: "MUL", label: "Multiply" },
  { id: "DIV", label: "Divide" },
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

function wrapSvgComment(comment: string, maxWidth = COMMENT_WIDTH): string[] {
  const words = comment.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  // Break an exceptionally long word as well, so nothing escapes the column.
  for (const word of words) {
    if (approximateSvgTextWidth(word) <= maxWidth) {
      chunks.push(word);
      continue;
    }
    let chunk = "";
    for (const letter of Array.from(word)) {
      if (chunk && approximateSvgTextWidth(chunk + letter) > maxWidth) {
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
    if (current && approximateSvgTextWidth(candidate) > maxWidth) {
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
  while (last.length > 0 && approximateSvgTextWidth(last + "…") > maxWidth) {
    last = last.slice(0, -1);
  }
  visible[COMMENT_MAX_LINES - 1] = last.trimEnd() + "…";
  return visible;
}

function ellipsizeSvgLabel(text: string, maxWidth: number): string {
  if (approximateSvgTextWidth(text) <= maxWidth) return text;
  let label = text;
  while (label && approximateSvgTextWidth(label + "…") > maxWidth) label = label.slice(0, -1);
  return label + "…";
}

function SvgComment({ x, y, comment, maxWidth = COMMENT_WIDTH }: {
  x: number; y: number; comment?: string; maxWidth?: number;
}) {
  if (!comment?.trim()) return null;
  const lines = wrapSvgComment(comment, maxWidth);
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

/**
 * Studio-style selection belongs to the instruction (not its surrounding rung).
 * Only the operand's tag line is blue with white lettering; comment and symbol
 * stay legible on white within a narrow outline.
 */
function SelectedInstructionFrame({ x, y, comment, labelWidth = 96 }: {
  x: number; y: number; comment?: string; labelWidth?: number;
}) {
  const lineCount = comment?.trim() ? wrapSvgComment(comment, labelWidth).length : 0;
  const frame = getInstructionSelectionFrame(lineCount, labelWidth);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect
        x={x + frame.left} y={y + frame.top}
        width={frame.width} height={frame.height}
        fill="none" stroke={LADDER_SELECTION_BLUE} strokeWidth="1.5"
      />
      <rect
        x={x + frame.tagLeft} y={y + frame.tagTop}
        width={frame.tagWidth} height={frame.tagHeight}
        fill={LADDER_SELECTION_BLUE}
      />
    </g>
  );
}

// Compact editor prototype: halve the geometry, without shrinking the tag text.
// One value controls contacts and coils consistently.
export const SYMBOL_SCALE = 0.5;

export function ToolbarSymbol({ kind }: { kind: Instruction }) {
  const isContact = kind === "XIC" || kind === "XIO" || kind === "ONS";
  const isBlock = ["TON", "TOF", "RTO", "RES", "TONOFF", "CTU", "CTD", "EQU", "NEQ", "LES", "LEQ", "GRT", "GEQ", "MOV", "ADD", "SUB", "MUL", "DIV"].includes(kind);
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
      {(kind === "OTL" || kind === "OTU" || kind === "ONS" || isBlock) && (
        <text x="46" y="30" textAnchor="middle" fill="currentColor" fontSize={kind === "TONOFF" ? 8.5 : isBlock || kind === "ONS" ? 12 : 16} fontWeight="600" fontFamily="Arial, sans-serif">
          {isBlock ? kind : kind === "ONS" ? "ONS" : kind === "OTL" ? "L" : "U"}
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
  x, y, kind, tag, comment, value, online, powerIn, flowOut, labelWidth, selected = false,
}: {
  x: number; y: number; kind: "XIC" | "XIO" | "ONS"; tag: string; comment?: string; labelWidth?: number;
  value: boolean; online: boolean; powerIn: boolean; flowOut?: boolean; selected?: boolean;
}) {
  // Logix semantics: XIC = bit TRUE; XIO = bit FALSE.
  const condition = kind === "XIC" ? value : kind === "XIO" ? !value : Boolean(flowOut);
  const flow = kind === "ONS" ? Boolean(flowOut) : powerIn && condition;
  // A TRUE contact without upstream power is not an energized path.
  const activeSymbol = online && flow;
  const halfBarGap = 14 * SYMBOL_SCALE;
  const halfBarHeight = 15 * SYMBOL_SCALE;
  const leadLength = 30 * SYMBOL_SCALE;
  const terminalX = halfBarGap + leadLength;
  return (
    <g>
      {selected && <SelectedInstructionFrame x={x} y={y} comment={comment} labelWidth={labelWidth} />}
      {/* Tags and wrapped comments always stay above the instruction. No duplicate status text below. */}
      <g fill={BASE} textAnchor="middle" fontFamily="Arial, sans-serif">
        <SvgComment x={x} y={y} comment={comment} maxWidth={labelWidth} />
        <text x={x} y={y - 23} fontSize="12" fill={selected ? "#ffffff" : "#1c354b"}>
          <title>{tag}</title>
          {labelWidth ? ellipsizeSvgLabel(tag, labelWidth) : tag}
        </text>
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
        {kind === "ONS" && <path d={"M" + (x - halfBarGap) + " " + y +
          "h" + (2 * halfBarGap)} />}
      </g>
      {kind === "ONS" && <text x={x} y={y + 20} textAnchor="middle"
        fontSize="10" fontWeight="700" fill={activeSymbol ? HOT : BASE}>ONS</text>}
      <Wire x1={x - terminalX} y1={y} x2={x - halfBarGap} y2={y} live={online && powerIn} />
      <Wire x1={x + halfBarGap} y1={y} x2={x + terminalX} y2={y} live={online && flow} />
    </g>
  );
}

export function Coil({
  x, y, tag, comment, online, live, storedValue = false, labelWidth, selected = false, kind = "OTE",
}: {
x: number; y: number; tag: string; comment?: string; online: boolean; live: boolean; storedValue?: boolean; labelWidth?: number; selected?: boolean;
  kind?: "OTE" | "OTL" | "OTU";
}) {
  const { symbolLive: activeSymbol, conductorLive } = getCoilVisualState(kind, online, live, storedValue);
  const curveEdge = 14 * SYMBOL_SCALE;
  const curveControl = 26 * SYMBOL_SCALE;
  const halfHeight = 15 * SYMBOL_SCALE;
  const curveControlY = 5 * SYMBOL_SCALE;
  const wireStart = 22 * SYMBOL_SCALE;
  const wireEnd = 48 * SYMBOL_SCALE;
  return (
    <g>
      {selected && <SelectedInstructionFrame x={x} y={y} comment={comment} labelWidth={labelWidth} />}
      {/* Tags and wrapped comments always stay above the instruction. No duplicate status text below. */}
      <g fill={BASE} textAnchor="middle" fontFamily="Arial, sans-serif">
        <SvgComment x={x} y={y} comment={comment} maxWidth={labelWidth} />
        <text x={x} y={y - 23} fontSize="12" fill={selected ? "#ffffff" : "#1c354b"}>
          <title>{tag}</title>
          {labelWidth ? ellipsizeSvgLabel(tag, labelWidth) : tag}
        </text>
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
      {kind !== "OTE" && <text x={x} y={y + 4} textAnchor="middle"
        fontSize="12" fontWeight="700" fill={activeSymbol ? HOT : BASE}>
        {kind === "OTL" ? "L" : "U"}
      </text>}
      <Wire x1={x - wireEnd} y1={y} x2={x - wireStart} y2={y} live={conductorLive} />
      <Wire x1={x + wireStart} y1={y} x2={x + wireEnd} y2={y} live={conductorLive} />
    </g>
  );
}

/**
 * Shared Ladder rail primitives for both editable and monitor-only routines.
 * A continuous column can be rendered over an entire routine or one row.
 */
export function LadderRails({
  leftX, rightX, top, bottom, live = false,
}: {
  leftX: number; rightX: number; top: number; bottom: number; live?: boolean;
}) {
  return (
    <path
      d={"M" + leftX + " " + top + "V" + bottom +
        " M" + rightX + " " + top + "V" + bottom}
      fill="none"
      stroke={live ? HOT : "#bcc5ce"}
      strokeWidth={live ? 2.625 : 1.6}
    />
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
  // Keep full room for the OR branch while trimming the *bottom* of each rung.
  // Selection bands stop before the next rung, including in the compact block section.
  const top = blockRow ? 60 : 47;
  const bottom = blockRow ? 60 : index === 0 ? 101 : 37;
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


/** Compact Logix-like TIMER output block; PRE and ACC are milliseconds. */
export function TimerBlock({
  x, y, kind, tag, preset, presetLabel, accumulated, en, tt, dn, selected, online, live,
}: {
  x: number; y: number; kind: "TON" | "TOF" | "RTO" | "RES";
  tag: string; preset: number; presetLabel?: string; accumulated: number;
  en: boolean; tt: boolean; dn: boolean;
  selected?: boolean; online: boolean; live: boolean;
}) {
  const stroke = online && live ? HOT : BASE;
  return (
    <g>
      <rect x={x - 68} y={y - 27} width={136} height={68} rx={3}
        fill="#f9fafb" stroke={selected ? LADDER_SELECTION_BLUE : stroke}
        strokeWidth={selected ? 2 : 1.5}/>
      <text x={x - 58} y={y - 14} fontSize={11} fontWeight="700"
        fill="#1c354b">{kind}</text>
      <text x={x + 58} y={y - 14} textAnchor="end" fontSize={10}
        fill={selected ? LADDER_SELECTION_BLUE : "#34465a"}>
        {ellipsizeSvgLabel(tag, 84)}
      </text>
      <path d={`M${x-62} ${y-9}h124`} stroke="#cbd5e1" strokeWidth={1}/>
      <text x={x - 57} y={y + 3} fontSize={10} fill="#556372">PRE</text>
      <text x={x + 54} y={y + 3} textAnchor="end" fontSize={10}
        fontFamily="monospace" fill="#1c354b">{ellipsizeSvgLabel(presetLabel ?? String(preset), 92)}</text>
      <text x={x - 57} y={y + 17} fontSize={10} fill="#556372">ACC</text>
      <text x={x + 54} y={y + 17} textAnchor="end" fontSize={10}
        fontFamily="monospace" fill="#1c354b">{accumulated}</text>
      <text x={x} y={y + 34} textAnchor="middle" fontSize={9} fontWeight="600"
        fill="#64748b">
        <tspan fill={en ? HOT : "#64748b"}>EN {Number(en)}</tspan>
        <tspan dx={9} fill={tt ? HOT : "#64748b"}>TT {Number(tt)}</tspan>
        <tspan dx={9} fill={dn ? HOT : "#64748b"}>DN {Number(dn)}</tspan>
      </text>
      <title>{kind} · {tag} · PRE {preset}ms · ACC {accumulated}ms</title>
    </g>
  );
}


/** Compact counter output; PRE/ACC are signed pulse counts, not milliseconds. */
export function CounterBlock({
  x, y, kind, tag, preset, presetLabel, accumulated, cu, cd, dn, ov, un, selected, online, live,
}: {
  x: number; y: number; kind: "CTU" | "CTD" | "RES";
  tag: string; preset: number; presetLabel?: string; accumulated: number;
  cu: boolean; cd: boolean; dn: boolean; ov: boolean; un: boolean;
  selected?: boolean; online: boolean; live: boolean;
}) {
  const stroke = online && live ? HOT : BASE;
  return (
    <g>
      <rect x={x - 68} y={y - 27} width={136} height={68} rx={3}
        fill="#f9fafb" stroke={selected ? LADDER_SELECTION_BLUE : stroke}
        strokeWidth={selected ? 2 : 1.5} />
      <text x={x - 58} y={y - 14} fontSize={11} fontWeight="700"
        fill="#1c354b">{kind}</text>
      <text x={x + 58} y={y - 14} textAnchor="end" fontSize={10}
        fill={selected ? LADDER_SELECTION_BLUE : "#34465a"}>
        {ellipsizeSvgLabel(tag, 84)}
      </text>
      <path d={"M" + (x - 62) + " " + (y - 9) + "h124"}
        stroke="#cbd5e1" strokeWidth={1} />
      <text x={x - 57} y={y + 3} fontSize={10} fill="#556372">PRE</text>
      <text x={x + 54} y={y + 3} textAnchor="end" fontSize={10}
        fontFamily="monospace" fill="#1c354b">{ellipsizeSvgLabel(presetLabel ?? String(preset), 92)}</text>
      <text x={x - 57} y={y + 17} fontSize={10} fill="#556372">ACC</text>
      <text x={x + 54} y={y + 17} textAnchor="end" fontSize={10}
        fontFamily="monospace" fill="#1c354b">{accumulated}</text>
      <text x={x} y={y + 34} textAnchor="middle" fontSize={8.4} fontWeight="600"
        fill="#64748b">
        <tspan fill={cu ? HOT : "#64748b"}>CU {Number(cu)}</tspan>
        <tspan dx={4} fill={cd ? HOT : "#64748b"}>CD {Number(cd)}</tspan>
        <tspan dx={4} fill={dn ? HOT : "#64748b"}>DN {Number(dn)}</tspan>
        <tspan dx={4} fill={ov ? HOT : "#64748b"}>OV {Number(ov)}</tspan>
        <tspan dx={4} fill={un ? HOT : "#64748b"}>UN {Number(un)}</tspan>
      </text>
      <title>{kind} · {tag} · PRE {preset} pulsos · ACC {accumulated} pulsos</title>
    </g>
  );
}


/** Studio-inspired comparison contact with two editable numeric operands. */
export function ComparisonBlock({
  x, y, kind, sourceA, sourceB, condition = false, selected = false, online = false, live = false,
}: {
  x: number; y: number;
  kind: "EQU" | "NEQ" | "LES" | "LEQ" | "GRT" | "GEQ";
  sourceA: string; sourceB: string;
  condition?: boolean; selected?: boolean; online?: boolean; live?: boolean;
}) {
  const frame = selected ? LADDER_SELECTION_BLUE : online && live ? HOT : BASE;
  return (
    <g>
      <rect x={x - 41} y={y - 27} width={82} height={68} rx={3}
        fill="#f9fafb" stroke={frame} strokeWidth={selected ? 2 : 1.5}/>
      <text x={x - 33} y={y - 14} fontSize={11} fontWeight="700" fill="#1c354b">
        {kind}
      </text>
      <text x={x + 33} y={y - 14} textAnchor="end" fontSize={10}
        fontWeight="700" fill={online && condition ? HOT : "#64748b"}>
        {online ? Number(condition) : ""}
      </text>
      <path d={"M" + (x - 35) + " " + (y - 8) + "h70"} stroke="#cbd5e1" strokeWidth={1}/>
      <text x={x - 34} y={y + 5} fontSize={9} fill="#556372">A</text>
      <text x={x + 34} y={y + 5} fontSize={9} textAnchor="end"
        fontFamily="monospace" fill="#1c354b">
        {ellipsizeSvgLabel(sourceA, 58)}
      </text>
      <text x={x - 34} y={y + 20} fontSize={9} fill="#556372">B</text>
      <text x={x + 34} y={y + 20} fontSize={9} textAnchor="end"
        fontFamily="monospace" fill="#1c354b">
        {ellipsizeSvgLabel(sourceB, 58)}
      </text>
      <title>{kind}: A = {sourceA}, B = {sourceB}{online ? " · Resultado " + Number(condition) : ""}</title>
    </g>
  );
}


/** Numeric transfer/math output with editable operands and live state. */
export function MathOutputBlock({
  x, y, kind, sourceA, sourceB, destination, selected, online, live, valid,
}: {
  x: number; y: number; kind: "MOV" | "ADD" | "SUB" | "MUL" | "DIV";
  sourceA: string; sourceB: string; destination: string;
  selected?: boolean; online?: boolean; live?: boolean; valid?: boolean;
}) {
  const height = kind === "MOV" ? 73 : 88;
  const stroke = selected ? LADDER_SELECTION_BLUE : online && live ? HOT : BASE;
  return (
    <g>
      <rect x={x - 68} y={y - 27} width={136} height={height} rx={3}
        fill="#f9fafb" stroke={stroke} strokeWidth={selected ? 2 : 1.5}/>
      <text x={x - 58} y={y - 13} fontSize={11} fontWeight="700" fill="#1c354b">{kind}</text>
      <text x={x + 58} y={y - 13} textAnchor="end" fontSize={9} fontWeight="600"
        fill={online && live ? HOT : "#64748b"}>{online ? valid ? "OK" : "—" : ""}</text>
      <path d={"M" + (x - 62) + " " + (y - 8) + "h124"} stroke="#cbd5e1" strokeWidth={1}/>
      <text x={x - 58} y={y + 5} fontSize={9} fill="#556372">Source</text>
      <text x={x + 58} y={y + 5} textAnchor="end" fontFamily="monospace"
        fontSize={10} fill="#1c354b">{ellipsizeSvgLabel(sourceA, 79)}</text>
      {kind !== "MOV" && <>
        <text x={x - 58} y={y + 21} fontSize={9} fill="#556372">Source B</text>
        <text x={x + 58} y={y + 21} textAnchor="end" fontFamily="monospace"
          fontSize={10} fill="#1c354b">{ellipsizeSvgLabel(sourceB, 79)}</text>
      </>}
      <path d={"M" + (x - 62) + " " + (y + (kind === "MOV" ? 16 : 32)) + "h124"}
        stroke="#cbd5e1" strokeWidth={1}/>
      <text x={x - 58} y={y + (kind === "MOV" ? 32 : 48)}
        fontSize={9} fill="#556372">Dest</text>
      <text x={x + 58} y={y + (kind === "MOV" ? 32 : 48)}
        textAnchor="end" fontFamily="monospace" fontSize={10}
        fill={selected ? LADDER_SELECTION_BLUE : "#1c354b"}>
        {ellipsizeSvgLabel(destination, 83)}
      </text>
      <title>{kind} · A={sourceA}{kind === "MOV" ? "" : " · B=" + sourceB} · Dest={destination}</title>
    </g>
  );
}
