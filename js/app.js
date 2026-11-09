/* =====================================================================
 * app.js — Inti aplikasi OBE Tracker v4 (PWA GitHub Pages)
 *   boot cepat (cache IndexedDB + SWR), login, menu & navigasi instan,
 *   ubah/wajib-ganti password, indikator sinkron, penjaga tutup tab.
 * ===================================================================== */
import * as E from './engine.js';
import { db, Store, Sync, api, Sesi, Fire, Bus, DEMO, LS } from './data.js';
import { h, $id, State, showToast, showCustomDialog, openModal, closeModal, modalTerbuka, aman } from './ui.js';
import * as Admin from './admin.js';
import { renderInputNilai, formNilai, hapusNilai } from './nilai.js';
import { renderLaporan } from './laporan.js';
import { downloadTemplate, handleExcelUpload } from './excel.js';

const PAGES = {
  dashboard: () => Admin.renderAdminDashboard(),
  'manajemen-user': t => Admin.renderManajemenUser(t),
  'data-master': t => Admin.renderDataMaster(t),
  mapping: t => Admin.renderMappingPage(t),
  'input-nilai': t => renderInputNilai(t),
  laporan: t => renderLaporan(t === null || t === undefined ? undefined : t),
  settings: () => Admin.renderSettings()
};
const AKSES = { admin: Object.keys(PAGES), dosen: ['input-nilai', 'laporan'], mahasiswa: ['laporan'] };
const AWAL = { admin: 'dashboard', dosen: 'input-nilai', mahasiswa: 'laporan' };

// ---------- Loading screen ----------
const loadingText = t => { const el = $id('loading-text'); if (el) el.innerText = t; };
function tutupLoader() { const l = $id('global-loading'); if (!l || l.classList.contains('hidden')) return; l.style.opacity = '0'; setTimeout(() => l.classList.add('hidden'), 300); }
function tampilLogin() {
  $id('main-dashboard').classList.add('hidden'); $id('login-page').classList.remove('hidden'); tutupLoader();
  const btn = $id('login-btn'); btn.disabled = false; btn.innerText = 'Sign in';
  if (DEMO) $id('demo-note').classList.remove('hidden');
  setTimeout(() => { const u = $id('username'); if (u && !u.value) u.focus(); }, 350);
  if (!DEMO) api('ping', {}, { method: 'GET', timeout: 15000 }); // hangatkan server Apps Script selagi pengguna mengetik
}

// ---------- Branding ----------
function branding(b) {
  const st = b || db.settings[0] || LS.get('obe4_brand', {}) || {};
  if (!b && Store.siap) LS.set('obe4_brand', { namaProdi: st.namaProdi || '', fakultas: st.fakultas || '', logoUrl: st.logoUrl || '' });
  if (st.namaProdi) document.querySelectorAll('.app-brand-name').forEach(el => { el.innerText = st.namaProdi; });
  if (st.fakultas) document.querySelectorAll('.app-brand-fakultas').forEach(el => { el.innerText = st.fakultas; });
  if (st.logoUrl && /^data:image\//.test(st.logoUrl)) {
    document.querySelectorAll('.app-brand-icon').forEach(el => { el.innerHTML = `<img src="${h(st.logoUrl)}" class="w-full h-full object-contain" alt="">`; el.classList.remove('p-1.5', 'p-2', 'bg-gradient-to-br'); el.classList.add('bg-transparent'); });
    document.querySelectorAll('.app-brand-icon-login').forEach(el => { el.innerHTML = `<img src="${h(st.logoUrl)}" class="w-full h-full object-contain" alt="">`; el.classList.add('bg-transparent'); el.classList.remove('hidden'); });
  }
}

