/**
 * azure.js — AzureSync
 * ─────────────────────────────────────────────────────────────
 * Syncs local IndexedDB cluster data to Azure Cosmos DB via
 * an Azure Function endpoint. The Function holds the Cosmos
 * connection string — never exposed to the client.
 *
 * Pattern: local-first. The app works 100% offline.
 * When online, sync runs in the background every 30s.
 *
 * Azure Function contract (POST /api/sync):
 *   Request body:  { clusters: [...], deviceId: string }
 *   Response body: { merged: [...] }   ← server-merged clusters
 *
 * To set up:
 *   1. Create Azure Function App (Node.js, free tier)
 *   2. Add Cosmos DB binding
 *   3. Deploy the function from /azure-function/sync/index.js
 *   4. Paste your Function URL into CONFIG.AZURE_FUNCTION_URL
 */

import { CONFIG }    from './config.js';
import { GeoMemory } from './geo.js';

export const AzureSync = {
  _timer:    null,
  _deviceId: null,
  _online:   navigator.onLine,

  init() {
    // Generate a stable anonymous device ID
    this._deviceId = localStorage.getItem('safestep_device_id')
      || (() => {
          const id = crypto.randomUUID();
          localStorage.setItem('safestep_device_id', id);
          return id;
        })();

    window.addEventListener('online',  () => { this._online = true;  this.syncNow(); });
    window.addEventListener('offline', () => { this._online = false; });
  },

  start() {
    if (!CONFIG.AZURE_FUNCTION_URL) {
      console.info('[AzureSync] No function URL configured — running offline only.');
      return;
    }
    this.syncNow();
    this._timer = setInterval(() => this.syncNow(), CONFIG.AZURE_SYNC_INTERVAL_MS);
  },

  stop() {
    clearInterval(this._timer);
    this._timer = null;
  },

  async syncNow() {
    if (!this._online || !CONFIG.AZURE_FUNCTION_URL) return;

    try {
      const clusters = await GeoMemory.getAllClusters();
      if (clusters.length === 0) return;

      const res = await fetch(CONFIG.AZURE_FUNCTION_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clusters, deviceId: this._deviceId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { merged } = await res.json();

      // Write server-merged clusters back to local IndexedDB
      // Server merges baselines from all devices that visited the same cluster
      for (const cluster of merged) {
        await GeoMemory._put(cluster);
      }

      console.log(`[AzureSync] Synced ${clusters.length} clusters, received ${merged.length} merged.`);
    } catch (err) {
      console.warn('[AzureSync] Sync failed (will retry):', err.message);
    }
  },
};
