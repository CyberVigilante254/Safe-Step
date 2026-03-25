/**
 * config.js — All tunable parameters in one place.
 */
export const CONFIG = {
  // ── Audio pipeline ────────────────────────────────────────────
  FFT_SIZE:    2048,
  SMOOTHING:   0.78,
  SAMPLE_RATE: 44100,

  // ── Vehicle frequency bands (Hz) ─────────────────────────────
  VEH_BAND_LO:      60,    // engine fundamentals: motorbike/car/matatu
  VEH_BAND_HI:      520,
  TYRE_BAND_LO:     800,   // tyre/road noise: electric vehicles, fast cars
  TYRE_BAND_HI:     2200,
  HOOT_BAND_LO:     350,   // hooting / horn signatures
  HOOT_BAND_HI:     900,

  // ── Calibration ──────────────────────────────────────────────
  CAL_FRAMES:     150,    // ~2.5s at 60fps — skipped if geo baseline exists
  CAL_PERCENTILE: 0.80,

  // ── Sensitivity presets ───────────────────────────────────────
  SENSITIVITY_MULTIPLIERS: [3.2, 2.6, 2.0, 1.55, 1.2],

  // ── Detection debounce ────────────────────────────────────────
  HOLD_FRAMES_CAUTION: 6,
  HOLD_FRAMES_DANGER:  4,
  RELEASE_FRAMES:      20,

  // ── Crossing window ───────────────────────────────────────────
  WINDOW_HISTORY_FRAMES: 45,   // frames of VEH level history to analyse
  WINDOW_APPROACH_SLOPE: 0.8,  // rising slope threshold → approaching
  WINDOW_CLEAR_FRAMES:   30,   // consecutive quiet frames → window opens
  WINDOW_MIN_SECONDS:    4,    // minimum crossing window offered

  // ── Electric vehicle detection ────────────────────────────────
  EV_TYRE_THRESHOLD:  0.6,    // tyre band rise without engine band → EV flag
  EV_CONFIDENCE_WARN: true,   // show "LOW SIGNATURE" warning for EVs

  // ── Haptic ────────────────────────────────────────────────────
  HAPTIC_COOLDOWN_CAUTION: 1100,
  HAPTIC_COOLDOWN_DANGER:   320,

  // ── Sonar animation ───────────────────────────────────────────
  SWEEP_SPEED_IDLE:   0.006,
  SWEEP_SPEED_ACTIVE: 0.036,

  // ── Geo memory ────────────────────────────────────────────────
  GEO_CLUSTER_RADIUS_M:  60,   // GPS points within 60m = same road cluster
  GEO_BASELINE_WEIGHT:   0.15, // how much each new visit updates the stored baseline
  GEO_MIN_VISITS_TRUST:  3,    // visits before we trust the stored baseline
  GEO_WATCH_INTERVAL_MS: 5000, // GPS poll interval

  // ── Azure sync ────────────────────────────────────────────────
  // Point this at your Azure Function URL — never put Cosmos keys in client JS
  AZURE_FUNCTION_URL: '',      // e.g. 'https://safestep.azurewebsites.net/api/sync'
  AZURE_SYNC_INTERVAL_MS: 30000, // sync every 30s when online
};
