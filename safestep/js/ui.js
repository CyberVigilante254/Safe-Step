/**
 * ui.js — UI
 * ─────────────────────────────────────────────────────────────
 * Owns all DOM mutations: threat state display, meters,
 * freq bars, haptic feedback, overlays.
 */

import { CONFIG }       from './config.js';
import { State }        from './state.js';
import { AudioEngine }  from './audio.js';
import { SonarRenderer } from './sonar.js';

// ── Threat display config ──────────────────────────────────────
const THREAT_CONFIG = [
  {
    label: 'SAFE',
    color: 'var(--safe)',
    glow:  '0 0 28px rgba(0,255,136,.55), 0 0 70px rgba(0,255,136,.22)',
    vehBg: 'var(--safe)',
  },
  {
    label: 'CAUTION',
    color: 'var(--caution)',
    glow:  '0 0 28px rgba(255,204,0,.55), 0 0 70px rgba(255,204,0,.22)',
    vehBg: 'var(--caution)',
  },
  {
    label: 'DANGER',
    color: 'var(--danger)',
    glow:  '0 0 28px rgba(255,34,68,.65), 0 0 70px rgba(255,34,68,.28)',
    vehBg: 'var(--danger)',
  },
];

const THREAT_SUBS = [
  'CROSSING CLEAR',
  'VEHICLE NEARBY',
  'STOP — VEHICLE CLOSE',
];

export const UI = {
  // DOM refs — populated by init()
  els: {},

  init(elements) {
    this.els = elements;
    this._buildFreqBars(32);
  },

  _buildFreqBars(count) {
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.className = 'fbar';
      this.els.freqBars.appendChild(d);
    }
  },

  // ── Threat state ────────────────────────────────────────────
  setThreat(level, subOverride) {
    const cfg = THREAT_CONFIG[level];
    const sub = subOverride ?? THREAT_SUBS[level];

    this.els.threatLabel.childNodes[0].nodeValue = cfg.label;
    this.els.threatSub.textContent               = sub;
    this.els.threatLabel.style.color             = cfg.color;
    this.els.threatLabel.style.textShadow        = cfg.glow;
    this.els.vehFill.style.background            = cfg.vehBg;

    if (level === 2) {
      this.els.dangerOverlay.classList.add('show');
      setTimeout(() => this.els.dangerOverlay.classList.remove('show'), 700);
    }
    if (level > 0) {
      this.triggerHaptic(level);
      if (Math.random() < .18) SonarRenderer.spawnBlip(level);
    }
  },

  // ── Haptic ──────────────────────────────────────────────────
  triggerHaptic(level) {
    if (!navigator.vibrate) return;
    const now      = Date.now();
    const cooldown = level === 2
      ? CONFIG.HAPTIC_COOLDOWN_DANGER
      : CONFIG.HAPTIC_COOLDOWN_CAUTION;
    if (now - State.lastHapticTime < cooldown) return;

    State.lastHapticTime = now;
    navigator.vibrate(level === 2 ? [110, 55, 110, 55, 190] : [75, 115, 75]);

    this.els.hapticPill.classList.add('show');
    setTimeout(() => this.els.hapticPill.classList.remove('show'), 400);
  },

  // ── Level meters ────────────────────────────────────────────
  updateMeters(envLevel, vehLevel) {
    const pct = (v, max) => Math.min(100, v / max * 100) + '%';
    this.els.envFill.style.width = pct(envLevel, 110);
    this.els.vehFill.style.width = pct(vehLevel, 110);
    this.els.envVal.textContent  = Math.round(envLevel);
    this.els.vehVal.textContent  = Math.round(vehLevel);
  },

  // ── Frequency visualiser ─────────────────────────────────────
  updateFreqBars(freqData) {
    const startBin = AudioEngine.hzToIndex(20);
    const endBin   = AudioEngine.hzToIndex(4000);
    const range    = endBin - startBin;
    const bars     = this.els.freqBars.querySelectorAll('.fbar');
    const n        = bars.length;

    bars.forEach((bar, i) => {
      const s   = startBin + Math.floor(range * i / n);
      const e   = startBin + Math.floor(range * (i + 1) / n);
      let sum   = 0;
      for (let j = s; j < e; j++) sum += freqData[j];
      const avg = sum / (e - s);

      bar.style.height = Math.max(2, avg / 170 * 34) + 'px';

      // Highlight the vehicle detection band in threat colour
      const hz = (i / n) * 4000;
      const inBand = hz >= CONFIG.VEH_BAND_LO && hz <= CONFIG.VEH_BAND_HI;
      bar.style.background = inBand
        ? SonarRenderer.threatColor(State.currentThreat)
        : 'rgba(0,200,255,.22)';
    });
  },

  resetFreqBars() {
    this.els.freqBars.querySelectorAll('.fbar').forEach(b => {
      b.style.height     = '2px';
      b.style.background = 'rgba(0,200,255,.22)';
    });
  },

  // ── Scan button / live dot ───────────────────────────────────
  setScanningState(on) {
    this.els.scanBtn.textContent = on ? '◼  STOP SCANNING' : '⬤  START SCANNING';
    this.els.scanBtn.classList.toggle('scanning', on);
    this.els.liveDot.classList.toggle('active', on);
  },

  // ── Record button ────────────────────────────────────────────
  setRecordingState(on) {
    this.els.recordBtn.textContent = on ? '◼  STOP RECORDING' : '⏺  RECORD DATA';
    this.els.recordBtn.classList.toggle('recording', on);
  },

  // ── Vehicle classification display ────────────────────────────
  updateClassification(vehicleClass, evWarning) {
    const tag = this.els.vehicleTag;
    const warn = this.els.evWarning;
    if (!tag) return;

    const label = {
      none: '', motorbike: 'BODA BODA', car: 'VEHICLE',
      matatu: 'MATATU', electric: 'SILENT VEHICLE', hoot: 'HOOTING',
    }[vehicleClass] || '';

    tag.textContent = label;
    tag.classList.toggle('visible', label !== '');
    tag.dataset.class = vehicleClass;
    if (warn) warn.classList.toggle('visible', evWarning);
  },

  // ── Crossing window display ───────────────────────────────────
  updateCrossingWindow(windowOpen, windowSeconds, trajectory) {
    const panel = this.els.windowPanel;
    const timer = this.els.windowTimer;
    const traj  = this.els.windowTrajectory;
    if (!panel) return;

    panel.classList.toggle('open',   windowOpen);
    panel.classList.toggle('closed', !windowOpen && State.currentThreat > 0);

    if (timer) {
      timer.textContent = windowOpen
        ? `CROSS NOW — ${windowSeconds}s`
        : '';
    }

    const trajectoryLabels = {
      approaching: '▲ APPROACHING',
      receding:    '▼ PASSING',
      present:     '● PRESENT',
      clear:       '',
    };
    if (traj) traj.textContent = trajectoryLabels[trajectory] || '';
  },

  // ── Debug panel (comprehensive) ─────────────────────────────
  updateDebug(info) {
    const set = (id, v) => { const el = this.els[id]; if (el) el.textContent = v; };
    set('dBaseline', info.baseline);
    set('dVeh',      info.veh);
    set('dNoise',    info.noise);
    set('dThresh',   `${info.caution} / ${info.danger}`);
    set('dHold',     info.hold);
    set('dHoldMax',  info.holdMax);
    set('dFrames',   info.frames);
    set('dClass',    `${info.vehicleClass} (${info.confidence})`);
    set('dWindow',   info.trajectory);
  },
};
