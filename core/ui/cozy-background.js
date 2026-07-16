/**
 * CozyOS Enterprise Design System — High-League Living Experience Engine
 * File Reference: core/ui/cozy-background.js
 * * Permanent rotating watermarks, ambient waterfalls, sparks, and graphics 
 * generated procedural based on the loaded CSS custom properties.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const PRO_MESSAGES = [
        "Teach AI Your Language",
        "Built for Africa. Ready for the World.",
        "Offline First. Enterprise Ready.",
        "One Platform. Unlimited Businesses.",
        "Smart Software. Simple Business.",
        "Secure by Design.",
        "Your Business. Your Operating System.",
        "Innovation Without Limits.",
        "Welcome to CozyOS.",
        "Build Once. Scale Everywhere.",
        "Every Business Matters.",
        "Precision. Performance. Progress."
    ];

    class CozyLivingBackground {
        constructor() {
            this.canvas = null;
            this.ctx = null;
            this.animationFrameId = null;
            this.isTabActive = true;
            this.prefersReducedMotion = false;

            // Theme transition configuration
            this.activeApp = "developer";
            this.targetApp = "developer";
            this.transitionAlpha = 1.0; 
            
            // Shared Simulation States
            this.particles = [];
            this.clouds = [];
            this.waterfallDrops = [];
            this.sparks = [];
            this.schoolGlyphs = [];
            this.soccerBall = null;
            this.grassBlades = [];
            
            // Permanent Watermark Rotation Parameters
            this.logoRotation = 0;
            this.microGridOffset = 0;
            
            // Branding Message Rotator
            this.messageIndex = 0;
            this.messageText = PRO_MESSAGES[0];
            this.messageAlpha = 0;
            this.messageFadeState = "in"; // "in", "hold", "out"
            this.messageTimer = 0;

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", () => this.init());
            } else {
                this.init();
            }
        }

        init() {
            if (document.getElementById("cozy-live-bg-canvas")) return;

            this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document.addEventListener("visibilitychange", () => {
                this.isTabActive = !document.hidden;
            });

            this.canvas = document.createElement("canvas");
            this.canvas.id = "cozy-live-bg-canvas";
            
            Object.assign(this.canvas.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                zIndex: "-100",
                pointerEvents: "none",
                background: "transparent" // Let cozy-theme.css radial gradient shine through
            });

            document.body.prepend(this.canvas);
            this.ctx = this.canvas.getContext("2d");

            this.handleResize();
            window.addEventListener("resize", () => this.handleResize());

            this.generateInitialAssets();
            this.animate();
            this.observeThemeChanges();
        }

        handleResize() {
            if (!this.canvas) return;
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = window.innerWidth * dpr;
            this.canvas.height = window.innerHeight * dpr;
            this.ctx.scale(dpr, dpr);
            this.canvas.style.width = window.innerWidth + "px";
            this.canvas.style.height = window.innerHeight + "px";
            this.generateInitialAssets();
        }

        observeThemeChanges() {
            const getTheme = () => document.documentElement.getAttribute("data-cozy-app") || "developer";
            this.updateForTheme(getTheme());

            const observer = new MutationObserver(() => {
                const updated = getTheme();
                if (updated !== this.targetApp) {
                    this.updateForTheme(updated);
                }
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-cozy-app"] });
        }

        updateForTheme(themeName) {
            this.targetApp = themeName;
            this.transitionAlpha = 0.0;
        }

        generateInitialAssets() {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // Clouds (Nature)
            this.clouds = [];
            for (let i = 0; i < 5; i++) {
                this.clouds.push({
                    x: Math.random() * width,
                    y: Math.random() * (height * 0.35),
                    radius: Math.random() * 50 + 40,
                    speed: Math.random() * 0.15 + 0.05,
                    opacity: Math.random() * 0.04 + 0.02
                });
            }

            // Waterfalls
            this.waterfallDrops = [];
            for (let i = 0; i < 40; i++) {
                this.waterfallDrops.push({
                    x: (width * 0.8) + (Math.random() * 30),
                    y: Math.random() * height,
                    vy: Math.random() * 4 + 4,
                    length: Math.random() * 15 + 10,
                    opacity: Math.random() * 0.15 + 0.05
                });
            }

            // Particles / Heavy Dust (Quarry)
            this.particles = [];
            for (let i = 0; i < 45; i++) {
                this.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: Math.random() * 0.3 + 0.1,
                    size: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.12 + 0.03
                });
            }

            // Mining Sparks (Quarry)
            this.sparks = [];
            for (let i = 0; i < 15; i++) {
                this.sparks.push(this.createSpark(width, height));
            }

            // Floating Symbols (School)
            const academicGlyphs = ["A", "B", "C", "π", "∫", "x", "y", "1", "+", "f(x)", "Δ"];
            this.schoolGlyphs = [];
            for (let i = 0; i < 20; i++) {
                this.schoolGlyphs.push({
                    x: Math.random() * width,
                    y: height + Math.random() * 100,
                    char: academicGlyphs[Math.floor(Math.random() * academicGlyphs.length)],
                    vy: Math.random() * 0.3 + 0.1,
                    size: Math.random() * 12 + 10,
                    opacity: Math.random() * 0.06 + 0.02,
                    spin: Math.random() * 0.02 - 0.01,
                    angle: Math.random() * Math.PI
                });
            }

            // Sports Physics Ball
            this.soccerBall = {
                x: width * 0.3,
                y: height * 0.2,
                vx: 1.2,
                vy: 0.8,
                radius: 24,
                rotation: 0,
                spinRate: 0.01
            };

            // Sports Grass
            this.grassBlades = [];
            const bladeCount = Math.floor(width / 15);
            for (let i = 0; i < bladeCount; i++) {
                this.grassBlades.push({
                    x: i * 15 + (Math.random() * 5),
                    height: Math.random() * 25 + 15,
                    swayOffset: Math.random() * 100,
                    swaySpeed: Math.random() * 0.015 + 0.005
                });
            }
        }

        createSpark(width, height) {
            return {
                x: Math.random() * width,
                y: height - (Math.random() * 50),
                vx: (Math.random() - 0.5) * 1.5,
                vy: -(Math.random() * 2 + 1.5),
                size: Math.random() * 2.5 + 1,
                life: Math.random() * 0.8 + 0.2,
                // Fetches dynamic colors directly from the active theme
                color: Math.random() > 0.5 ? "var(--cozy-brand-primary)" : "var(--cozy-brand-accent)"
            };
        }

        animate() {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
            if (!this.isTabActive || this.prefersReducedMotion || !this.ctx || !this.canvas) return;

            const width = window.innerWidth;
            const height = window.innerHeight;

            this.logoRotation += 0.0003; 
            this.microGridOffset = (this.microGridOffset + 0.02) % 40;

            if (this.transitionAlpha < 1.0) {
                this.transitionAlpha += 0.02;
                if (this.transitionAlpha >= 1.0) {
                    this.transitionAlpha = 1.0;
                    this.activeApp = this.targetApp;
                }
            }

            // Clear to transparency so CSS radial gradient variables animate natively underneath
            this.ctx.clearRect(0, 0, width, height);

            // Render live elements
            this.drawSpecializedScenes(width, height);
            this.drawWatermarkLayers(width, height);
            this.drawRotatingBrandingMessages(width, height);
        }

        drawSpecializedScenes(width, height) {
            if (this.transitionAlpha < 1.0) {
                this.ctx.globalAlpha = 1.0 - this.transitionAlpha;
                this.renderScene(this.activeApp, width, height);
                this.ctx.globalAlpha = this.transitionAlpha;
                this.renderScene(this.targetApp, width, height);
                this.ctx.globalAlpha = 1.0;
            } else {
                this.renderScene(this.targetApp, width, height);
            }
        }

        renderScene(appName, width, height) {
            switch (appName) {
                case "shopos":
                case "agricultureos":
                    this.renderNatureScene(width, height);
                    break;
                case "quarryos":
                    this.renderQuarryScene(width, height);
                    break;
                case "schoolos":
                case "educationos":
                    this.renderSchoolScene(width, height);
                    break;
                case "sports":
                    this.renderSportsScene(width, height);
                    break;
                case "mpesaos":
                    this.renderMpesaScene(width, height);
                    break;
                case "developer":
                default:
                    this.renderDeveloperScene(width, height);
                    break;
            }
        }

        renderNatureScene(width, height) {
            this.ctx.save();
            const hour = new Date().getHours();
            const isDay = hour > 6 && hour < 18;
            const lightX = width * 0.15;
            const lightY = height * 0.15;
            
            if (isDay) {
                const sunGrad = this.ctx.createRadialGradient(lightX, lightY, 2, lightX, lightY, 30);
                sunGrad.addColorStop(0, "rgba(251, 191, 36, 0.08)");
                sunGrad.addColorStop(1, "rgba(0,0,0,0)");
                this.ctx.fillStyle = sunGrad;
                this.ctx.beginPath();
                this.ctx.arc(lightX, lightY, 30, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
                this.ctx.beginPath();
                this.ctx.arc(lightX, lightY, 15, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.clouds.forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x - cloud.radius > width) cloud.x = -cloud.radius;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
                this.ctx.beginPath();
                this.ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
                this.ctx.fill();
            });

            this.waterfallDrops.forEach(drop => {
                drop.y += drop.vy;
                if (drop.y > height) {
                    drop.y = -drop.length;
                }
                this.ctx.strokeStyle = `rgba(56, 189, 248, ${drop.opacity})`;
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                this.ctx.moveTo(drop.x, drop.y);
                this.ctx.lineTo(drop.x, drop.y + drop.length);
                this.ctx.stroke();
            });
            this.ctx.restore();
        }

        renderQuarryScene(width, height) {
            this.ctx.save();
            const time = Date.now() * 0.0003;
            this.ctx.strokeStyle = "rgba(120, 113, 108, 0.03)";
            this.ctx.lineWidth = 4;
            
            const drawCog = (cx, cy, r, teeth, rotation) => {
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.stroke();
                for (let i = 0; i < teeth; i++) {
                    const angle = rotation + (i * (Math.PI * 2 / teeth));
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                    this.ctx.lineTo(cx + Math.cos(angle) * (r + 8), cy + Math.sin(angle) * (r + 8));
                    this.ctx.stroke();
                }
            };
            drawCog(width - 80, height - 80, 50, 12, time);

            this.sparks.forEach(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.life -= 0.005;
                if (s.life <= 0) Object.assign(s, this.createSpark(width, height));
                
                this.ctx.fillStyle = s.color;
                this.ctx.globalAlpha = s.life * 0.3;
                this.ctx.beginPath();
                this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1.0;

            this.particles.forEach(p => {
                p.y += p.vy;
                p.x += p.vx;
                if (p.y > height) p.y = 0;
                this.ctx.fillStyle = `rgba(168, 162, 158, ${p.alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.restore();
        }

        renderSchoolScene(width, height) {
            this.ctx.save();
            const intensity = Math.sin(Date.now() * 0.001) * 0.015 + 0.02;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(width * 0.4, 0);
            this.ctx.lineTo(width * 0.7, height);
            this.ctx.lineTo(0, height);
            this.ctx.fill();

            this.schoolGlyphs.forEach(g => {
                g.y -= g.vy;
                if (g.y < -30) {
                    g.y = height + 30;
                    g.x = Math.random() * width;
                }
                this.ctx.save();
                this.ctx.translate(g.x, g.y);
                this.ctx.rotate(g.angle);
                this.ctx.font = `italic ${g.size}px serif`;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${g.opacity})`;
                this.ctx.fillText(g.char, 0, 0);
                this.ctx.restore();
            });
            this.ctx.restore();
        }
        /* ==========================================================================
   AGRICULTUREOS ADDITIONS
   ========================================================================== */

