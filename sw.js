/* Service Worker OBE Tracker v4
 * - Cangkang aplikasi (HTML/CSS/JS/ikon) di-precache → buka ulang instan & bisa offline
 * - Pustaka CDN berversi (Font Awesome, Chart.js, SheetJS, Google Fonts) di-cache saat dipakai pertama kali
 * - Permintaan ke Apps Script, Firestore, dan Identity Toolkit TIDAK pernah di-cache (selalu data terbaru)
 * Naikkan VERSI setiap kali file frontend diubah agar pengguna mendapat versi baru. */
const VERSI = 'obe-v4.0.0';
const SHELL = ['./', './index.html', './css/app.css', './js/config.js', './js/app.js', './js/data.js', './js/engine.js', './js/ui.js', './js/admin.js', './js/nilai.js', './js/laporan.js', './js/excel.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const CDN = /^(https:\/\/(cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|fonts\.googleapis\.com|fonts\.gstatic\.com))\//;
const JANGAN = /(script\.google\.com|script\.googleusercontent\.com|googleapis\.com\/v1|identitytoolkit|securetoken|firestore\.googleapis\.com)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = req.url;
  if (req.method !== 'GET' || JANGAN.test(url)) return; // biarkan jaringan menangani
  const sameOrigin = new URL(url).origin === self.location.origin;
  if (sameOrigin) {
    // config.js selalu coba jaringan dulu (agar perubahan GAS_URL langsung berlaku)
    if (url.includes('/js/config.js')) { e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSI).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req))); return; }
    // Stale-while-revalidate untuk cangkang aplikasi
    e.respondWith(caches.open(VERSI).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || (req.mode === 'navigate' ? c.match('./index.html') : undefined));
      return hit || net;
    }));
    return;
  }
  if (CDN.test(url)) {
    // Cache-first untuk pustaka CDN berversi
    e.respondWith(caches.open(VERSI).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r;
    }));
  }
});
