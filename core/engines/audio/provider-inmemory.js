/**
 * =============================================================================
 * CozyOS Audio Manager — Reference In-Memory Provider
 * File: core/engines/audio/provider-inmemory.js
 * =============================================================================
 *
 * NOT A REAL HARDWARE ADAPTER (Rule 6 — Honest Engineering).
 *
 * Reference implementation of Audio Manager's provider interface, used to
 * exercise real orchestration and mixer logic with real async calls and
 * real error paths, without fabricating audio hardware this sandbox does
 * not have. withDsp=false produces a provider that only implements the four
 * REQUIRED methods, so Audio Manager's honest "provider doesn't support
 * this" fallback paths are exercised for real, not just documented.
 * =============================================================================
 */

'use strict';

function createInMemoryAudioProvider(type = 'mock', { withDsp = true } = {}) {
  const devices = new Map();
  const listeners = new Map();

  function on(eventName, handler) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
    return () => listeners.get(eventName)?.delete(handler);
  }

  function emit(eventName, payload) {
    const handlers = listeners.get(eventName);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  function _simulateDeviceAdded(device) {
    devices.set(device.externalId, {
      ...device,
      connected: false,
      healthy: true,
      gainDb: 0,
      muted: false,
      echoCancellation: false,
      noiseReduction: false
    });
    emit('device:added', device);
  }

  function _simulateDeviceRemoved(externalId) {
    const device = devices.get(externalId);
    devices.delete(externalId);
    if (device) emit('device:removed', { externalId, name: device.name });
  }

  function _simulateUnhealthy(externalId, detail) {
    const device = devices.get(externalId);
    if (device) device.healthy = false;
    return { ok: false, detail: detail || 'Simulated hardware fault.' };
  }

  function _simulateLevel(externalId, peakDb, rmsDb) {
    const device = devices.get(externalId);
    if (device) device.simulatedLevel = { peakDb, rmsDb };
  }

  async function listDevices() {
    return [...devices.values()].map(({ externalId, name, metadata }) => ({ externalId, name, metadata }));
  }

  async function connect(externalId) {
    const device = devices.get(externalId);
    if (!device) throw new Error(`[InMemoryAudioProvider:${type}] Unknown device "${externalId}".`);
    if (!device.healthy) throw new Error(`[InMemoryAudioProvider:${type}] Device "${externalId}" failed to connect (unhealthy).`);
    device.connected = true;
    return { streamHandle: { providerType: type, externalId, kind: 'in-memory-reference-handle' } };
  }

  async function disconnect(externalId) {
    const device = devices.get(externalId);
    if (device) device.connected = false;
  }

  async function getHealth(externalId) {
    const device = devices.get(externalId);
    if (!device) return { ok: false, detail: 'Device not found.' };
    return { ok: device.healthy, detail: device.healthy ? 'OK' : 'Simulated fault.' };
  }

  const dspMethods = withDsp
    ? {
        async setGain(externalId, gainDb) {
          const device = devices.get(externalId);
          if (!device) throw new Error(`[InMemoryAudioProvider:${type}] Unknown device "${externalId}".`);
          device.gainDb = gainDb;
        },
        async setMute(externalId, muted) {
          const device = devices.get(externalId);
          if (!device) throw new Error(`[InMemoryAudioProvider:${type}] Unknown device "${externalId}".`);
          device.muted = muted;
        },
        async setEchoCancellation(externalId, enabled) {
          const device = devices.get(externalId);
          if (!device) throw new Error(`[InMemoryAudioProvider:${type}] Unknown device "${externalId}".`);
          device.echoCancellation = enabled;
        },
        async setNoiseReduction(externalId, enabled) {
          const device = devices.get(externalId);
          if (!device) throw new Error(`[InMemoryAudioProvider:${type}] Unknown device "${externalId}".`);
          device.noiseReduction = enabled;
        },
        async getLevel(externalId) {
          const device = devices.get(externalId);
          if (!device) throw new Error(`[InMemoryAudioProvider:${type}] Unknown device "${externalId}".`);
          return device.simulatedLevel || { peakDb: -60, rmsDb: -70 };
        }
      }
    : {};

  return {
    type,
    listDevices,
    connect,
    disconnect,
    getHealth,
    ...dspMethods,
    on,
    _simulateDeviceAdded,
    _simulateDeviceRemoved,
    _simulateUnhealthy,
    _simulateLevel
  };
}

export { createInMemoryAudioProvider };
export default createInMemoryAudioProvider;
