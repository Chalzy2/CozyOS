/**
 * Cozy Live Engine
 * Handles micro-interactions, real-time live events, and soft UI updates (e.g., quiet,
 * non-disruptive badge flashes, pulsing activities, or status shifts).
 */
class CozyLive {
  constructor(options = {}) {
    this.pulseElements = document.querySelectorAll('[data-cozy-live-pulse]');
    this.activities = new Map();
    this.init();
  }

  init() {
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.setupPulseAnimations();
    this.observeNewPulseElements();
  }

  setupPulseAnimations() {
    if (this.prefersReducedMotion) return;
    this.pulseElements.forEach(el => this.applyPulse(el));
  }

  applyPulse(el) {
    const speed = el.getAttribute('data-cozy-live-pulse') || 'slow';
    let duration = '3s';
    if (speed === 'normal') duration = '2s';
    if (speed === 'fast') duration = '1s';

    el.style.animation = `cozyPulse ${duration} infinite ease-in-out`;
  }

  /**
   * CozyOS loads module HTML dynamically (see cozy-ui.js), replacing
   * #cozy-app-root's content after this class has already captured its
   * initial pulseElements list. Watch for newly inserted pulse elements
   * so they get animated too, without needing loadModule() to know
   * anything about this engine.
   */
  observeNewPulseElements() {
    if (this.prefersReducedMotion) return;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('[data-cozy-live-pulse]')) this.applyPulse(node);
          node.querySelectorAll?.('[data-cozy-live-pulse]').forEach(el => this.applyPulse(el));
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Updates a specific UI marker softly with new data.
   * @param {string} channel - The dynamic channel target
   * @param {Function} updateFn - Handled transform logic
   */
  subscribe(channel, updateFn) {
    if (!this.activities.has(channel)) {
      this.activities.set(channel, []);
    }
    this.activities.get(channel).push(updateFn);
  }

  /**
   * Broadcast/Publish an update safely with soft fade elements.
   * @param {string} channel - Target channel
   * @param {any} data - Feed payload
   */
  publish(channel, data) {
    if (this.activities.has(channel)) {
      this.activities.get(channel).forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[CozyLive] Error processing update on ${channel}:`, err);
        }
      });
    }
  }
}

window.CozyOS = window.CozyOS || {};
window.CozyOS.Live = new CozyLive();
window.CozyOS.CozyLive = CozyLive;