// 1. [Add to generateInitialAssets() inside cozy-background.js]
this.wheatFields = [];
const fieldDensity = Math.floor(width / 18);
for (let i = 0; i < fieldDensity; i++) {
    this.wheatFields.push({
        x: i * 18 + (Math.random() * 6),
        height: Math.random() * 35 + 20,
        swayOffset: Math.random() * 150,
        swaySpeed: Math.random() * 0.012 + 0.004,
        yieldHeadSize: Math.random() * 5 + 3
    });
}

// 2. [Add to renderScene() switch-case or map to 'agricultureos']
case "agricultureos":
    this.renderAgricultureScene(width, height);
    break;

// 3. [Add as a method to CozyLivingBackground class]
renderAgricultureScene(width, height) {
    this.ctx.save();
    
    // Draw soft sun beams rising from lower left
    const beamGrad = this.ctx.createLinearGradient(0, height, width * 0.4, 0);
    beamGrad.addColorStop(0, "rgba(234, 179, 8, 0.04)"); // Wheat Gold
    beamGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = beamGrad;
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);
    this.ctx.lineTo(0, height * 0.4);
    this.ctx.lineTo(width * 0.6, 0);
    this.ctx.lineTo(width, 0);
    this.ctx.closePath();
    this.ctx.fill();

    // Render biological drifting spores (custom particles)
    this.particles.forEach(p => {
        p.y -= p.vy * 0.8; // Drifting upwards softly
        p.x += Math.sin(Date.now() * 0.001 + p.alpha) * 0.15;
        if (p.y < 0) p.y = height;
        
        this.ctx.fillStyle = `rgba(234, 179, 8, ${p.alpha * 0.4})`; // Gold spores
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
        this.ctx.fill();
    });

    // Draw swaying wheat blades at bottom layer
    this.ctx.strokeStyle = "rgba(234, 179, 8, 0.06)";
    this.ctx.lineWidth = 1.8;
    this.wheatFields.forEach(blade => {
        const sway = Math.sin(Date.now() * blade.swaySpeed + blade.swayOffset) * 16;
        
        this.ctx.beginPath();
        this.ctx.moveTo(blade.x, height);
        // Quad curve for organic sway structure
        this.ctx.quadraticCurveTo(
            blade.x, 
            height - blade.height * 0.5, 
            blade.x + sway, 
            height - blade.height
        );
        this.ctx.stroke();

        // Draw seed head (wheat spikelet)
        this.ctx.fillStyle = "rgba(234, 179, 8, 0.08)";
        this.ctx.beginPath();
        this.ctx.arc(blade.x + sway, height - blade.height, blade.yieldHeadSize, 0, Math.PI * 2);
        this.ctx.fill();
    });

    this.ctx.restore();
        }