// ---------- Menu ----------
const navBtn = (id, ikon, teks) => `<button onclick="loadPage('${id}')" id="nav-${id}" class="w-full flex items-center space-x-3 px-8 py-3.5 text-gray-500 hover:bg-gray-50 transition group"><i class="fas ${ikon} w-5 text-gray-400 group-hover:text-brand-light transition"></i><span class="font-bold text-sm tracking-wide">${teks}</span></button>`;
const subItem = (page, tab, ikon, teks, tambah) => `<div class="w-full flex items-center justify-between pl-16 pr-8 py-3 text-gray-500 hover:text-brand-light hover:bg-brand-soft/50 text-sm transition group cursor-pointer" onclick="loadPage('${page}', '${tab}')"><div class="flex items-center space-x-3"><i class="fas ${ikon} text-[10px]"></i><span class="font-medium">${teks}</span></div>${tambah ? `<i onclick="event.stopPropagation(); openMasterForm('${tambah}')" class="fas fa-plus-circle text-gray-300 hover:text-brand-light transition text-lg" title="Tambah"></i>` : ''}</div>`;
const grup = (id, ikon, teks, isi) => `<div class="relative group"><button onclick="toggleSubmenu('${id}')" class="w-full flex items-center justify-between px-8 py-3.5 text-gray-500 hover:bg-gray-50 transition"><div class="flex items-center space-x-3"><i class="fas ${ikon} w-5 text-gray-400 group-hover:text-brand-light transition"></i><span class="font-bold text-sm tracking-wide">${teks}</span></div><i id="arrow-${id}" class="fas fa-chevron-right text-[10px] transition-transform duration-300"></i></button><div id="submenu-${id}" class="submenu-enter bg-gray-50/50 border-y border-gray-100/50">${isi}</div></div>`;
function renderMenu() {
  const r = State.user.role; let html = '';
  if (r === 'admin') {
    html = navBtn('dashboard', 'fa-home', 'Beranda') +
      grup('user', 'fa-users-cog', 'Manajemen User', subItem('manajemen-user', 'tab-dosen', 'fa-chalkboard-teacher', 'Data Dosen', 'dosen') + subItem('manajemen-user', 'tab-mhs', 'fa-user-graduate', 'Data Mahasiswa', 'mhs')) +
      grup('master', 'fa-database', 'Data Master', subItem('data-master', 'tab-profil', 'fa-user-tie', 'Profil Lulusan', 'profil') + subItem('data-master', 'tab-cpl', 'fa-list-check', 'Capaian (CPL)', 'cpl') + subItem('data-master', 'tab-mk', 'fa-book', 'Mata Kuliah', 'mk') + subItem('data-master', 'tab-cpmk', 'fa-bullseye', 'Data CPMK', 'cpmk')) +
      grup('mapping', 'fa-project-diagram', 'Pemetaan OBE', `<button onclick="loadPage('mapping', 'cpl-profil')" class="w-full flex items-center space-x-3 pl-16 py-3 text-gray-500 hover:text-brand-light hover:bg-brand-soft/50 text-sm transition"><i class="fas fa-user-tie text-[10px]"></i><span class="font-medium">Mapping CPL <i class="fas fa-arrow-right mx-1 text-[8px]"></i> Profil</span></button><button onclick="loadPage('mapping', 'cpmk-cpl')" class="w-full flex items-center space-x-3 pl-16 py-3 text-gray-500 hover:text-brand-light hover:bg-brand-soft/50 text-sm transition"><i class="fas fa-sitemap text-[10px]"></i><span class="font-medium">Mapping CPMK <i class="fas fa-arrow-right mx-1 text-[8px]"></i> CPL</span></button>`) +
      navBtn('input-nilai', 'fa-edit', 'Input Nilai CPMK') + navBtn('laporan', 'fa-chart-pie', 'Laporan Evaluasi') + '<div class="my-3 border-t border-gray-100"></div>' + navBtn('settings', 'fa-cog', 'Pengaturan Instansi');
  } else if (r === 'dosen') html = navBtn('input-nilai', 'fa-edit', 'Input Nilai CPMK') + navBtn('laporan', 'fa-chart-pie', 'Laporan Evaluasi');
  else html = navBtn('laporan', 'fa-user-graduate', 'Laporanku (CPL & PL)');
  $id('nav-menu').innerHTML = html;
}
let activeSubmenu = null;
function toggleSubmenu(id) {
  const sub = $id('submenu-' + id), arrow = $id('arrow-' + id);
  if (activeSubmenu && activeSubmenu !== id) { const os = $id('submenu-' + activeSubmenu), oa = $id('arrow-' + activeSubmenu); if (os) os.classList.remove('submenu-open'); if (oa) oa.classList.remove('rotate-90'); }
  sub.classList.toggle('submenu-open'); arrow.classList.toggle('rotate-90'); activeSubmenu = sub.classList.contains('submenu-open') ? id : null;
}
let sidebarOpen = false;
function toggleSidebar() {
  const sb = $id('sidebar-container'), ov = $id('sidebar-overlay'); sidebarOpen = !sidebarOpen;
  sb.classList.toggle('-translate-x-full', !sidebarOpen); ov.classList.toggle('hidden', !sidebarOpen);
}
function closeSidebar() { if (window.innerWidth < 768 && sidebarOpen) toggleSidebar(); }

