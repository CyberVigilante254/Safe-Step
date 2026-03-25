/**
 * crossing.js — CrossingWindow
 * ─────────────────────────────────────────────────────────────
 * Analyses a rolling history of VEH levels to determine:
 *   - Is a vehicle approaching or receding?
 *   - Is there a safe gap to cross right now?
 *   - How many seconds is that gap estimated to last?
 *
 * Replaces the binary SAFE / DANGER output with an actionable
 * crossing window countdown.
 */

import { CONFIG } from './config.js';
import { State }  from './state.js';

export const CrossingWindow = {
  _clearFrameCount: 0,
  _windowTimer:     null,

  /**
   * Call every frame with the current vehLevel.
   * Returns { windowOpen, windowSeconds, trajectory }
   * trajectory: 'approaching' | 'receding' | 'clear' | 'present'
   */
  update(vehLevel) {
    // Maintain rolling history
    State.vehHistory.push(vehLevel);
    if (State.vehHistory.length > CONFIG.WINDOW_HISTORY_FRAMES) {
      State.vehHistory.shift();
    }

    if (State.vehHistory.length < 10) {
      return { windowOpen: false, windowSeconds: 0, trajectory: 'clear' };
    }

    const trajectory = this._detectTrajectory();
    const isClear    = State.currentThreat === 0;

    if (isClear) {
      this._clearFrameCount++;
    } else {
      this._clearFrameCount = 0;
      State.windowOpen    = false;
      State.windowSeconds = 0;
    }

    // Window opens after sustained clear period
    if (this._clearFrameCount >= CONFIG.WINDOW_CLEAR_FRAMES && !State.windowOpen) {
      const estimated = this._estimateWindowSeconds();
      State.windowOpen    = true;
      State.windowSeconds = estimated;
      this._startCountdown(estimated);
    }

    return {
      windowOpen:    State.windowOpen,
      windowSeconds: State.windowCountdown,
      trajectory,
    };
  },

  /** Linear regression slope on recent history → trajectory */
  _detectTrajectory() {
    const h = State.vehHistory;
    const n = h.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX  += i;
      sumY  += h[i];
      sumXY += i * h[i];
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope >  CONFIG.WINDOW_APPROACH_SLOPE) return 'approaching';
    if (slope < -CONFIG.WINDOW_APPROACH_SLOPE) return 'receding';
    if (State.currentThreat > 0)               return 'present';
    return 'clear';
  },

  /**
   * Estimate how long the gap will last based on how
   * quickly the signal dropped and how stable it is now.
   * Rough heuristic: more stable drop → longer window.
   */
  _estimateWindowSeconds() {
    const recent  = State.vehHistory.slice(-15);
    const variance = this._variance(recent);
    // Low variance + dropped signal = stable gap
    const base     = CONFIG.WINDOW_MIN_SECONDS;
    const bonus    = Math.max(0, 8 - variance * 0.1);
    return Math.round(Math.min(base + bonus, 12));
  },

  _variance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
  },

  _startCountdown(seconds) {
    clearInterval(this._windowTimer);
    State.windowCountdown = seconds;

    this._windowTimer = setInterval(() => {
      State.windowCountdown--;
      if (State.windowCountdown <= 0) {
        clearInterval(this._windowTimer);
        State.windowOpen    = false;
        State.windowSeconds = 0;
      }
    }, 1000);
  },

  reset() {
    clearInterval(this._windowTimer);
    this._clearFrameCount = 0;
    State.windowOpen      = false;
    State.windowSeconds   = 0;
    State.windowCountdown = 0;
    State.vehHistory      = [];
  },

  /** Human-readable trajectory label */
  trajectoryLabel(t) {
    return {
      approaching: '▲ APPROACHING',
      receding:    '▼ PASSING',
      present:     '● PRESENT',
      clear:       '',
    }[t] || '';
  },
};
