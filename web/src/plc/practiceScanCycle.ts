import { getPracticeBuildSignature } from "./practiceBuild.ts";
import { type PracticeProject } from "./practiceDocument.ts";
import {
  evaluateSeriesScan, stopAfterSeriesLogicEdit, stopSeriesScan,
  type SeriesScan,
} from "./practiceRuntime.ts";

export type ScanMode = "stopped" | "running" | "paused";
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
function performScan(state: PracticeScanState): PracticeScanState {
  const begin = performance.now();
  const frame = evaluateSeriesScan(state.project);
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
    mode: "running",
    scanCount: 0,
    lastScanDurationMs: 0,
    maxScanDurationMs: 0,
    frame: null,
  });
}

/** Called by the periodic scheduler. No work occurs when PAUSED/STOPPED. */
export function tickPracticeScan(state: PracticeScanState): PracticeScanState {
  return state.mode === "running" ? performScan(state) : state;
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
  return state.mode === "paused" ? performScan(state) : state;
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