/* ==========================================================================
   SPORTS MODE ADDITIONS
   ========================================================================== */

// 1. [Add to renderScene() switch-case or map to 'sports']
case "sports":
    this.renderSportsScene(width, height);
    break;

// 2. [Add as a method to CozyLivingBackground class]
renderSportsScene(width, height) {
    this.ctx.save();

    // Draw dynamic ground grass lines
    this.ctx.strokeStyle = "rgba(34, 197, 94, 0.03)";
    this.ctx.lineWidth = 1.5;
    this.grassBlades.forEach(blade => {
        const sway = Math.sin(Date.now() * blade.swaySpeed + blade.swayOffset) * 10;
        this.ctx.beginPath();
        this.ctx.moveTo(blade.x, height);
        this.ctx.quadraticCurveTo(blade.x, height - blade.height * 0.6, blade.x + sway, height - blade.height);
        this.ctx.stroke();
    });

    // Physics Update: Ball boundaries and velocity
    const ball = this.soccerBall;
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.rotation += ball.vx * ball.spinRate;

    // Boundary bounces (elastic collisions with walls)
    if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx *= -1;
    } else if (ball.x + ball.radius > width) {
        ball.x = width - ball.radius;
        ball.vx *= -1;
    }

    if (ball.y - ball.radius < 0) {
        ball.y = ball.radius;
        ball.vy *= -1;
    } else if (ball.y + ball.radius > height) {
        ball.y = height - ball.radius;
        ball.vy *= -1;
    }

    // Render the interactive geometric vector ball
    this.ctx.save();
    this.ctx.translate(ball.x, ball.y);
    this.ctx.rotate(ball.rotation);
    
    // Outer shadow rim
    this.ctx.fillStyle = "rgba(34, 197, 94, 0.02)";
    this.ctx.beginPath();
    this.ctx.arc(2, 2, ball.radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Wireframe ball vector lines
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Draw stylized geodesic pane lines (rotating details)
    this.ctx.beginPath();
    this.ctx.moveTo(0, -ball.radius);
    this.ctx.lineTo(0, ball.radius);
    this.ctx.moveTo(-ball.radius, 0);
    this.ctx.lineTo(ball.radius, 0);
    this.ctx.stroke();
    
    this.ctx.restore();
    this.ctx.restore();
        }
