/**
 * =============================================================================
 * CozyOS Kernel Bridge
 * File: core/kernel/kernel-bridge.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The kernel layer (compatibility.js, bootstrap.js, lifecycle.js,
 * diagnostics.js, kernel.js) is built as real ES modules. Every existing
 * CozyOS coordinator (IdentityEngine, Company, PaymentChannel, Document
 * Engine, and every application UI module) is a browser IIFE assigning to
 * window.CozyOS.X, loaded via plain <script src="..."> tags. These two
 * module systems do not interoperate on their own — a plain <script> tag
 * cannot import an ES module.
 *
 * This file is the ONLY interoperability layer between them. It is loaded
 * via <script type="module">, imports the five real kernel modules, and
 * publishes them under window.CozyOS.Kernel so that every existing,
 * unmodified IIFE-based coordinator can reach the kernel with a guarded,
 * optional reference — the same pattern already used for every other
 * cross-coordinator dependency in this platform:
 *
 *   const bootstrap = window.CozyOS?.Kernel?.Bootstrap;
 *   if (bootstrap) { bootstrap.registerService({...}); }
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ------------------------------------------
 * - No business logic. No new decisions. No new state.
 * - No re-implementation of anything Kernel/Bootstrap/Compatibility/
 *   Lifecycle/Diagnostics already do (Rule 2).
 * - No patching, wrapping, or "fixing" of the kernel modules' own
 *   behavior — if a real defect exists in one of them, it gets fixed in
 *   that module's own source (Rule 21), never papered over here.
 * - No fallback/mock kernel is fabricated if a module fails to load —
 *   window.CozyOS.Kernel simply never gets set, and dependents already
 *   guard for its absence (Rule 6: Honest Engineering).
 *
 * WHY A REAL EVENT IS NEEDED
 * ----------------------------
 * <script type="module"> executes deferred, after regular scripts. A
 * coordinator loaded by an ordinary <script> tag earlier in the page
 * could, in principle, run before this bridge finishes importing. Every
 * dependent should still guard with `window.CozyOS?.Kernel?.X` (never
 * assume it's present), but this file also emits a real, observable
 * "cozyos:kernel-bridge-ready" DOM event once publication is complete,
 * for any coordinator that specifically needs to wait for it rather than
 * just degrade gracefully in its absence.
 * =============================================================================
 */

import Bootstrap from './bootstrap.js';
import Compatibility from './compatibility.js';
import Lifecycle from './lifecycle.js';
import Diagnostics from './diagnostics.js';
import Kernel from './kernel.js';

window.CozyOS = window.CozyOS || {};

// Pure publication — five real modules, assigned as-is, nothing added,
// nothing wrapped, nothing re-derived.
window.CozyOS.Kernel = Object.freeze({
    Kernel,
    Bootstrap,
    Compatibility,
    Lifecycle,
    Diagnostics
});

// Real, observable readiness signal — a plain DOM CustomEvent, not a
// second event-bus implementation (Rule 2: this platform already has one
// per kernel module; this is just a way for browser-side code to know
// publication finished, since ES module execution is deferred).
if (typeof document !== "undefined" && typeof document.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    document.dispatchEvent(new CustomEvent("cozyos:kernel-bridge-ready", { detail: { kernelVersion: Bootstrap.KERNEL_VERSION } }));
}
