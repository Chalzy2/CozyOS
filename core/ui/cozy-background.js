/**
 * Cozy Background Controller
 * Manages dynamic, ambient background effects (e.g., interactive canvas, particle drifts, or smooth gradient shifts)
 * that align with the cozy aesthetic without degrading performance.
 */
class CozyBackground {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.type = options.type || 'ambient'; // 'ambient', 'particles', or 'gradient'
    this.canvas = null;
    this.ctx = null;
    this.animationFrameId = null;
    this.particles = [];
    
    this.init();
  }

  init() {
    // Ensure container has relative/absolute positioning to host background
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    if (this.type === 'particles' || this.type === 'ambient') {
      this.createCanvas();
      this.setupResizeListener();
      this.type === 'particles' ? this.initParticles() : this.initAmbientDrift();
    } else {
      this.container.classList.add('cozy-bg-gradient-animate');
    }
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cozy-background-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = '-1';
    this.canvas.style.pointerEvents = 'none';
    
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  resizeCanvas() {
    if (this.canvas) {
      this.canvas.width = this.container.offsetWidth;
      this.canvas.height = this.container.offsetHeight;
    }
  }

  setupResizeListener() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      if (this.type === 'particles') this.initParticles();
    });
  }

  initParticles() {
    this.particles = [];
    const count = Math.min(Math.floor(this.canvas.width / 40), 100);
    const colors = ['rgba(240, 219, 203, 0.4)', 'rgba(214, 186, 171, 0.3)', 'rgba(189, 149, 137, 0.2)'];

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        radius: Math.random() * 4 + 1,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    this.animateParticles();
  }

  animateParticles() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;

      // Wrap around screen edges
      if (p.x < 0) p.x = this.canvas.width;
      if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height;
      if (p.y > this.canvas.height) p.y = 0;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.fill();
    });

    this.animationFrameId = requestAnimationFrame(() => this.animateParticles());
  }

  initAmbientDrift() {
    let time = 0;
    const animateDrift = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      const width = this.canvas.width;
      const height = this.canvas.height;
      const gradient = this.ctx.createRadialGradient(
        width / 2 + Math.sin(time) * (width * 0.2),
        height / 2 + Math.cos(time * 0.8) * (height * 0.2),
        width * 0.1,
        width / 2,
        height / 2,
        width * 0.7
      );

      gradient.addColorStop(0, 'rgba(242, 230, 218, 0.15)');
      gradient.addColorStop(0.5, 'rgba(229, 212, 196, 0.08)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);

      time += 0.002;
      this.animationFrameId = requestAnimationFrame(animateDrift);
    };
    
    animateDrift();
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

export default CozyBackground;
