/**
 * config.js
 * ─────────────────────────────────────────────────────────────
 * All tunable parameters in one place.
 * Tweak these during field testing — nothing else needs to change.
 */

export const CONFIG = {
  // ── Audio pipeline ──────────────────────────────────────────
  FFT_SIZE:    2048,
  SMOOTHING:   0.78,   // analyser smoothing  (0 = raw, 1 = frozen)
  SAMPLE_RATE: 44100,

  // ── Vehicle frequency band (Hz) ─────────────────────────────
  // Covers motorbike / car / matatu engine fundamentals
  VEH_BAND_LO: 60,
  VEH_BAND_HI: 520,

  // ── Calibration ─────────────────────────────────────────────
  CAL_FRAMES:     150,   // ~2.5 s at 60 fps
  CAL_PERCENTILE: 0.80,  // use 80th-pct so one loud event won't skew baseline

  // ── Sensitivity presets ─────────────────────────────────────
  // Index 0 = level 1 (least sensitive) … Index 4 = level 5 (most sensitive)
  // Value = multiplier on top of baseline; lower → triggers earlier
  SENSITIVITY_MULTIPLIERS: [3.2, 2.6, 2.0, 1.55, 1.2],

  // ── Detection debounce ──────────────────────────────────────
  // Threat must persist for N consecutive frames before committing to UI
  HOLD_FRAMES_CAUTION: 6,
  HOLD_FRAMES_DANGER:  4,

  // After signal drops to SAFE, hold the warning for N frames (hysteresis)
  RELEASE_FRAMES: 20,

  // ── Haptic cooldowns (ms) ───────────────────────────────────
  HAPTIC_COOLDOWN_CAUTION: 1100,
  HAPTIC_COOLDOWN_DANGER:   320,

  // ── Sonar animation ─────────────────────────────────────────
  SWEEP_SPEED_IDLE:   0.006,
  SWEEP_SPEED_ACTIVE: 0.036,
};