// Navigasi bawah melayang (HP)
function bottomNav() {
  const old = $id('obe-bnav'); if (old) old.remove();
  const r = State.user.role, items = r === 'admin' ? [['dashboard', 'fa-home', 'Beranda'], ['manajemen-user', 'fa-users-cog', 'User', 'tab-dosen'], ['data-master', 'fa-database', 'Master', 'tab-profil'], ['mapping', 'fa-project-diagram', 'Peta', 'cpmk-cpl'], ['input-nilai', 'fa-edit', 'Nilai'], ['laporan', 'fa-chart-pie', 'Laporan']]
    : r === 'dosen' ? [['input-nilai', 'fa-edit', 'Nilai'], ['laporan', 'fa-chart-pie', 'Laporan']] : [['laporan', 'fa-user-graduate', 'Laporanku']];
  const n = document.createElement('nav'); n.id = 'obe-bnav'; n.className = 'md:hidden fixed bottom-3 inset-x-3 z-50 flex justify-around rounded-2xl border border-white/40 bg-white/80 backdrop-blur-md shadow-2xl p-1.5';
  n.innerHTML = items.map(i => `<button data-p="${i[0]}" data-t="${i[3] || ''}" class="flex-1 flex flex-col items-center py-1.5 rounded-xl text-gray-400 text-[10px] font-bold"><i class="fas ${i[1]} text-base mb-0.5"></i>${i[2]}</button>`).join('');
  n.onclick = e => { const b = e.target.closest('button'); if (b) loadPage(b.dataset.p, b.dataset.t || null); };
  $id('app-container').appendChild(n);
}
function tandaiNav(p) {
  document.querySelectorAll('#nav-menu button').forEach(b => b.classList.remove('sidebar-active'));
  const a = $id('nav-' + p); if (a) a.classList.add('sidebar-active');
  const n = $id('obe-bnav'); if (n) n.querySelectorAll('button').forEach(b => { const on = b.dataset.p === p; b.classList.toggle('text-brand', on); b.classList.toggle('bg-brand-soft', on); b.classList.toggle('text-gray-400', !on); });
}

// ---------- Navigasi instan (tanpa jeda buatan) ----------
let renderToken = 0;
function loadPage(pageId, tabId = null) {
  if (!State.user) return;
  if (!AKSES[State.user.role].includes(pageId)) pageId = AWAL[State.user.role];
  closeSidebar(); tandaiNav(pageId);
  if (pageId !== 'laporan' && Store.view !== 'ALL') Store.lihatSemester('ALL');
  State.halaman = pageId; State.tab = tabId;
  const container = $id('content-view'), my = ++renderToken;
  container.innerHTML = '<div class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-4xl text-brand-light/50"></i></div>';
  const sc = $id('content-scroll'); if (sc) sc.scrollTop = 0;
  // 1 frame untuk menggambar spinner, lalu render (tanpa setTimeout 150 ms seperti versi lama)
  requestAnimationFrame(() => setTimeout(() => { if (my !== renderToken) return; aman(() => PAGES[pageId](tabId)); }, 0));
}
function rerender() {
  if (!State.user || !State.halaman) return;
  if (modalTerbuka()) { State.kotor = true; return; }
  const ae = document.activeElement; if (ae && $id('content-view').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.type !== 'checkbox') { State.kotor = true; return; }
  const sc = $id('content-scroll'), top = sc ? sc.scrollTop : 0;
  aman(() => PAGES[State.halaman](State.halaman === 'laporan' ? undefined : State.tab));
  if (sc) sc.scrollTop = top;
}

