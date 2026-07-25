/**
 * CozyOS — CozyAuthenticator Local Stylesheet
 * File Reference: core/modules/Cozy-Authenticator/authenticator.css
 * Milestone: 132a
 *
 * OWNERSHIP
 *   Approved Gemini UI is locked — this file changes NO markup, no
 *   layout, no spacing, no colors, no behavior. It replaces the two
 *   network dependencies the original standalone page used
 *   (https://cdn.tailwindcss.com, https://unpkg.com/lucide@latest) with
 *   a real, local, offline stylesheet — a bounded, exact extraction of
 *   only the utility classes this locked markup actually references
 *   (enumerated directly from index.html + authenticator.js), not a
 *   general-purpose Tailwind reimplementation. Icons are inlined as
 *   local SVG (see authenticator.js) instead of loaded from unpkg.
 *   Do not add classes here speculatively — if the locked markup ever
 *   changes, re-extract from the new markup instead of guessing ahead.
 */

/* ---------- Cozy palette (from the original inline tailwind.config) ---------- */
:root {
    --cozy-c-emerald: #1B5E20;
    --cozy-c-emeraldLight: #2E7D32;
    --cozy-c-gold: #F9A825;
    --cozy-c-goldLight: #FBC02D;
    --cozy-c-dark: #101418;
    --cozy-c-surface: #161D22;
    --cozy-c-card: #1C262C;
    --cozy-c-border: #28353E;
    --cozy-c-success: #00A86B;
    --cozy-c-error: #D32F2F;
    --cozy-c-warning: #F9A825;
    --slate-100: #f1f5f9; --slate-300: #cbd5e1; --slate-400: #94a3b8; --slate-500: #64748b;
}

