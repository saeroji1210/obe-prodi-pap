/* admin.js — Beranda admin, Manajemen User, Data Master, Pemetaan OBE, Pengaturan Instansi */
import * as E from './engine.js';
import { db, Store, api, DEMO } from './data.js';
import { h, $id, State, showToast, showCustomDialog, openModal, card, kosongKuning, setJudul, gambarChart } from './ui.js';

const num = E.num, T = E.T;
const mhsAll = () => db.users.filter(u => u.role === 'mahasiswa');
const st0 = () => db.settings[0] || (db.settings[0] = { id: 1 });
const BTN_TAB = 'px-8 py-5 font-bold text-sm text-gray-400 hover:text-brand-light transition whitespace-nowrap';
const BTN_TAB_ON = 'px-8 py-5 font-extrabold text-sm border-b-[3px] border-brand text-brand whitespace-nowrap bg-white';
const INP = 'w-full px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-brand focus:bg-white text-sm font-bold text-gray-800 transition-all';
const LBL = 'block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5';
const tombolBar = type => `<button onclick="openMasterForm('${type}')" class="bg-brand text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition grow md:grow-0 text-center tracking-wide"><i class="fas fa-plus mr-2"></i>Baru</button><button onclick="downloadTemplate('${type}')" class="text-brand border-2 border-brand px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-soft transition grow md:grow-0 text-center tracking-wide"><i class="fas fa-download mr-2"></i>Template</button><label class="bg-gradient-to-br from-brand-blue to-brand-light text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-brand-light/30 hover:opacity-90 transition cursor-pointer grow md:grow-0 text-center inline-block tracking-wide"><i class="fas fa-upload mr-2"></i>Upload<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="handleExcelUpload(this, '${type}')"></label>`;

