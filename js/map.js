/**
 * map.js — RoadMap
 * ─────────────────────────────────────────────────────────────
 * Two-layer map view:
 *
 *  Layer 1 — Leaflet base map (OpenStreetMap tiles)
 *            Shows real Nairobi roads.
 *
 *  Layer 2 — Acoustic trace overlay
 *            Your GPS path this session, colour-coded by threat.
 *            Safe=green  Caution=amber  Danger=red
 *
 *  Layer 3 — Road memory dots
 *            Previously visited clusters from IndexedDB,
 *            sized by visit count, coloured by average threat.
 *
 * Leaflet is loaded from CDN in index.html.
 */

import { State }     from './state.js';
import { GeoMemory } from './geo.js';

export const RoadMap = {
  _map:          null,
  _traceLayer:   null,
  _memoryLayer:  null,
  _posMarker:    null,
  _initialized:  false,
  _container:    null,

  async init(containerId) {
    this._container = document.getElementById(containerId);
    if (!this._container || this._initialized) return;

    // Leaflet must be loaded — check for it
    if (typeof L === 'undefined') {
      console.error('[RoadMap] Leaflet not loaded');
      return;
    }

    // Default centre: Nairobi CBD
    const centre = State.geoPosition
      ? [State.geoPosition.lat, State.geoPosition.lng]
      : [-1.2921, 36.8219];

    this._map = L.map(containerId, {
      center:        centre,
      zoom:          17,
      zoomControl:   true,
      attributionControl: false,
    });

    // OpenStreetMap tiles — free, no API key
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:     19,
      opacity:     0.7,
      className:   'map-tiles', // filtered dark in CSS
    }).addTo(this._map);

    this._traceLayer  = L.layerGroup().addTo(this._map);
    this._memoryLayer = L.layerGroup().addTo(this._map);

    this._initialized = true;
    await this.loadMemoryDots();
  },

  /** Call every time GPS position updates while map is visible */
  updatePosition(lat, lng) {
    if (!this._map) return;

    if (!this._posMarker) {
      this._posMarker = L.circleMarker([lat, lng], {
        radius:      8,
        fillColor:   '#00ccff',
        fillOpacity: 0.9,
        color:       '#fff',
        weight:      2,
      }).addTo(this._map);
    } else {
      this._posMarker.setLatLng([lat, lng]);
    }

    this._map.panTo([lat, lng], { animate: true, duration: 0.5 });
  },

  /** Add a point to the acoustic trace when threat level changes */
  addTracePoint(lat, lng, threat) {
    if (!this._map) return;

    const colours = ['#00ff88', '#ffcc00', '#ff2244'];
    const colour  = colours[threat] || colours[0];
    const radius  = threat === 2 ? 7 : threat === 1 ? 5 : 3;

    State.acousticTrace.push({ lat, lng, threat, ts: Date.now() });

    L.circleMarker([lat, lng], {
      radius,
      fillColor:   colour,
      fillOpacity: 0.75,
      color:       colour,
      weight:      1,
    }).addTo(this._traceLayer);

    // Connect trace points with a polyline
    if (State.acousticTrace.length > 1) {
      const prev = State.acousticTrace[State.acousticTrace.length - 2];
      L.polyline([[prev.lat, prev.lng], [lat, lng]], {
        color:   colour,
        weight:  3,
        opacity: 0.6,
      }).addTo(this._traceLayer);
    }
  },

  /** Load all stored clusters as memory dots */
  async loadMemoryDots() {
    if (!this._map) return;
    this._memoryLayer.clearLayers();

    const clusters = await GeoMemory.getAllClusters();
    for (const c of clusters) {
      const size   = Math.min(3 + c.visits * 1.5, 14);
      const danger = (c.threatLog || []).filter(e => e.threat === 2).length;
      const total  = (c.threatLog || []).length || 1;
      const risk   = danger / total; // 0–1
      const colour = risk > 0.3 ? '#ff2244' : risk > 0.1 ? '#ffcc00' : '#00ff88';

      const marker = L.circleMarker([c.lat, c.lng], {
        radius:      size,
        fillColor:   colour,
        fillOpacity: 0.5,
        color:       colour,
        weight:      1,
      });

      marker.bindPopup(`
        <div style="font-family:monospace;font-size:11px;color:#333">
          <b>Road Memory</b><br>
          Visits: ${c.visits}<br>
          Baseline: ${Math.round(c.baseline)}<br>
          Last seen: ${new Date(c.lastSeen).toLocaleDateString()}
        </div>
      `);

      marker.addTo(this._memoryLayer);
    }
  },

  show() {
    if (this._container) this._container.style.display = 'block';
    if (this._map) this._map.invalidateSize();
    State.mapVisible = true;
  },

  hide() {
    if (this._container) this._container.style.display = 'none';
    State.mapVisible = false;
  },

  toggle() {
    State.mapVisible ? this.hide() : this.show();
  },
};