/* ---------- Already-local design rules (unchanged from the approved <style> block) ---------- */
.ca-scope ::-webkit-scrollbar { width: 6px; height: 6px; }
.ca-scope ::-webkit-scrollbar-track { background: #101418; }
.ca-scope ::-webkit-scrollbar-thumb { background: #28353E; border-radius: 3px; }
.ca-scope ::-webkit-scrollbar-thumb-hover { background: #1B5E20; }
.ca-scope .glass-panel { background: rgba(28, 38, 44, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(249, 168, 37, 0.15); }
.ca-scope .glass-card { background: rgba(22, 29, 34, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(27, 94, 32, 0.25); }
@keyframes softBreath { 0%, 100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.01); opacity: 1; box-shadow: 0 0 25px rgba(27, 94, 32, 0.3); } }
.ca-scope .animate-soft-breath { animation: softBreath 4s ease-in-out infinite; }
.ca-scope .countdown-ring { transition: stroke-dashoffset 1s linear; }
.ca-scope.light .glass-panel { background: rgba(255,255,255,0.85); border-color: rgba(27,94,32,0.15); }
.ca-scope.light .glass-card { background: rgba(255,255,255,0.7); border-color: rgba(27,94,32,0.2); }
@keyframes ca-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

/* ---------- Base ---------- */
.ca-scope { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.ca-scope.antialiased { -webkit-font-smoothing: antialiased; }
.ca-scope.font-sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.ca-scope .font-mono { font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", Courier, monospace; }
.ca-scope ::selection { background: var(--cozy-c-emerald); color: #fff; }
.ca-scope.min-h-screen { min-height: 100vh; }

/* ---------- Layout ---------- */
.ca-scope .flex { display: flex; } .ca-scope .flex-1 { flex: 1 1 0%; } .ca-scope .flex-col { flex-direction: column; }
.ca-scope .flex-wrap { flex-wrap: wrap; } .ca-scope .grid { display: grid; } .ca-scope .block { display: block; }
.ca-scope .hidden { display: none; } .ca-scope .relative { position: relative; } .ca-scope .absolute { position: absolute; }
.ca-scope .fixed { position: fixed; } .ca-scope .sticky { position: sticky; } .ca-scope .overflow-hidden { overflow: hidden; }
.ca-scope .pointer-events-none { pointer-events: none; } .ca-scope .transform { transform: translateX(0); }
.ca-scope .-rotate-90 { transform: rotate(-90deg); } .ca-scope .-translate-x-1\/2 { transform: translateX(-50%); }
.ca-scope .-translate-y-1\/2 { transform: translateY(-50%); } .ca-scope .object-cover { object-fit: cover; }
.ca-scope .items-center { align-items: center; } .ca-scope .items-start { align-items: flex-start; }
.ca-scope .justify-between { justify-content: space-between; } .ca-scope .justify-center { justify-content: center; }
.ca-scope .justify-end { justify-content: flex-end; } .ca-scope .group { position: relative; }
.ca-scope .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); } .ca-scope .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ca-scope .top-0 { top: 0; } .ca-scope .top-1\/2 { top: 50%; } .ca-scope .left-1\/2 { left: 50%; } .ca-scope .left-3 { left: 0.75rem; }
.ca-scope .right-0 { right: 0; } .ca-scope .bottom-6 { bottom: 1.5rem; } .ca-scope .inset-0 { inset: 0; }
.ca-scope .z-30 { z-index: 30; } .ca-scope .z-40 { z-index: 40; } .ca-scope .z-50 { z-index: 50; }

/* ---------- Spacing ---------- */
.ca-scope .p-2 { padding: 0.5rem; } .ca-scope .p-2\.5 { padding: 0.625rem; } .ca-scope .p-3 { padding: 0.75rem; }
.ca-scope .p-4 { padding: 1rem; } .ca-scope .p-5 { padding: 1.25rem; } .ca-scope .p-6 { padding: 1.5rem; }
.ca-scope .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; } .ca-scope .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.ca-scope .px-4 { padding-left: 1rem; padding-right: 1rem; } .ca-scope .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
.ca-scope .py-0\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; } .ca-scope .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.ca-scope .py-1\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; } .ca-scope .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.ca-scope .py-4 { padding-top: 1rem; padding-bottom: 1rem; } .ca-scope .pt-2 { padding-top: 0.5rem; } .ca-scope .pt-4 { padding-top: 1rem; }
.ca-scope .pb-3 { padding-bottom: 0.75rem; } .ca-scope .pl-9 { padding-left: 2.25rem; } .ca-scope .pr-4 { padding-right: 1rem; }
.ca-scope .mb-1 { margin-bottom: 0.25rem; } .ca-scope .mb-2 { margin-bottom: 0.5rem; } .ca-scope .mt-0\.5 { margin-top: 0.125rem; }
.ca-scope .mt-5 { margin-top: 1.25rem; } .ca-scope .mr-1 { margin-right: 0.25rem; } .ca-scope .mr-1\.5 { margin-right: 0.375rem; }
.ca-scope .mx-auto { margin-left: auto; margin-right: auto; }
.ca-scope .gap-2 { gap: 0.5rem; } .ca-scope .gap-3 { gap: 0.75rem; } .ca-scope .gap-4 { gap: 1rem; }
.ca-scope .space-x-2 > * + * { margin-left: 0.5rem; } .ca-scope .space-x-3 > * + * { margin-left: 0.75rem; } .ca-scope .space-x-4 > * + * { margin-left: 1rem; }
.ca-scope .space-y-1 > * + * { margin-top: 0.25rem; } .ca-scope .space-y-3 > * + * { margin-top: 0.75rem; }
.ca-scope .space-y-4 > * + * { margin-top: 1rem; } .ca-scope .space-y-6 > * + * { margin-top: 1.5rem; }

/* ---------- Sizing ---------- */
.ca-scope .w-2 { width: 0.5rem; } .ca-scope .w-3 { width: 0.75rem; } .ca-scope .w-3\.5 { width: 0.875rem; }
.ca-scope .w-4 { width: 1rem; } .ca-scope .w-5 { width: 1.25rem; } .ca-scope .w-6 { width: 1.5rem; }
.ca-scope .w-10 { width: 2.5rem; } .ca-scope .w-12 { width: 3rem; } .ca-scope .w-32 { width: 8rem; } .ca-scope .w-full { width: 100%; }
.ca-scope .h-2 { height: 0.5rem; } .ca-scope .h-3 { height: 0.75rem; } .ca-scope .h-3\.5 { height: 0.875rem; }
.ca-scope .h-4 { height: 1rem; } .ca-scope .h-5 { height: 1.25rem; } .ca-scope .h-6 { height: 1.5rem; }
.ca-scope .h-10 { height: 2.5rem; } .ca-scope .h-12 { height: 3rem; } .ca-scope .h-16 { height: 4rem; }
.ca-scope .h-32 { height: 8rem; } .ca-scope .h-full { height: 100%; }
.ca-scope .max-w-5xl { max-width: 64rem; } .ca-scope .max-w-sm { max-width: 24rem; }

/* ---------- Typography ---------- */
.ca-scope .text-\[9px\] { font-size: 9px; } .ca-scope .text-\[10px\] { font-size: 10px; }
.ca-scope .text-xs { font-size: 0.75rem; } .ca-scope .text-sm { font-size: 0.875rem; } .ca-scope .text-base { font-size: 1rem; }
.ca-scope .text-2xl { font-size: 1.5rem; } .ca-scope .font-bold { font-weight: 700; } .ca-scope .font-semibold { font-weight: 600; }
.ca-scope .font-extrabold { font-weight: 800; } .ca-scope .font-black { font-weight: 900; }
.ca-scope .text-center { text-align: center; } .ca-scope .uppercase { text-transform: uppercase; }
.ca-scope .tracking-wider { letter-spacing: 0.05em; } .ca-scope .tracking-widest { letter-spacing: 0.1em; }
.ca-scope .drop-shadow { filter: drop-shadow(0 1px 2px rgba(0,0,0,.3)); }

/* ---------- Colors: cozy palette + slate ---------- */
.ca-scope .bg-cozy-dark { background-color: var(--cozy-c-dark); } .ca-scope .bg-cozy-dark\/60 { background-color: rgba(16,20,24,.6); }
.ca-scope .bg-cozy-surface { background-color: var(--cozy-c-surface); } .ca-scope .bg-cozy-surface\/90 { background-color: rgba(22,29,34,.9); }
.ca-scope .bg-cozy-card { background-color: var(--cozy-c-card); } .ca-scope .bg-cozy-emerald { background-color: var(--cozy-c-emerald); }
.ca-scope .bg-cozy-gold\/20 { background-color: rgba(249,168,37,.2); } .ca-scope .bg-black { background-color: #000; } .ca-scope .bg-black\/60 { background-color: rgba(0,0,0,.6); }
.ca-scope .bg-slate-500 { background-color: var(--slate-500); }
.ca-scope .hover\:bg-cozy-border:hover { background-color: var(--cozy-c-border); } .ca-scope .hover\:bg-cozy-emeraldLight:hover { background-color: var(--cozy-c-emeraldLight); }
.ca-scope .text-white { color: #fff; } .ca-scope .text-cozy-gold { color: var(--cozy-c-gold); } .ca-scope .text-cozy-success { color: var(--cozy-c-success); }
.ca-scope .text-cozy-error { color: var(--cozy-c-error); } .ca-scope .text-cozy-border { color: var(--cozy-c-border); }
.ca-scope .text-slate-100 { color: var(--slate-100); } .ca-scope .text-slate-300 { color: var(--slate-300); } .ca-scope .text-slate-400 { color: var(--slate-400); }
.ca-scope .placeholder-slate-500::placeholder { color: var(--slate-500); }
.ca-scope .hover\:text-white:hover { color: #fff; } .ca-scope .hover\:text-cozy-gold:hover { color: var(--cozy-c-gold); }
.ca-scope .border { border-width: 1px; border-style: solid; } .ca-scope .border-b { border-bottom: 1px solid; } .ca-scope .border-t { border-top: 1px solid; }
.ca-scope .border-cozy-border { border-color: var(--cozy-c-border); } .ca-scope .border-cozy-border\/60 { border-color: rgba(40,53,62,.6); }
.ca-scope .border-cozy-gold\/30 { border-color: rgba(249,168,37,.3); } .ca-scope .border-cozy-gold\/40 { border-color: rgba(249,168,37,.4); }
.ca-scope .hover\:border-cozy-gold\/50:hover { border-color: rgba(249,168,37,.5); }
.ca-scope .focus\:border-cozy-gold:focus { border-color: var(--cozy-c-gold); } .ca-scope .focus\:outline-none:focus { outline: none; }
.ca-scope .shadow-cozy-emerald\/30 { box-shadow: 0 10px 15px -3px rgba(27,94,32,.3); }
.ca-scope .shadow-inner { box-shadow: inset 0 2px 4px rgba(0,0,0,.25); } .ca-scope .shadow-md { box-shadow: 0 4px 6px -1px rgba(0,0,0,.3); }
.ca-scope .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,.3); } .ca-scope .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,.35); }
.ca-scope .rounded { border-radius: 0.25rem; } .ca-scope .rounded-lg { border-radius: 0.5rem; } .ca-scope .rounded-xl { border-radius: 0.75rem; }
.ca-scope .rounded-2xl { border-radius: 1rem; } .ca-scope .rounded-full { border-radius: 9999px; }
.ca-scope .transition { transition: all .15s ease; } .ca-scope .transition-all { transition: all .3s ease; } .ca-scope .duration-300 { transition-duration: .3s; }
.ca-scope .animate-pulse { animation: ca-pulse 2s cubic-bezier(.4,0,.6,1) infinite; }
.ca-scope .bg-gradient-to-br { background-image: linear-gradient(to bottom right, var(--ca-grad-from), var(--ca-grad-to)); }
.ca-scope .blur-2xl { filter: blur(40px); }

