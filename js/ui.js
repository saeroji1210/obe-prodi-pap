/* ui.js — utilitas antarmuka bersama (escape HTML, toast, dialog, modal, kartu, pemuat pustaka) */

// Escape SEMUA data saat dirender (bukan saat disimpan) → aman XSS tanpa mengubah data asli
export const h = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const $id = id => document.getElementById(id);
export const State = { user: null, mkNilai: null, laporanSel: 'ALL', halaman: null, tab: null, kotor: false };

export function showToast(msg) {
  const t = $id('toast'); $id('toast-msg').innerText = msg;
  t.classList.remove('hidden'); clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

let dialogCb = null;
export function showCustomDialog(type, message, callback = null, opt = {}) {
  const modal = $id('dialog-modal'), title = $id('dialog-title'), msg = $id('dialog-message'), icon = $id('dialog-icon'), cancel = $id('dialog-cancel'), ok = $id('dialog-confirm');
  msg.innerText = message; dialogCb = callback;
  if (type === 'tanya') {
    title.innerText = opt.judul || 'Konfirmasi'; icon.innerHTML = '<i class="fas fa-circle-question text-amber-500 text-2xl"></i>'; icon.className = 'mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-50 mb-5 border border-amber-100';
    cancel.classList.remove('hidden'); cancel.innerText = opt.batal || 'Batal'; ok.innerText = opt.ok || 'Lanjutkan'; ok.className = 'w-full inline-flex justify-center rounded-xl border border-transparent shadow-md px-6 py-2.5 bg-brand text-base font-bold text-white hover:bg-brand-dark transition sm:w-auto sm:text-sm';
  } else if (type === 'confirm') {
    cancel.innerText = 'Batal';
    title.innerText = 'Konfirmasi Hapus'; icon.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>'; icon.className = 'mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-50 mb-5 border border-red-100';
    cancel.classList.remove('hidden'); ok.innerText = 'Yakin, Hapus'; ok.className = 'w-full inline-flex justify-center rounded-xl border border-transparent shadow-md px-6 py-2.5 bg-red-500 text-base font-bold text-white hover:bg-red-600 transition sm:w-auto sm:text-sm';
  } else {
    title.innerText = 'Perhatian'; icon.innerHTML = '<i class="fas fa-info-circle text-brand-light text-2xl"></i>'; icon.className = 'mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-brand-soft mb-5 border border-blue-100';
    cancel.classList.add('hidden'); ok.innerText = 'Mengerti'; ok.className = 'w-full inline-flex justify-center rounded-xl border border-transparent shadow-md px-6 py-2.5 bg-brand text-base font-bold text-white hover:bg-brand-dark transition sm:w-auto sm:text-sm';
  }
  modal.classList.add('modal-active');
  ok.onclick = () => { const cb = dialogCb; closeCustomDialog(); if (cb) cb(); };
  cancel.onclick = () => closeCustomDialog();
  setTimeout(() => ok.focus(), 50);
}
export function closeCustomDialog() { $id('dialog-modal').classList.remove('modal-active'); dialogCb = null; }

// Modal formulir. onSubmit boleh async; kembalikan false untuk menahan modal tetap terbuka.
let modalTerkunci = false;
export function openModal(title, html, onSubmit, opt = {}) {
  $id('modal-title').innerText = title; $id('modal-body').innerHTML = html;
  const btn = $id('modal-submit'), batal = $id('modal-cancel'), x = $id('modal-x');
  btn.innerText = opt.submitText || 'Simpan Data'; btn.disabled = false;
  modalTerkunci = !!opt.wajib; batal.classList.toggle('hidden', !!opt.wajib); x.classList.toggle('hidden', !!opt.wajib);
  btn.onclick = async () => {
    if (btn.disabled) return;
    const label = btn.innerText; btn.disabled = true;
    try { const r = await onSubmit(); if (r !== false) closeModal(true); }
    catch (e) { showCustomDialog('alert', e.message || String(e)); } // kesalahan validasi ditampilkan ke pengguna, bukan dicatat sebagai error
    finally { btn.disabled = false; btn.innerText = label; }
  };
  $id('modal-container').classList.add('modal-active');
  setTimeout(() => { const i = $id('modal-body').querySelector('input:not([readonly]):not([type=hidden]), textarea, select'); if (i && !opt.noFocus) i.focus(); }, 80);
}
export function closeModal(paksa) {
  if (modalTerkunci && !paksa) return;
  modalTerkunci = false; $id('modal-container').classList.remove('modal-active');
  if (State.kotor && window.App) { State.kotor = false; window.App.rerender(); }
}
export const modalTerbuka = () => $id('modal-container').classList.contains('modal-active') || $id('dialog-modal').classList.contains('modal-active');

export const card = (id, extra = '') => { const c = document.createElement('div'); if (id) c.id = id; c.className = 'cv-auto bg-white rounded-[2rem] card-shadow border border-gray-100 p-8 mt-8 ' + extra; return c; };
export const kosongKuning = (judul, isi = '', ikon = '') => `<div class="bg-yellow-50 border border-yellow-200 p-10 rounded-3xl text-center max-w-2xl mx-auto mt-10">${ikon ? `<i class="fas ${ikon} text-5xl text-yellow-500 mb-5"></i>` : ''}<h3 class="font-extrabold text-xl text-yellow-700 mb-2">${judul}</h3>${isi ? `<p class="text-sm text-yellow-600 font-medium">${isi}</p>` : ''}</div>`;
export const setJudul = (judul, desk) => { $id('page-title').innerText = judul; $id('page-desc').innerText = desk; };

// ---------- Pemuat pustaka eksternal (lazy, sekali) ----------
const skrip = {};
export function loadScript(src) {
  if (!skrip[src]) skrip[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => { delete skrip[src]; rej(new Error('Gagal memuat ' + src)); }; document.head.appendChild(s); });
  return skrip[src];
}
export const URL_XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
export async function XL() {
  if (window.XLSX) return window.XLSX;
  showToast('Menyiapkan modul Excel...');
  await loadScript(URL_XLSX); return window.XLSX;
}
export async function whenChart() {
  if (window.Chart) return window.Chart;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'); return window.Chart;
}
// Gambar grafik setelah elemen ada di DOM; grafik lama dengan id sama dihancurkan dulu
export async function gambarChart(id, config) {
  try {
    const C = await whenChart(), el = $id(id); if (!el) return null;
    const old = C.getChart(el); if (old) old.destroy();
    return new C(el.getContext('2d'), config);
  } catch (e) { console.warn(e); const el = $id(id); if (el && el.parentElement) el.parentElement.innerHTML = '<p class="text-xs text-gray-400 text-center pt-20">Grafik tidak dapat dimuat (offline).</p>'; return null; }
}
// Cetak dokumen HTML di jendela baru
export function cetak(judul, isi, css = '') {
  const w = window.open('', '_blank'); if (!w) { showToast('Pop-up diblokir browser.'); return; }
  w.document.write('<html><head><title>' + h(judul) + '</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:24px auto;line-height:1.55;font-size:13px}' + css + '</style></head><body>' + isi + '</body></html>');
  w.document.close(); setTimeout(() => w.print(), 250);
}
export const aman = fn => { try { return fn(); } catch (e) { console.error(e); } };
