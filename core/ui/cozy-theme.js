/**
 * CozyOS Enterprise Design System — Dynamic Theme Engine
 * File Reference: core/ui/cozy-theme.js
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    // Theme that setTheme() falls back to when a requested theme is
    // unregistered or fails validation. Must itself be a valid, registered
    // theme with a complete token block in cozy-tokens.css.
    const DEFAULT_THEME = "developer";

    // CSS custom properties every theme must define. Mirrors the token
    // set every existing block in cozy-tokens.css already provides.
    const REQUIRED_TOKENS = [
        "--cozy-accent",
        "--cozy-brand-primary",
        "--cozy-brand-accent",
        "--cozy-brand-glow",
        "--cozy-bg-gradient",
        "--cozy-muted",
        "--cozy-text",
        "--cozy-border"
    ];

    class CozyThemeController {
        constructor() {
            // Canonical theme name -> { name, aliases }
            this.themes = new Map();
            // Alias -> canonical theme name (e.g. "developer-hub" -> "developer")
            this.aliases = new Map();

            this.registerBuiltInThemes();
            this.autoDetectAndApplyTheme();
        }

        /**
         * Registers the themes that already ship with the design system
         * (cozy-tokens.css + cozy-background.js scenes). Kept explicit so
         * the mapping stays visible and future modules can extend it via
         * registerTheme() without editing this list.
         */
        registerBuiltInThemes() {
            this.registerTheme("developer", ["developer-hub"]);
            this.registerTheme("shopos");
            this.registerTheme("quarryos");
            this.registerTheme("mpesaos");
            this.registerTheme("hospitalos");
            this.registerTheme("schoolos", ["educationos"]);
            this.registerTheme("churchos");
        }

        /**
         * Registers a theme name (and optional aliases) so it can be
         * resolved by setTheme()/getTheme()/hasTheme(). Lets future
         * applications register their own theme without modifying
         * the Theme Engine itself.
         *
         * Duplicate-registration policy: re-registering an existing
         * canonical name is a no-op (and logs a warning) unless
         * `options.overwrite` is explicitly true. This protects against
         * accidental duplicate registrations while still allowing an
         * intentional re-registration.
         *
         * Validation policy: the theme is only accepted if cozy-tokens.css
         * defines all REQUIRED_TOKENS for it (checked via computed style).
         * A theme that fails validation is rejected — it is not added to
         * the registry — so a partial/incomplete theme can never be
         * switched to and break the UI. Rejection is logged with the
         * specific missing tokens.
         */
        registerTheme(themeName, aliases = [], options = {}) {
            const canonical = themeName.toLowerCase().trim();
            const { overwrite = false } = options;

            if (this.themes.has(canonical) && !overwrite) {
                console.warn(`[CozyTheme] Theme "${canonical}" is already registered. Ignoring duplicate registration (pass { overwrite: true } to replace it).`);
                return this.themes.get(canonical);
            }

            const validation = this.validateTheme(canonical);
            if (!validation.valid) {
                console.warn(`[CozyTheme] Theme "${canonical}" rejected — missing required tokens in cozy-tokens.css: ${validation.missing.join(", ")}`);
                return null;
            }

            this.themes.set(canonical, { name: canonical, aliases: [] });

            aliases.forEach((rawAlias) => {
                const alias = rawAlias.toLowerCase().trim();
                if (this.themes.has(alias)) {
                    console.warn(`[CozyTheme] Alias "${alias}" collides with an existing theme name and was not registered.`);
                    return;
                }
                if (this.aliases.has(alias) && this.aliases.get(alias) !== canonical) {
                    console.warn(`[CozyTheme] Alias "${alias}" is already mapped to "${this.aliases.get(alias)}" and was not reassigned.`);
                    return;
                }
                this.aliases.set(alias, canonical);
                this.themes.get(canonical).aliases.push(alias);
            });

            return this.themes.get(canonical);
        }

        /**
         * Checks that a theme name has all REQUIRED_TOKENS defined in CSS,
         * using a detached, invisible probe element so the check never
         * affects the live UI. Depends on cozy-tokens.css already being
         * loaded (true for the shipped shell.html: stylesheets are linked
         * in <head>, before the deferred theme script runs).
         */
        validateTheme(canonical) {
            const probe = document.createElement("div");
            probe.setAttribute("data-cozy-app", canonical);
            probe.style.position = "absolute";
            probe.style.width = "0";
            probe.style.height = "0";
            probe.style.visibility = "hidden";
            probe.style.pointerEvents = "none";
            document.body.appendChild(probe);

            const computed = getComputedStyle(probe);
            const missing = REQUIRED_TOKENS.filter((token) => !computed.getPropertyValue(token).trim());

            document.body.removeChild(probe);
            return { valid: missing.length === 0, missing };
        }

        /**
         * Returns true if the given name is a registered theme or a
         * registered alias of one.
         */
        hasTheme(name) {
            const key = name.toLowerCase().trim();
            return this.themes.has(key) || this.aliases.has(key);
        }

        /**
         * Resolves a name or alias to its canonical theme name.
         * Returns null if unregistered.
         */
        getTheme(name) {
            const key = name.toLowerCase().trim();
            if (this.themes.has(key)) return key;
            if (this.aliases.has(key)) return this.aliases.get(key);
            return null;
        }

        /**
         * Lists all registered themes and their aliases, e.g. for a
         * settings/diagnostics panel.
         */
        listThemes() {
            return Array.from(this.themes.values()).map((theme) => ({
                name: theme.name,
                aliases: [...theme.aliases]
            }));
        }

        /**
         * Safely set and transition the visual profile.
         * Resolves aliases via the registry (e.g. "developer-hub" -> "developer").
         *
         * Fallback policy: if the requested name is not a registered theme
         * (or alias), CozyOS intentionally falls back to DEFAULT_THEME
         * ("developer") rather than applying an unrecognized value, since
         * an unregistered value has no matching CSS tokens and would leave
         * the UI unstyled. The fallback is logged as a warning.
         */
        setTheme(appName) {
            const requested = appName.toLowerCase().trim();
            const resolved = this.getTheme(requested);

            let cleanAppName = resolved;
            if (!resolved) {
                console.warn(`[CozyTheme] Unknown theme "${requested}" requested. Falling back to default theme "${DEFAULT_THEME}".`);
                cleanAppName = DEFAULT_THEME;
            }

            document.documentElement.setAttribute("data-cozy-app", cleanAppName);
            
            console.log(`[CozyTheme] Applied active theme profile: ${cleanAppName}`);

            // Notify sibling engines of the theme transition
            if (window.CozyOS.Background) {
                window.CozyOS.Background.updateForTheme(cleanAppName);
            }
            if (window.CozyOS.Toast) {
                window.CozyOS.Toast.show(`Interface profile: ${cleanAppName.toUpperCase()}`);
            }
        }

        /**
         * Scans the system location or parent configuration to auto-load the theme profile
         */
        autoDetectAndApplyTheme() {
            // Priority 1: Check if manual override attribute is already on the document tag
            const existingAttr = document.documentElement.getAttribute("data-cozy-app");
            if (existingAttr) {
                this.setTheme(existingAttr);
                return;
            }

            // Priority 2: Detect based on path URL structure
            const path = window.location.pathname.toLowerCase();
            let matchedTheme = "developer"; // Default fallback

            if (path.includes("/shopos") || path.includes("/shop/")) {
                matchedTheme = "shopos";
            } else if (path.includes("/quarryos") || path.includes("/quarry/")) {
                matchedTheme = "quarryos";
            } else if (path.includes("/mpesaos") || path.includes("/mpesa/")) {
                matchedTheme = "mpesaos";
            } else if (path.includes("/hospitalos") || path.includes("/hospital/")) {
                matchedTheme = "hospitalos";
            } else if (path.includes("/schoolos") || path.includes("/educationos") || path.includes("/school/")) {
                matchedTheme = "schoolos";
            } else if (path.includes("/churchos") || path.includes("/church/")) {
                matchedTheme = "churchos";
            }

            this.setTheme(matchedTheme);
        }
    }

    // Initialize immediately
    window.CozyOS.Theme = new CozyThemeController();
})();
