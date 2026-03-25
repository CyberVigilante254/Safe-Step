/**
 * main.js — App Entry Point
 * Wires all modules together. Stays thin — just orchestration.
 */

import { CONFIG }            from './config.js';
import { State }             from './state.js';
import { AudioEngine }       from './audio.js';
import { ThreatDetector }    from './detector.js';
import { VehicleClassifier } from './classifier.js';
import { CrossingWindow }    from './crossing.js';
import { SonarRenderer }     from './sonar.js';
import { UI }                from './ui.js';
import { DataRecorder }      from './recorder.js';
import { DemoMode }          from './demo.js';
import { GeoMemory }         from './geo.js';
import { AzureSync }         from './azure.js';
import { RoadMap }           from './map.js';

// ── DOM refs ──────────────────────────────────────────────────
const els = {
  canvas:           document.getElementById('sonar-canvas'),
  threatLabel:      document.getElementById('threat-label'),
  threatSub:        document.getElementById('threat-sub'),
  scanBtn:          document.getElementById('scan-btn'),
  liveDot:          document.getElementById('live-dot'),
  envFill:          document.getElementById('env-fill'),
  vehFill:          document.getElementById('veh-fill'),
  envVal:           document.getElementById('env-val'),
  vehVal:           document.getElementById('veh-val'),
  freqBars:         document.getElementById('freq-bars'),
  sensReadout:      document.getElementById('sens-readout'),
  sensSlider:       document.getElementById('sens-slider'),
  sliderVal:        document.getElementById('slider-val'),
  debugToggle:      document.getElementById('debug-toggle'),
  debugPanel:       document.getElementById('debug-panel'),
  dangerOverlay:    document.getElementById('danger-overlay'),
  hapticPill:       document.getElementById('haptic-pill'),
  micError:         document.getElementById('mic-error'),
  recordBtn:        document.getElementById('record-btn'),
  downloadBtn:      document.getElementById('download-btn'),
  demoBtn:          document.getElementById('demo-btn'),
  recalBtn:         document.getElementById('recal-btn'),
  mapBtn:           document.getElementById('map-btn'),
  labelBtns:        document.querySelectorAll('[data-label]'),
  demoIndicator:    document.getElementById('demo-indicator'),
  // crossing window
  windowPanel:      document.getElementById('window-panel'),
  windowTimer:      document.getElementById('window-timer'),
  windowTrajectory: document.getElementById('window-trajectory'),
  // vehicle class
  vehicleTag:       document.getElementById('vehicle-tag'),
  evWarning:        document.getElementById('ev-warning'),
  // geo
  geoStatus:        document.getElementById('geo-status'),
  // debug spans
  dBaseline:        document.getElementById('d-baseline'),
  dVeh:             document.getElementById('d-veh'),
  dNoise:           document.getElementById('d-noise'),
  dThresh:          document.getElementById('d-thresh'),
  dHold:            document.getElementById('d-hold'),
  dHoldMax:         document.getElementById('d-hold-max'),
  dFrames:          document.getElementById('d-frames'),
  dClass:           document.getElementById('d-class'),
  dWindow:          document.getElementById('d-window'),
};

// ── Init ──────────────────────────────────────────────────────
SonarRenderer.init(els.canvas);
window.addEventListener('resize', () => SonarRenderer.resize());
SonarRenderer.resize();
UI.init(els);
AzureSync.init();

// Init geo + map on load
GeoMemory.openDB().then(() => {
  AzureSync.start();
  GeoMemory.startWatching(onGeoPosition);
  RoadMap.init('map-container');
});

// ── Geo position handler ──────────────────────────────────────
let _lastGeoThreat = -1;

async function onGeoPosition(pos) {
  const { lat, lng } = pos;

  // Update map
  if (State.mapVisible) {
    RoadMap.updatePosition(lat, lng);
  }

  // Log trace point when threat changes
  if (State.currentThreat !== _lastGeoThreat) {
    _lastGeoThreat = State.currentThreat;
    RoadMap.addTracePoint(lat, lng, State.currentThreat);
    await GeoMemory.logThreatEvent(lat, lng, State.currentThreat, State.vehicleClass);
  }

  // Update geo status indicator
  const accuracy = Math.round(pos.accuracy || 0);
  els.geoStatus.textContent = `GPS ±${accuracy}m`;
  els.geoStatus.classList.toggle('locked', accuracy < 20);
}

