/**
 * Cozy Toast system
 * Clean, elegant visual notifications that slide gracefully from the screen boundaries
 * without breaking user focus or creating intrusive visual clutter.
 */
class CozyToast {
  constructor() {
    this.container = this.getOrCreateContainer();
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
      duration = 4000,
      actionLabel = null,
      onAction = null
    } = options;

    const toast = document.createElement('div');
    toast.className = `cozy-toast cozy-toast-${type}`;
    toast.style.cssText = `
      padding: 1rem 1.25rem;
      border-radius: var(--cozy-radius-md, 8px);
      background-color: var(--cozy-bg-toast, #ffffff);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
      border-left: 4px solid var(--cozy-accent-${type}, #d6baab);
      color: var(--cozy-text-dark, #4a3e3d);
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
        color: var(--cozy-color-primary, #bd9589);
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

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
  }

  dismiss(toast) {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(1rem)';
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }
}

export const toast = new CozyToast();
export default CozyToast;
