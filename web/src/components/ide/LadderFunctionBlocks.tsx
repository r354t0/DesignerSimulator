import { Wire } from "./LadderSymbols";

/**
 * Studio-inspired VISUAL preview. Values are examples only: no timer clock or
 * edge-triggered counter is implemented yet. TONOFF is a custom instruction.
 */
export type PreviewBlockKind = "TON" | "TOF" | "TONOFF" | "CTU" | "CTD";

export const PREVIEW_BLOCKS: {
  kind: PreviewBlockKind;
  tag: string;
  contact: string;
  description: string;
  values: ReadonlyArray<readonly [string, string]>;
  bits: ReadonlyArray<string>;
}[] = [
  {
    kind: "TON",
    tag: "TMR_StartDelay",
    contact: "Start_PB",
    description: "Retardo a la conexión",
    values: [["PRE", "5000"], ["ACC", "2300"]],
    bits: ["EN", "TT", "DN"],
  },
  {
    kind: "TOF",
    tag: "TMR_StopDelay",
    contact: "Motor_Run",
    description: "Retardo a la desconexión",
    values: [["PRE", "2500"], ["ACC", "1100"]],
    bits: ["EN", "TT", "DN"],
  },
  {
    kind: "TONOFF",
    tag: "TMR_DualDelay",
    contact: "Auto_Mode",
    description: "Retardo ON/OFF · bloque personalizado",
    values: [["ON PRE", "1800"], ["OFF PRE", "2200"], ["ACC", "800"]],
    bits: ["EN", "TT", "DN"],
  },
  {
    kind: "CTU",
    tag: "CNT_BoxesUp",
    contact: "Start_PB",
    description: "Contador ascendente",
    values: [["PRE", "10"], ["ACC", "4"]],
    bits: ["CU", "DN", "OV"],
  },
  {
    kind: "CTD",
    tag: "CNT_BoxesDown",
    contact: "Stop_PB",
    description: "Contador descendente",
    values: [["PRE", "8"], ["ACC", "2"]],
    bits: ["CD", "DN", "UN"],
  },
];

export const PREVIEW_BLOCK_WIDTH = 198;
export const PREVIEW_BLOCK_HEIGHT = 114;

interface Props {
  kind: PreviewBlockKind;
  tag: string;
  x: number;
  y: number;
  online: boolean;
  energized: boolean;
  values: ReadonlyArray<readonly [string, string]>;
  bits: ReadonlyArray<string>;
}

export function LadderFunctionBlock({
  kind, tag, x, y, online, energized, values, bits,
}: Props) {
  const active = online && energized;
  const top = y - PREVIEW_BLOCK_HEIGHT / 2;
  const green = "#00c83a";
  const graphite = "#64748b";

  return (
    <g aria-label={kind + " " + tag + " · representación visual"}>
      <rect
        x={x}
        y={top}
        width={PREVIEW_BLOCK_WIDTH}
        height={PREVIEW_BLOCK_HEIGHT}
        fill="#ffffff"
        stroke={active ? green : graphite}
        strokeWidth={active ? 2.5 : 1.4}
      />
      <rect
        x={x + 1}
        y={top + 1}
        width={PREVIEW_BLOCK_WIDTH - 2}
        height="29"
        fill={active ? "#effbf1" : "#f2f5f8"}
      />
      <path
        d={"M" + x + " " + (top + 30) + "H" + (x + PREVIEW_BLOCK_WIDTH)}
        fill="none"
        stroke={active ? "#b4e9c0" : "#d7dce3"}
        strokeWidth="1"
      />
      <text x={x + 9} y={top + 19} fontSize="12" fontWeight="700" fill="#172a3d" fontFamily="Arial, sans-serif">
        {kind}
      </text>
      {kind === "TONOFF" && (
        <text x={x + 9} y={top + 43} fontSize="8.5" fontWeight="600" fill="#a26815">
          CUSTOM
        </text>
      )}
      <text
        x={x + (kind === "TONOFF" ? 66 : 48)}
        y={top + 19}
        textAnchor="start"
        fontSize={kind === "TONOFF" ? "10.8" : "11.5"}
        fontFamily="Arial, sans-serif"
        fill="#1c354b"
      >
        {tag}
      </text>

      {values.map(([label, value], i) => (
        <g key={label} fontSize="10.7" fontFamily="Arial, sans-serif">
          <text x={x + 9} y={top + 54 + i * 18} fill="#596778">{label}</text>
          <text x={x + 111} y={top + 54 + i * 18} textAnchor="end" fontFamily="Consolas, monospace" fill="#172a3d">
            {value}
          </text>
        </g>
      ))}

      <path
        d={"M" + (x + 124) + " " + (top + 35) + "V" + (top + PREVIEW_BLOCK_HEIGHT - 7)}
        stroke="#e0e5eb"
      />
      {bits.map((bit, i) => (
        <g key={bit} fontFamily="Arial, sans-serif">
          <circle
            cx={x + 142}
            cy={top + 48 + i * 19}
            r="3.7"
            fill={active && i === 0 ? green : "#d5dce3"}
          />
          <text x={x + 153} y={top + 52 + i * 19} fontSize="10.5" fill="#445566">
            {bit}
          </text>
        </g>
      ))}
      {/* Status lamps are intentionally illustrative; ACC and DN are not calculated yet. */}
      <text x={x + 9} y={top + 105} fontSize="8.5" fill="#8793a0">
        Valores de muestra
      </text>
    </g>
  );
}

export function PreviewBlockRung({
  kind, tag, contact, values, bits, x, y, rightRailX, inputValue, online,
}: {
  kind: PreviewBlockKind;
  tag: string;
  contact: string;
  values: ReadonlyArray<readonly [string, string]>;
  bits: ReadonlyArray<string>;
  x: number;
  y: number;
  rightRailX: number;
  inputValue: boolean;
  online: boolean;
}) {
  // Left lead must stop at the block boundary; no line crosses the block.
  return (
    <>
      <Wire x1={182} y1={y} x2={x} y2={y} live={online && inputValue} />
      <LadderFunctionBlock
        kind={kind}
        tag={tag}
        x={x}
        y={y}
        online={online}
        energized={inputValue}
        values={values}
        bits={bits}
      />
      <Wire
        x1={x + PREVIEW_BLOCK_WIDTH}
        y1={y}
        x2={rightRailX}
        y2={y}
        live={online && inputValue}
      />
    </>
  );
}
