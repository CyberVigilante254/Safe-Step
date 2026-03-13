/**
 * main.js — App Entry Point
 * ─────────────────────────────────────────────────────────────
 * Wires AudioEngine → ThreatDetector → UI + SonarRenderer.
 * This file should stay thin — just orchestration.
 */

import { CONFIG }        from './config.js';
import { State }         from './state.js';
import { AudioEngine }   from './audio.js';
import { ThreatDetector } from './detector.js';
import { SonarRenderer } from './sonar.js';
import { UI }            from './ui.js';
import { DataRecorder }  from './recorder.js';

// ── DOM element map ────────────────────────────────────────────
const els = {
  canvas:       document.getElementById('sonar-canvas'),
  threatLabel:  document.getElementById('threat-label'),
  threatSub:    document.getElementById('threat-sub'),
  scanBtn:      document.getElementById('scan-btn'),
  liveDot:      document.getElementById('live-dot'),
  envFill:      document.getElementById('env-fill'),
  vehFill:      document.getElementById('veh-fill'),
  envVal:       document.getElementById('env-val'),
  vehVal:       document.getElementById('veh-val'),
  freqBars:     document.getElementById('freq-bars'),
  sensReadout:  document.getElementById('sens-readout'),
  sensSlider:   document.getElementById('sens-slider'),
  sliderVal:    document.getElementById('slider-val'),
  debugToggle:  document.getElementById('debug-toggle'),
  debugPanel:   document.getElementById('debug-panel'),
  dangerOverlay:document.getElementById('danger-overlay'),
  hapticPill:   document.getElementById('haptic-pill'),
  micError:     document.getElementById('mic-error'),
  recordBtn:    document.getElementById('record-btn'),
  downloadBtn:  document.getElementById('download-btn'),
  labelBtns:    document.querySelectorAll('[data-label]'),
  // debug spans
  dBaseline:    document.getElementById('d-baseline'),
  dVeh:         document.getElementById('d-veh'),
  dNoise:       document.getElementById('d-noise'),
  dThresh:      document.getElementById('d-thresh'),
  dHold:        document.getElementById('d-hold'),
  dHoldMax:     document.getElementById('d-hold-max'),
  dFrames:      document.getElementById('d-frames'),
};

// ── Init subsystems ────────────────────────────────────────────
SonarRenderer.init(els.canvas);
window.addEventListener('resize', () => SonarRenderer.resize());
SonarRenderer.resize();

UI.init(els);

// ── Main loop ──────────────────────────────────────────────────
function mainLoop() {
  SonarRenderer.draw();

  if (State.scanning && State.analyser) {
    State.analyser.getByteFrequencyData(State.freqData);
    State.frameCount++;

    const vehLevel = AudioEngine.getVehicleBandLevel();
    const envLevel = AudioEngine.getOverallLevel();

    ThreatDetector.update(
      vehLevel,
      // onCalibrationProgress
      (progress) => {
        els.threatSub.textContent = `CALIBRATING ${progress}%`;
        SonarRenderer.setCalProgress(progress / 100);
      },
      // onCalibrationDone
      (baseline) => {
        els.sensReadout.textContent = `BASELINE ${Math.round(baseline)}`;
        SonarRenderer.setCalProgress(null);
        UI.setThreat(0, 'CROSSING CLEAR');
      },
      // onThreatChange
      (level) => {
        UI.setThreat(level);
      }
    );

    UI.updateMeters(envLevel, vehLevel);
    UI.updateFreqBars(State.freqData);
    DataRecorder.captureFrame(vehLevel, envLevel);

    // Debug panel
    if (els.debugPanel.classList.contains('visible')) {
      UI.updateDebug(ThreatDetector.debugInfo(vehLevel));
    }
  }

  requestAnimationFrame(mainLoop);
}

// ── Start scan ─────────────────────────────────────────────────
async function startScan() {
  const ok = await AudioEngine.start();
  if (!ok) {
    els.micError.classList.add('show');
    return;
  }

  // Reset state
  Object.assign(State, {
    scanning:       true,
    calibrated:     false,
    calSamples:     [],
    baseline:       0,
    currentThreat:  0,
    rawThreat:      0,
    holdCounter:    0,
    releaseCounter: 0,
    frameCount:     0,
    blips:          [],
  });

  els.threatLabel.childNodes[0].nodeValue = 'READY';
  els.threatSub.textContent               = 'CALIBRATING 0%';
  els.sensReadout.textContent             = 'BASELINE ——';
  UI.setScanningState(true);
}

// ── Stop scan ──────────────────────────────────────────────────
function stopScan() {
  AudioEngine.stop();

  State.scanning      = false;
  State.calibrated    = false;
  State.currentThreat = 0;
  State.blips         = [];

  SonarRenderer.setCalProgress(null);
  UI.setScanningState(false);
  UI.setThreat(0, 'SCANNER OFF');
  UI.updateMeters(0, 0);
  UI.resetFreqBars();

  els.envVal.textContent  = '—';
  els.vehVal.textContent  = '—';
  els.sensReadout.textContent = 'BASELINE ——';
}

// ── Event listeners ────────────────────────────────────────────
els.scanBtn.addEventListener('click', () => {
  State.scanning ? stopScan() : startScan();
});

els.sensSlider.addEventListener('input', () => {
  State.sensitivityLevel    = parseInt(els.sensSlider.value);
  els.sliderVal.textContent = els.sensSlider.value;
  // Reset detection so new threshold kicks in cleanly
  State.holdCounter    = 0;
  State.releaseCounter = 0;
  State.rawThreat      = 0;
});

els.debugToggle.addEventListener('click', () => {
  els.debugPanel.classList.toggle('visible');
  els.debugToggle.classList.toggle('on');
});

// Data recording
els.recordBtn.addEventListener('click', () => {
  if (!State.recording) {
    DataRecorder.start();
    UI.setRecordingState(true);
  } else {
    DataRecorder.stop();
    UI.setRecordingState(false);
  }
});

els.downloadBtn.addEventListener('click', () => DataRecorder.download());

// Label buttons (for tagging recorded data on the fly)
els.labelBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const label = btn.dataset.label;
    DataRecorder.labelAs(label);
    // Visual feedback
    els.labelBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Boot ───────────────────────────────────────────────────────
mainLoop();
