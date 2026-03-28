/**
 * state.js — Single shared mutable state object.
 */
export const State = {
  // ── Audio pipeline ────────────────────────────────────────────
  audioCtx:  null,
  analyser:  null,
  micStream: null,
  freqData:  null,

  // ── Scanning ──────────────────────────────────────────────────
  scanning:   false,
  frameCount: 0,

  // ── Sonar animation ───────────────────────────────────────────
  sweepAngle: 0,
  blips:      [],

  // ── Calibration ───────────────────────────────────────────────
  calibrated:  false,
  calSamples:  [],
  baseline:    0,

  // ── Threat detection ──────────────────────────────────────────
  currentThreat:  0,   // 0=safe  1=caution  2=danger
  rawThreat:      0,
  holdCounter:    0,
  releaseCounter: 0,

  // ── Classifier ────────────────────────────────────────────────
  vehicleClass:    'none',   // 'none'|'motorbike'|'car'|'matatu'|'electric'|'hoot'
  evWarning:       false,    // true when low-signature (EV) pattern detected

  // ── Crossing window ───────────────────────────────────────────
  vehHistory:      [],       // rolling array of recent vehLevel readings
  windowOpen:      false,    // true = gap detected, safe to cross
  windowSeconds:   0,        // estimated seconds available
  windowCountdown: 0,        // live countdown while crossing window is open

  // ── Geo ───────────────────────────────────────────────────────
  geoPosition:     null,     // { lat, lng, accuracy }
  geoClusterId:    null,     // key of the current road cluster in IndexedDB
  geoMemoryLoaded: false,    // true once we checked IndexedDB for this cluster

  // ── Map ───────────────────────────────────────────────────────
  mapVisible:      false,
  acousticTrace:   [],       // [{ lat, lng, threat, ts }] — current session path

  // ── Haptic ────────────────────────────────────────────────────
  lastHapticTime: 0,

  // ── User settings ─────────────────────────────────────────────
  sensitivityLevel: 3,

  // ── Data recording ────────────────────────────────────────────
  recording:    false,
  recordBuffer: [],

  // ── Demo / stage ──────────────────────────────────────────────
  demoMode: false,
};
