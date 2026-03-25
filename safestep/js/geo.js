/**
 * geo.js — GeoMemory
 * ─────────────────────────────────────────────────────────────
 * Manages GPS-aware road baseline memory.
 *
 * Every road location is stored as a "cluster" — a GPS point
 * with a radius. When you return to a known cluster, the app
 * loads the stored baseline instantly, skipping calibration.
 * Each visit updates the baseline using an exponential moving
 * average so it improves over time.
 *
 * Storage: IndexedDB (local) + Azure Function sync (cloud).
 *
 * Schema per cluster:
 * {
 *   id:         string (geohash-style key),
 *   lat:        number,
 *   lng:        number,
 *   baseline:   number,   // rolling veh-band baseline
 *   visits:     number,
 *   lastSeen:   ISO string,
 *   threatLog:  [{ ts, threat, vehicleClass }],  // last 50 events
 * }
 */

import { CONFIG } from './config.js';
import { State }  from './state.js';

const DB_NAME    = 'safestep';
const DB_VERSION = 1;
const STORE      = 'clusters';

export const GeoMemory = {
  _db:         null,
  _watchId:    null,
  _onPosition: null,  // callback(position)

  // ── IndexedDB setup ───────────────────────────────────────────

  async openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { this._db = e.target.result; resolve(); };
      req.onerror   = e => reject(e.target.error);
    });
  },

  async _get(id) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async _put(record) {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  },

  async _getAll() {
    return new Promise((resolve, reject) => {
      const tx  = this._db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror   = e => reject(e.target.error);
    });
  },

  // ── GPS watching ──────────────────────────────────────────────

  startWatching(onPosition) {
    if (!navigator.geolocation) return;
    this._onPosition = onPosition;

    this._watchId = navigator.geolocation.watchPosition(
      pos => {
        State.geoPosition = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        onPosition(State.geoPosition);
      },
      err => console.warn('[GeoMemory] GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: CONFIG.GEO_WATCH_INTERVAL_MS }
    );
  },

  stopWatching() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  },

  // ── Cluster logic ─────────────────────────────────────────────

  /** Haversine distance in metres between two {lat,lng} points */
  _distanceM(a, b) {
    const R   = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const sin2 = Math.sin(dLat / 2) ** 2
               + Math.cos(a.lat * Math.PI / 180)
               * Math.cos(b.lat * Math.PI / 180)
               * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(sin2));
  },

  /** Deterministic cluster key from rounded GPS coords */
  _clusterId(lat, lng) {
    const precision = 0.0005; // ~55m grid
    const rLat = Math.round(lat / precision) * precision;
    const rLng = Math.round(lng / precision) * precision;
    return `${rLat.toFixed(4)}_${rLng.toFixed(4)}`;
  },

  /**
   * Look up the nearest stored cluster for a given position.
   * Returns the cluster record or null if none within radius.
   */
  async findCluster(lat, lng) {
    const all = await this._getAll();
    let nearest = null, minDist = Infinity;

    for (const c of all) {
      const d = this._distanceM({ lat, lng }, { lat: c.lat, lng: c.lng });
      if (d < CONFIG.GEO_CLUSTER_RADIUS_M && d < minDist) {
        minDist = d; nearest = c;
      }
    }
    return nearest;
  },

  /**
   * Load baseline for current GPS position.
   * Returns baseline value if found, null if new location.
   */
  async loadBaseline(lat, lng) {
    if (!this._db) await this.openDB();
    const cluster = await this.findCluster(lat, lng);
    if (!cluster) return null;

    State.geoClusterId    = cluster.id;
    State.geoMemoryLoaded = true;

    // Trust it only after enough visits
    if (cluster.visits >= CONFIG.GEO_MIN_VISITS_TRUST) {
      console.log(`[GeoMemory] Loaded baseline ${cluster.baseline} from cluster ${cluster.id} (${cluster.visits} visits)`);
      return cluster.baseline;
    }
    return null; // not enough data yet — still calibrate
  },

  /**
   * Save or update the baseline for the current position.
   * Uses exponential moving average to update incrementally.
   */
  async saveBaseline(lat, lng, newBaseline) {
    if (!this._db) await this.openDB();
    const id       = this._clusterId(lat, lng);
    const existing = await this._get(id);

    const record = existing
      ? {
          ...existing,
          // EMA update: new value weighted by GEO_BASELINE_WEIGHT
          baseline:  existing.baseline * (1 - CONFIG.GEO_BASELINE_WEIGHT)
                   + newBaseline       *      CONFIG.GEO_BASELINE_WEIGHT,
          visits:    existing.visits + 1,
          lastSeen:  new Date().toISOString(),
        }
      : {
          id,
          lat, lng,
          baseline:  newBaseline,
          visits:    1,
          lastSeen:  new Date().toISOString(),
          threatLog: [],
        };

    await this._put(record);
    State.geoClusterId = id;
    console.log(`[GeoMemory] Saved baseline ${record.baseline.toFixed(1)} for cluster ${id}`);
  },

  /**
   * Append a threat event to the cluster's threat log.
   * Keeps only the last 50 events to cap storage.
   */
  async logThreatEvent(lat, lng, threat, vehicleClass) {
    if (!this._db || !lat) return;
    const id = this._clusterId(lat, lng);
    const existing = await this._get(id);
    if (!existing) return;

    const log = [
      ...(existing.threatLog || []),
      { ts: Date.now(), threat, vehicleClass },
    ].slice(-50);

    await this._put({ ...existing, threatLog: log });
  },

  /** Return all clusters — used by the map to draw road memory dots */
  async getAllClusters() {
    if (!this._db) await this.openDB();
    return this._getAll();
  },
};