/* ==========================================================================
   MPESAOS & HOSPITALOS MESH NETWORK ADDITIONS
   ========================================================================== */

// 1. [Add to renderScene() switch-case]
case "mpesaos":
    this.renderMpesaScene(width, height);
    break;
case "hospitalos":
    this.renderHospitalScene(width, height);
    break;

// 2. [Add as methods to CozyLivingBackground class]
renderMpesaScene(width, height) {
    this.ctx.save();
    // Render dynamic green node connections
    this.drawMeshNetwork("rgba(5, 150, 105, 0.04)", "rgba(5, 150, 105, 0.06)", 110);
    this.ctx.restore();
}

renderHospitalScene(width, height) {
    this.ctx.save();
    // Render dynamic medical blue cardiogram frequency links
    this.drawMeshNetwork("rgba(14, 165, 233, 0.04)", "rgba(14, 165, 233, 0.05)", 130);
    this.ctx.restore();
}

// Global utility helper to connect close-proximity particles
drawMeshNetwork(lineColor, dotColor, thresholdRange) {
    const len = this.particles.length;
    
    // Draw connections between points within range
    for (let i = 0; i < len; i++) {
        const p1 = this.particles[i];
        
        for (let j = i + 1; j < len; j++) {
            const p2 = this.particles[j];
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            
            if (dist < thresholdRange) {
                // Soft fade line depending on distance proximity
                const alphaFactor = (1 - dist / thresholdRange);
                this.ctx.strokeStyle = lineColor;
                this.ctx.globalAlpha = alphaFactor;
                this.ctx.lineWidth = 0.8;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(p2.x, p2.y);
                this.ctx.stroke();
            }
        }
        
        // Draw little node joints
        this.ctx.fillStyle = dotColor;
        this.ctx.globalAlpha = p1.alpha * 1.5;
        this.ctx.beginPath();
        this.ctx.arc(p1.x, p1.y, p1.size * 1.2, 0, Math.PI * 2);
        this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
}

        renderSportsScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
            this.ctx.lineWidth = 2.0;
            this.grassBlades.forEach(g => {
                const angle = Math.sin(Date.now() * g.swaySpeed + g.swayOffset) * 12;
                this.ctx.beginPath();
                this.ctx.moveTo(g.x, height);
                this.ctx.quadraticCurveTo(g.x, height - g.height * 0.5, g.x + angle, height - g.height);
                this.ctx.stroke();
            });

            const ball = this.soccerBall;
            ball.x += ball.vx;
            ball.y += ball.vy;
            ball.rotation += ball.vx * ball.spinRate;

            if (ball.x - ball.radius < 0 || ball.x + ball.radius > width) ball.vx *= -1;
            if (ball.y - ball.radius < 0 || ball.y + ball.radius > height) ball.vy *= -1;

            this.ctx.save();
            this.ctx.translate(ball.x, ball.y);
            this.ctx.rotate(ball.rotation);
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
            this.ctx.restore();
        }

        renderMpesaScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = "var(--cozy-brand-primary)";
            this.ctx.globalAlpha = 0.03;
            this.ctx.lineWidth = 1.0;
            
            const gridSpacing = 80;
            const shift = (Date.now() * 0.02) % gridSpacing;
            
            for (let x = -gridSpacing; x < width + gridSpacing; x += gridSpacing) {
                this.ctx.beginPath();
                this.ctx.moveTo(x + shift, 0);
                this.ctx.lineTo(x + shift, height);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        renderDeveloperScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = "var(--cozy-brand-primary)";
            this.ctx.globalAlpha = 0.04;
            this.ctx.lineWidth = 2.0;
            this.ctx.beginPath();
            const time = Date.now() * 0.0006;
            for (let x = 0; x < width; x += 15) {
                const y = (height * 0.75) + Math.sin(x * 0.0035 + time) * 45;
                if (x === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();
            this.ctx.restore();
        }

        drawWatermarkLayers(width, height) {
            this.ctx.save();
            
            // LAYER A: Permanent Slow-Rotating Brand Monogram Logo
            this.ctx.save();
            this.ctx.translate(width * 0.25, height * 0.5);
            this.ctx.rotate(this.logoRotation);
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.012)";
            this.ctx.lineWidth = 2.5;
            
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                this.ctx.lineTo(Math.cos(angle) * 80, Math.sin(angle) * 80);
            }
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.restore();

            // LAYER B: Coordinate Markers & System Diagnostics
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
            this.ctx.font = "bold 10px monospace";
            this.ctx.letterSpacing = "2px";
            
            const dateString = new Date().toISOString().slice(0, 10);
            this.ctx.fillText(`SYS_STATUS: NOMINAL // REF_${dateString}`, 45, 45);
            this.ctx.fillText("LOC_NODE: 1.002.AFR", 45, 65);

            // LAYER C: Application Signatures
            this.ctx.font = "bold 11px system-ui, sans-serif";
            this.ctx.letterSpacing = "1.5px";
            this.ctx.fillText("COZYOS CORE V2", 45, height - 40);

            this.ctx.textAlign = "right";
            this.ctx.fillText(this.targetApp.toUpperCase() + "_RUNTIME", width - 45, height - 40);
            this.ctx.restore();
        }

        drawRotatingBrandingMessages(width, height) {
            this.ctx.save();
            this.ctx.textAlign = "center";
            this.ctx.font = "italic 13px system-ui, -apple-system, sans-serif";
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.messageAlpha * 0.35})`;

            this.ctx.fillText(this.messageText, width / 2, height - 40);

            if (this.messageFadeState === "in") {
                this.messageAlpha += 0.004;
                if (this.messageAlpha >= 1) {
                    this.messageAlpha = 1;
                    this.messageFadeState = "hold";
                    this.messageTimer = 0;
                }
            } else if (this.messageFadeState === "hold") {
                this.messageTimer++;
                if (this.messageTimer > 450) {
                    this.messageFadeState = "out";
                }
            } else if (this.messageFadeState === "out") {
                this.messageAlpha -= 0.004;
                if (this.messageAlpha <= 0) {
                    this.messageAlpha = 0;
                    this.messageIndex = (this.messageIndex + 1) % PRO_MESSAGES.length;
                    this.messageText = PRO_MESSAGES[this.messageIndex];
                    this.messageFadeState = "in";
                }
            }
            this.ctx.restore();
        }
    }

    window.CozyOS.Background = new CozyLivingBackground();
})();
