/**
 * detector.js — ThreatDetector
 * ─────────────────────────────────────────────────────────────
 * Calibrates the ambient baseline, then classifies vehicle threat
 * level using hold/release logic to prevent false positives.
 *
 * Threat levels:
 *   0 = SAFE
 *   1 = CAUTION  (vehicle audible, not immediate)
 *   2 = DANGER   (vehicle close / approaching fast)
 */

import { CONFIG } from './config.js';
import { State }  from './state.js';

export const ThreatDetector = {
  /** Non-destructive Nth-percentile of an array. */
  _percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(p * (sorted.length - 1))];
  },

  /**
   * Caution and danger thresholds derived from the current
   * baseline and the user's chosen sensitivity multiplier.
   */
  getThresholds() {
    const mult    = CONFIG.SENSITIVITY_MULTIPLIERS[State.sensitivityLevel - 1];
    const caution = State.baseline * mult;
    const danger  = State.baseline * mult * 1.9;
    return { caution, danger };
  },

  /**
   * Call once per animation frame while scanning.
   * Handles calibration first, then detection.
   * Returns the committed threat level (0 / 1 / 2).
   */
  update(vehLevel, onCalibrationProgress, onCalibrationDone, onThreatChange) {
    // ── CALIBRATION PHASE ──────────────────────────────────────
    if (!State.calibrated) {
      State.calSamples.push(vehLevel);

      const progress = Math.min(
        100,
        Math.round(State.calSamples.length / CONFIG.CAL_FRAMES * 100)
      );
      onCalibrationProgress(progress);

      if (State.calSamples.length >= CONFIG.CAL_FRAMES) {
        State.baseline   = this._percentile(State.calSamples, CONFIG.CAL_PERCENTILE);
        State.calibrated = true;
        onCalibrationDone(State.baseline);
      }

      return 0;
    }

    // ── DETECTION PHASE ────────────────────────────────────────
    const { caution, danger } = this.getThresholds();
    const rawSignal = vehLevel > danger  ? 2
                    : vehLevel > caution ? 1
                    :                      0;

    if (rawSignal > 0) {
      // Signal is elevated — count sustained frames
      State.releaseCounter = 0;

      if (rawSignal === State.rawThreat) {
        State.holdCounter++;
      } else {
        State.rawThreat   = rawSignal;
        State.holdCounter = 1;
      }

      const required = rawSignal === 2
        ? CONFIG.HOLD_FRAMES_DANGER
        : CONFIG.HOLD_FRAMES_CAUTION;

      if (State.holdCounter >= required && rawSignal !== State.currentThreat) {
        State.currentThreat = rawSignal;
        onThreatChange(rawSignal);
      }
    } else {
      // Signal is quiet — start release countdown
      State.holdCounter  = 0;
      State.rawThreat    = 0;
      State.releaseCounter++;

      if (State.releaseCounter >= CONFIG.RELEASE_FRAMES && State.currentThreat !== 0) {
        State.currentThreat = 0;
        onThreatChange(0);
      }
    }

    return State.currentThreat;
  },

  /** Expose thresholds for the debug panel. */
  debugInfo(vehLevel) {
    const { caution, danger } = this.getThresholds();
    return {
      baseline:  Math.round(State.baseline),
      veh:       Math.round(vehLevel),
      noise:     Math.round(vehLevel - State.baseline),
      caution:   Math.round(caution),
      danger:    Math.round(danger),
      hold:      State.holdCounter,
      holdMax:   State.rawThreat === 2 ? CONFIG.HOLD_FRAMES_DANGER : CONFIG.HOLD_FRAMES_CAUTION,
      frames:    State.frameCount,
    };
  },
};