// ── Main loop ─────────────────────────────────────────────────
function mainLoop() {
  SonarRenderer.draw();

  if (State.scanning && State.analyser && !State.demoMode) {
    State.analyser.getByteFrequencyData(State.freqData);
    State.frameCount++;

    const vehLevel = AudioEngine.getVehicleBandLevel();
    const envLevel = AudioEngine.getOverallLevel();

    // 1. Threat detection
    ThreatDetector.update(
      vehLevel,
      (progress) => {
        els.threatSub.textContent = `CALIBRATING ${progress}%`;
        SonarRenderer.setCalProgress(progress / 100);
      },
      async (baseline) => {
        // Calibration done — save to geo memory
        els.sensReadout.textContent = `BASELINE ${Math.round(baseline)}`;
        SonarRenderer.setCalProgress(null);
        UI.setThreat(0, 'CROSSING CLEAR');
        if (State.geoPosition) {
          await GeoMemory.saveBaseline(
            State.geoPosition.lat,
            State.geoPosition.lng,
            baseline
          );
        }
      },
      (level) => {
        UI.setThreat(level);
      }
    );

    // 2. Vehicle classification
    const { vehicleClass, evWarning, confidence } =
      VehicleClassifier.classify(State.freqData);
    State.vehicleClass = vehicleClass;
    State.evWarning    = evWarning;
    UI.updateClassification(vehicleClass, evWarning);

    // 3. Crossing window
    const { windowOpen, windowSeconds, trajectory } =
      CrossingWindow.update(vehLevel);
    UI.updateCrossingWindow(windowOpen, windowSeconds, trajectory);

    // 4. Meters + freq bars
    UI.updateMeters(envLevel, vehLevel);
    UI.updateFreqBars(State.freqData);

    // 5. Data recording
    DataRecorder.captureFrame(vehLevel, envLevel);

    // 6. Debug
    if (els.debugPanel.classList.contains('visible')) {
      UI.updateDebug({
        ...ThreatDetector.debugInfo(vehLevel),
        vehicleClass,
        confidence: (confidence * 100).toFixed(0) + '%',
        windowSeconds,
        trajectory,
      });
    }
  }

  requestAnimationFrame(mainLoop);
}

// ── Start scan ────────────────────────────────────────────────
async function startScan() {
  // Check for geo-cached baseline at this location
  let cachedBaseline = null;
  if (State.geoPosition) {
    cachedBaseline = await GeoMemory.loadBaseline(
      State.geoPosition.lat,
      State.geoPosition.lng
    );
  }

  const ok = await AudioEngine.start();
  if (!ok) { els.micError.classList.add('show'); return; }

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
    demoMode:       false,
    vehicleClass:   'none',
    evWarning:      false,
  });

  CrossingWindow.reset();

  // If we have a trusted cached baseline, skip calibration
  if (cachedBaseline !== null) {
    State.calibrated = true;
    State.baseline   = cachedBaseline;
    els.threatLabel.childNodes[0].nodeValue = 'READY';
    els.threatSub.textContent   = 'ROAD MEMORY LOADED';
    els.sensReadout.textContent = `BASELINE ${Math.round(cachedBaseline)} ★`;
    SonarRenderer.setCalProgress(null);
    setTimeout(() => UI.setThreat(0, 'CROSSING CLEAR'), 1200);
  } else {
    els.threatLabel.childNodes[0].nodeValue = 'READY';
    els.threatSub.textContent   = 'CALIBRATING 0%';
    els.sensReadout.textContent = 'BASELINE ——';
  }

  UI.setScanningState(true);
  await DemoMode.acquireWakeLock();
}

