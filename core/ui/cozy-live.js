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
    this.setupPulseAnimations();
  }

  setupPulseAnimations() {
    this.pulseElements.forEach(el => {
      const speed = el.getAttribute('data-cozy-live-pulse') || 'slow';
      let duration = '3s';
      if (speed === 'normal') duration = '2s';
      if (speed === 'fast') duration = '1s';

      el.style.animation = `cozyPulse ${duration} infinite ease-in-out`;
    });
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

export default CozyLive;
