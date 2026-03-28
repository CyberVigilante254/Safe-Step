/**
 * audio.js — AudioEngine
 * ─────────────────────────────────────────────────────────────
 * Owns the mic pipeline: getUserMedia → AnalyserNode.
 * Exposes helpers to read frequency-domain data.
 */

import { CONFIG } from './config.js';
import { State }  from './state.js';

export const AudioEngine = {
  /**
   * Request mic access and wire up the analyser.
   * Returns true on success, false if permission denied.
   */
  async start() {
    try {
      State.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // we want raw engine sound, not cleaned speech
          noiseSuppression: false,
          autoGainControl:  false,
        },
      });
    } catch {
      return false;
    }

    State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    State.analyser = State.audioCtx.createAnalyser();
    State.analyser.fftSize               = CONFIG.FFT_SIZE;
    State.analyser.smoothingTimeConstant = CONFIG.SMOOTHING;

    State.audioCtx
      .createMediaStreamSource(State.micStream)
      .connect(State.analyser);

    State.freqData = new Uint8Array(State.analyser.frequencyBinCount);
    return true;
  },

  /** Tear down the pipeline cleanly. */
  stop() {
    State.micStream?.getTracks().forEach(t => t.stop());
    State.audioCtx?.close();
    State.audioCtx  = null;
    State.analyser  = null;
    State.micStream = null;
    State.freqData  = null;
  },

  /** Convert a frequency in Hz to the nearest FFT bin index. */
  hzToIndex(hz) {
    return Math.round(hz / (CONFIG.SAMPLE_RATE / CONFIG.FFT_SIZE));
  },

  /**
   * Average magnitude in the vehicle detection band (0–255 scale).
   * This is the primary signal for threat detection.
   */
  getVehicleBandLevel() {
    const lo  = this.hzToIndex(CONFIG.VEH_BAND_LO);
    const hi  = this.hzToIndex(CONFIG.VEH_BAND_HI);
    let   sum = 0;
    for (let i = lo; i <= hi; i++) sum += State.freqData[i];
    return sum / (hi - lo);
  },

  /** Average magnitude across the full spectrum — used for the ENV meter. */
  getOverallLevel() {
    let sum = 0;
    for (let i = 0; i < State.freqData.length; i++) sum += State.freqData[i];
    return sum / State.freqData.length;
  },
};
