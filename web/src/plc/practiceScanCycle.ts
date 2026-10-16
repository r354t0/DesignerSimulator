import { getPracticeBuildSignature } from "./practiceBuild.ts";
import { setTagValue, type PracticeProject } from "./practiceDocument.ts";
import {
  evaluateSeriesScan, prescanBitInstructions, stopAfterSeriesLogicEdit, stopSeriesScan,
  type SeriesScan,
} from "./practiceRuntime.ts";

export type ScanMode = "stopped" | "running" | "paused";

/**
 * A single RUN control starts a new verified session from STOP, or resumes the
 * paused session without resetting scan counters or rebuilding unchanged logic.
 * RUN while already running is a no-op.
 */
export function getRunAction(mode: ScanMode): "build-and-start" | "resume" | "none" {
  return mode === "paused" ? "resume" :
    mode === "stopped" ? "build-and-start" : "none";
}
export const SCAN_PERIODS_MS = [50, 100, 250, 500] as const;
export type ScanPeriodMs = (typeof SCAN_PERIODS_MS)[number];

export interface PracticeScanState {
  project: PracticeProject;
  mode: ScanMode;
  scanPeriodMs: ScanPeriodMs;
  scanCount: number;
  lastScanDurationMs: number;
  maxScanDurationMs: number;
  /** The last completed evaluation; frozen during PAUSE. */
  frame: SeriesScan | null;
}

export function initialPracticeScanState(project: PracticeProject): PracticeScanState {
  return {
    project, mode: "stopped", scanPeriodMs: 100, scanCount: 0,
    lastScanDurationMs: 0, maxScanDurationMs: 0, frame: null,
  };
}

export function setScanPeriod(state: PracticeScanState, period: number): PracticeScanState {
  if (!SCAN_PERIODS_MS.some((allowed) => allowed === period)) {
    throw new Error("Período de scan no admitido. Selecciona 50, 100, 250 o 500 ms.");
  }
  return { ...state, scanPeriodMs: period as ScanPeriodMs };
}

/**
 * Execute exactly one complete Ladder pass. The period is a browser timer
 * target, not a real-time PLC guarantee. Timing measures JavaScript logic
 * evaluation only, NOT OS scheduling or React paint time.
 */
function performScan(state: PracticeScanState, elapsedMs: number): PracticeScanState {
  const begin = performance.now();
  const frame = evaluateSeriesScan(state.project, elapsedMs);
  const duration = Math.max(0, performance.now() - begin);
  return {
    ...state,
    project: frame.project,
    frame,
    scanCount: state.scanCount + 1,
    lastScanDurationMs: duration,
    maxScanDurationMs: Math.max(state.maxScanDurationMs, duration),
  };
}

/** Start a fresh session. The caller must run Build and verify success. */
export function startPracticeScans(state: PracticeScanState): PracticeScanState {
  return performScan({
    ...state,
    project: prescanBitInstructions(state.project),
    mode: "running",
    scanCount: 0,
    lastScanDurationMs: 0,
    maxScanDurationMs: 0,
    frame: null,
  }, 0);
}

/** Called by the periodic scheduler. No work occurs when PAUSED/STOPPED. */
export function tickPracticeScan(state: PracticeScanState): PracticeScanState {
  return state.mode === "running" ? performScan(state, state.scanPeriodMs) : state;
}

/**
 * UI momentary pushbuttons can be pressed and released in less than one
 * configurable scan interval (50–500 ms). A scheduled scan could miss such
 * a real user action entirely. Sample ONLY a new rising button input
 * immediately while in RUN; pass elapsedMs=0 so TON/TOF/RTO are not
 * accelerated by extra human actions. Releases remain instantaneous input
 * updates, and the periodic scan continues unaffected.
 *
 * STOP/PAUSE never execute unscheduled scans. Redundant pointer events
 * do not trigger extra samples.
 */
export function applyMomentaryBoolInput(
  state: PracticeScanState, tagName: string, pressed: boolean,
): PracticeScanState {
  const tag = state.project.tags.find((item) => item.name === tagName);
  if (!tag || tag.type !== "BOOL") {
    throw new Error("El pulsador requiere un tag BOOL existente: " + tagName);
  }
  if (tag.value === pressed) return state;
  const staged = changePracticeScanProject(
    state, setTagValue(state.project, tagName, pressed),
  );
  return pressed && staged.mode === "running" ? performScan(staged, 0) : staged;
}

/**
 * An optical sensor may see a short box-to-box gap between browser scans.
 * Apply both the falling (clear beam) and rising (new box) edges to the
 * Ladder immediately so CTU.CU returns to FALSE before the next count.
 * This is a discrete-event simulation scan with zero elapsed virtual time;
 * it must never accelerate TON/TOF/RTO or run while PAUSED/STOPPED.
 */
export function applySceneSensorBoolInput(
  state: PracticeScanState, tagName: string, detected: boolean,
): PracticeScanState {
  const tag = state.project.tags.find((item) => item.name === tagName);
  if (!tag || tag.type !== "BOOL") {
    throw new Error("El sensor requiere un tag BOOL existente: " + tagName);
  }
  if (tag.value === detected) return state;
  const updated = changePracticeScanProject(
    state, setTagValue(state.project, tagName, detected),
  );
  return updated.mode === "running" ? performScan(updated, 0) : updated;
}

export function pausePracticeScans(state: PracticeScanState): PracticeScanState {
  return state.mode === "running" ? { ...state, mode: "paused" } : state;
}

/** Resume an unchanged, previously Built session. */
export function resumePracticeScans(state: PracticeScanState): PracticeScanState {
  return state.mode === "paused" ? { ...state, mode: "running" } : state;
}

/** Executes exactly ONE pass and remains PAUSED. */
export function stepPracticeScan(state: PracticeScanState): PracticeScanState {
  return state.mode === "paused" ? performScan(state, state.scanPeriodMs) : state;
}

export function stopPracticeScans(state: PracticeScanState): PracticeScanState {
  return {
    ...state,
    mode: "stopped",
    project: stopSeriesScan(state.project),
    frame: null,
  };
}

/**
 * Input changes are staged until the next scan. In PAUSE this freezes all
 * OTE outputs and the visual power-flow snapshot until SCAN or RESUME.
 * Structural edits while running/paused stop and clear all old/new outputs.
 */
export function changePracticeScanProject(
  state: PracticeScanState, next: PracticeProject,
): PracticeScanState {
  const logicChanged =
    getPracticeBuildSignature(next) !== getPracticeBuildSignature(state.project);
  if (logicChanged && state.mode !== "stopped") {
    return {
      ...state, mode: "stopped", frame: null,
      project: stopAfterSeriesLogicEdit(state.project, next),
    };
  }
  return { ...state, project: next };
}