// ---------- Inisialisasi setelah login ----------
function initApp(user) {
  State.user = user;
  $id('login-page').classList.add('hidden'); $id('main-dashboard').classList.remove('hidden');
  $id('display-name').innerText = user.name || user.username; $id('display-role').innerText = user.role;
  $id('user-avatar').innerText = (user.name || user.username || 'U').charAt(0).toUpperCase();
  renderMenu(); bottomNav(); branding();
  tutupLoader();
  loadPage(AWAL[user.role]);
}

// ---------- Login / Logout ----------
function togglePasswordDisplay(btn) { const p = $id('password'); if (p.type === 'password') { p.type = 'text'; btn.innerText = 'HIDE'; } else { p.type = 'password'; btn.innerText = 'SHOW'; } }
let loginJalan = false;
async function handleLogin() {
  if (loginJalan) return;
  const u = $id('username').value.trim(), p = $id('password').value, btn = $id('login-btn'), msg = $id('login-msg');
  const gagal = m => { msg.textContent = m || 'Username atau password salah!'; msg.classList.remove('hidden'); btn.disabled = false; btn.innerText = 'Sign in'; loginJalan = false; };
  if (!u || !p) return gagal('Isi username dan password.');
  loginJalan = true; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...'; msg.classList.add('hidden');
  const r = await api('login', { username: u, password: p }, { timeout: 45000 });
  if (!r.ok) return gagal(r.pesan);
  Sesi.set({ token: r.token, exp: r.exp, user: r.user, wajibGanti: !!r.wajibGanti, darurat: !!r.darurat });
  try {
    if (!DEMO) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Menghubungkan database...'; await Fire.tukar(r.fb); }
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memuat data...';
    await Store.muat(r.user, { cacheDulu: true });
  } catch (e) { console.error(e); Sesi.clear(); return gagal(e.message); }
  Sync.mulai(r.user.username);
  $id('password').value = ''; loginJalan = false;
  initApp(r.user);
  if (r.wajibGanti) gantiPassword(true);
}
async function logout() {
  if (Sync.sibuk()) {
    showToast('Menyimpan perubahan terakhir...');
    const ok = await Sync.kuras(20000);
    if (!ok) return showCustomDialog('tanya', 'Masih ada ' + Sync.ops.length + ' perubahan yang belum tersimpan ke server (koneksi bermasalah). Jika keluar sekarang, perubahan itu tetap disimpan di perangkat ini dan dikirim saat Anda login lagi dengan akun yang sama.', () => keluar(true), { judul: 'Belum tersimpan', ok: 'Tetap keluar' });
  }
  keluar(false);
}
async function keluar(simpanAntrean) {
  if (!simpanAntrean) Sync.reset(); else { clearTimeout(Sync.timer); Sync.kunci = ''; }
  await Store.lupakan(); Sesi.clear();
  State.user = null; State.halaman = null; State.mkNilai = null; State.laporanSel = 'ALL';
  const n = $id('obe-bnav'); if (n) n.remove();
  $id('username').value = ''; $id('password').value = ''; $id('login-msg').classList.add('hidden');
  closeModal(true); tampilLogin();
}