/* ---------- Responsive (min-width breakpoints match Tailwind defaults) ---------- */
@media (min-width: 640px) {
    .ca-scope .sm\:flex { display: flex; } .ca-scope .sm\:flex-row { flex-direction: row; }
    .ca-scope .sm\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .ca-scope .sm\:p-6 { padding: 1.5rem; } .ca-scope .sm\:px-8 { padding-left: 2rem; padding-right: 2rem; }
    .ca-scope .sm\:text-3xl { font-size: 1.875rem; } .ca-scope .sm\:text-base { font-size: 1rem; } .ca-scope .sm\:text-sm { font-size: 0.875rem; }
    .ca-scope .sm\:w-96 { width: 24rem; } .ca-scope .sm\:w-auto { width: auto; }
}
@media (min-width: 768px) {
    .ca-scope .md\:col-span-2 { grid-column: span 2 / span 2; } .ca-scope .md\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) { .ca-scope .lg\:p-8 { padding: 2rem; } }

/* ---------- Per-account rotating accent colors — literal selectors
   matching the exact class name strings authenticator.js's template
   already interpolates (`bg-${colorTheme}-500/10`, etc., for its fixed
   6-color COLOR_THEMES rotation). Zero markup/JS changes required;
   these are the same class names the CDN generated at runtime,
   enumerated here as static rules instead. Values are Tailwind's own
   published default palette (a numeric design-token convention, not
   original expression). ---------- */
