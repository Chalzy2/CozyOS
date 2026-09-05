/**
 * =============================================================================
 * CozyOS Camera Manager — Reference In-Memory Provider
 * File: core/engines/camera/provider-inmemory.js
 * =============================================================================
 *
 * NOT A REAL HARDWARE ADAPTER (Rule 6 — Honest Engineering).
 *
 * This is a reference implementation of Camera Manager's provider interface
 * used to exercise the real orchestration logic in camera-manager.js with
 * real async calls, real state transitions, and real error paths — without
 * fabricating USB/IP/HDMI/PTZ device access this sandbox does not have.
 *
 * A production deployment replaces/augments this with real adapters (e.g.
 * node-usb for USB cameras, ONVIF/RTSP for IP cameras, a capture-card SDK
 * for HDMI, getUserMedia for webcam) — each implementing the identical
 * interface documented in camera-manager.js, so Camera Manager's own code
 * never has to change (Rule 2: no duplication, provider is the seam).
 * =============================================================================
 */

'use strict';

function createInMemoryCameraProvider(type = 'mock') {
  const devices = new Map(); // externalId -> { externalId, name, metadata, ptzCapable, connected, healthy }
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

  // --- Test/simulation controls (not part of the real provider contract,
  // used only to make hot-plug and failure paths genuinely exercisable) ---

  function _simulateDeviceAdded(device) {
    devices.set(device.externalId, { ...device, connected: false, healthy: true });
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

  // --- Real provider interface contract ---

  async function listDevices() {
    return [...devices.values()].map(({ externalId, name, metadata, ptzCapable }) => ({
      externalId, name, metadata, ptzCapable
    }));
  }

  async function connect(externalId) {
    const device = devices.get(externalId);
    if (!device) throw new Error(`[InMemoryProvider:${type}] Unknown device "${externalId}".`);
    if (!device.healthy) throw new Error(`[InMemoryProvider:${type}] Device "${externalId}" failed to connect (unhealthy).`);
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

  async function sendPTZCommand(externalId, command) {
    const device = devices.get(externalId);
    if (!device) throw new Error(`[InMemoryProvider:${type}] Unknown device "${externalId}".`);
    if (!device.ptzCapable) throw new Error(`[InMemoryProvider:${type}] Device "${externalId}" is not PTZ-capable.`);
    if (!command || typeof command !== 'object') throw new Error(`[InMemoryProvider:${type}] Invalid PTZ command.`);
    device.lastPTZCommand = command;
  }

  return {
    type,
    listDevices,
    connect,
    disconnect,
    getHealth,
    sendPTZCommand,
    on,
    // simulation controls — test-only, intentionally outside the real contract
    _simulateDeviceAdded,
    _simulateDeviceRemoved,
    _simulateUnhealthy
  };
}

export { createInMemoryCameraProvider };
export default createInMemoryCameraProvider;