// ── Stop scan ─────────────────────────────────────────────────
function stopScan() {
  DemoMode.cancel();
  AudioEngine.stop();
  DemoMode.releaseWakeLock();
  CrossingWindow.reset();

  Object.assign(State, {
    scanning:      false,
    calibrated:    false,
    currentThreat: 0,
    blips:         [],
    demoMode:      false,
    vehicleClass:  'none',
    evWarning:     false,
  });

  SonarRenderer.setCalProgress(null);
  UI.setScanningState(false);
  UI.setThreat(0, 'SCANNER OFF');
  UI.updateMeters(0, 0);
  UI.resetFreqBars();
  UI.updateClassification('none', false);
  UI.updateCrossingWindow(false, 0, 'clear');

  els.envVal.textContent      = '—';
  els.vehVal.textContent      = '—';
  els.sensReadout.textContent = 'BASELINE ——';
  els.demoIndicator.classList.remove('show');
}

// ── Recalibrate ───────────────────────────────────────────────
function recalibrate() {
  if (!State.scanning) return;
  Object.assign(State, {
    calibrated:    false,
    calSamples:    [],
    currentThreat: 0,
    rawThreat:     0,
    holdCounter:   0,
    releaseCounter:0,
    blips:         [],
  });
  CrossingWindow.reset();
  els.threatLabel.childNodes[0].nodeValue = 'READY';
  els.threatSub.textContent   = 'CALIBRATING 0%';
  els.sensReadout.textContent = 'BASELINE ——';
  UI.setThreat(0, 'RECALIBRATING…');
  // visual flash on button
  els.recalBtn.classList.add('pulsed');
  setTimeout(() => els.recalBtn.classList.remove('pulsed'), 700);
}

// ── Demo mode ─────────────────────────────────────────────────
function triggerDemo() {
  if (DemoMode.isRunning) {
    DemoMode.cancel();
    els.demoIndicator.classList.remove('show');
    State.demoMode = false;
    return;
  }
  State.scanning = true;
  State.demoMode = true;
  UI.setScanningState(true);
  els.demoIndicator.classList.add('show');

  DemoMode.run((step) => {
    if (step === 'safe') {
      els.demoIndicator.classList.remove('show');
      State.demoMode = false;
      if (!State.analyser) { State.scanning = false; UI.setScanningState(false); }
    }
  });
}

// ── Long press on sonar → demo ────────────────────────────────
let longPressTimer = null;
els.canvas.addEventListener('pointerdown', () => {
  longPressTimer = setTimeout(triggerDemo, 3000);
});
els.canvas.addEventListener('pointerup',    () => clearTimeout(longPressTimer));
els.canvas.addEventListener('pointerleave', () => clearTimeout(longPressTimer));

// ── Event listeners ───────────────────────────────────────────
els.scanBtn.addEventListener('click', () => State.scanning ? stopScan() : startScan());

els.recalBtn.addEventListener('click', recalibrate);
els.demoBtn.addEventListener('click', triggerDemo);

els.mapBtn.addEventListener('click', async () => {
  RoadMap.toggle();
  els.mapBtn.classList.toggle('on', State.mapVisible);
  if (State.mapVisible) await RoadMap.loadMemoryDots();
});

els.sensSlider.addEventListener('input', () => {
  State.sensitivityLevel    = parseInt(els.sensSlider.value);
  els.sliderVal.textContent = els.sensSlider.value;
  State.holdCounter = State.releaseCounter = State.rawThreat = 0;
});

els.debugToggle.addEventListener('click', () => {
  els.debugPanel.classList.toggle('visible');
  els.debugToggle.classList.toggle('on');
});

els.recordBtn.addEventListener('click', () => {
  if (!State.recording) { DataRecorder.start(); UI.setRecordingState(true); }
  else                  { DataRecorder.stop();  UI.setRecordingState(false); }
});
els.downloadBtn.addEventListener('click', () => DataRecorder.download());

els.labelBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    DataRecorder.labelAs(btn.dataset.label);
    els.labelBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Boot ──────────────────────────────────────────────────────
mainLoop();
