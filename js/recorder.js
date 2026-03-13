/**
 * recorder.js — DataRecorder
 * ─────────────────────────────────────────────────────────────
 * Captures labelled audio feature frames for future ML training.
 *
 * Each frame saves:
 *   timestamp  — ms since recording started
 *   vehLevel   — vehicle-band average (0–255)
 *   envLevel   — overall average (0–255)
 *   threat     — committed threat level at time of capture (0/1/2)
 *   label      — human label set via labelAs() ('' | 'clear' | 'vehicle' | 'danger')
 *
 * Download produces a JSON file ready for preprocessing.
 */

import { State } from './state.js';

export const DataRecorder = {
  _startTime: 0,
  _label:     'unlabelled',

  start() {
    State.recording    = true;
    State.recordBuffer = [];
    this._startTime    = Date.now();
    console.log('[DataRecorder] Recording started');
  },

  stop() {
    State.recording = false;
    console.log(`[DataRecorder] Stopped. ${State.recordBuffer.length} frames captured.`);
  },

  /** Call this to tag subsequent frames (e.g. user presses a label button). */
  labelAs(label) {
    this._label = label;
  },

  /** Called every frame while recording is active. */
  captureFrame(vehLevel, envLevel) {
    if (!State.recording) return;
    State.recordBuffer.push({
      timestamp: Date.now() - this._startTime,
      vehLevel:  Math.round(vehLevel),
      envLevel:  Math.round(envLevel),
      threat:    State.currentThreat,
      label:     this._label,
    });
  },

  /** Trigger a JSON download of all captured frames. */
  download() {
    if (State.recordBuffer.length === 0) {
      alert('No data recorded yet.');
      return;
    }

    const payload = {
      meta: {
        recordedAt:    new Date().toISOString(),
        frames:        State.recordBuffer.length,
        durationMs:    State.recordBuffer.at(-1)?.timestamp ?? 0,
        sensitivityLevel: State.sensitivityLevel,
        baseline:      State.baseline,
      },
      frames: State.recordBuffer,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `safestep-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`[DataRecorder] Downloaded ${State.recordBuffer.length} frames.`);
  },
};
