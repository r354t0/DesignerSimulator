import {
  SORT_EXIT_POSITION, SORT_EXIT_SENSOR_POSITION, SORT_GATE_POSITION,
  SORT_SCANNER_POSITION, type SortBoxType, type SortState,
} from "../../plc/sortSceneModel";

/**
 * Industrial process overview. Geometry is presentation-only:
 * box positions, routes, sensors and motor power always come from PLC physics.
 * The discharge coordinates align with the actual simulation exit (1.03),
 * so a box does not disappear in the middle of its conveyor branch.
 */
interface Props {
  state: SortState;
  motor: boolean;
  divert: boolean;
  detection: boolean;
}

const GATE_Y = 158;
const OUTPUT_A_Y = 85;
const OUTPUT_B_Y = 230;
const BRANCH_END_POSITION = 0.73;
const BRANCH_END_X = 480;
const DISCHARGE_X = 710;
const BELT_START_X = 78;

const xAt = (position: number) => position <= BRANCH_END_POSITION
  ? BELT_START_X + position * 550
  : BRANCH_END_X +
      (position - BRANCH_END_POSITION) /
        (SORT_EXIT_POSITION - BRANCH_END_POSITION) * (DISCHARGE_X - BRANCH_END_X);

function BoxOnBelt({ kind, id, x, y }: {
  kind: SortBoxType; id: number; x: number; y: number;
}) {
  const color = kind === "A" ? "#357e9f" : "#be8742";
  const edge = kind === "A" ? "#8ce1fa" : "#ffdb8c";
  return (
    <g transform={"translate(" + x + " " + y + ")"}>
      <rect x="-19" y="-18" width="38" height="36" rx="3"
        fill="#080f18" opacity=".55" transform="translate(2 3)"/>
      <rect x="-19" y="-19" width="38" height="36" rx="2"
        fill={color} stroke={edge} strokeWidth="1.5"/>
      <path d="M-18 -10 H18 M-6 -18 V17" stroke="#ffffff"
        strokeOpacity=".19" strokeWidth="1.2"/>
      <rect x="-14" y="-13" width="28" height="15" rx="2" fill="#061927"
        fillOpacity=".8"/>
      <text x="0" y="-2" fill={edge} fontSize="12" fontWeight="700"
        fontFamily="Arial, sans-serif" textAnchor="middle">{kind}</text>
      <text x="0" y="12" fill="#f8fafc" fontSize="9" fontFamily="monospace"
        textAnchor="middle">#{id}</text>
    </g>
  );
}

function Photoeye({ x, y, name, active }: {
  x: number; y: number; name: string; active: boolean;
}) {
  const color = active ? "#fbbf24" : "#38bdf8";
  return (
    <g transform={"translate(" + x + " " + y + ")"}>
      <rect x="-9" y="-38" width="18" height="14" rx="3"
        fill="#142d40" stroke={color} strokeWidth="1.7"/>
      <circle cx="0" cy="-31" r="3" fill={color}/>
      <path d="M0 -22 V24" stroke={color} strokeWidth="1.7"
        strokeDasharray="4 4" opacity={active ? 1 : .48}/>
      <text x="14" y="-29" fontSize="10" fontWeight="600"
        fill="#c9d9e7" fontFamily="Arial, sans-serif">{name}</text>
    </g>
  );
}

