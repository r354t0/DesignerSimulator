import {
  DEMO_BLOCKS,
  type DemoBit,
  type DemoBlockKind,
  type DemoBlockState,
} from "../../plc/timerCounterDemo";

/** Static rung definitions; live status comes from the demo runtime. */
export const PREVIEW_BLOCKS = DEMO_BLOCKS;
export const PREVIEW_BLOCK_WIDTH = 198;
export const PREVIEW_BLOCK_HEIGHT = 114;

interface Props {
  kind: DemoBlockKind;
  tag: string;
  x: number;
  y: number;
  online: boolean;
  energized: boolean;
  state: DemoBlockState;
  bits: readonly DemoBit[];
}

export function LadderFunctionBlock({
  kind, tag, x, y, online, energized, state, bits,
}: Props) {
  const active = online && energized;
  const top = y - PREVIEW_BLOCK_HEIGHT / 2;
  const green = "#00c83a";
  const graphite = "#64748b";
  const values: ReadonlyArray<readonly [string, string]> = kind === "TONOFF"
    ? [["ON PRE", String(state.pre)], ["OFF PRE", String(state.offPre)], ["ACC", String(Math.round(state.acc))]]
    : [["PRE", String(state.pre)], ["ACC", String(Math.round(state.acc))]];
  const bitValues: Record<DemoBit, boolean> = {
    EN: state.en, TT: state.tt, DN: state.dn,
    CU: state.cu, CD: state.cd, OV: state.ov, UN: state.un,
  };

  return (
    <g aria-label={kind + " " + tag + " · valores de simulación"}>
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
            fill={online && bitValues[bit] ? green : "#d5dce3"}
          />
          <text x={x + 153} y={top + 52 + i * 19} fontSize="10.5" fill="#445566">
            {bit}
          </text>
        </g>
      ))}
      <text x={x + 9} y={top + 105} fontSize="8.5" fill="#8793a0">
        {kind === "CTU" || kind === "CTD" ? "Pulsos · demo" : "Milisegundos · demo"}
      </text>
    </g>
  );
}

