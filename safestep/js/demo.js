/**
 * demo.js — DemoMode
 * ─────────────────────────────────────────────────────────────
 * Stage safety net. Two features:
 *
 * 1. DEMO MODE — simulates a vehicle detection sequence so you
 *    can show the full CAUTION → DANGER → SAFE flow on stage
 *    without needing a real car. Triggered by a hidden long-press
 *    on the sonar canvas (3 seconds), or the demo button.
 *
 * 2. WAKE LOCK — prevents Android from sleeping / throttling
 *    the audio pipeline mid-demo.
 */

import { State }         from './state.js';
import { UI }            from './ui.js';
import { SonarRenderer } from './sonar.js';

export const DemoMode = {
  _wakeLock:   null,
  _demoTimer:  null,
  _isRunning:  false,

  // ── Wake Lock ──────────────────────────────────────────────────
  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired — screen will stay on');

      // Re-acquire if the page becomes visible again (e.g. after tab switch)
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && this._wakeLock === null) {
          await this.acquireWakeLock();
        }
      });
    } catch (err) {
      console.warn('[WakeLock] Not available:', err.message);
    }
  },

  releaseWakeLock() {
    this._wakeLock?.release();
    this._wakeLock = null;
  },

  // ── Demo sequence ──────────────────────────────────────────────
  /**
   * Runs a scripted detection sequence:
   *   0.0s  → scanning starts (skip calibration, use fake baseline)
   *   0.5s  → CAUTION  + haptic
   *   2.0s  → DANGER   + haptic + flash
   *   4.5s  → back to SAFE
   *
   * onStep(stepName) fires at each stage so the caller can log/display.
   */
  run(onStep) {
    if (this._isRunning) return;
    this._isRunning = true;

    // Inject a fake calibrated baseline so detection logic doesn't interfere
    State.calibrated   = true;
    State.baseline     = 30;
    State.currentThreat = 0;
    State.blips        = [];

    onStep?.('start');

    const steps = [
      { delay: 500,  threat: 1, sub: 'VEHICLE NEARBY',        step: 'caution' },
      { delay: 2000, threat: 2, sub: 'STOP — VEHICLE CLOSE',  step: 'danger'  },
      { delay: 4500, threat: 0, sub: 'CROSSING CLEAR',        step: 'safe'    },
    ];

    steps.forEach(({ delay, threat, sub, step }) => {
      const t = setTimeout(() => {
        State.currentThreat = threat;
        UI.setThreat(threat, sub);

        // Spray a burst of blips for visual drama
        const burst = threat === 2 ? 6 : 3;
        for (let i = 0; i < burst; i++) {
          setTimeout(() => SonarRenderer.spawnBlip(threat || 1), i * 80);
        }

        onStep?.(step);

        if (threat === 0) {
          this._isRunning = false;
          // Restore real scanning state if mic was active
          if (State.scanning) {
            State.calibrated = true; // keep calibrated flag
          }
        }
      }, delay);

      this._demoTimers = this._demoTimers || [];
      this._demoTimers.push(t);
    });
  },

  /** Cancel a running demo early */
  cancel() {
    (this._demoTimers || []).forEach(t => clearTimeout(t));
    this._demoTimers = [];
    this._isRunning  = false;
    State.currentThreat = 0;
    UI.setThreat(0, 'CROSSING CLEAR');
  },

  get isRunning() { return this._isRunning; },
};
