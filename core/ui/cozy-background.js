/**
 * CozyOS Enterprise Design System — High-League Living Experience Engine
 * File Reference: core/ui/cozy-background.js
 * * An elite, GPU-accelerated, zero-dependency canvas renderer.
 * Features ultra-smooth scene switching and permanent, slow-orbiting 
 * multi-layered watermarks (logo vectors, micro-coordinates, and credentials)
 * operating at an elegant 1.5% to 3% opacity.
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
                background: "#080708" // Premium dark canvas anchor
            });

            document.body.prepend(this.canvas);
            this.ctx = this.canvas.getContext("2d");

            this.handleResize();
            window.addEventListener("resize", () => this.handleResize());

            // Instantiate all procedural assets
            this.generateInitialAssets();

            // Run main loop
            this.animate();

            // Hook global theme attribute changes
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
            this.generateInitialAssets(); // Regenerate coordinates for matching aspect ratio
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
            this.transitionAlpha = 0.0; // Trigger fade-in interpolation
        }

        generateInitialAssets() {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // 1. Clouds (Nature Parallax)
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

            // 2. Waterfalls
            this.waterfallDrops = [];
            for (let i = 0; i < 40; i++) {
                this.waterfallDrops.push({
                    x: (width * 0.8) + (Math.random() * 30), // Sits on the right side
                    y: Math.random() * height,
                    vy: Math.random() * 4 + 4,
                    length: Math.random() * 15 + 10,
                    opacity: Math.random() * 0.15 + 0.05
                });
            }

            // 3. Mining Cogs & Dust
            this.particles = [];
            for (let i = 0; i < 45; i++) {
                this.particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: Math.random() * 0.3 + 0.1, // Falling dust
                    size: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.12 + 0.03
                });
            }

            // 4. Mining Sparks
            this.sparks = [];
            for (let i = 0; i < 15; i++) {
                this.sparks.push(this.createSpark(width, height));
            }

            // 5. School Silent Learning Glyphs
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

            // 6. Sports / Soccer Ball Physics
            this.soccerBall = {
                x: width * 0.3,
                y: height * 0.2,
                vx: 1.2,
                vy: 0.8,
                radius: 24,
                rotation: 0,
                spinRate: 0.01
            };

            // 7. Sports Swaying Grass
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
                color: Math.random() > 0.5 ? "rgba(251, 191, 36, " : "rgba(249, 115, 22, " // Gold vs Orange
            };
        }

        getPaletteForTheme(theme) {
            const palettes = {
                developer:     { bg: [12, 10, 15],      primary: [16, 185, 129],  accent: [251, 191, 36] }, // Green/Gold
                shopos:        { bg: [15, 10, 8],       primary: [34, 197, 94],   accent: [249, 115, 22] }, // Orange/Green
                quarryos:      { bg: [18, 17, 16],      primary: [120, 113, 108], accent: [234, 179, 8] },  // Heavy Stone
                mpesaos:       { bg: [4, 15, 10],       primary: [5, 150, 105],   accent: [255, 255, 255] }, // Emerald
                hospitalos:    { bg: [8, 14, 20],       primary: [14, 165, 233],  accent: [56, 189, 248] },  // Hospital Cyan
                schoolos:      { bg: [10, 12, 20],      primary: [59, 130, 246],  accent: [168, 85, 247] },  // Class Blue
                agricultureos: { bg: [8, 16, 10],       primary: [22, 163, 74],   accent: [234, 179, 8] }   // Soft Crops
            };
            return palettes[theme] || palettes["developer"];
        }

        animate() {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
            if (!this.isTabActive || this.prefersReducedMotion || !this.ctx || !this.canvas) return;

            const width = window.innerWidth;
            const height = window.innerHeight;

            // Permanent rotation/translation increments
            this.logoRotation += 0.0003; // Ultra slow, continuous rotation
            this.microGridOffset = (this.microGridOffset + 0.02) % 40;

            // Interpolate theme switch smooth transitions
            if (this.transitionAlpha < 1.0) {
                this.transitionAlpha += 0.02; // Transition duration ~1s
                if (this.transitionAlpha >= 1.0) {
                    this.transitionAlpha = 1.0;
                    this.activeApp = this.targetApp;
                }
            }

            const activePal = this.getPaletteForTheme(this.activeApp);
            const targetPal = this.getPaletteForTheme(this.targetApp);

            // Interpolated dynamic ambient solid background to eliminate flickering artifacts
            const r = Math.round(activePal.bg[0] + (targetPal.bg[0] - activePal.bg[0]) * this.transitionAlpha);
            const g = Math.round(activePal.bg[1] + (targetPal.bg[1] - activePal.bg[1]) * this.transitionAlpha);
            const b = Math.round(activePal.bg[2] + (targetPal.bg[2] - activePal.bg[2]) * this.transitionAlpha);
            this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            this.ctx.fillRect(0, 0, width, height);

            // 1. Draw atmospheric radial glows
            this.drawUniversalAtmosphere(width, height, activePal, targetPal);

            // 2. Render specialized unique features depending on application
            this.drawSpecializedScenes(width, height);

            // 3. Render Permanent Luxury System Watermark Layers (Logo, Grid, Names)
            this.drawWatermarkLayers(width, height);

            // 4. Render rotating operational brand phrases
            this.drawRotatingBrandingMessages(width, height);
        }

        drawUniversalAtmosphere(width, height, activePal, targetPal) {
            const actPri = activePal.primary;
            const tarPri = targetPal.primary;
            const rp = Math.round(actPri[0] + (tarPri[0] - actPri[0]) * this.transitionAlpha);
            const gp = Math.round(actPri[1] + (tarPri[1] - actPri[1]) * this.transitionAlpha);
            const bp = Math.round(actPri[2] + (tarPri[2] - actPri[2]) * this.transitionAlpha);

            const grad = this.ctx.createRadialGradient(width / 2, 0, 5, width / 2, 0, height);
            grad.addColorStop(0, `rgba(${rp}, ${gp}, ${bp}, 0.06)`);
            grad.addColorStop(0.6, `rgba(${rp}, ${gp}, ${bp}, 0.02)`);
            grad.addColorStop(1, "rgba(0,0,0,0)");
            
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(0, 0, width, height);
        }

        drawSpecializedScenes(width, height) {
            // Merge both rendering routines if in transition to prevent hard cuts
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

        /* ----------------------------------------------------
         * SCENE: Nature Scene (Moving Clouds, Waterfalls, Sun/Moon)
         * ---------------------------------------------------- */
        renderNatureScene(width, height) {
            this.ctx.save();

            // A. Sky Tracking Elements (Sun / Moon Tracker)
            const hour = new Date().getHours();
            const isDay = hour > 6 && hour < 18;
            
            this.ctx.beginPath();
            const lightX = width * 0.15;
            const lightY = height * 0.15;
            
            if (isDay) {
                // Warm radiating sun
                const sunGrad = this.ctx.createRadialGradient(lightX, lightY, 2, lightX, lightY, 30);
                sunGrad.addColorStop(0, "rgba(251, 191, 36, 0.08)");
                sunGrad.addColorStop(1, "rgba(0,0,0,0)");
                this.ctx.fillStyle = sunGrad;
                this.ctx.arc(lightX, lightY, 30, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                // Silver crescent moon
                this.ctx.fillStyle = "rgba(226, 232, 240, 0.04)";
                this.ctx.arc(lightX, lightY, 15, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // B. Moving Clouds
            this.clouds.forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x - cloud.radius > width) {
                    cloud.x = -cloud.radius;
                }
                this.ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
                this.ctx.beginPath();
                this.ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
                this.ctx.arc(cloud.x + cloud.radius * 0.6, cloud.y - cloud.radius * 0.2, cloud.radius * 0.8, 0, Math.PI * 2);
                this.ctx.arc(cloud.x - cloud.radius * 0.6, cloud.y + cloud.radius * 0.1, cloud.radius * 0.7, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // C. Falling Waterfalls (Cascading down onto right bounds)
            this.waterfallDrops.forEach(drop => {
                drop.y += drop.vy;
                if (drop.y > height) {
                    drop.y = -drop.length;
                    // Splash effect at waterfall floor
                    this.ctx.fillStyle = "rgba(14, 165, 233, 0.2)";
                    this.ctx.beginPath();
                    this.ctx.arc(drop.x, height - 2, Math.random() * 4 + 2, 0, Math.PI * 2);
                    this.ctx.fill();
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

        /* ----------------------------------------------------
         * SCENE: QuarryOS (Mining dust, moving machinery, sparks)
         * ---------------------------------------------------- */
        renderQuarryScene(width, height) {
            this.ctx.save();

            // A. Slow mechanical rotating cogs (opacity 2-3%)
            const time = Date.now() * 0.0003;
            this.ctx.strokeStyle = "rgba(120, 113, 108, 0.03)";
            this.ctx.lineWidth = 4;
            
            const drawCog = (cx, cy, r, teeth, rotation) => {
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.stroke();
                
                for (let i = 0; i < teeth; i++) {
                    const angle = rotation + (i * (Math.PI * 2 / teeth));
                    const sx = cx + Math.cos(angle) * r;
                    const sy = cy + Math.sin(angle) * r;
                    const ex = cx + Math.cos(angle) * (r + 10);
                    const ey = cy + Math.sin(angle) * (r + 10);
                    this.ctx.beginPath();
                    this.ctx.moveTo(sx, sy);
                    this.ctx.lineTo(ex, ey);
                    this.ctx.stroke();
                }
            };
            drawCog(width - 80, height - 80, 50, 12, time);
            drawCog(width - 150, height - 30, 35, 8, -time * 1.3);

            // B. Rising Extraction Sparks
            this.sparks.forEach(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.life -= 0.005;

                if (s.life <= 0) {
                    Object.assign(s, this.createSpark(width, height));
                }

                this.ctx.fillStyle = `${s.color}${s.life * 0.4})`;
                this.ctx.beginPath();
                this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // C. Drifting Stone Dust Particles
            this.particles.forEach(p => {
                p.y += p.vy;
                p.x += p.vx;
                if (p.y > height) p.y = 0;
                if (p.x < 0 || p.x > width) p.vx *= -1;

                this.ctx.fillStyle = `rgba(168, 162, 158, ${p.alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });

            this.ctx.restore();
        }

        /* ----------------------------------------------------
         * SCENE: SchoolOS (Silent Learning, Floating Glyphs)
         * ---------------------------------------------------- */
        renderSchoolScene(width, height) {
            this.ctx.save();

            // A. Diagonal Pulsing Sunbeams
            const rayGrad = this.ctx.createLinearGradient(0, 0, width * 0.7, height);
            const intensity = Math.sin(Date.now() * 0.001) * 0.015 + 0.02; // Soft wave
            rayGrad.addColorStop(0, `rgba(253, 224, 71, ${intensity})`);
            rayGrad.addColorStop(0.5, "rgba(253, 224, 71, 0.005)");
            rayGrad.addColorStop(1, "rgba(0,0,0,0)");
            
            this.ctx.fillStyle = rayGrad;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(width * 0.4, 0);
            this.ctx.lineTo(width * 0.8, height);
            this.ctx.lineTo(0, height);
            this.ctx.closePath();
            this.ctx.fill();

            // B. Floating Academic Characters
            this.schoolGlyphs.forEach(g => {
                g.y -= g.vy;
                g.angle += g.spin;

                if (g.y < -30) {
                    g.y = height + 30;
                    g.x = Math.random() * width;
                }

                this.ctx.save();
                this.ctx.translate(g.x, g.y);
                this.ctx.rotate(g.angle);
                this.ctx.font = `italic ${g.size}px serif`;
                this.ctx.fillStyle = `rgba(192, 132, 252, ${g.opacity})`;
                this.ctx.fillText(g.char, 0, 0);
                this.ctx.restore();
            });

            this.ctx.restore();
        }

        /* ----------------------------------------------------
         * SCENE: Sports (Swaying grass blades, physical vector ball)
         * ---------------------------------------------------- */
        renderSportsScene(width, height) {
            this.ctx.save();

            // A. Dynamic swaying ground blades
            this.ctx.strokeStyle = "rgba(34, 197, 94, 0.04)";
            this.ctx.lineWidth = 3.0;
            this.grassBlades.forEach(g => {
                const angle = Math.sin(Date.now() * g.swaySpeed + g.swayOffset) * 12;
                this.ctx.beginPath();
                this.ctx.moveTo(g.x, height);
                this.ctx.quadraticCurveTo(g.x, height - g.height * 0.5, g.x + angle, height - g.height);
                this.ctx.stroke();
            });

            // B. Bouncing Interactive Soccer Ball (Highly aesthetic silhouette vector)
            const ball = this.soccerBall;
            ball.x += ball.vx;
            ball.y += ball.vy;
            ball.rotation += ball.vx * ball.spinRate;

            // Handle borders bounces softly
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

            this.ctx.save();
            this.ctx.translate(ball.x, ball.y);
            this.ctx.rotate(ball.rotation);

            // Draw clean aesthetic ball core at low opacity
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Draw interior geometric leather panels
            this.ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * Math.PI * 2) / 5;
                const px = Math.cos(angle) * (ball.radius * 0.6);
                const py = Math.sin(angle) * (ball.radius * 0.6);
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(px, py);
            }
            this.ctx.stroke();
            this.ctx.restore();

            this.ctx.restore();
        }

        /* ----------------------------------------------------
         * SCENE: MpesaOS (Secure Transaction Node Grid)
         * ---------------------------------------------------- */
        renderMpesaScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = "rgba(5, 150, 105, 0.025)";
            this.ctx.lineWidth = 1.0;
            
            // Draw an overlaying digital ledger constellation network
            const gridSpacing = 80;
            const shift = (Date.now() * 0.02) % gridSpacing;
            
            for (let x = -gridSpacing; x < width + gridSpacing; x += gridSpacing) {
                this.ctx.beginPath();
                this.ctx.moveTo(x + shift, 0);
                this.ctx.lineTo(x + shift, height);
                this.ctx.stroke();
            }

            // Draw tiny flashing transaction packet dots
            this.ctx.fillStyle = "rgba(5, 150, 105, 0.25)";
            for (let i = 0; i < 8; i++) {
                const px = (width * 0.1) + ((Date.now() * 0.05 + i * 200) % (width * 0.8));
                const py = height * 0.4 + Math.sin(px * 0.005) * 50;
                this.ctx.beginPath();
                this.ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.restore();
        }

        /* ----------------------------------------------------
         * SCENE: Developer Mode (Clean Technical Aurora Wave)
         * ---------------------------------------------------- */
        renderDeveloperScene(width, height) {
            this.ctx.save();
            this.ctx.strokeStyle = "rgba(16, 185, 129, 0.035)";
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

        /* ----------------------------------------------------
         * PERMANENT LUXURY WATERMARKS & SECURITY LAYERS
         * ---------------------------------------------------- */
        drawWatermarkLayers(width, height) {
            this.ctx.save();
            
            // LAYER A: Permanent Slow-Rotating Brand Monogram Logo (Center-Left Background, Opacity 1.5%)
            this.ctx.save();
            const logoX = width * 0.25;
            const logoY = height * 0.5;
            this.ctx.translate(logoX, logoY);
            this.ctx.rotate(this.logoRotation);
            
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
            this.ctx.lineWidth = 2.5;
            
            // Draw Geometric Outer Shield (Cozy Cabin shape)
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                const x = Math.cos(angle) * 80;
                const y = Math.sin(angle) * 80;
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.closePath();
            this.ctx.stroke();
            
            // Inner Cabin line symbols
            this.ctx.beginPath();
            this.ctx.moveTo(-35, 15);
            this.ctx.lineTo(0, -35);
            this.ctx.lineTo(35, 15);
            this.ctx.moveTo(-20, 15);
            this.ctx.lineTo(-20, -5);
            this.ctx.lineTo(20, -5);
            this.ctx.lineTo(20, 15);
            this.ctx.stroke();
            this.ctx.restore();

            // LAYER B: Technical Radar / Coordinate Markers (Fixed Opacity 2.5%)
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
            this.ctx.font = "bold 10px monospace";
            this.ctx.letterSpacing = "2px";
            
            // System Coordinate Tracking (Permanent)
            const dateString = new Date().toISOString().slice(0, 10);
            this.ctx.fillText(`SYS_STATUS: NOMINAL // REF_${dateString}`, 45, 45);
            this.ctx.fillText("LOC_NODE: 1.002.AFR", 45, 65);

            // LAYER C: Application Signatures
            this.ctx.font = "bold 11px system-ui, sans-serif";
            this.ctx.letterSpacing = "1.5px";
            this.ctx.fillText("COZYOS CORE V2", 45, height - 40);

            // Conditional right boundary signature based on application target
            let dynamicTargetText = "SECURE LEDGER NODE";
            if (this.targetApp === "quarryos") dynamicTargetText = "HEAVY INDUSTRIAL GRID";
            else if (this.targetApp === "schoolos") dynamicTargetText = "LIBRARY INTERACTIVE ENV";
            else if (this.targetApp === "sports") dynamicTargetText = "COZYSPORTS RUNTIME";

            this.ctx.textAlign = "right";
            this.ctx.fillText(dynamicTargetText, width - 45, height - 40);
            this.ctx.restore();
        }

        /* ----------------------------------------------------
         * BRAND MESSAGE ROTATOR
         * ---------------------------------------------------- */
       drawRotatingBrandingMessages(width, height) {
            this.ctx.save();
            this.ctx.textAlign = "center";
            this.ctx.font = "italic 13px system-ui, -apple-system, sans-serif";
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.messageAlpha * 0.35})`; // Soft transparent brand text

            const textX = width / 2;
            const textY = height - 40;

            this.ctx.fillText(this.messageText, textX, textY);

            // Animate message alpha channel fade boundaries
            if (this.messageFadeState === "in") {
                this.messageAlpha += 0.004;
                if (this.messageAlpha >= 1) {
                    this.messageAlpha = 1;
                    this.messageFadeState = "hold";
                    this.messageTimer = 0;
                }
            } else if (this.messageFadeState === "hold") {
                this.messageTimer++;
                if (this.messageTimer > 450) { // On-screen hold for roughly ~7.5 seconds
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

        