/* ============================== BERANDA ADMIN ============================== */
function gaps() {
  const out = [], mapped = new Set(db.mappingCpmk.map(m => m.mk + '|' + m.cpmk));
  db.cpl.forEach(c => {
    const ms = db.mappingCpmk.filter(m => m.cpl === c.kode);
    if (!ms.length) out.push(['CPL ' + c.kode, 'belum didukung CPMK mana pun']);
    else { const s = ms.reduce((a, m) => a + num(m.bobot), 0); if (Math.abs(s - 100) > 0.5) out.push(['CPL ' + c.kode, 'total bobot pemetaan ' + +s.toFixed(1) + '% (seharusnya 100%)']); }
  });
  db.cpmk.forEach(c => { if (!mapped.has(c.mk + '|' + c.kode)) out.push(['CPMK ' + c.mk + ' ' + c.kode, 'belum dipetakan ke CPL']); });
  db.mk.forEach(m => {
    const cp = E.cpmkOfMk(db, m.kode);
    if (!cp.length) { out.push(['MK ' + m.kode, 'belum punya CPMK']); return; }
    const s = cp.reduce((a, c) => a + E.bobotOf(db, m.kode, c.kode), 0);
    if (Math.abs(s - 100) > 0.5) out.push(['MK ' + m.kode, 'bobot transkrip CPMK ' + +s.toFixed(1) + '% (seharusnya 100%)']);
  });
  db.profilLulusan.forEach(p => { if (!db.mappingCplProfil.some(m => m.profil === p.kode)) out.push(['Profil ' + p.kode, 'belum didukung CPL mana pun']); });
  return out;
}
function setupCard() {
  const d = db, cps = d.cpmk.length, st = st0();
  const bobotOk = d.mk.filter(m => E.cpmkOfMk(d, m.kode).length).every(m => Math.abs(E.cpmkOfMk(d, m.kode).reduce((a, c) => a + E.bobotOf(d, m.kode, c.kode), 0) - 100) < 0.5);
  const mapOk = d.cpl.length > 0 && d.cpl.every(l => Math.abs(E.mappingsOf(d, l.kode).reduce((a, m) => a + num(m.bobot), 0) - 100) < 0.5);
  const nM = mhsAll().length, dosen = d.users.filter(u => u.role === 'dosen');
  const steps = [
    ['Profil Lulusan', d.profilLulusan.length > 0, d.profilLulusan.length + ' profil', 'data-master', 'tab-profil'], ['CPL beserta target', d.cpl.length > 0, d.cpl.length + ' CPL', 'data-master', 'tab-cpl'],
    ['Mata Kuliah', d.mk.length > 0, d.mk.length + ' mata kuliah', 'data-master', 'tab-mk'], ['CPMK per mata kuliah', cps > 0, cps + ' CPMK', 'data-master', 'tab-cpmk'],
    ['Pemetaan CPMK ke CPL (total 100% per CPL)', mapOk, mapOk ? 'lengkap' : 'belum 100%', 'mapping', 'cpmk-cpl'], ['Bobot CPMK per mata kuliah (total 100%)', cps > 0 && bobotOk, bobotOk && cps ? 'lengkap' : 'belum 100%', 'mapping', 'cpmk-cpl'],
    ['Semester aktif', !!st.semesterAktif, st.semesterAktif || 'belum dipilih', 'settings', ''], ['Mahasiswa', nM > 0, nM + ' mahasiswa', 'manajemen-user', 'tab-mhs'],
    ['Peserta kelas semester aktif', d.pesertaKelas.some(p => p.semester === st.semesterAktif), d.pesertaKelas.filter(p => p.semester === st.semesterAktif).length + ' data', 'settings', ''], ['Dosen dan mata kuliah yang diampu', dosen.some(u => (u.mkDiampu || []).length), dosen.length + ' dosen', 'manajemen-user', 'tab-dosen'],
    ['Nilai CPMK terisi', d.nilaiCpmk.length > 0, d.nilaiCpmk.length + ' nilai', 'input-nilai', '']];
  const done = steps.filter(s => s[1]).length, c = card('setup-card'); c.classList.remove('mt-8'); c.classList.add('mb-8');
  c.innerHTML = `<div class="flex justify-between items-center mb-4"><h4 class="font-extrabold text-lg text-gray-900"><i class="fas fa-list-check text-brand-light mr-2"></i>Panduan Pengaturan Awal</h4><span class="text-xs font-black ${done === steps.length ? 'text-green-600' : 'text-amber-600'}">${done} / ${steps.length} langkah</span></div>` +
    `<div class="w-full bg-gray-100 rounded-full h-1.5 mb-4 overflow-hidden"><div class="bg-brand-light h-1.5 rounded-full" style="width:${Math.round(done / steps.length * 100)}%"></div></div>` +
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">' + steps.map(s => `<button onclick="loadPage('${s[3]}'${s[4] ? `,'${s[4]}'` : ''})" class="flex items-center justify-between text-left px-4 py-2.5 rounded-xl border ${s[1] ? 'border-green-100 bg-green-50/40' : 'border-amber-200 bg-amber-50/50'} hover:shadow transition"><span class="text-sm font-bold text-gray-700"><i class="fas ${s[1] ? 'fa-circle-check text-green-500' : 'fa-circle-exclamation text-amber-500'} mr-2"></i>${h(s[0])}</span><span class="text-[11px] font-bold text-gray-400">${h(s[2])}</span></button>`).join('') + '</div>';
  return c;
}
export function renderAdminDashboard() {
  setJudul('Beranda Admin', 'Ikhtisar mutu dan pemenuhan kurikulum Program Studi.');
  const container = $id('content-view'), nims = mhsAll().map(m => m.username), pr = E.programAll(db, nims), v = pr.filter(r => r.rata !== null);
  const overall = v.length ? (v.reduce((a, r) => a + r.rata, 0) / v.length).toFixed(1) : '0';
  const stat = (judul, isi, ikon, warna, ket) => `<div class="bg-white p-7 rounded-[2rem] card-shadow border border-gray-100 relative overflow-hidden"><div class="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-brand-soft rounded-full opacity-50"></div><p class="text-gray-400 text-xs font-bold uppercase tracking-widest relative z-10">${judul}</p><h3 class="text-4xl font-black text-gray-900 mt-2 mb-3 relative z-10">${isi}</h3><div class="${warna} text-xs font-bold flex items-center relative z-10"><i class="fas ${ikon} mr-1.5"></i> ${ket}</div></div>`;
  container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">${stat('Total Mahasiswa', nims.length, 'fa-users', 'text-brand-light', 'Terdaftar Aktif')}${stat('Total Mata Kuliah', db.mk.length, 'fa-book', 'text-brand', 'Kurikulum')}${stat('Rata-rata Kualitas Prodi', overall + '<span class="text-xl font-bold text-gray-400 ml-1">%</span>', 'fa-chart-line', 'text-green-500', 'Performa CPL Berjalan')}</div><div class="bg-white p-8 rounded-[2rem] card-shadow border border-gray-100 flex flex-col"><h4 class="font-extrabold text-gray-900 mb-6 text-lg">Performa Berjalan vs Target CPL (%)</h4><div class="relative w-full h-80"><canvas id="mainChart"></canvas></div></div>`;
  container.insertBefore(setupCard(), container.firstChild);
  const g = gaps(), c = card();
  c.innerHTML = '<h4 class="font-extrabold text-lg text-gray-900 mb-4"><i class="fas fa-puzzle-piece text-brand-light mr-2"></i>Kecukupan Kurikulum</h4>' + (g.length
    ? '<p class="text-xs text-amber-600 font-bold mb-3">' + g.length + ' temuan yang memengaruhi akurasi capaian CPL:</p><div class="max-h-72 overflow-y-auto border border-gray-100 rounded-xl custom-scrollbar"><table class="w-full text-left text-sm"><tbody>' + g.map(x => '<tr class="border-b border-gray-50"><td class="px-4 py-2 font-bold text-gray-800 whitespace-nowrap">' + h(x[0]) + '</td><td class="px-4 py-2 text-gray-600">' + h(x[1]) + '</td></tr>').join('') + '</tbody></table></div>'
    : '<p class="text-sm text-green-600 font-bold"><i class="fas fa-check-circle mr-1"></i>Pemetaan dan bobot sudah lengkap.</p>');
  container.appendChild(c);
  const labels = db.cpl.map(x => x.kode);
  gambarChart('mainChart', { type: 'bar', data: { labels: labels.length ? labels : ['Belum ada CPL'], datasets: [{ label: 'Rata-rata Performa (mahasiswa data cukup, %)', data: pr.length ? pr.map(r => r.rata === null ? 0 : +r.rata.toFixed(1)) : [0], backgroundColor: '#007bff', borderRadius: 8 }, { label: 'Target Minimal (%)', data: db.cpl.length ? db.cpl.map(x => num(x.target)) : [0], backgroundColor: 'rgba(11, 29, 74, 0.15)', borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, scales: { y: { min: 0, max: 100, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } } });
}

/* ============================== MANAJEMEN USER ============================== */
const cariUser = { dosen: '', mhs: '' };
export function renderManajemenUser(targetTab) {
  setJudul('Manajemen Pengguna', 'Kelola data akun Dosen dan Mahasiswa.');
  targetTab = targetTab === 'tab-mhs' ? 'tab-mhs' : 'tab-dosen';
  $id('content-view').innerHTML = `<div class="bg-white rounded-[2rem] card-shadow border border-gray-100 overflow-hidden"><div class="flex border-b border-gray-100 overflow-x-auto custom-scrollbar bg-gray-50/50"><button onclick="switchUserTab('tab-dosen')" id="btn-tab-dosen" class="${BTN_TAB}">Data Dosen</button><button onclick="switchUserTab('tab-mhs')" id="btn-tab-mhs" class="${BTN_TAB}">Data Mahasiswa</button></div><div id="user-tab-content" class="p-6 sm:p-8"></div></div>`;
  switchUserTab(targetTab);
}
export function switchUserTab(id) {
  State.tab = id;
  ['btn-tab-dosen', 'btn-tab-mhs'].forEach(b => { const el = $id(b); if (el) el.className = BTN_TAB; });
  const act = $id('btn-' + id); if (act) act.className = BTN_TAB_ON;
  const content = $id('user-tab-content'); if (!content) return;
  const type = id.replace('tab-', ''), role = type === 'mhs' ? 'mahasiswa' : 'dosen';
  content.innerHTML = `<div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4"><h4 class="text-lg font-extrabold text-gray-900 w-full md:w-auto tracking-tight">Daftar Pengguna</h4><div class="flex flex-wrap gap-3 w-full md:w-auto">${tombolBar(type)}</div></div>` +
    `<div class="relative mb-5"><i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i><input id="user-q" type="text" autocomplete="off" placeholder="Cari ${type === 'mhs' ? 'NIM' : 'NIDN'} / nama${type === 'mhs' ? ' / angkatan' : ''}..." class="w-full pl-11 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand focus:bg-white outline-none text-sm font-semibold text-gray-800" value="${h(cariUser[type])}"><span id="user-count" class="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400"></span></div>` +
    `<div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar shadow-sm"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-5 py-4">${type === 'dosen' ? 'NIDN' : 'NIM'}</th><th class="px-5 py-4">Nama Lengkap</th>${type === 'mhs' ? '<th class="px-5 py-4 text-center">Angkatan</th>' : '<th class="px-5 py-4">MK Diampu</th>'}<th class="px-5 py-4">Status</th><th class="px-5 py-4 text-right">Aksi</th></tr></thead><tbody id="table-body" class="divide-y divide-gray-50/80 bg-white"></tbody></table></div>`;
  const draw = () => {
    const q = cariUser[type].trim().toLowerCase(), all = db.users.filter(u => u.role === role);
    const rows = q ? all.filter(u => (u.username + ' ' + u.name + ' ' + (u.angkatan || '')).toLowerCase().includes(q)) : all;
    const tampil = rows.slice(0, 500);
    $id('table-body').innerHTML = !all.length ? `<tr><td colspan="5" class="px-5 py-12 text-center text-gray-400 italic font-medium">Belum ada data ${role}.</td></tr>`
      : !rows.length ? '<tr><td colspan="5" class="px-5 py-12 text-center text-gray-400 italic font-medium">Tidak ada yang cocok.</td></tr>'
        : tampil.map(u => `<tr class="hover:bg-brand-soft/40 transition"><td class="px-5 py-4 text-sm font-mono text-brand-blue font-bold">${h(u.username)}</td><td class="px-5 py-4 text-sm font-bold text-gray-800">${h(u.name)}</td>${type === 'mhs' ? `<td class="px-5 py-4 text-sm text-gray-600 text-center font-bold">${h(u.angkatan || '-')}</td>` : `<td class="px-5 py-4 text-xs text-gray-500 font-semibold whitespace-normal max-w-[260px]">${h((u.mkDiampu || []).join(', ') || '-')}</td>`}<td class="px-5 py-4 text-xs"><span class="bg-brand-soft text-brand-blue px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">${h(u.role)}</span></td><td class="px-5 py-4 text-right space-x-3"><button data-aksi="resetpw" data-id="${h(u.username)}" class="text-gray-300 hover:text-amber-500 transition" title="Reset password"><i class="fas fa-key text-base"></i></button><button data-aksi="edit" data-type="${type}" data-id="${h(u.username)}" class="text-gray-300 hover:text-brand-light transition" title="Edit Data"><i class="fas fa-edit text-base"></i></button><button data-aksi="hapus" data-type="${type}" data-id="${h(u.username)}" class="text-gray-300 hover:text-red-500 transition" title="Hapus Data"><i class="fas fa-trash-alt text-base"></i></button></td></tr>`).join('') + (rows.length > tampil.length ? `<tr><td colspan="5" class="px-5 py-4 text-center text-xs font-bold text-gray-400">Menampilkan 500 dari ${rows.length}. Persempit pencarian.</td></tr>` : '');
    $id('user-count').textContent = rows.length + ' dari ' + all.length;
  };
  $id('user-q').oninput = e => { cariUser[type] = e.target.value; draw(); };
  draw();
}

/* ============================== DATA MASTER ============================== */
export function renderDataMaster(targetTab) {
  setJudul('Pengelolaan Data Master', 'Kelola entitas dasar akademik sistem.');
  if (!targetTab || !/^tab-(profil|cpl|mk|cpmk)$/.test(targetTab)) targetTab = 'tab-profil';
  $id('content-view').innerHTML = `<div class="bg-white rounded-[2rem] card-shadow border border-gray-100 overflow-hidden"><div class="flex border-b border-gray-100 overflow-x-auto custom-scrollbar bg-gray-50/50"><button onclick="switchMasterTab('tab-profil')" id="btn-tab-profil" class="${BTN_TAB}">Profil Lulusan</button><button onclick="switchMasterTab('tab-cpl')" id="btn-tab-cpl" class="${BTN_TAB}">Master CPL</button><button onclick="switchMasterTab('tab-mk')" id="btn-tab-mk" class="${BTN_TAB}">Mata Kuliah</button><button onclick="switchMasterTab('tab-cpmk')" id="btn-tab-cpmk" class="${BTN_TAB}">Data CPMK</button></div><div id="tab-content-area" class="p-6 sm:p-8"></div></div>`;
  switchMasterTab(targetTab);
}
export function switchMasterTab(id) {
  State.tab = id;
  ['btn-tab-profil', 'btn-tab-cpl', 'btn-tab-mk', 'btn-tab-cpmk'].forEach(b => { const el = $id(b); if (el) el.className = BTN_TAB; });
  const act = $id('btn-' + id); if (act) act.className = BTN_TAB_ON;
  const content = $id('tab-content-area'); if (!content) return;
  const type = id.replace('tab-', ''), data = db[type === 'profil' ? 'profilLulusan' : type], mkNama = new Map(db.mk.map(m => [m.kode, m.nama]));
  const rows = !data.length ? '<tr><td colspan="4" class="px-5 py-12 text-center text-gray-400 italic font-medium">Belum ada data.</td></tr>' : data.map(it => {
    let c1, c2, c3, rid;
    if (type === 'profil') { rid = c1 = it.kode; c2 = it.deskripsi; c3 = '<span class="bg-gray-100 text-gray-500 px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase">Aktif</span>'; }
    else if (type === 'cpl') { rid = c1 = it.kode; c2 = it.deskripsi; c3 = `<span class="bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider border border-green-100">${h(it.target || 0)}% Target</span>`; }
    else if (type === 'mk') { rid = c1 = it.kode; c2 = it.nama; c3 = `<span class="text-brand-dark font-extrabold">${h(it.sks)} SKS</span> <span class="bg-brand-soft text-brand px-2.5 py-1 rounded-lg text-[10px] ml-2 font-bold uppercase tracking-wider">Smt ${h(it.semester || '-')}</span>`; }
    else { rid = it.mk + '\u0001' + it.kode; c1 = it.kode; c2 = it.deskripsi; c3 = `<span class="bg-brand-soft text-brand-blue px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider">${h(mkNama.get(it.mk) || it.mk)}</span>`; }
    return `<tr class="hover:bg-brand-soft/40 transition"><td class="px-5 py-4 text-sm font-mono text-brand-blue font-bold">${h(c1)}</td><td class="px-5 py-4 text-sm font-bold text-gray-800 whitespace-normal min-w-[200px]">${h(c2)}</td><td class="px-5 py-4 text-xs">${c3}</td><td class="px-5 py-4 text-right space-x-3"><button data-aksi="edit" data-type="${type}" data-id="${h(rid)}" class="text-gray-300 hover:text-brand-light transition" title="Edit Data"><i class="fas fa-edit text-base"></i></button><button data-aksi="hapus" data-type="${type}" data-id="${h(rid)}" class="text-gray-300 hover:text-red-500 transition" title="Hapus Data"><i class="fas fa-trash-alt text-base"></i></button></td></tr>`;
  }).join('');
  content.innerHTML = `<div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4"><h4 class="text-lg font-extrabold text-gray-900 w-full md:w-auto tracking-tight">Daftar Data</h4><div class="flex flex-wrap gap-3 w-full md:w-auto">${tombolBar(type)}</div></div><div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar shadow-sm"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-5 py-4">Kode</th><th class="px-5 py-4">Deskripsi / Nama</th><th class="px-5 py-4">Atribut</th><th class="px-5 py-4 text-right">Aksi</th></tr></thead><tbody class="divide-y divide-gray-50/80 bg-white">${rows}</tbody></table></div>`;
}

// ---------- Formulir master & pengguna ----------
const TABEL = { profil: 'profilLulusan', cpl: 'cpl', mk: 'mk', cpmk: 'cpmk', mhs: 'users', dosen: 'users' };
function cariItem(type, id) {
  if (type === 'mhs' || type === 'dosen') return db.users.find(u => T(u.username) === T(id));
  if (type === 'cpmk') { const [m, k] = String(id).split('\u0001'); return db.cpmk.find(c => T(c.mk) === T(m) && T(c.kode) === T(k)); }
  return db[TABEL[type]].find(x => T(x.kode) === T(id));
}
export function openMasterForm(type, edit = null) {
  const ed = !!edit, ro = ed ? ' bg-gray-100 cursor-not-allowed" readonly' : '"';
  const titles = { dosen: ed ? 'Edit Dosen' : 'Tambah Dosen', mhs: ed ? 'Edit Mahasiswa' : 'Tambah Mahasiswa', profil: ed ? 'Edit Profil' : 'Tambah Profil Lulusan', cpl: ed ? 'Edit CPL' : 'Tambah CPL', mk: ed ? 'Edit MK' : 'Tambah MK', cpmk: ed ? 'Edit CPMK' : 'Tambah CPMK' };
  let html = '';
  if (type === 'mhs' || type === 'dosen') {
    html = `<div class="space-y-4"><div><label class="${LBL}">${type === 'mhs' ? 'NIM' : 'NIDN / Username'}</label><input type="text" id="f-user" class="${INP}${ro} value="${ed ? h(edit.username) : ''}"></div>` +
      `<div><label class="${LBL}">Nama Lengkap</label><input type="text" id="f-name" class="${INP}" value="${ed ? h(edit.name) : ''}"></div>` +
      (type === 'mhs' ? `<div><label class="${LBL}">Angkatan</label><input type="number" id="f-angkatan" class="${INP}" value="${ed ? h(edit.angkatan || '') : ''}" placeholder="Contoh: 2024"></div>` : '') +
      `<div><label class="${LBL}">Password ${ed ? '(kosongkan = tidak berubah)' : '(kosongkan = password bawaan)'}</label><input type="password" id="f-pass" autocomplete="new-password" class="${INP}" placeholder="${ed ? '••••••••' : 'Min. 6 karakter, atau kosongkan'}"><p class="text-[10px] text-gray-400 mt-1.5">Pengguna wajib mengganti password saat login berikutnya.</p></div></div>`;
    if (type === 'dosen') {
      const cur = (ed && edit.mkDiampu) || [];
      html += `<div class="mt-4"><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-2">Mata kuliah yang diampu (hak input nilai)</label><div class="max-h-40 overflow-y-auto border border-gray-100 rounded-xl p-3 space-y-2 custom-scrollbar">` +
        (db.mk.length ? db.mk.map(m => `<label class="flex items-center space-x-2 text-sm font-semibold text-gray-700"><input type="checkbox" class="mk-ampu" value="${h(m.kode)}"${cur.includes(m.kode) ? ' checked' : ''}><span>${h(m.kode)} - ${h(m.nama)}</span></label>`).join('') : '<p class="text-xs text-gray-400">Belum ada mata kuliah.</p>') + '</div></div>';
    }
  } else if (type === 'profil') {
    html = `<div class="space-y-4"><div><label class="${LBL}">Kode Profil Lulusan</label><input type="text" id="f-kode" class="${INP}${ro} value="${ed ? h(edit.kode) : ''}"></div><div><label class="${LBL}">Deskripsi Profil</label><textarea id="f-desc" class="${INP} h-28">${ed ? h(edit.deskripsi) : ''}</textarea></div></div>`;
  } else if (type === 'cpl') {
    html = `<div class="space-y-4"><div class="grid grid-cols-2 gap-5"><div><label class="${LBL}">Kode CPL</label><input type="text" id="f-kode" class="${INP}${ro} value="${ed ? h(edit.kode) : ''}"></div><div><label class="${LBL}">Target (%)</label><input type="number" id="f-target" min="0" max="100" class="${INP}" value="${ed ? h(edit.target) : '70'}"></div></div><div><label class="${LBL}">Deskripsi</label><textarea id="f-desc" class="${INP} h-28">${ed ? h(edit.deskripsi) : ''}</textarea></div></div>`;
  } else if (type === 'mk') {
    html = `<div class="space-y-4"><div class="grid grid-cols-3 gap-4"><div><label class="${LBL}">Kode MK</label><input type="text" id="f-kode" class="${INP}${ro} value="${ed ? h(edit.kode) : ''}"></div><div><label class="${LBL}">SKS</label><input type="number" id="f-sks" class="${INP}" value="${ed ? h(edit.sks) : '3'}"></div><div><label class="${LBL}">Smt</label><input type="number" id="f-smt" class="${INP}" value="${ed ? h(edit.semester) : ''}"></div></div><div><label class="${LBL}">Nama MK</label><input type="text" id="f-name" class="${INP}" value="${ed ? h(edit.nama) : ''}"></div></div>`;
  } else if (type === 'cpmk') {
    const opts = db.mk.map(m => `<option value="${h(m.kode)}"${ed && edit.mk === m.kode ? ' selected' : ''}>${h(m.kode)} - ${h(m.nama)}</option>`).join('');
    html = `<div class="space-y-4"><div><label class="${LBL}">Mata Kuliah</label><select id="f-mk" class="${INP}"${ed ? ' disabled' : ''}><option value="">-- Pilih Mata Kuliah --</option>${opts}</select></div><div><label class="${LBL}">Kode CPMK</label><input type="text" id="f-kode" class="${INP}${ro} value="${ed ? h(edit.kode) : ''}" placeholder="Contoh: CPMK-1"></div><div><label class="${LBL}">Deskripsi Capaian</label><textarea id="f-desc" class="${INP} h-28">${ed ? h(edit.deskripsi) : ''}</textarea></div>${ed ? '<p class="text-[10px] text-gray-400">Kode & mata kuliah dikunci agar nilai dan pemetaan CPMK ini tidak terputus. Untuk mengganti kode, hapus lalu buat CPMK baru.</p>' : ''}</div>`;
  }
  const v = id => ($id(id) ? $id(id).value : '').trim();
  openModal(titles[type], html, () => {
    if (type === 'mhs' || type === 'dosen') {
      const u = v('f-user'), name = v('f-name'), pw = $id('f-pass').value;
      if (!u || !name) throw new Error((type === 'mhs' ? 'NIM' : 'NIDN') + ' dan nama wajib diisi.');
      if (/[\/\s]/.test(u)) throw new Error('Username tidak boleh memuat spasi atau "/".');
      if (pw && pw.length < 6) throw new Error('Password minimal 6 karakter.');
      const lain = db.users.find(x => x.username === u);
      if (!ed && lain) throw new Error('ID ' + u + ' sudah terdaftar sebagai ' + lain.role + '.');
      const rec = ed ? Object.assign({}, edit) : { username: u, role: type === 'mhs' ? 'mahasiswa' : 'dosen', angkatan: '', mkDiampu: [] };
      rec.name = name; if (type === 'mhs') rec.angkatan = v('f-angkatan');
      if (type === 'dosen') rec.mkDiampu = [...$id('modal-body').querySelectorAll('.mk-ampu:checked')].map(x => x.value);
      if (pw) rec._pw = pw;
      if (ed) db.users[db.users.indexOf(edit)] = rec; else db.users.unshift(rec);
    } else {
      const kode = ed ? edit.kode : v('f-kode'); if (!kode) throw new Error('Kode wajib diisi.');
      const tb = TABEL[type];
      let rec;
      if (type === 'profil') rec = { kode, deskripsi: v('f-desc') };
      else if (type === 'cpl') { const t = parseFloat(v('f-target')); if (isNaN(t) || t < 0 || t > 100) throw new Error('Target harus 0-100.'); rec = { kode, target: t, deskripsi: v('f-desc') }; }
      else if (type === 'mk') rec = { kode, nama: v('f-name'), sks: parseInt(v('f-sks')) || 0, semester: parseInt(v('f-smt')) || 0 };
      else { const mk = ed ? edit.mk : v('f-mk'); if (!mk) throw new Error('Pilih mata kuliah.'); rec = { kode, mk, deskripsi: v('f-desc') }; }
      if (!ed && cariItem(type, type === 'cpmk' ? rec.mk + '\u0001' + kode : kode)) throw new Error('Kode ' + kode + ' sudah ada.');
      if (ed) db[tb][db[tb].indexOf(edit)] = rec; else db[tb].unshift(rec);
    }
    Store.simpan(TABEL[type]); showToast('Data disimpan!');
    if (type === 'mhs' || type === 'dosen') switchUserTab('tab-' + type); else switchMasterTab('tab-' + type);
  });
}
export function editMasterData(type, id) { const it = cariItem(type, id); if (it) openMasterForm(type, it); }
export function deleteMasterData(type, id) {
  const it = cariItem(type, id); if (!it) return;
  const label = type === 'cpmk' ? it.mk + ' / ' + it.kode : id;
  const efek = type === 'mk' ? ' Semua CPMK, pemetaan, bobot, dan NILAI mata kuliah ini ikut terhapus.' : type === 'cpmk' ? ' Pemetaan, bobot, dan NILAI CPMK ini ikut terhapus.' : type === 'cpl' ? ' Pemetaan CPL ini ikut terhapus.' : type === 'profil' ? ' Pemetaan ke profil ini ikut terhapus.' : ' Akun login ikut dihapus.';
  showCustomDialog('confirm', 'Hapus data ' + label + '?' + efek, () => {
    const tb = TABEL[type]; db[tb] = db[tb].filter(x => x !== it);
    Store.simpan(tb); showToast('Terhapus!');
    if (type === 'mhs' || type === 'dosen') switchUserTab('tab-' + type); else switchMasterTab('tab-' + type);
  });
}

/* ============================== PEMETAAN OBE ============================== */
const mapBtn = (t, l) => `<button onclick="downloadTemplate('${t}')" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition"><i class="fas fa-download mr-2"></i>Template ${l}</button><label class="bg-gradient-to-br from-brand-blue to-brand-light text-white px-4 py-2 rounded-xl text-sm font-bold cursor-pointer hover:opacity-90 transition"><i class="fas fa-upload mr-2"></i>Upload<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="handleExcelUpload(this,'${t}')"></label>`;
export function renderMappingPage(subId) {
  subId = subId === 'cpl-profil' ? 'cpl-profil' : 'cpmk-cpl'; State.tab = subId;
  setJudul('Pemetaan OBE (Level 2)', subId === 'cpmk-cpl' ? 'Relasi Kualitas: Capaian Pembelajaran Mata Kuliah (CPMK) terhadap CPL.' : 'Relasi Makro: Capaian CPL terhadap Profil Lulusan (PL).');
  const container = $id('content-view');
  if (subId === 'cpl-profil' && (!db.cpl.length || !db.profilLulusan.length)) { container.innerHTML = kosongKuning('Data Master Belum Lengkap', 'Lengkapi Data Profil Lulusan dan CPL terlebih dahulu.'); return; }
  if (subId === 'cpmk-cpl' && (!db.cpl.length || !db.mk.length)) { container.innerHTML = kosongKuning('Data Master Belum Lengkap', 'Lengkapi Data CPL dan Mata Kuliah terlebih dahulu.'); return; }
  const bar = `<div class="map-bar flex flex-wrap items-center gap-3 mb-5">${subId === 'cpl-profil' ? mapBtn('mapprofil', 'CPL → Profil') : mapBtn('mapcpl', 'CPMK → CPL') + '<span class="w-px h-8 bg-gray-200 mx-2"></span>' + mapBtn('bobot', 'Bobot CPMK')}<button id="btn-normal" type="button" class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl hover:bg-amber-100 transition"><i class="fas fa-wand-magic-sparkles mr-2"></i>Normalkan bobot ke 100%</button></div>`;
  const cell = (cls, i, j, on, b) => `<td class="px-3 py-4 border-l border-gray-50 text-center"><div class="flex flex-col items-center justify-center gap-2"><input type="checkbox" data-i="${i}" data-j="${j}" class="mapping-checkbox rounded text-brand-light border-gray-300 focus:ring-brand-light transition cursor-pointer ${cls}-chk"${on ? ' checked' : ''}><input type="number" data-i="${i}" data-j="${j}" class="${cls}-bobot w-14 text-center text-xs p-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-light outline-none text-brand-dark font-bold shadow-inner${on ? '' : ' hidden'}" placeholder="0" value="${on ? h(b) : ''}" min="0" max="100"></div></td>`;
  let html;
  if (subId === 'cpmk-cpl') {
    const idx = new Map(db.mappingCpmk.map(m => [m.mk + '\u0001' + m.cpmk + '\u0001' + m.cpl, m])), rowsArr = [];
    const th = db.cpl.map(c => `<th class="px-3 py-4 text-center border-l border-gray-100 min-w-[80px]" title="${h(c.deskripsi)}"><div class="font-extrabold text-brand-dark text-xs">${h(c.kode)}</div><div class="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">Bobot (%) ke CPL</div></th>`).join('');
    const tr = db.mk.map(m => {
      const cps = E.cpmkOfMk(db, m.kode); if (!cps.length) return '';
      return `<tr class="bg-brand-soft/60"><td colspan="${db.cpl.length + 1}" class="px-6 py-3 font-extrabold text-xs text-brand border-l-4 border-brand uppercase tracking-wider sticky left-0 z-10">${h(m.kode)} - ${h(m.nama)}</td></tr>` + cps.map(cp => {
        const i = rowsArr.push(cp) - 1;
        return `<tr class="hover:bg-brand-soft/30 transition border-b border-gray-50 last:border-0"><td class="px-6 py-4 bg-white sticky left-0 z-10 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] min-w-[250px]"><p class="font-bold text-gray-800 text-sm whitespace-nowrap">${h(cp.kode)}</p><p class="text-[10px] font-medium text-gray-500 mt-1.5 whitespace-normal w-full md:w-56 leading-relaxed">${h(cp.deskripsi)}</p></td>${db.cpl.map((c, j) => { const mo = idx.get(cp.mk + '\u0001' + cp.kode + '\u0001' + c.kode); return cell('cc', i, j, !!mo, mo ? mo.bobot : ''); }).join('')}</tr>`;
      }).join('');
    }).join('');
    html = `<div class="bg-white rounded-[2rem] card-shadow border border-gray-100 p-6 md:p-8"><div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 w-full"><h3 class="font-extrabold text-lg text-gray-900 tracking-tight"><i class="fas fa-sitemap text-brand-light mr-2"></i> Mapping CPMK <i class="fas fa-arrow-right text-gray-300 text-sm mx-2"></i> CPL</h3><button id="btn-save-map" class="bg-brand text-white px-7 py-3 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition tracking-wide w-full md:w-auto"><i class="fas fa-save mr-2"></i>Simpan Pemetaan</button></div><div class="overflow-x-auto border border-gray-100 rounded-2xl relative custom-scrollbar shadow-sm"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase font-black tracking-widest text-gray-400 border-b border-gray-100"><tr><th class="px-6 py-5 sticky left-0 bg-gray-50/90 backdrop-blur z-20 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] min-w-[250px]">Capaian Mata Kuliah (CPMK)</th>${th}</tr></thead><tbody class="divide-y divide-gray-50/50 bg-white">${tr}</tbody></table></div><p class="text-xs font-medium text-gray-400 mt-5"><i class="fas fa-info-circle mr-1 text-brand-light"></i> Centang kotak untuk menghubungkan CPMK dengan CPL, lalu isi bobot persentase relasi kontribusinya.</p></div>`;
    container.innerHTML = bar + html;
    pasangMatriks('cc', () => {
      const out = [];
      container.querySelectorAll('.cc-chk:checked').forEach(chk => { const cp = rowsArr[+chk.dataset.i], c = db.cpl[+chk.dataset.j], b = container.querySelector(`.cc-bobot[data-i="${chk.dataset.i}"][data-j="${chk.dataset.j}"]`); out.push({ cpmk: cp.kode, mk: cp.mk, cpl: c.kode, bobot: num(b && b.value) }); });
      return out;
    }, 'mappingCpmk', 'cpl', 'Pemetaan CPMK ke CPL berhasil disimpan!');
  } else {
    const idx = new Map(db.mappingCplProfil.map(m => [m.cpl + '\u0001' + m.profil, m]));
    const th = db.profilLulusan.map(p => `<th class="px-3 py-4 text-center border-l border-gray-100 min-w-[80px]" title="${h(p.deskripsi)}"><div class="font-extrabold text-brand-dark text-xs">${h(p.kode)}</div><div class="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">Bobot (%)</div></th>`).join('');
    const tr = db.cpl.map((c, i) => `<tr class="hover:bg-brand-soft/30 transition border-b border-gray-50 last:border-0"><td class="px-6 py-5 bg-white sticky left-0 z-10 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] min-w-[200px]"><p class="font-bold text-gray-800 text-sm whitespace-normal w-full md:w-48 leading-tight">${h(c.kode)}</p><p class="text-[10px] font-medium text-gray-400 mt-1.5 w-full md:w-48 whitespace-normal">${h(c.deskripsi)}</p></td>${db.profilLulusan.map((p, j) => { const mo = idx.get(c.kode + '\u0001' + p.kode); return cell('cp', i, j, !!mo, mo ? mo.bobot : ''); }).join('')}</tr>`).join('');
    html = `<div class="bg-white rounded-[2rem] card-shadow border border-gray-100 p-6 md:p-8"><div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 w-full"><h3 class="font-extrabold text-lg text-gray-900 tracking-tight"><i class="fas fa-user-tie text-brand mr-2"></i> Mapping CPL <i class="fas fa-arrow-right text-gray-300 text-sm mx-2"></i> Profil Lulusan</h3><button id="btn-save-map" class="bg-brand text-white px-7 py-3 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition tracking-wide w-full md:w-auto"><i class="fas fa-save mr-2"></i>Simpan Pemetaan</button></div><div class="overflow-x-auto border border-gray-100 rounded-2xl relative custom-scrollbar shadow-sm"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase font-black tracking-widest text-gray-400 border-b border-gray-100"><tr><th class="px-6 py-5 sticky left-0 bg-gray-50/90 backdrop-blur z-20 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)] min-w-[200px]">Capaian Pembelajaran Lulusan (CPL)</th>${th}</tr></thead><tbody class="divide-y divide-gray-50/50 bg-white">${tr}</tbody></table></div></div>`;
    container.innerHTML = bar + html;
    pasangMatriks('cp', () => {
      const out = [];
      container.querySelectorAll('.cp-chk:checked').forEach(chk => { const c = db.cpl[+chk.dataset.i], p = db.profilLulusan[+chk.dataset.j], b = container.querySelector(`.cp-bobot[data-i="${chk.dataset.i}"][data-j="${chk.dataset.j}"]`); out.push({ cpl: c.kode, profil: p.kode, bobot: num(b && b.value) }); });
      return out;
    }, 'mappingCplProfil', 'profil', 'Relasi CPL-Profil berhasil disimpan!');
  }
}
// Perilaku matriks: centang ↔ kotak bobot, simpan + validasi total, normalkan per kelompok
function pasangMatriks(cls, kumpulkan, tabel, kunciGrup, pesan) {
  const host = $id('content-view');
  host.querySelectorAll('.' + cls + '-chk').forEach(chk => chk.onchange = () => { const b = host.querySelector(`.${cls}-bobot[data-i="${chk.dataset.i}"][data-j="${chk.dataset.j}"]`); if (b) b.classList.toggle('hidden', !chk.checked); });
  $id('btn-save-map').onclick = () => {
    const rows = kumpulkan(), fix = rows.filter(r => r.bobot < 0 || r.bobot > 100).length;
    rows.forEach(r => { r.bobot = Math.min(100, Math.max(0, r.bobot)); });
    db[tabel] = rows; Store.simpan(tabel); showToast(pesan);
    const sum = {}; rows.forEach(r => { sum[r[kunciGrup === 'cpl' ? 'cpl' : 'profil']] = (sum[r[kunciGrup === 'cpl' ? 'cpl' : 'profil']] || 0) + r.bobot; });
    const msgs = []; if (fix) msgs.push(fix + ' bobot di luar 0-100 disesuaikan.');
    const bad = Object.keys(sum).filter(k => Math.abs(sum[k] - 100) > 0.5).map(k => k + ' (' + +sum[k].toFixed(1) + '%)');
    if (bad.length) msgs.push('Total bobot kontribusi per ' + (kunciGrup === 'cpl' ? 'CPL' : 'Profil') + ' belum 100%: ' + bad.join(', ') + '. Hasil tetap dihitung secara relatif, namun sebaiknya disesuaikan.');
    const un = (kunciGrup === 'cpl' ? db.cpl : db.profilLulusan).filter(x => !(x.kode in sum)).map(x => x.kode);
    if (un.length) msgs.push('Belum terpetakan sama sekali: ' + un.join(', ') + '.');
    if (msgs.length) setTimeout(() => showCustomDialog('alert', msgs.join('\n')), 300);
  };
  $id('btn-normal').onclick = () => {
    const grup = new Map(); // kelompok = kolom (CPL / Profil)
    host.querySelectorAll('.' + cls + '-chk:checked').forEach(chk => { const j = chk.dataset.j; (grup.get(j) || grup.set(j, []).get(j)).push(host.querySelector(`.${cls}-bobot[data-i="${chk.dataset.i}"][data-j="${j}"]`)); });
    let n = 0;
    grup.forEach(g => {
      const sum = g.reduce((a, i) => a + num(i.value), 0), v = g.map(i => sum > 0 ? num(i.value) / sum * 100 : 100 / g.length).map(x => Math.round(x * 10) / 10);
      const diff = Math.round((100 - v.reduce((a, x) => a + x, 0)) * 10) / 10, mx = v.indexOf(Math.max(...v)); v[mx] = Math.round((v[mx] + diff) * 10) / 10;
      g.forEach((i, k) => { i.value = v[k]; }); n++;
    });
    showToast(n ? n + ' kelompok dinormalkan ke 100%. Tekan "Simpan Pemetaan" untuk menyimpan.' : 'Belum ada pemetaan yang dicentang.');
  };
}

/* ============================== PENGATURAN INSTANSI ============================== */
const DEF_LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' /></svg>";
export function renderSettings() {
  setJudul('Pengaturan Instansi', 'Kelola identitas Program Studi dan Fakultas Anda.');
  const host = $id('content-view'), st = st0(), I2 = 'w-full px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand focus:bg-white outline-none text-sm font-bold text-gray-800 transition-all';
  host.innerHTML = `<div class="bg-white rounded-[2rem] card-shadow border border-gray-100 p-8 md:p-10 max-w-4xl"><div class="flex flex-col md:flex-row gap-10"><div class="w-full md:w-1/3 flex flex-col items-center"><label class="block text-sm font-extrabold text-gray-800 mb-5">Logo Instansi</label><div class="w-52 h-52 rounded-3xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative group hover:border-brand transition-colors"><img id="preview-logo" src="${h(st.logoUrl || DEF_LOGO)}" class="w-full h-full object-contain ${st.logoUrl ? '' : 'p-10'}" alt="Logo"><div class="absolute inset-0 bg-brand-dark/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onclick="document.getElementById('upload-logo').click()"><i class="fas fa-camera text-white text-3xl mb-3"></i><span class="text-white text-xs font-bold tracking-wide">Ubah Logo</span></div></div><input type="file" id="upload-logo" accept="image/*" class="hidden"><input type="hidden" id="logo-base64" value="${h(st.logoUrl || '')}"><p class="text-[10px] text-gray-400 mt-4 text-center font-medium w-full leading-relaxed">Klik area di atas untuk mengganti logo. <br>Otomatis disesuaikan ke ukuran ideal.</p></div><div class="w-full md:w-2/3 space-y-6 mt-2"><div><label class="block text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">Nama Program Studi</label><input type="text" id="f-prodi" class="${I2}" placeholder="Contoh: S1 Teknik Informatika" value="${h(st.namaProdi || '')}"></div><div><label class="block text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">Fakultas</label><input type="text" id="f-fakultas" class="${I2}" placeholder="Contoh: Fakultas Ilmu Komputer" value="${h(st.fakultas || '')}"></div><div><label class="block text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">Nama Ketua Program Studi</label><input type="text" id="f-kaprodi" class="${I2}" placeholder="Beserta gelar akademik..." value="${h(st.kaprodi || '')}"></div><div class="pt-8 mt-4 border-t border-gray-100 flex justify-end"><button id="btn-save-settings" class="bg-brand text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition flex items-center tracking-wide"><i class="fas fa-save mr-2 text-lg"></i> Simpan Pengaturan Instansi</button></div></div></div></div>`;
  $id('upload-logo').onchange = e => gantiLogo(e.target);
  $id('btn-save-settings').onclick = () => {
    Object.assign(st0(), { namaProdi: $id('f-prodi').value.trim(), fakultas: $id('f-fakultas').value.trim(), kaprodi: $id('f-kaprodi').value.trim(), logoUrl: $id('logo-base64').value });
    Store.simpan('settings'); window.App.branding(); showToast('Pengaturan Instansi berhasil disimpan!');
  };
  kartuAi(host); kartuAmbang(host); kartuSemester(host); kartuAturan(host);
}
function gantiLogo(input) {
  const file = input.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { showCustomDialog('alert', 'Ukuran maksimal 2MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'), MAX = 120; let w = img.width, hh = img.height;
      if (w > hh) { if (w > MAX) { hh *= MAX / w; w = MAX; } } else if (hh > MAX) { w *= MAX / hh; hh = MAX; }
      c.width = w; c.height = hh; c.getContext('2d').drawImage(img, 0, 0, w, hh);
      let url = c.toDataURL('image/png'); if (url.length > 48000) url = c.toDataURL('image/jpeg', 0.8);
      if (url.length > 50000) { showCustomDialog('alert', 'Detail logo terlalu padat.'); return; }
      const p = $id('preview-logo'); p.src = url; p.classList.remove('p-10'); $id('logo-base64').value = url;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function kartuAi(host) {
  const el = card('', 'p-8 md:p-10 max-w-4xl'); host.appendChild(el);
  el.innerHTML = '<div class="text-center py-6 text-gray-300"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>';
  const gambar = s => {
    el.innerHTML = '<h4 class="font-extrabold text-lg text-gray-900 mb-1"><i class="fas fa-key text-brand-light mr-2"></i>Google AI Studio (Evaluasi AI)</h4>' +
      `<p class="text-xs text-gray-400 font-medium mb-6">Status API key: <strong class="${s.ada ? 'text-green-600' : 'text-red-500'}">${s.ada ? 'Tersimpan (' + h(s.samaran) + ')' : 'Belum diisi'}</strong>. Key disimpan di Script Properties server (tidak pernah dikirim ke browser maupun Firestore).</p>` +
      `<div class="space-y-5"><div><label class="block text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">API Key</label><input type="password" id="ai-key" autocomplete="off" class="${INP}" placeholder="${s.ada ? 'Kosongkan jika tidak ingin mengganti' : 'AIza...'}"></div>` +
      `<div><label class="block text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">Model Gemini</label><input type="text" id="ai-model" class="${INP}" value="${h(s.modelOtomatis ? '' : s.model)}" placeholder="Kosongkan = otomatis pilih model flash terbaru${s.model ? ' (saat ini: ' + h(s.model) + ')' : ''}"></div>` +
      `<div class="flex justify-between items-center gap-3">${s.ada ? '<button id="ai-del" class="text-xs font-bold text-red-500 hover:underline">Hapus API key</button>' : '<span></span>'}<button id="ai-save" class="bg-brand text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition"><i class="fas fa-save mr-2"></i>Simpan Pengaturan AI</button></div></div>`;
    const kirim = async (apiKey, model) => { const b = $id('ai-save'); b.disabled = true; const r = await api('aiSimpan', { apiKey, model }); b.disabled = false; if (r.ok) { showToast('Pengaturan AI disimpan.'); gambar(r); } else showCustomDialog('alert', 'Gagal menyimpan: ' + r.pesan); };
    $id('ai-save').onclick = () => kirim($id('ai-key').value.trim(), $id('ai-model').value.trim());
    const d = $id('ai-del'); if (d) d.onclick = () => showCustomDialog('confirm', 'Hapus API key Gemini dari server?', () => kirim('__HAPUS__', $id('ai-model').value.trim()));
  };
  api('aiStatus').then(r => { if (r.ok) gambar(r); else el.innerHTML = '<p class="text-sm text-red-500 font-bold">Gagal memuat status AI: ' + h(r.pesan) + '</p>'; });
}
function kartuAmbang(host) {
  const st = st0(), mm = st.ambangMk || {}, g = E.globalMin(db), inp = 'px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand outline-none text-sm font-bold text-gray-800';
  const el = card('', 'p-8 md:p-10 max-w-4xl');
  el.innerHTML = '<h4 class="font-extrabold text-lg text-gray-900 mb-1"><i class="fas fa-shield-halved text-brand-light mr-2"></i>Ambang Kelulusan CPMK</h4><p class="text-xs text-gray-400 font-medium mb-6">CPL dinyatakan tercapai bila rata-rata memenuhi target dan tidak ada CPMK penentu di bawah nilai minimum.</p>' +
    `<label class="block text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">Nilai minimum CPMK (seluruh prodi)</label><input id="amb-g" type="number" min="0" max="100" class="${inp} w-32" value="${g}">` +
    '<p class="text-xs font-extrabold text-gray-400 uppercase tracking-widest mt-6 mb-2">Penyesuaian per mata kuliah (kosongkan = ikut nilai di atas)</p><div class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">' +
    db.mk.map((m, i) => `<div class="flex items-center justify-between gap-3"><span class="text-sm font-semibold text-gray-700">${h(m.kode)} - ${h(m.nama)}</span><input type="number" min="0" max="100" class="amb-mk ${inp} w-24" data-i="${i}" value="${mm[m.kode] !== undefined ? h(mm[m.kode]) : ''}"></div>`).join('') +
    '</div><div class="flex justify-end mt-6"><button id="amb-save" class="bg-brand text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition"><i class="fas fa-save mr-2"></i>Simpan Ambang</button></div>';
  host.appendChild(el);
  el.querySelector('#amb-save').onclick = () => {
    const gv = parseFloat(el.querySelector('#amb-g').value), o = {}; let bad = isNaN(gv) || gv < 0 || gv > 100;
    el.querySelectorAll('.amb-mk').forEach(i => { if (i.value.trim() === '') return; const v = parseFloat(i.value); if (isNaN(v) || v < 0 || v > 100) bad = true; else o[db.mk[+i.dataset.i].kode] = v; });
    if (bad) return showCustomDialog('alert', 'Semua nilai minimum harus berupa angka 0-100.');
    Object.assign(st0(), { ambangCpmk: gv, ambangMk: o }); Store.simpan('settings'); showToast('Ambang kelulusan disimpan.');
  };
}
function kartuSemester(host) {
  const f = 'px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand outline-none text-sm font-semibold text-gray-800';
  const el = card('', 'p-8 md:p-10 max-w-4xl');
  el.innerHTML = '<h4 class="font-extrabold text-lg text-gray-900 mb-4"><i class="fas fa-calendar-check text-brand-light mr-2"></i>Semester &amp; Peserta Kelas</h4>' +
    `<div class="flex gap-2 mb-3"><input id="sm-new" class="${f} grow" placeholder="Contoh: 2026/2027 Ganjil"><button id="sm-add" class="bg-brand text-white px-5 rounded-xl text-sm font-bold">Tambah</button></div><div id="sm-list" class="flex flex-wrap gap-2 mb-6"></div>` +
    `<p class="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">Peserta kelas</p><div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3"><select id="pk-sem" class="${f}"></select><select id="pk-mk" class="${f}"></select><select id="pk-akt" class="${f}"></select><input id="pk-q" class="${f}" placeholder="Cari NIM / nama"></div>` +
    '<div id="pk-list" class="max-h-72 overflow-y-auto border border-gray-100 rounded-xl p-3 space-y-1.5 custom-scrollbar"></div><div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mt-4"><span id="pk-n" class="text-xs font-bold text-gray-400"></span><div class="flex gap-2 flex-wrap"><button id="pk-none" class="text-gray-500 border-2 border-gray-200 px-4 py-2 rounded-xl text-sm font-bold">Kosongkan yang tampil</button><button id="pk-all" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold">Pilih semua yang tampil</button><button id="pk-save" class="bg-brand text-white px-5 py-2 rounded-xl text-sm font-bold">Simpan Peserta</button></div></div>';
  host.appendChild(el);
  const $ = id => el.querySelector('#' + id), mhs = mhsAll(), akts = [...new Set(mhs.map(E.aktOf))].sort().reverse();
  let sel = new Set();
  const aktif = () => st0().semesterAktif || '';
  const pesertaOf = (s, m) => new Set(db.pesertaKelas.filter(p => p.semester === s && p.mk === m).map(p => String(p.nim)));
  const cnt = () => { $('pk-n').textContent = sel.size + ' mahasiswa terpilih'; };
  const drawList = () => {
    const q = $('pk-q').value.trim().toLowerCase(), a = $('pk-akt').value;
    const rows = mhs.filter(u => (a === 'ALL' || E.aktOf(u) === a) && (!q || (u.username + ' ' + u.name).toLowerCase().includes(q)));
    $('pk-list').innerHTML = rows.slice(0, 1000).map(u => `<label class="flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" class="pk-c" value="${h(u.username)}"${sel.has(String(u.username)) ? ' checked' : ''}><span class="font-mono text-brand-blue">${h(u.username)}</span> ${h(u.name)} <span class="text-[10px] text-gray-400">${h(E.aktOf(u))}</span></label>`).join('') || '<span class="text-xs text-gray-400">Tidak ada mahasiswa.</span>';
    cnt();
  };
  $('pk-list').onchange = e => { const c = e.target; if (!c.classList.contains('pk-c')) return; c.checked ? sel.add(c.value) : sel.delete(c.value); cnt(); };
  const loadSel = () => { sel = pesertaOf($('pk-sem').value, $('pk-mk').value); drawList(); };
  const drawSem = () => {
    const A = aktif();
    $('sm-list').innerHTML = db.semester.map((s, i) => `<label class="flex items-center gap-2 px-3 py-1.5 rounded-xl border ${s.kode === A ? 'border-brand bg-brand-soft' : 'border-gray-200'} text-sm font-bold cursor-pointer"><input type="radio" name="sm-akt" data-i="${i}"${s.kode === A ? ' checked' : ''}>${h(s.kode)}${s.kode === A ? ' <span class="text-[10px] text-brand">AKTIF</span>' : ''}</label>`).join('') || '<span class="text-xs text-gray-400">Belum ada semester.</span>';
    const cur = $('pk-sem').value;
    $('pk-sem').innerHTML = db.semester.map((s, i) => `<option value="${h(s.kode)}"${(cur ? s.kode === cur : s.kode === A) ? ' selected' : ''}>${h(s.kode)}</option>`).join('');
    $('sm-list').querySelectorAll('input').forEach(r => r.onchange = () => { const k = db.semester[+r.dataset.i].kode; st0().semesterAktif = k; Store.simpan('settings'); showToast('Semester aktif: ' + k); drawSem(); loadSel(); });
  };
  $('pk-mk').innerHTML = db.mk.map(m => `<option value="${h(m.kode)}">${h(m.kode)} - ${h(m.nama)}</option>`).join('');
  $('pk-akt').innerHTML = '<option value="ALL">Semua angkatan</option>' + akts.map(a => `<option value="${h(a)}">Angkatan ${h(a)}</option>`).join('');
  $('sm-add').onclick = () => {
    const k = $('sm-new').value.trim(); if (!k) return;
    if (db.semester.some(s => s.kode === k)) return showToast('Semester sudah ada.');
    if (!/\d{4}/.test(k)) return showCustomDialog('alert', 'Sertakan tahun pada nama semester, mis. "2026/2027 Ganjil", agar urutan semester (nilai terbaru) benar.');
    db.semester = E.sortSem(db.semester.concat([{ kode: k, nama: k }])); if (!aktif()) st0().semesterAktif = k;
    Store.simpan('settings'); $('sm-new').value = ''; drawSem(); loadSel(); showToast('Semester ' + k + ' ditambahkan.');
  };
  ['pk-sem', 'pk-mk'].forEach(i => $(i).onchange = loadSel); $('pk-akt').onchange = drawList; $('pk-q').oninput = drawList;
  $('pk-all').onclick = () => { el.querySelectorAll('.pk-c').forEach(c => { c.checked = true; sel.add(c.value); }); cnt(); };
  $('pk-none').onclick = () => { el.querySelectorAll('.pk-c').forEach(c => { c.checked = false; sel.delete(c.value); }); cnt(); };
  $('pk-save').onclick = () => {
    const s = $('pk-sem').value, m = $('pk-mk').value; if (!s || !m) return showCustomDialog('alert', 'Pilih semester dan mata kuliah dulu.');
    Store.aturPeserta(s, m, [...sel]); showToast('Peserta kelas ' + m + ' (' + s + ') disimpan: ' + sel.size + ' mahasiswa.');
  };
  drawSem(); loadSel();
}
function kartuAturan(host) {
  const s = st0(), mp = E.minProg(db), pct = parseFloat(s.minPctMhs) || 0, amb = E.globalMin(db);
  const f = 'px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand outline-none text-sm font-bold text-gray-800', el = card('', 'p-8 md:p-10 max-w-4xl');
  el.innerHTML = '<h4 class="font-extrabold text-lg text-gray-900 mb-1"><i class="fas fa-scale-balanced text-brand-light mr-2"></i>Aturan Ketercapaian CPL</h4><p class="text-xs text-gray-400 font-medium mb-5">Ringkasan cara sistem menilai. Ubah di sini; semua laporan, ekspor, dan analisis AI otomatis mengikuti.</p>' +
    `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5"><div><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5">Progres minimal untuk dinilai</label><select id="ar-prog" class="${f} w-full">${[...new Set([100, 90, 75, 50, 25, mp])].sort((a, b) => b - a).map(v => `<option value="${v}"${v === mp ? ' selected' : ''}>${v}%</option>`).join('')}</select></div>` +
    `<div><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5">Minimal % mahasiswa yang mencapai (0 = tidak dipakai)</label><input id="ar-pct" type="number" min="0" max="100" class="${f} w-full" value="${pct}"></div></div>` +
    `<ol class="text-xs text-gray-600 font-medium leading-relaxed list-decimal pl-5 space-y-1.5 mb-5"><li><strong>Performa CPL</strong> mahasiswa = rata-rata berbobot nilai CPMK pembentuknya (hanya yang sudah dinilai).</li><li>Status dinilai bila bobot CPMK yang sudah terisi minimal <strong>${mp}%</strong>; jika kurang, statusnya <em>Belum cukup data</em> (bukan gagal).</li><li>Mahasiswa <strong>Tercapai</strong> bila performa memenuhi target CPL dan tidak ada CPMK penentu di bawah nilai minimum (<strong>${amb}</strong>; atur di kartu Ambang).</li><li>CPL di <strong>tingkat program</strong> Tercapai bila rata-rata mahasiswa (data cukup) memenuhi target${pct > 0 ? ' dan minimal <strong>' + pct + '%</strong> mahasiswa Tercapai' : ''}.</li></ol>` +
    '<div class="flex justify-end"><button id="ar-save" class="bg-brand text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition"><i class="fas fa-save mr-2"></i>Simpan Aturan</button></div>';
  host.appendChild(el);
  el.querySelector('#ar-save').onclick = () => {
    const p = parseFloat(el.querySelector('#ar-pct').value); if (isNaN(p) || p < 0 || p > 100) return showCustomDialog('alert', 'Persentase harus 0-100.');
    Object.assign(st0(), { minProgres: parseFloat(el.querySelector('#ar-prog').value), minPctMhs: p }); Store.simpan('settings'); showToast('Aturan ketercapaian disimpan.'); renderSettings();
  };
}