// ---------- Password ----------
const FPW = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-brand focus:bg-white text-sm font-semibold text-gray-800', LPW = 'block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5';
const fieldPw = (id, label) => `<div><label class="${LPW}">${label}</label><input id="${id}" type="password" autocomplete="new-password" class="${FPW}"></div>`;
function gantiPassword(wajib) {
  if (DEMO) return showCustomDialog('alert', 'Mode demo: password tidak dapat diubah.');
  if (Sesi.d && Sesi.d.darurat) return showCustomDialog('alert', 'Akun darurat diganti lewat fungsi resetAksesDarurat() di editor Apps Script.');
  openModal(wajib ? 'Ganti Password Bawaan' : 'Ubah Password',
    (wajib ? '<p class="text-sm text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-xl p-3">Anda masih memakai password bawaan/sementara. Demi keamanan data nilai, ganti password sekarang.</p>' : '') +
    fieldPw('pw-old', 'Password lama') + fieldPw('pw-new', 'Password baru (min. 8 karakter, huruf + angka)') + fieldPw('pw-new2', 'Ulangi password baru'), async () => {
      const o = $id('pw-old').value, n = $id('pw-new').value, n2 = $id('pw-new2').value;
      if (!o) throw new Error('Isi password lama.');
      if (n.length < 8) throw new Error('Password baru minimal 8 karakter.');
      if (!/[A-Za-z]/.test(n) || !/\d/.test(n)) throw new Error('Gunakan kombinasi huruf dan angka.');
      if (n !== n2) throw new Error('Konfirmasi password tidak sama.');
      $id('modal-submit').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
      const r = await api('ubahPassword', { lama: o, baru: n });
      if (!r.ok) throw new Error(r.pesan);
      Sesi.patch({ token: r.token, exp: r.exp, wajibGanti: false });
      await Fire.tukar(r.fb);
      showToast('Password berhasil diubah.');
    }, { submitText: 'Simpan Password', wajib });
}
export function resetPassword(username) {
  const u = db.users.find(x => String(x.username) === String(username)); if (!u) return;
  if (DEMO) return showCustomDialog('alert', 'Mode demo: password tidak dapat direset.');
  openModal('Reset Password', `<p class="text-sm text-gray-600 font-medium"><strong>${h(u.name)}</strong> (${h(username)}) · ${h(u.role)}</p>` + fieldPw('pw-r1', 'Password baru (min. 8 karakter) — kosongkan = password bawaan') + fieldPw('pw-r2', 'Ulangi password baru') + '<p class="text-[11px] text-gray-400">Pengguna wajib mengganti password saat login berikutnya. Semua sesi aktif pengguna ini diakhiri.</p>', async () => {
    const a = $id('pw-r1').value, b = $id('pw-r2').value;
    if (a && a.length < 8) throw new Error('Password baru minimal 8 karakter.');
    if (a !== b) throw new Error('Konfirmasi password tidak sama.');
    $id('modal-submit').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
    const r = await api('resetPassword', { username, baru: a });
    if (!r.ok) throw new Error(r.pesan);
    showToast('Password ' + username + ' direset. Sampaikan password baru kepada pengguna.');
  }, { submitText: 'Reset Password' });
}

// ---------- Aksi tabel (delegasi; tanpa onclick berisi data) ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-aksi]'); if (!b || !$id('content-view').contains(b)) return;
  const a = b.dataset.aksi, t = b.dataset.type, id = b.dataset.id;
  if (a === 'edit') Admin.editMasterData(t, id);
  else if (a === 'hapus') Admin.deleteMasterData(t, id);
  else if (a === 'resetpw') resetPassword(id);
  else if (a === 'nilai-edit') formNilai(id);
  else if (a === 'nilai-hapus') hapusNilai(id);
});

