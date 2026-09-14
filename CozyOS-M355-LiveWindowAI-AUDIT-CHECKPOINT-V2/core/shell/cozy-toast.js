/**
 * Cozy Toast system
 * Clean, elegant visual notifications that slide gracefully from the screen boundaries
 * without breaking user focus or creating intrusive visual clutter.
 */

// Platform decision (frozen): max concurrently visible toasts, FIFO eviction.
const MAX_VISIBLE_TOASTS = 3;

// Platform decision (frozen): priority ranking — errors are protected from
// being evicted to make room for lower-priority toasts.
const TYPE_PRIORITY = { error: 4, warning: 3, success: 2, info: 1 };

// Platform decision (frozen): per-type auto-dismiss duration in ms.
// Error defaults to 8s but can still be made fully manual via { duration: 0 }.
const TYPE_DURATION = { info: 3000, success: 4000, warning: 6000, error: 8000 };

class CozyToast {
  constructor() {
    this.container = this.getOrCreateContainer();
    // Tracks currently visible toasts for dedupe/eviction/priority logic.
    // Each entry: { el, textSpan, message, type, priority, count, timerId }
    this.active = [];
  }

  getOrCreateContainer() {
    let container = document.querySelector('.cozy-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'cozy-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        z-index: 9999;
        pointer-events: none;
        max-width: 350px;
        width: 100%;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  show(message, options = {}) {
    const {
      type = 'info', // 'info', 'success', 'warning', 'error'
      duration = TYPE_DURATION[type] ?? 4000,
      actionLabel = null,
      onAction = null
    } = options;
    const priority = TYPE_PRIORITY[type] ?? TYPE_PRIORITY.info;

    // Duplicate messages: refresh the existing toast instead of stacking
    // another copy. e.g. "Payment received (x3)".
    const existing = this.active.find(entry => entry.message === message);
    if (existing) {
      existing.count += 1;
      existing.textSpan.innerText = `${message} (x${existing.count})`;
      clearTimeout(existing.timerId);
      if (duration > 0) {
        existing.timerId = setTimeout(() => this.dismiss(existing.el), duration);
      }
      return;
    }

    // Max visible toasts (frozen: 3), FIFO — but errors are never evicted
    // to make room for a lower-priority toast. If the least-important
    // visible toast already outranks the incoming one, the incoming toast
    // is dropped rather than bumping something more important.
    if (this.active.length >= MAX_VISIBLE_TOASTS) {
      let evictIndex = 0;
      for (let i = 1; i < this.active.length; i++) {
        if (this.active[i].priority < this.active[evictIndex].priority) evictIndex = i;
      }
      const evictCandidate = this.active[evictIndex];
      if (priority > evictCandidate.priority) {
        clearTimeout(evictCandidate.timerId);
        this.dismiss(evictCandidate.el);
      } else {
        console.info(`[CozyToast] Dropped "${message}" — ${MAX_VISIBLE_TOASTS} higher-or-equal priority toasts already visible.`);
        return;
      }
    }

    const toast = document.createElement('div');
    toast.className = `cozy-toast cozy-toast-${type}`;
    toast.style.cssText = `
      padding: 1rem 1.25rem;
      border-radius: var(--cozy-radius-md, 8px);
      background-color: var(--cozy-glass-bg, #ffffff);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      border-left: 4px solid var(--cozy-${type}, #d6baab);
      color: var(--cozy-text, #4a3e3d);
      font-family: inherit;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(1rem);
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
    `;

    // Internal text
    const textSpan = document.createElement('span');
    textSpan.innerText = message;
    toast.appendChild(textSpan);

    // Optional Action Button
    if (actionLabel && onAction) {
      const button = document.createElement('button');
      button.innerText = actionLabel;
      button.style.cssText = `
        background: none;
        border: none;
        margin-left: 1rem;
        padding: 0.25rem 0.5rem;
        color: var(--cozy-brand-primary, #bd9589);
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
        transition: opacity 0.2s;
      `;
      button.addEventListener('mouseover', () => button.style.opacity = '0.7');
      button.addEventListener('mouseout', () => button.style.opacity = '1');
      button.addEventListener('click', () => {
        onAction();
        this.dismiss(toast);
      });
      toast.appendChild(button);
    }

    this.container.appendChild(toast);

    // Force reflow and animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    const entry = { el: toast, textSpan, message, type, priority, count: 1, timerId: null };
    if (duration > 0) {
      entry.timerId = setTimeout(() => this.dismiss(toast), duration);
    }
    this.active.push(entry);
  }

  dismiss(toast) {
    const index = this.active.findIndex(entry => entry.el === toast);
    if (index !== -1) {
      clearTimeout(this.active[index].timerId);
      this.active.splice(index, 1);
    }

    toast.style.opacity = '0';
    toast.style.transform = 'translateY(1rem)';
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }
}

window.CozyOS = window.CozyOS || {};
window.CozyOS.Toast = new CozyToast();
window.CozyOS.CozyToast = CozyToast;
