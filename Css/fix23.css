/* =============================================
   COZYCABIN FIX.CSS — v2 ENHANCED
   Mobile | Tablet | Desktop
   Black/Gold premium theme
   ============================================= */

/* ── GOOGLE FONTS ── */
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Outfit:wght@300;400;500;600;700;800;900&display=swap');

/* ── CSS VARIABLES ── */
:root {
  --gold:        #ffd700;
  --gold-dim:    #e6c200;
  --gold-glow:   rgba(255,215,0,0.25);
  --gold-soft:   rgba(255,215,0,0.08);
  --bg:          #000000;
  --bg-card:     #0d0d0d;
  --bg-deep:     #060610;
  --bg-panel:    #0f172a;
  --bg-mid:      #1e293b;
  --border:      rgba(255,215,0,0.18);
  --border-soft: rgba(255,255,255,0.08);
  --text:        #ffffff;
  --text-muted:  #94a3b8;
  --text-dim:    #64748b;
  --green:       #22c55e;
  --blue:        #3b82f6;
  --radius-sm:   10px;
  --radius-md:   16px;
  --radius-lg:   24px;
  --radius-xl:   32px;
  --shadow-gold: 0 0 30px rgba(255,215,0,0.12);
  --shadow-card: 0 4px 24px rgba(0,0,0,0.5);
  --font-brand:  'Rajdhani', sans-serif;
  --font-body:   'Outfit', sans-serif;
}

/* ── RESET ── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  max-width: 100%;
}

html, body {
  width: 100%;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  -webkit-user-select: none;
  user-select: none;
  scroll-behavior: smooth;
}

img, video, iframe {
  max-width: 100%;
  height: auto;
  display: block;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  user-select: none;
}

button, a { touch-action: manipulation; }
input, select, textarea { width: 100%; max-width: 100%; font-family: var(--font-body); }

/* =============================================
   SITE HEADER / NAV BAR
   ============================================= */
.site-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 20px rgba(0,0,0,0.6);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.header-logo img {
  height: 44px;
  width: auto;
  border-radius: 10px;
}

.header-logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.header-logo-brand {
  font-family: var(--font-brand);
  font-size: 22px;
  font-weight: 700;
  color: var(--gold);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.header-logo-tagline {
  font-family: var(--font-brand);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-nav a {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 8px;
  transition: color .2s, background .2s;
}

.header-nav a:hover {
  color: var(--gold);
  background: var(--gold-soft);
}

.header-icons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon-btn {
  background: var(--gold-soft);
  border: 1px solid var(--border);
  color: var(--text-muted);
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  transition: .2s;
  -webkit-tap-highlight-color: transparent;
}

.header-icon-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
}

.header-menu-btn {
  display: none;
  background: none;
  border: 1px solid var(--border);
  color: var(--text);
  width: 40px;
  height: 40px;
  border-radius: 10px;
  font-size: 20px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* =============================================
   HERO BANNER
   ============================================= */
#hero-banner {
  margin: 0 0 20px 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-gold);
  border: 1px solid var(--border);
}

.hero-slide {
  display: none;
  flex-direction: column;
  justify-content: center;
  border-radius: var(--radius-lg);
  padding: 30px 24px;
  min-height: 170px;
  position: relative;
  overflow: hidden;
  animation: heroFade 0.45s ease;
}

.hero-slide.active { display: flex; }

@keyframes heroFade {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0);   }
}

#hero-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 12px 0 8px;
  background: transparent;
}

.hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #333;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background .3s, transform .3s, width .3s;
}

.hero-dot.active {
  background: var(--gold);
  transform: scale(1.3);
  width: 22px;
  border-radius: 4px;
}

/* =============================================
   PROMO BANNER
   ============================================= */
#promo-banner {
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  margin-bottom: 20px;
  cursor: pointer;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-gold);
}

.promo-slide {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px;
  min-height: 100px;
  animation: heroFade .4s ease;
}

.promo-slide.active { display: flex; }

.promo-dots {
  display: flex;
  justify-content: center;
  gap: 7px;
  padding: 10px 0 6px;
}

.promo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #333;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: width .3s, background .3s, border-radius .3s;
}

/* =============================================
   TRUST BAR
   ============================================= */
.trust-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 10px;
  margin-bottom: 24px;
}

.trust-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}

.trust-icon {
  font-size: 22px;
  line-height: 1;
}

.trust-label {
  font-family: var(--font-brand);
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: .5px;
  text-transform: uppercase;
}

.trust-sub {
  font-size: 10px;
  color: var(--text-dim);
}

/* =============================================
   CONTAINER
   ============================================= */
.container {
  width: 100%;
  max-width: 1200px;
  margin: auto;
  padding: 12px 14px 100px;
  overflow-x: hidden;
}

/* =============================================
   BRAND HEADER (legacy — keep for pages without site-header)
   ============================================= */
.brand-header { text-align: center; padding: 10px 0 20px; }

