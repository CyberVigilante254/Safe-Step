/**
 * classifier.js — VehicleClassifier
 * ─────────────────────────────────────────────────────────────
 * Classifies the type of vehicle from the current FFT frame.
 *
 * Currently uses hand-tuned frequency-band heuristics.
 * Designed as a swappable backend — replace _runHeuristic()
 * with _runNeuralNet() once the TFLite / Azure model is ready.
 *
 * Classes:
 *   none       — background / no vehicle
 *   motorbike  — strong 80–200Hz fundamental, fast attack
 *   car        — moderate 60–300Hz, sustained
 *   matatu     — high 60–400Hz + hoot band activity
 *   electric   — tyre band elevated, engine band quiet (low-confidence)
 *   hoot       — horn/hooting signature (350–900Hz spike)
 */

import { CONFIG }      from './config.js';
import { AudioEngine } from './audio.js';
import { State }       from './state.js';

export const VehicleClassifier = {
  // ── Public API ────────────────────────────────────────────────

  /**
   * Run classification on the current freqData frame.
   * Returns { vehicleClass, evWarning, confidence }
   */
  classify(freqData) {
    const engine = this._bandAvg(freqData, CONFIG.VEH_BAND_LO,  CONFIG.VEH_BAND_HI);
    const tyre   = this._bandAvg(freqData, CONFIG.TYRE_BAND_LO, CONFIG.TYRE_BAND_HI);
    const hoot   = this._bandAvg(freqData, CONFIG.HOOT_BAND_LO, CONFIG.HOOT_BAND_HI);
    const moto   = this._bandAvg(freqData, 80, 220);  // motorbike sweet spot

    return this._runHeuristic({ engine, tyre, hoot, moto });
  },

  // ── Heuristic classifier ──────────────────────────────────────
  // Replace this method body when swapping in the neural net.

  _runHeuristic({ engine, tyre, hoot, moto }) {
    const bl = State.baseline || 20; // fallback during calibration

    const engineRise = engine / bl;
    const tyreRise   = tyre   / (bl * 0.6); // tyre baseline is typically lower
    const hootRise   = hoot   / bl;
    const motoRise   = moto   / bl;

    // ── Electric vehicle: tyre up, engine quiet ──────────────────
    const evWarning = tyreRise > CONFIG.EV_TYRE_THRESHOLD && engineRise < 1.4;

    if (evWarning) {
      return { vehicleClass: 'electric', evWarning: true, confidence: 0.55 };
    }

    // ── No vehicle ───────────────────────────────────────────────
    if (engineRise < 1.3 && motoRise < 1.3) {
      return { vehicleClass: 'none', evWarning: false, confidence: 0.90 };
    }

    // ── Horn / hooting ────────────────────────────────────────────
    if (hootRise > 2.5 && engineRise > 1.5) {
      return { vehicleClass: 'hoot', evWarning: false, confidence: 0.75 };
    }

    // ── Motorbike (boda boda / pikipiki) ─────────────────────────
    // High moto-band relative to overall engine band → likely motorbike
    if (motoRise > 2.0 && motoRise > engineRise * 0.8) {
      return { vehicleClass: 'motorbike', evWarning: false, confidence: 0.70 };
    }

    // ── Matatu / nganya ───────────────────────────────────────────
    // Large engines + hoot activity = matatu signature
    if (engineRise > 2.2 && hootRise > 1.6) {
      return { vehicleClass: 'matatu', evWarning: false, confidence: 0.65 };
    }

    // ── Generic car ───────────────────────────────────────────────
    return { vehicleClass: 'car', evWarning: false, confidence: 0.60 };
  },

  // ── Future slot: neural net inference ────────────────────────
  // async _runNeuralNet(freqData) {
  //   const input = tf.tensor2d([Array.from(freqData)]);
  //   const output = model.predict(input);
  //   const classes = ['none','motorbike','car','matatu','electric','hoot'];
  //   const idx = output.argMax(1).dataSync()[0];
  //   return { vehicleClass: classes[idx], confidence: output.max().dataSync()[0] };
  // },

  // ── Helpers ───────────────────────────────────────────────────
  _bandAvg(freqData, loHz, hiHz) {
    const lo  = AudioEngine.hzToIndex(loHz);
    const hi  = AudioEngine.hzToIndex(hiHz);
    let   sum = 0;
    for (let i = lo; i <= hi; i++) sum += freqData[i];
    return sum / (hi - lo);
  },

  /** Human-readable label for UI display */
  label(vehicleClass) {
    return {
      none:      '',
      motorbike: 'BODA BODA',
      car:       'VEHICLE',
      matatu:    'MATATU',
      electric:  'SILENT VEHICLE',
      hoot:      'HOOTING',
    }[vehicleClass] || '';
  },
};
