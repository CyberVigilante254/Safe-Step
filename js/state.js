/**
 * state.js
 * ─────────────────────────────────────────────────────────────
 * Single shared mutable state object.
 * Import and mutate directly — no getters/setters needed at this scale.
 */

export const State = {
  // ── Audio pipeline ──────────────────────────────────────────
  audioCtx:  null,
  analyser:  null,
  micStream: null,
  freqData:  null,

  // ── Scanning ────────────────────────────────────────────────
  scanning:   false,
  frameCount: 0,

  // ── Sonar animation ─────────────────────────────────────────
  sweepAngle: 0,
  blips:      [],

  // ── Calibration ─────────────────────────────────────────────
  calibrated:  false,
  calSamples:  [],   // raw veh-band samples collected during calibration
  baseline:    0,    // 80th-percentile of calSamples

  // ── Threat detection ────────────────────────────────────────
  currentThreat:  0, // committed level shown in UI  (0 / 1 / 2)
  rawThreat:      0, // what the signal says right now
  holdCounter:    0, // frames current rawThreat has been sustained
  releaseCounter: 0, // frames since rawThreat dropped to safe

  // ── Haptic ──────────────────────────────────────────────────
  lastHapticTime: 0,

  // ── User settings ───────────────────────────────────────────
  sensitivityLevel: 3, // 1–5, maps into CONFIG.SENSITIVITY_MULTIPLIERS

  // ── Data collection (for training) ──────────────────────────
  recording:    false,
  recordBuffer: [],  // array of { timestamp, vehLevel, envLevel, threat }
};
