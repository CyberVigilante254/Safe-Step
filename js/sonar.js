/**
 * sonar.js — SonarRenderer
 * ─────────────────────────────────────────────────────────────
 * Pure canvas drawing logic.
 * Knows nothing about audio — just reads State for sweep angle,
 * blips, and current threat level.
 */

import { CONFIG } from './config.js';
import { State }  from './state.js';

export const SonarRenderer = {
  canvas: null,
  ctx:    null,

  /** Must be called once with the <canvas> element before draw(). */
  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
  },

  resize() {
    const s = Math.min(this.canvas.offsetWidth, this.canvas.offsetHeight);
    this.canvas.width = this.canvas.height = s;
  },

  // ── Colour helpers ──────────────────────────────────────────
  threatColor(t) {
    return t === 2 ? '#ff2244' : t === 1 ? '#ffcc00' : '#00ff88';
  },

  _hexRGB(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  },

  // ── Calibration arc ─────────────────────────────────────────
  _calProgress: null,
  setCalProgress(p) { this._calProgress = p; },  // null = off, 0–1 = active

  // ── Main draw ───────────────────────────────────────────────
  draw() {
    const { canvas, ctx } = this;
    const W  = canvas.width;
    const H  = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R  = W * 0.455;
    const c  = this.threatColor(State.currentThreat);
    const [r, g, b] = this._hexRGB(c);

    ctx.clearRect(0, 0, W, H);

    // Range rings
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * i / 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,200,255,${.035 + i * .018})`;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }

    // Crosshair
    ctx.strokeStyle = 'rgba(0,200,255,.055)';
    ctx.lineWidth   = 1;
    [[cx - R, cy, cx + R, cy], [cx, cy - R, cx, cy + R]]
      .forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      });

    if (this._calProgress !== null) {
      // ── Calibration progress arc ──
      ctx.beginPath();
      ctx.arc(cx, cy, R * .55, -Math.PI / 2, Math.PI * 1.5);
      ctx.strokeStyle = 'rgba(0,200,255,.1)';
      ctx.lineWidth   = 3;
      ctx.stroke();

      const end = -Math.PI / 2 + Math.PI * 2 * this._calProgress;
      ctx.beginPath();
      ctx.arc(cx, cy, R * .55, -Math.PI / 2, end);
      ctx.strokeStyle = 'rgba(0,200,255,.7)';
      ctx.lineWidth   = 3;
      ctx.shadowColor = 'rgba(0,200,255,.6)';
      ctx.shadowBlur  = 8;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    } else {
      // ── Sweep trail ──
      const sw = Math.PI * .58;
      for (let i = 0; i < 48; i++) {
        const a = State.sweepAngle - sw * i / 48;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a, a + sw / 48);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},${(1 - i / 48) * .16})`;
        ctx.fill();
      }

      // ── Sweep line ──
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(State.sweepAngle) * R,
        cy + Math.sin(State.sweepAngle) * R
      );
      ctx.strokeStyle = c;
      ctx.lineWidth   = 2;
      ctx.shadowColor = c;
      ctx.shadowBlur  = 12;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // ── Blips ──
    State.blips = State.blips.filter(bl => bl.age < 85);
    State.blips.forEach(bl => {
      const alpha = 1 - bl.age / 85;
      const size  = bl.size * (1 + bl.age * .011);
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, size, 0, Math.PI * 2);
      ctx.fillStyle   = `rgba(${bl.r},${bl.g},${bl.b},${alpha * .88})`;
      ctx.shadowColor = bl.color;
      ctx.shadowBlur  = 10;
      ctx.fill();
      ctx.shadowBlur  = 0;
      bl.age++;
    });

    // ── Outer ring ──
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = c;
    ctx.lineWidth   = 2;
    ctx.shadowColor = c;
    ctx.shadowBlur  = 14;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // ── Tick marks ──
    for (let i = 0; i < 12; i++) {
      const a   = i / 12 * Math.PI * 2;
      const len = i % 3 === 0 ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
      ctx.lineTo(cx + Math.cos(a) * R,          cy + Math.sin(a) * R);
      ctx.strokeStyle = `rgba(0,200,255,${i % 3 === 0 ? .45 : .2})`;
      ctx.lineWidth   = i % 3 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // Advance sweep angle
    const speed = State.scanning
      ? CONFIG.SWEEP_SPEED_ACTIVE
      : CONFIG.SWEEP_SPEED_IDLE;
    State.sweepAngle = (State.sweepAngle + speed) % (Math.PI * 2);
  },

  /** Spawn a blip at the current sweep angle, distance based on threat. */
  spawnBlip(threat) {
    const W  = this.canvas.width;
    const H  = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R  = W * 0.455;

    const dist = threat === 2
      ? R * (.20 + Math.random() * .32)
      : R * (.42 + Math.random() * .36);
    const a  = State.sweepAngle + (Math.random() - .5) * .85;
    const x  = cx + Math.cos(a) * dist;
    const y  = cy + Math.sin(a) * dist;
    const color = this.threatColor(threat);
    const [r, g, b] = this._hexRGB(color);

    State.blips.push({ x, y, age: 0, size: 3 + threat * 4, color, r, g, b });
  },
};
