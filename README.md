# SafeStep Signal 🚦

Real-time crosswalk safety system for high-risk roads.  
Uses your phone's microphone to detect approaching vehicles via audio pattern analysis,
then alerts you through vibration — no need to look at the screen.

---

## File structure

```
safestep/
├── index.html          # Shell — markup only, no inline logic
├── css/
│   └── styles.css      # All styles + design tokens
└── js/
    ├── config.js       # All tunable constants (edit this during testing)
    ├── state.js        # Single shared mutable state object
    ├── audio.js        # Mic pipeline (AudioEngine)
    ├── detector.js     # Calibration + threat classification (ThreatDetector)
    ├── sonar.js        # Canvas drawing (SonarRenderer)
    ├── ui.js           # DOM updates, haptics, overlays (UI)
    ├── recorder.js     # Data capture + JSON download (DataRecorder)
    └── main.js         # Entry point — wires everything together
```

---

## Running locally

The app uses ES modules (`type="module"`), so it **must be served over HTTP** — not opened as a file.

```bash
# Option 1 — Python (built-in)
cd safestep
python3 -m http.server 8080

# Option 2 — Node (if you have npx)
cd safestep
npx serve .
```

Then open `http://localhost:8080` in Chrome or Safari.

---

## Testing on your phone

With your laptop and phone on the same Wi-Fi:

```bash
# Start the server (find your local IP first)
python3 -m http.server 8080

# Find your local IP
ipconfig getifaddr en0   # macOS
ip route get 1 | awk '{print $7}'  # Linux
```

Open `http://YOUR_LOCAL_IP:8080` on your phone browser.

> **Note:** The Web Audio API requires either `localhost` or HTTPS.
> For phone testing over LAN, use an HTTPS tunnel:
> `npx localtunnel --port 8080`  →  opens a public HTTPS URL.

---

## Tuning thresholds (config.js)

| Constant | Default | Effect |
|---|---|---|
| `VEH_BAND_LO/HI` | 60–520 Hz | Frequency range to watch |
| `CAL_FRAMES` | 150 (~2.5s) | How long calibration takes |
| `CAL_PERCENTILE` | 0.80 | Baseline robustness (higher = less sensitive to cal-time noise) |
| `SENSITIVITY_MULTIPLIERS` | [3.2…1.2] | Per-level trigger multipliers |
| `HOLD_FRAMES_*` | 4–6 | Frames threat must persist before triggering |
| `RELEASE_FRAMES` | 20 | Quiet frames needed before clearing alert |

---

## Collecting training data

1. Start scanning (calibration runs first)
2. Press the label button for what's happening: **CLEAR**, **VEHICLE**, **DANGER**
3. Press **⏺ RECORD DATA** to start capturing frames
4. Walk around the crossing, label events as they happen
5. Press **↓ DOWNLOAD** — saves a JSON file with timestamped feature vectors

Each frame includes `vehLevel`, `envLevel`, `threat`, `label`, and `timestamp`.
Feed these into a TensorFlow / sklearn pipeline to train a proper classifier.

---

## Next steps (roadmap)

- [ ] PWA manifest + service worker for offline use
- [ ] Raw FFT snapshot export (for training a CNN on spectrograms)
- [ ] TFLite model integration to replace threshold detection
- [ ] Directional estimation using dual-mic (front/back camera mics)
- [ ] Nairobi-specific training dataset from field recordings