.brand-logo {
  width: 150px;
  margin: auto;
  border: 2px solid var(--gold);
  border-radius: 18px;
  padding: 5px;
  background: var(--bg-card);
  box-shadow: var(--shadow-gold);
}

.brand-tagline {
  font-family: var(--font-brand);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 2.5px;
  text-transform: uppercase;
  margin-top: 6px;
}

/* =============================================
   SECTION TITLES
   ============================================= */
.section-title {
  text-align: center;
  color: var(--gold);
  font-family: var(--font-brand);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 20px;
  text-transform: uppercase;
}

.section-subtitle {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  margin-top: -14px;
  margin-bottom: 20px;
}

/* =============================================
   MAIN CATEGORY GRID
   ============================================= */
.main-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin: 20px 0;
}

.grid-btn {
  background: linear-gradient(135deg, #111827, #0f172a);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  padding: 24px 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color .25s, transform .25s, box-shadow .25s;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  overflow: hidden;
}

.grid-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--gold-soft), transparent);
  opacity: 0;
  transition: opacity .3s;
  border-radius: inherit;
}

.grid-btn:hover::before,
.grid-btn:active::before { opacity: 1; }

.grid-btn:hover,
.grid-btn:active {
  border-color: var(--gold);
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(255,215,0,0.15);
}

.grid-btn span {
  font-size: 30px;
  display: block;
  margin-bottom: 10px;
  position: relative;
}

