/**
 * Cozy Navigation Controller
 * Provides buttery-smooth route transition handlers, dynamic accent indicators,
 * and warm, delightful screen navigation animations.
 */
class CozyNavigation {
  constructor(options = {}) {
    this.navElement = options.navElement || document.querySelector('.cozy-nav');
    this.links = this.navElement ? this.navElement.querySelectorAll('a') : [];
    this.indicator = null;
    
    this.init();
  }

  init() {
    if (!this.navElement) return;

    this.createIndicator();
    this.setupListeners();
    this.updateIndicatorPosition(this.navElement.querySelector('a.active') || this.links[0]);
  }

  createIndicator() {
    this.indicator = document.createElement('div');
    this.indicator.className = 'cozy-nav-indicator';
    this.indicator.style.cssText = `
      position: absolute;
      bottom: 0;
      height: 3px;
      background-color: var(--cozy-color-primary, #bd9589);
      border-radius: 3px;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: left;
    `;
    this.navElement.style.position = 'relative';
    this.navElement.appendChild(this.indicator);
  }

  setupListeners() {
    this.links.forEach(link => {
      link.addEventListener('click', (e) => {
        this.setActive(link);
      });

      link.addEventListener('mouseenter', () => {
        this.updateIndicatorPosition(link);
      });
    });

    this.navElement.addEventListener('mouseleave', () => {
      const activeLink = this.navElement.querySelector('a.active') || this.links[0];
      this.updateIndicatorPosition(activeLink);
    });
  }

  setActive(targetLink) {
    this.links.forEach(link => link.classList.remove('active'));
    targetLink.classList.add('active');
    this.updateIndicatorPosition(targetLink);
  }

  updateIndicatorPosition(targetLink) {
    if (!targetLink || !this.indicator) return;

    const navRect = this.navElement.getBoundingClientRect();
    const targetRect = targetLink.getBoundingClientRect();

    const leftOffset = targetRect.left - navRect.left;
    
    this.indicator.style.width = `${targetRect.width}px`;
    this.indicator.style.transform = `translateX(${leftOffset}px)`;
  }
}

export default CozyNavigation;