.ca-scope .from-emerald-600 { --ca-grad-from: #059669; } .ca-scope .to-emerald-800 { --ca-grad-to: #065f46; }
.ca-scope .bg-emerald-500\/10 { background-color: rgba(16,185,129,.1); } .ca-scope .border-emerald-400\/30 { border-color: rgba(52,211,153,.3); } .ca-scope .text-emerald-400 { color: #34d399; }
.ca-scope .from-amber-600 { --ca-grad-from: #d97706; } .ca-scope .to-amber-800 { --ca-grad-to: #92400e; }
.ca-scope .bg-amber-500\/10 { background-color: rgba(245,158,11,.1); } .ca-scope .border-amber-400\/30 { border-color: rgba(251,191,36,.3); } .ca-scope .text-amber-400 { color: #fbbf24; }
.ca-scope .from-purple-600 { --ca-grad-from: #9333ea; } .ca-scope .to-purple-800 { --ca-grad-to: #6b21a8; }
.ca-scope .bg-purple-500\/10 { background-color: rgba(168,85,247,.1); } .ca-scope .border-purple-400\/30 { border-color: rgba(192,132,252,.3); } .ca-scope .text-purple-400 { color: #c084fc; }
.ca-scope .from-cyan-600 { --ca-grad-from: #0891b2; } .ca-scope .to-cyan-800 { --ca-grad-to: #155e75; }
.ca-scope .bg-cyan-500\/10 { background-color: rgba(6,182,212,.1); } .ca-scope .border-cyan-400\/30 { border-color: rgba(34,211,238,.3); } .ca-scope .text-cyan-400 { color: #22d3ee; }
.ca-scope .from-rose-600 { --ca-grad-from: #e11d48; } .ca-scope .to-rose-800 { --ca-grad-to: #9f1239; }
.ca-scope .bg-rose-500\/10 { background-color: rgba(244,63,94,.1); } .ca-scope .border-rose-400\/30 { border-color: rgba(251,113,133,.3); } .ca-scope .text-rose-400 { color: #fb7185; }
.ca-scope .from-indigo-600 { --ca-grad-from: #4f46e5; } .ca-scope .to-indigo-800 { --ca-grad-to: #3730a3; }
.ca-scope .bg-indigo-500\/10 { background-color: rgba(99,102,241,.1); } .ca-scope .border-indigo-400\/30 { border-color: rgba(129,140,248,.3); } .ca-scope .text-indigo-400 { color: #818cf8; }