.grid-btn small {
  font-family: var(--font-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
  color: var(--text);
  position: relative;
}

/* =============================================
   MINOR MENU (SUBMENU)
   ============================================= */
.minor-menu {
  display: none;
  background: linear-gradient(180deg, #0a1128, #0f172a);
  border: 2px solid var(--gold);
  border-radius: var(--radius-lg);
  padding: 20px 15px;
  margin: 15px 0;
  width: 100%;
  box-shadow: var(--shadow-gold);
  animation: menuSlide .3s ease;
}

@keyframes menuSlide {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.minor-top {
  width: 100%;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 15px;
}

.back-btn {
  background: rgba(255,255,255,0.06);
  color: var(--text-muted);
  border: 1px solid rgba(255,255,255,0.12);
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all .2s;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.back-btn:active,
.back-btn:hover {
  background: rgba(255,204,0,0.12);
  color: var(--gold);
  border-color: var(--gold);
  transform: translateX(-3px);
}

.minor-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.minor-btn {
  background: #1a2235;
  border: 1px solid var(--border-soft);
  color: var(--text);
  border-radius: var(--radius-md);
  padding: 16px 8px;
  font-family: var(--font-brand);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .3px;
  cursor: pointer;
  transition: all .25s;
  -webkit-tap-highlight-color: transparent;
  text-transform: uppercase;
}

.minor-btn:hover,
.minor-btn:active {
  background: var(--gold);
  color: #000;
  border-color: var(--gold);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(255,215,0,0.2);
}

/* =============================================
   PRODUCTS CONTAINER
   ============================================= */
#products-container {
  display: none;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  padding: 20px;
  margin: 20px 0;
  background: linear-gradient(180deg, #020817, #060d1f);
  border: 2px solid var(--gold);
  border-radius: var(--radius-xl);
  width: 100%;
  box-shadow: var(--shadow-gold);
}

/* ── PRODUCT CARD ── */
.product-card {
  background: linear-gradient(145deg, #111827, #0f172a);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 15px;
  color: var(--text);
  transition: border-color .25s, box-shadow .25s;
}

.product-card:hover {
  border-color: rgba(255,215,0,0.35);
  box-shadow: 0 6px 30px rgba(255,215,0,0.08);
}

/* ── GALLERY ── */
.product-gallery {
  width: 100%;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 10px;
  position: relative;
}

.main-product-image {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: #111;
  border-radius: var(--radius-md);
  display: block;
  transition: transform .4s ease;
}

.product-card:hover .main-product-image { transform: scale(1.02); }

/* ── THUMBNAILS ── */
.thumbnail-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-bottom: 12px;
  padding-bottom: 4px;
  scrollbar-width: none;
}
.thumbnail-row::-webkit-scrollbar { display: none; }

.thumb-image {
  width: 62px;
  height: 62px;
  object-fit: cover;
  border-radius: 10px;
  border: 2px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color .2s, transform .2s;
}
.thumb-image:hover { transform: scale(1.05); }
.thumb-active { border-color: var(--gold) !important; }

/* ── PRODUCT TEXT ── */
.product-title {
  font-family: var(--font-brand);
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 3px;
  letter-spacing: .3px;
}
.company-name {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.product-description {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.65;
  margin-bottom: 12px;
}

/* ── PRICE ── */
.price-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.new-price {
  color: var(--gold);
  font-family: var(--font-brand);
  font-size: 26px;
  font-weight: 800;
}
.old-price {
  color: var(--text-dim);
  text-decoration: line-through;
  font-size: 14px;
}

/* Savings badge */
.savings-badge {
  background: rgba(34,197,94,0.15);
  color: #22c55e;
  border: 1px solid rgba(34,197,94,0.3);
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  margin-left: auto;
}

/* ── SIZE & COLOR ── */
.sizes-box, .colors-box { margin-bottom: 14px; }
.sizes-box h4, .colors-box h4 {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}
.sizes-row, .colors-row { display: flex; flex-wrap: wrap; gap: 8px; }

.size-btn, .color-btn {
  background: #0f172a;
  color: var(--text);
  border: 1px solid #334155;
  padding: 8px 14px;
  border-radius: 8px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: all .2s;
}
.size-btn:hover, .color-btn:hover {
  border-color: rgba(255,215,0,0.5);
  color: var(--gold);
}
.option-active {
  background: var(--gold) !important;
  color: #000 !important;
  border-color: var(--gold) !important;
  font-weight: 700 !important;
}

/* ── HINT ── */
.selection-hint {
  font-size: 12px;
  min-height: 18px;
  margin-bottom: 12px;
  font-weight: 500;
}

/* ── BUTTONS ── */
.buy-btn {
  width: 100%;
  background: linear-gradient(135deg, #16a34a, #22c55e);
  color: #fff;
  border: none;
  padding: 14px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 10px;
  -webkit-tap-highlight-color: transparent;
  transition: opacity .2s, transform .2s;
  letter-spacing: .3px;
}
.buy-btn:active { opacity: 0.85; transform: scale(0.98); }

.cart-btn {
  width: 100%;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid #334155;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 12px;
  -webkit-tap-highlight-color: transparent;
  transition: border-color .2s, color .2s;
}
.cart-btn:hover { border-color: var(--gold); color: var(--gold); }

/* ── DETAILS ── */
.details-box {
  background: #0a1128;
  padding: 14px;
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid var(--border-soft);
}
.details-box summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--text);
  font-size: 13px;
}

/* ── EMPTY STATE ── */
.empty-products {
  text-align: center;
  padding: 50px 20px;
  grid-column: 1 / -1;
}
.empty-products h2 { color: var(--gold); margin-bottom: 10px; font-family: var(--font-brand); }
.empty-products p  { color: var(--text-muted); }

/* =============================================
   ACADEMY CARD
   ============================================= */
.academy-card {
  background: linear-gradient(135deg, #0d1117, #111827);
  border: 1px solid rgba(0,7,255,0.35);
  border-radius: 28px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 18px auto;
  max-width: 520px;
  box-shadow: 0 4px 20px rgba(0,7,255,0.1);
  transition: border-color .25s;
}
.academy-card:hover { border-color: rgba(0,7,255,0.7); }

.academy-icon {
  width: 85px;
  height: 85px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  flex-shrink: 0;
  font-family: var(--font-brand);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.bg-blue   { background: linear-gradient(135deg, #1d4ed8, #2563eb); color: #fff; }
.bg-yellow { background: linear-gradient(135deg, var(--gold-dim), var(--gold)); color: #000; }
.academy-info h2 { font-family: var(--font-brand); font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.academy-info p  { font-size: 14px; cursor: pointer; line-height: 1.55; color: var(--text-muted); }

/* =============================================
   AFFILIATE BOX
   ============================================= */
.cozy-affiliate-box {
  background: linear-gradient(135deg, #071129 0%, #0f172a 100%);
  border: 1px solid rgba(45,183,66,0.25);
  border-radius: 28px;
  padding: 35px 22px;
  margin: 30px auto;
  text-align: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}

.cozy-affiliate-box::before {
  content: '';
  position: absolute;
  top: -60px; right: -60px;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(45,183,66,0.08), transparent 70%);
  pointer-events: none;
}

.cozy-affiliate-badge {
  display: inline-block;
  background: linear-gradient(90deg, #2db742, #24a63c);
  color: white;
  padding: 6px 16px;
  border-radius: 50px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 20px;
}

.cozy-affiliate-title {
  color: white;
  font-family: var(--font-brand);
  font-size: 34px;
  line-height: 1.3;
  font-weight: 800;
  margin-bottom: 16px;
}
.cozy-affiliate-title span { color: #2db742; }

.cozy-affiliate-text {
  color: #d1d5db;
  font-size: 15px;
  line-height: 1.85;
  margin-bottom: 28px;
}

.cozy-affiliate-btn {
  background: linear-gradient(90deg, #2db742, #24a63c);
  color: white;
  border: none;
  border-radius: 14px;
  padding: 16px 28px;
  width: 100%;
  max-width: 320px;
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  transition: .3s ease;
  letter-spacing: .3px;
}
.cozy-affiliate-btn:hover { transform: scale(1.03); box-shadow: 0 6px 20px rgba(45,183,66,0.3); }

/* =============================================
   SMART PAYMENT MODAL
   ============================================= */
.modal {
  display: none;
  position: fixed;
  z-index: 9999;
  left: 0; top: 0;
  width: 100%; height: 100%;
  background: rgba(0,0,0,0.95);
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.modal-content {
  width: 90%;
  max-width: 500px;
  border-radius: 20px;
  border: 2px solid var(--gold);
  background: linear-gradient(180deg, #0d1117, #111827);
  box-shadow: 0 20px 60px rgba(0,0,0,0.8), var(--shadow-gold);
  overflow: hidden;
  animation: modalSlide .3s ease;
}

@keyframes modalSlide {
  from { opacity: 0; transform: translateY(30px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
.close-modal:hover { color: var(--gold); }

/* =============================================
   CRYPTO BOX
   ============================================= */
.crypto-box {
  background: linear-gradient(145deg, #181818, #101010);
  border: 1px solid #2d2d2d;
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.45);
  transition: border-color .25s;
}
.crypto-box:hover { border-color: rgba(242,201,76,0.4); }

.crypto-left   { display: flex; align-items: center; gap: 14px; flex: 1; }

.crypto-logo-box {
  width: 72px; height: 72px;
  border-radius: 16px;
  background: #111;
  border: 1px solid #2a2a2a;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}
.crypto-logo   { width: 44px; height: 44px; object-fit: contain; }
.crypto-info   { display: flex; flex-direction: column; gap: 4px; }
.crypto-title  { color: #f2c94c; font-family: var(--font-brand); font-size: 15px; font-weight: 700; margin: 0; line-height: 1.3; }
.crypto-desc   { color: #888; font-size: 11px; line-height: 1.5; margin: 0; }

.crypto-btn {
  padding: 12px 20px;
  border-radius: 12px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  color: #fff;
  white-space: nowrap;
  transition: .25s ease;
}
.crypto-btn:hover { transform: scale(1.04); opacity: 0.92; }

/* =============================================
   CONTACT SECTION
   ============================================= */
.contact-section {
  background: linear-gradient(180deg, #060e1e, #0a1128);
  border: 2px solid rgba(255,215,0,0.25);
  border-radius: 28px;
  padding: 28px 22px;
  margin-top: 40px;
  box-shadow: var(--shadow-gold);
}

.contact-title {
  color: var(--gold);
  font-family: var(--font-brand);
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: .5px;
  text-transform: uppercase;
}
.contact-subtitle {
  color: var(--text-muted);
  text-align: center;
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.6;
}
.contact-form { display: flex; flex-direction: column; gap: 16px; }

.contact-form input,
.contact-form textarea {
  background: #0d1117;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 14px 16px;
  color: white;
  font-family: var(--font-body);
  font-size: 14px;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.contact-form textarea { min-height: 130px; resize: none; }
.contact-form input:focus,
.contact-form textarea:focus {
  border-color: var(--gold);
  box-shadow: 0 0 12px var(--gold-glow);
}
.contact-form input::placeholder,
.contact-form textarea::placeholder { color: var(--text-dim); }

.contact-form button {
  background: linear-gradient(135deg, var(--gold-dim), var(--gold));
  color: #000;
  font-family: var(--font-body);
  font-weight: 800;
  font-size: 15px;
  padding: 15px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: .25s;
  letter-spacing: .3px;
}
.contact-form button:hover { transform: scale(1.02); box-shadow: 0 6px 20px var(--gold-glow); }

/* =============================================
   FOOTER
   ============================================= */
.site-footer {
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  padding: 40px 20px 30px;
  margin-top: 60px;
}

.footer-inner {
  max-width: 1200px;
  margin: auto;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 32px;
}

.footer-brand {}

.footer-logo-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.footer-logo-wrap img {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--border);
}
.footer-brand-name {
  font-family: var(--font-brand);
  font-size: 22px;
  font-weight: 700;
  color: var(--gold);
  letter-spacing: 1px;
  text-transform: uppercase;
  display: block;
}
.footer-brand-tagline {
  font-family: var(--font-brand);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 2px;
  text-transform: uppercase;
}
.footer-desc {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 16px;
}
.footer-social { display: flex; gap: 10px; }
.footer-social a {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--gold-soft);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  text-decoration: none;
  transition: .2s;
}
.footer-social a:hover { border-color: var(--gold); color: var(--gold); }

.footer-col-title {
  font-family: var(--font-brand);
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 14px;
}
.footer-col ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.footer-col ul li a {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 13px;
  transition: color .2s;
}
.footer-col ul li a:hover { color: var(--gold); }

.footer-bottom {
  max-width: 1200px;
  margin: 28px auto 0;
  padding-top: 20px;
  border-top: 1px solid var(--border-soft);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.footer-bottom p { color: var(--text-dim); font-size: 12px; }

/* =============================================
   FLOATING WHATSAPP
   ============================================= */
.float-wa {
  position: fixed;
  width: 62px; height: 62px;
  right: 18px; bottom: 18px;
  border-radius: 50%;
  background: #25d366;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(37,211,102,0.4);
  z-index: 99999;
  transition: transform .2s, box-shadow .2s;
  animation: waPulse 3s infinite;
}
.float-wa:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(37,211,102,0.55); }
.float-wa img { width: 34px; }

@keyframes waPulse {
  0%,100% { box-shadow: 0 4px 20px rgba(37,211,102,0.4); }
  50%      { box-shadow: 0 4px 28px rgba(37,211,102,0.65); }
}

/* =============================================
   DIGITAL ASSET CARDS
   ============================================= */
.dcard {
  background: #131825;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-soft);
  padding: 12px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  transition: border-color .2s, box-shadow .2s, transform .2s;
  -webkit-tap-highlight-color: transparent;
}
.dcard:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 24px rgba(0,0,0,0.4);
}
.dcard-icon {
  width: 52px; height: 52px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #fff;
  text-align: center; line-height: 1.2;
  letter-spacing: .03em; margin-bottom: 2px;
  font-family: var(--font-brand);
}
.dcard-title {
  font-family: var(--font-brand);
  font-size: .88rem;
  font-weight: 700;
  color: #eef2ff;
  line-height: 1.2;
}
.dcard-sub  { font-size: .65rem; font-weight: 600; color: var(--text-muted); line-height: 1.4; }
.dcard-arrow { font-size: .55rem; }

.dcard-course    { border-color: rgba(59,130,246,.45);  }
.dcard-course:hover  { border-color: rgba(59,130,246,.8);  box-shadow: 0 4px 20px rgba(59,130,246,.12); }
.dcard-course    .dcard-sub { color: #60a5fa; }
.dcard-ebook     { border-color: rgba(217,119,6,.45);   }
.dcard-ebook:hover   { border-color: rgba(217,119,6,.8);   box-shadow: 0 4px 20px rgba(217,119,6,.12); }
.dcard-ebook     .dcard-sub { color: #fbbf24; }
.dcard-crypto    { border-color: rgba(234,179,8,.45);   }
.dcard-crypto:hover  { border-color: rgba(234,179,8,.8);   box-shadow: 0 4px 20px rgba(234,179,8,.15); }
.dcard-crypto    .dcard-sub { color: #facc15; }
.dcard-affiliate { border-color: rgba(139,92,246,.45);  }
.dcard-affiliate:hover { border-color: rgba(139,92,246,.8); box-shadow: 0 4px 20px rgba(139,92,246,.15); }
.dcard-affiliate .dcard-sub { color: #a78bfa; }
.dcard-problem   { border-color: rgba(16,185,129,.45);  }
.dcard-problem:hover { border-color: rgba(16,185,129,.8); box-shadow: 0 4px 20px rgba(16,185,129,.12); }
.dcard-problem   .dcard-sub { color: #34d399; }
.dcard-member    { border-color: rgba(16,185,129,.35); background: linear-gradient(135deg,#0d1f1a,#131825); }
.dcard-member:hover  { border-color: rgba(16,185,129,.7); }

.ddrop-tile {
  display: flex; align-items: center; gap: 8px;
  background: #1a2030; border-radius: 10px;
  padding: 9px 10px; margin-bottom: 7px;
  text-decoration: none; color: #eef2ff;
  font-size: .82rem; font-weight: 600;
  transition: background .2s;
}
.ddrop-tile:last-child { margin-bottom: 0; }
.ddrop-tile:hover { background: #1f2840; }

/* =============================================
   EBOOK / MISC
   ============================================= */
.ebook-box {
  border: 2px solid #CD853F;
  border-radius: 14px;
  padding: 15px;
  margin-bottom: 15px;
  background: linear-gradient(135deg, #1a1000, #0d0800);
}

.delivery-bar {
  background: linear-gradient(90deg, var(--gold-dim), var(--gold));
  color: #000;
  padding: 12px 16px;
  font-family: var(--font-brand);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: .5px;
  text-transform: uppercase;
  margin: 25px 0;
  border-radius: 10px;
  text-align: center;
}

/* =============================================
   TABLET — 600px to 1024px
   ============================================= */
@media (min-width: 600px) and (max-width: 1024px) {
  .container { padding: 15px 20px 100px; }
  .main-grid { grid-template-columns: repeat(3,1fr); gap: 16px; }
  .grid-btn  { padding: 28px 10px; }
  .grid-btn span  { font-size: 32px; }
  .grid-btn small { font-size: 13px; }
  .minor-grid { grid-template-columns: repeat(4,1fr); gap: 14px; }
  .minor-btn  { font-size: 13px; padding: 18px 10px; }
  #products-container { grid-template-columns: repeat(2,1fr); gap: 20px; padding: 20px; }
  .product-title { font-size: 21px; }
  .new-price     { font-size: 26px; }
  .academy-card  { padding: 20px; gap: 20px; }
  .academy-icon  { width: 90px; height: 90px; }
  .academy-info h2 { font-size: 24px; }
  .brand-logo    { width: 160px; }
  .float-wa      { width: 66px; height: 66px; right: 24px; bottom: 24px; }
  .float-wa img  { width: 38px; }
  .header-nav    { display: flex; }
  .trust-bar     { grid-template-columns: repeat(4,1fr); }
  .footer-inner  { grid-template-columns: 2fr 1fr 1fr; }
  .header-logo-brand { font-size: 20px; }
  .site-header   { padding: 0 18px; }
}

/* =============================================
   DESKTOP — 1025px and above
   ============================================= */
@media (min-width: 1025px) {
  .container { padding: 20px 40px 100px; }
  .main-grid { grid-template-columns: repeat(3,1fr); gap: 20px; }
  .grid-btn  { padding: 32px 12px; border-radius: 28px; }
  .grid-btn span  { font-size: 36px; }
  .grid-btn small { font-size: 14px; }
  .minor-grid { grid-template-columns: repeat(4,1fr); gap: 16px; }
  .minor-btn  { font-size: 14px; padding: 20px 12px; border-radius: 18px; }
  #products-container { grid-template-columns: repeat(3,1fr); gap: 24px; padding: 24px; }
  .product-title { font-size: 22px; }
  .new-price     { font-size: 28px; }
  .buy-btn       { font-size: 16px; padding: 16px; }
  .academy-card  { padding: 24px; gap: 24px; max-width: 600px; }
  .academy-icon  { width: 100px; height: 100px; }
  .academy-info h2 { font-size: 28px; }
  .brand-logo    { width: 180px; }
  .float-wa      { width: 68px; height: 68px; right: 30px; bottom: 30px; }
  .float-wa img  { width: 40px; }
  .crypto-title  { font-size: 16px; }
  .crypto-desc   { font-size: 12px; }
  .crypto-btn    { padding: 14px 26px; font-size: 14px; }
  .cozy-affiliate-title { font-size: 40px; }
  .cozy-affiliate-text  { font-size: 17px; }
  .header-nav    { display: flex; gap: 4px; }
  .header-logo-brand { font-size: 26px; }
  .header-logo-tagline { font-size: 10px; }
  .trust-bar     { padding: 18px 14px; }
  .trust-icon    { font-size: 26px; }
  .trust-label   { font-size: 12px; }
  .trust-sub     { font-size: 11px; }
}

/* =============================================
   MOBILE — up to 599px
   ============================================= */
@media (max-width: 599px) {
  .container { padding: 10px 10px 100px; }
  .main-grid  { grid-template-columns: repeat(3,1fr); gap: 10px; }
  .grid-btn   { padding: 16px 6px; border-radius: 18px; }
  .grid-btn span  { font-size: 24px; }
  .grid-btn small { font-size: 10px; }
  .minor-grid { grid-template-columns: repeat(2,1fr); gap: 10px; }
  .minor-btn  { font-size: 12px; padding: 14px 6px; }
  #products-container { grid-template-columns: 1fr; padding: 14px; gap: 14px; }
  .product-title   { font-size: 18px; }
  .new-price       { font-size: 22px; }
  .buy-btn         { font-size: 14px; padding: 13px; }
  .academy-card    { padding: 14px; gap: 12px; }
  .academy-icon    { width: 65px; height: 65px; font-size: 10px; }
  .academy-info h2 { font-size: 18px; }
  .brand-logo      { width: 120px; }
  .float-wa        { width: 56px; height: 56px; right: 14px; bottom: 14px; }
  .float-wa img    { width: 30px; }
  .crypto-box      { padding: 12px; gap: 10px; flex-wrap: wrap; }
  .crypto-logo-box { width: 60px; height: 60px; }
  .crypto-logo     { width: 36px; height: 36px; }
  .crypto-title    { font-size: 13px; }
  .crypto-desc     { font-size: 10px; }
  .crypto-btn      { padding: 10px 14px; font-size: 12px; }
  .cozy-affiliate-title { font-size: 26px; }
  .cozy-affiliate-text  { font-size: 14px; line-height: 1.7; }
  .cozy-affiliate-btn   { font-size: 15px; padding: 15px; }
  .trust-bar             { grid-template-columns: repeat(2,1fr); gap: 8px; padding: 12px 8px; }
  .trust-icon            { font-size: 20px; }
  .header-nav            { display: none; }
  .header-menu-btn       { display: flex; }
  .header-logo-brand     { font-size: 18px; }
  .header-logo-tagline   { font-size: 8px; letter-spacing: 1.5px; }
  .site-header           { padding: 0 14px; height: 58px; }
  .footer-inner          { grid-template-columns: 1fr; gap: 24px; }
  .footer-bottom         { flex-direction: column; text-align: center; gap: 8px; }
  img {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
  }
}
/* =============================================
   COZYCABIN — CHROME / BRAVE / OPERA FIX v2
   Add this AFTER fix.css in your <head>
   ============================================= */

/* ── PRODUCTS CONTAINER ── */
#products-container {
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  padding: 12px !important;
  margin: 16px 0 !important;
}

/* ── PRODUCT CARD ── */
.product-card {
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  min-width: 0 !important;
  position: relative !important;
}

/* ── GALLERY WRAPPER ── */
.cc-gallery {
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  position: relative !important;
  display: block !important;
  isolation: isolate !important;
  border-radius: 0 !important;    /* remove any inherited border-radius that clips wrong */
  border: none !important;        /* remove any inherited border */
}

/* ── VIEWPORT — THE VISIBLE WINDOW ──
   Key fix: position relative + overflow hidden + width 100%
   WITHOUT aspect-ratio on the viewport itself (put it on a inner div instead)
   Brave/Opera fail when aspect-ratio + overflow:hidden are on the same element ── */
.cc-viewport {
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  position: relative !important;
  display: block !important;
  border-radius: 14px !important;
  /* Do NOT set height here — let aspect-ratio do it via padding trick below */
  height: 0 !important;           /* padding-bottom trick replaces aspect-ratio */
}

/* aspect-ratio: 3/4 → padding-bottom: 133.33% */
.cc-viewport[style*="aspect-ratio: 3/4"],
.cc-viewport[style*="aspect-ratio:3/4"] {
  padding-bottom: 133.33% !important;
}

/* aspect-ratio: 1/1 → padding-bottom: 100% */
.cc-viewport[style*="aspect-ratio: 1/1"],
.cc-viewport[style*="aspect-ratio:1/1"] {
  padding-bottom: 100% !important;
}

/* ── TRACK — slides container ── */
.cc-track {
  position: absolute !important;   /* sits inside the padded viewport */
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1) !important;
  will-change: transform !important;
  -webkit-backface-visibility: hidden !important;
  backface-visibility: hidden !important;
}

/* ── EACH SLIDE ── */
.cc-slide {
  flex: 0 0 100% !important;
  width: 100% !important;
  min-width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  position: relative !important;
  box-sizing: border-box !important;
}

/* ── VIDEO — GPU layer fix for black screen ── */
.cc-video,
.cc-slide video {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
  background: #111 !important;
  -webkit-transform: translateZ(0) !important;
  transform: translateZ(0) !important;
  -webkit-backface-visibility: hidden !important;
  backface-visibility: hidden !important;
}

/* ── SLIDE IMAGES ── */
.cc-slide img {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
}

/* ── OVERLAYS (counter, dots, badge, progress, play) ── */
.cc-counter {
  position: absolute !important;
  top: 10px !important;
  right: 10px !important;
  z-index: 10 !important;
  background: rgba(0,0,0,0.6) !important;
  color: #fff !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  padding: 3px 9px !important;
  border-radius: 20px !important;
  pointer-events: none !important;
}

.cc-dots {
  position: absolute !important;
  bottom: 10px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  display: flex !important;
  gap: 5px !important;
  z-index: 10 !important;
  pointer-events: none !important;
}

.cc-dot {
  width: 7px !important;
  height: 7px !important;
  border-radius: 50% !important;
  background: rgba(255,255,255,0.4) !important;
  display: inline-block !important;
  transition: background 0.3s, width 0.3s !important;
}

.cc-dot-active {
  background: #ffd700 !important;
  width: 18px !important;
  border-radius: 4px !important;
}

.cc-vid-badge {
  position: absolute !important;
  top: 10px !important;
  left: 10px !important;
  z-index: 10 !important;
  background: rgba(0,0,0,0.75) !important;
  color: #ffd700 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 4px 10px !important;
  border-radius: 20px !important;
  pointer-events: none !important;
}

.cc-vid-progress {
  position: absolute !important;
  bottom: 0 !important;
  left: 0 !important;
  height: 3px !important;
  width: 0% !important;
  background: #ffd700 !important;
  z-index: 11 !important;
  pointer-events: none !important;
  border-radius: 0 2px 2px 0 !important;
}

.cc-play-overlay {
  position: absolute !important;
  inset: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 12 !important;
  background: rgba(0,0,0,0.3) !important;
  transition: opacity 0.25s ease !important;
}

.cc-play-btn {
  width: 52px !important;
  height: 52px !important;
  border-radius: 50% !important;
  background: #ffd700 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 0 4px 20px rgba(255,215,0,0.4) !important;
}

/* ── THUMBNAIL ROW ── */
.cc-thumbrow {
  display: flex !important;
  flex-direction: row !important;
  gap: 7px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  padding: 8px 0 4px !important;
  scrollbar-width: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
}
.cc-thumbrow::-webkit-scrollbar { display: none; }

.cc-thumb {
  flex: 0 0 58px !important;
  width: 58px !important;
  height: 58px !important;
  border-radius: 9px !important;
  overflow: hidden !important;
  border: 2px solid transparent !important;
  cursor: pointer !important;
  position: relative !important;
  box-sizing: border-box !important;
  background: #111 !important;
  transition: border-color 0.2s !important;
}

.cc-th-active {
  border-color: #ffd700 !important;
}

.cc-thumb img,
.cc-thumb video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
  pointer-events: none !important;
}

/* ── GLOBAL OVERFLOW GUARD ── */
.container,
.minor-menu,
body {
  overflow-x: hidden !important;
  max-width: 100vw !important;
}
#products-container {
  border: none !important;
  box-shadow: none !important;
}
/* ── FIX: card fills container, no side gaps showing border ── */
#products-container {
  padding: 16px !important;
  gap: 16px !important;
}

.product-card {
  width: 100% !important;
  box-sizing: border-box !important;
}

/* Flexible gallery — auto-detects aspect ratio */
.cc-viewport {
  padding-bottom: 0 !important;
  height: auto !important;
  aspect-ratio: unset !important;
}

.cc-track {
  position: relative !important;
  height: auto !important;
}

.cc-slide {
  aspect-ratio: 1 / 1;  /* default square */
}

/* Portrait slides auto-switch to 3:4 */
.cc-slide img,
.cc-slide video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
}
/* ══ COZYCABIN YELLOW LINE FIX ══ */

/* Card fills full width, clips gold border bleed */
.product-card {
  overflow: hidden !important;
  isolation: isolate !important;
  width: 100% !important;
}

/* Container clips its own gold border from showing inside cards */
#products-container {
  overflow: hidden !important;
  padding: 12px !important;
}

/* Gallery background fills fully — no transparent gaps */
.cc-gallery,
.cc-viewport {
  background: #000 !important;
  isolation: isolate !important;
}

/* Slides fill their slot completely */
.cc-slide {
  background: #000 !important;
  flex: 0 0 100% !important;
  min-width: 100% !important;
  overflow: hidden !important;
}

/* Images/videos fill slide — no gaps on sides */
.cc-slide img,
.cc-slide video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
}

/* Minor menu border stops bleeding into product section */
.minor-menu {
  overflow: hidden !important;
  margin-bottom: 24px !important;
}
/* ══ YELLOW LINE FIX — CSS ONLY ══ */
.minor-menu {
  border-left: none !important;
  border-right: none !important;
  border-top: 2px solid var(--gold) !important;
  border-bottom: 2px solid var(--gold) !important;
}
/* ============================================================
   COZYCABIN — OVERLAY + PRODUCTS FIX CSS
   Add this file as:  <link rel="stylesheet" href="overlay-fix.css">
   OR paste these rules at the bottom of your fix.css
   ============================================================ */

/* ──────────────────────────────────────────────────────────────
   FIX 1: Remove the yellow border bleed / overlay on products
   
   The gold border on .minor-menu was creating a visible frame
   around product images because #products-container was rendered
   inside the same stacking context and the border bled through.
   ────────────────────────────────────────────────────────────── */

/* Fully contain the minor-menu — prevent its gold border from
   leaking visually into adjacent/child elements               */
.minor-menu {
  overflow: hidden !important;
  isolation: isolate !important;        /* new stacking context  */
  contain: layout style !important;     /* hard paint boundary   */
  border: 2px solid var(--gold) !important;
  margin-bottom: 0 !important;          /* gap handled below     */
}

/* ──────────────────────────────────────────────────────────────
   FIX 2: products-container — ensure it renders OUTSIDE the
   yellow frame, with its own stacking context & no border bleed
   ────────────────────────────────────────────────────────────── */
#products-container {
  position: relative !important;
  z-index: 2 !important;
  isolation: isolate !important;
  margin-top: 16px !important;          /* clean gap after menu  */
  /* Remove any inherited border/outline that could show gold:  */
  outline: none !important;
}

/* ──────────────────────────────────────────────────────────────
   FIX 3: Product images — no gold border, no box-shadow bleed
   Ensure thumb images and main images have clean transparent
   borders so the yellow overlay cannot appear on them
   ────────────────────────────────────────────────────────────── */
.product-card .main-product-image,
.product-card .cc-gallery img,
.product-card .cc-gallery video {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

/* Thumbnails: only show gold border when actively selected     */
.cc-thumb {
  border: 2px solid transparent !important;
  border-radius: 10px !important;
  overflow: hidden !important;
  position: relative !important;
}
.cc-thumb.cc-th-active {
  border-color: var(--gold) !important;
}

/* ──────────────────────────────────────────────────────────────
   FIX 4: .product-gallery wrapper — remove any inherited gold
   ────────────────────────────────────────────────────────────── */
.product-gallery,
.cc-gallery,
.cc-viewport {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

/* ──────────────────────────────────────────────────────────────
   FIX 5: Ensure cc-slide images fill correctly without any
   aspect-ratio override causing white/gold borders to show
   ────────────────────────────────────────────────────────────── */
.cc-slide {
  flex: 0 0 100% !important;
  min-width: 100% !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  border: none !important;
  background: #000 !important;          /* black fallback, not gold */
}

.cc-slide img,
.cc-slide video {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  display: block !important;
  border: none !important;
}
.minor-menu.open {
  display: block !important;
  contain: none !important;
}