export function SortProcessGraphic({ state, motor, divert, detection }: Props) {
  const gateX = xAt(SORT_GATE_POSITION);
  const scanX = xAt(SORT_SCANNER_POSITION);
  const exitSensorX = xAt(SORT_EXIT_SENSOR_POSITION);
  const upper = "M78 158 H" + gateX + " L" + BRANCH_END_X + " " + OUTPUT_A_Y +
    " H" + DISCHARGE_X;
  const lower = "M" + gateX + " " + GATE_Y + " L" + BRANCH_END_X +
    " " + OUTPUT_B_Y + " H" + DISCHARGE_X;

  return (
    <div role="img" aria-label={"Clasificador industrial: " + state.items.length +
      " cajas en tránsito; motor " + (motor ? "encendido" : "detenido") +
      "; desviador hacia " + (divert ? "B" : "A") +
      "; salida A " + state.exitA + ", salida B " + state.exitB}
      className="sort-process-canvas overflow-x-auto rounded-lg border border-[#31495b]">
      <svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg"
        className="block h-auto w-full min-w-[600px]" aria-hidden="true">
        <defs>
          <pattern id="sort-floor-grid" width="24" height="24"
            patternUnits="userSpaceOnUse">
            <path d="M24 0 H0 V24" stroke="#355064" strokeWidth=".7"
              fill="none" opacity=".27"/>
          </pattern>
          <linearGradient id="sort-steel" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7790a2"/>
            <stop offset="45%" stopColor="#536c7e"/>
            <stop offset="100%" stopColor="#364d60"/>
          </linearGradient>
          <linearGradient id="sort-belt" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#334b5c"/>
            <stop offset="100%" stopColor="#192c3c"/>
          </linearGradient>
        </defs>
        <rect width="760" height="320" fill="#101f2c"/>
        <rect width="760" height="320" fill="url(#sort-floor-grid)"/>
        <g fontFamily="Arial, sans-serif">
          <text x="25" y="25" fill="#64859c" fontSize="10"
            letterSpacing="1.8">TRANSPORTE Y DESVÍO · DV-01</text>
          <g fill="#152c3b" stroke="#476273" strokeWidth="1.3">
            <rect x="15" y="130" width="80" height="26" rx="4"/>
            <rect x="626" y="29" width="114" height="24" rx="4"/>
            <rect x="626" y="267" width="114" height="24" rx="4"/>
          </g>
          <g fill="#c9dae6" fontSize="11" fontWeight="700">
            <text x="55" y="147" textAnchor="middle">ENTRADA</text>
            <text x="683" y="45" textAnchor="middle">SALIDA A</text>
            <text x="683" y="283" textAnchor="middle">SALIDA B</text>
          </g>
        </g>

        {/* Outer galvanized steel profile and running rubber belts. */}
        {[upper, lower].map((path, i) => (
          <g key={i}>
            <path d={path} fill="none" stroke="#081721" strokeWidth="66"
              strokeLinejoin="round" strokeLinecap="round"/>
            <path d={path} fill="none" stroke="url(#sort-steel)" strokeWidth="60"
              strokeLinejoin="round" strokeLinecap="round"/>
            <path d={path} fill="none" stroke="url(#sort-belt)" strokeWidth="48"
              strokeLinejoin="round" strokeLinecap="round"/>
            <path d={path} fill="none" stroke="#678394" strokeWidth="1.5"
              strokeDasharray="5 9" opacity=".6"
              className="conveyor-belt-motion"
              style={{ animationPlayState: motor ? "running" : "paused" }}/>
            <path d={path} fill="none" stroke="#819aa9" strokeWidth="2"
              strokeDasharray="16 20" opacity=".8"
              className="conveyor-belt-motion"
              style={{ animationPlayState: motor ? "running" : "paused" }}/>
          </g>
        ))}

        {/* Discharge rail ends and stationary guarding. */}
        {[OUTPUT_A_Y, OUTPUT_B_Y].map((y, i) => (
          <g key={i}>
            <path d={"M683 " + (y-27) + " H714 V" + (y+27) + " H683"}
              fill="none" stroke="#8ea6b5" strokeWidth="3" opacity=".75"/>
            <rect x="720" y={y-19} width="7" height="38" rx="2"
              fill="#344e60" stroke="#7692a4"/>
          </g>
        ))}
        {/* Drive motor and drive pulley are physically mounted on the left. */}
        <path d="M91 192 L98 239 M103 192 L110 239" stroke="#b2c0c9"
          strokeWidth="2.3"/>
        <rect x="60" y="236" width="84" height="42" rx="8"
          fill={motor ? "#20544e" : "#344e61"}
          stroke={motor ? "#34d399" : "#849dad"} strokeWidth="2.5"/>
        <g className="conveyor-motor-spin"
          style={{ transformOrigin: "103px 257px",
            animationPlayState: motor ? "running" : "paused" }}>
          <circle cx="103" cy="257" r="15" fill="#132a38" stroke="#b3c4ce"
            strokeWidth="2"/>
          <path d="M91 257 H115 M103 245 V269 M95 249 L111 265 M111 249 L95 265"
            fill="none" stroke="#8cbbca" strokeWidth="2.1"/>
        </g>
        <text x="102" y="295" textAnchor="middle" fontSize="10"
          fontFamily="Arial, sans-serif"
          fill={motor ? "#6ee7b7" : "#9db3c2"}>M-01</text>

        {/* Type detection station and actuator. */}
        <g transform={"translate(" + scanX + " " + GATE_Y + ")"}>
          <rect x="-9" y="-40" width="18" height="15" rx="3"
            fill="#193b50" stroke={detection ? "#fbbf24" : "#38bdf8"}
            strokeWidth="1.7"/>
          <circle cx="0" cy="-32" r="3" fill={detection ? "#fbbf24" : "#38bdf8"}/>
          <path d="M0 -24 V24" stroke={detection ? "#fbbf24" : "#38bdf8"}
            strokeDasharray="4 4" strokeWidth="1.8" opacity=".85"/>
          <text x="-15" y="-48" fontSize="10" fill="#bad2e1"
            fontFamily="Arial, sans-serif">ID-B</text>
        </g>
        <g transform={"translate(" + gateX + " " + GATE_Y + ")"}>
          <circle r="22" fill="#102330" stroke="#a2b5c4" strokeWidth="2.5"/>
          <circle r="15" fill="#2d4557" stroke="#546f80" strokeWidth="1"/>
          <path d={divert ? "M-10 0 L15 16" : "M-10 0 L15 -16"}
            stroke={divert ? "#fbbf24" : "#34d399"} strokeWidth="6"
            strokeLinecap="round" fill="none"/>
          <circle r="4" fill="#e2e8f0"/>
          <rect x="-27" y="35" width="54" height="20" rx="3" fill="#142d3f"
            stroke="#4b697d"/>
          <text y="49" fill="#d6e5ef" fontSize="10" textAnchor="middle"
            fontFamily="Arial, sans-serif">DV-01</text>
        </g>
        <Photoeye x={exitSensorX} y={OUTPUT_A_Y} name="PE-A"
          active={state.sensorExitA}/>
        <Photoeye x={exitSensorX} y={OUTPUT_B_Y} name="PE-B"
          active={state.sensorExitB}/>

        {/* Box physics and route assignment are sourced solely from SortState. */}
        {state.items.map(item => {
          const progress = item.route === undefined ? 0
            : Math.max(0, Math.min(1,
              (item.position - SORT_GATE_POSITION) /
                (BRANCH_END_POSITION - SORT_GATE_POSITION)));
          const y = GATE_Y +
            (item.route === "B" ? OUTPUT_B_Y - GATE_Y : OUTPUT_A_Y - GATE_Y) * progress;
          return (
            <BoxOnBelt key={item.id} id={item.id} kind={item.kind}
              x={xAt(item.position)} y={y}/>
          );
        })}
        <g fontFamily="Arial, sans-serif" fontSize="10" letterSpacing=".5">
          <circle cx="672" cy="304" r="4" fill={motor ? "#34d399" : "#64748b"}/>
          <text x="683" y="308" fill="#b6cbd9">
            MOTOR {motor ? "RUN" : "OFF"}
          </text>
        </g>
      </svg>
    </div>
  );
}