// ---------- Indikator sinkron & event data ----------
Bus.on('sync', s => {
  const ind = $id('sync-indicator'), tx = $id('sync-text'), ic = $id('sync-icon'); if (!ind) return;
  const tampil = s.n > 0 || s.jalan; ind.classList.toggle('hidden', !tampil);
  if (!tampil) return;
  if (s.status === 'offline' || s.status === 'gagal') { tx.innerText = (s.status === 'offline' ? 'Offline' : 'Menunggu koneksi') + ' · ' + s.n + ' perubahan tertunda'; ic.className = 'fas fa-cloud-arrow-up text-amber-500 text-sm'; }
  else { tx.innerText = 'Menyinkronkan ke Cloud...'; ic.className = 'fas fa-sync-alt fa-spin text-brand-light text-sm'; }
});
Bus.on('sync-gagal', m => showToast('Perubahan belum tersimpan: ' + (m || 'koneksi bermasalah') + '. Mencoba lagi otomatis.'));
Bus.on('ditolak', list => {
  showCustomDialog('alert', list.length + ' perubahan ditolak server dan dibatalkan:\n' + list.slice(0, 8).map(x => '• ' + (Array.isArray(x.k) ? x.k.filter(Boolean).join(' / ') : (x.k || x.t || '')) + ': ' + x.alasan).join('\n') + (list.length > 8 ? '\n...dan ' + (list.length - 8) + ' lainnya.' : ''));
  if (!DEMO) Store.segarkan(true).catch(console.error); // kembalikan tampilan ke data server yang sah
});
Bus.on('data-baru', () => { branding(); rerender(); });
Bus.on('sesi-habis', pesan => {
  if (!State.user) return;
  const u = State.user.username;
  clearTimeout(Sync.timer); Sync.kunci = ''; // antrean tetap tersimpan untuk login berikutnya
  Sesi.clear(); State.user = null; State.halaman = null;
  const n = $id('obe-bnav'); if (n) n.remove(); closeModal(true);
  $id('username').value = u; tampilLogin();
  showCustomDialog('alert', (pesan || 'Sesi berakhir.') + ' Perubahan yang belum terkirim akan dilanjutkan setelah Anda login kembali.');
});
window.addEventListener('beforeunload', e => { if (Sync.sibuk()) { e.preventDefault(); e.returnValue = ''; } });
// Segarkan data saat kembali ke tab (≥ 60 detik sejak penyegaran terakhir) — hemat kuota baca
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !State.user || DEMO) return;
  if (Date.now() - Store.terakhir > 60000) Store.segarkan().catch(console.warn);
  if (Sync.ops.length) Sync.jadwal(200);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); } });

// ---------- Boot ----------
async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
  branding(LS.get('obe4_brand', null));
  const pub = LS.get('obe4_publik', null);
  const ambilPublik = DEMO ? Promise.resolve(null) : api('publik', {}, { method: 'GET', timeout: 25000 }).then(r => { if (r.ok) { LS.set('obe4_publik', { branding: r.branding, at: Date.now() }); if (!State.user) branding(r.branding); } return r; });
  if (Sesi.valid()) {
    try {
      loadingText('Memuat data tersimpan...');
      const u = Sesi.user();
      await Store.muat(u, { cacheDulu: true });
      Sync.mulai(u.username);
      initApp(u);
      if (Sesi.d.wajibGanti) gantiPassword(true);
      if (!DEMO) api('sesi').then(r => { if (r.ok && r.user && State.user) { State.user = Object.assign({}, State.user, r.user); Sesi.patch({ user: State.user }); } });
      return;
    } catch (e) { console.error(e); Sesi.clear(); }
  }
  if (!pub && !DEMO) { loadingText('Menghubungkan ke server...'); const r = await ambilPublik; if (!r || !r.ok) loadingText('Server belum dapat dihubungi. Anda tetap dapat mencoba login.'); }
  tampilLogin();
}

// ---------- Ekspos untuk atribut onclick di HTML ----------
Object.assign(window, {
  loadPage, toggleSidebar, toggleSubmenu, togglePasswordDisplay, handleLogin, logout, closeModal,
  ubahPassword: () => gantiPassword(false), openMasterForm: (t, it) => Admin.openMasterForm(t, it),
  switchUserTab: id => Admin.switchUserTab(id), switchMasterTab: id => Admin.switchMasterTab(id),
  downloadTemplate, handleExcelUpload,
  App: { rerender, branding: () => branding(), db, Store, E, Sync }
});
boot();
