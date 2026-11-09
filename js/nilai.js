/* nilai.js — Input Nilai CPMK (bobot transkrip, rekap, filter, template/upload, analisis MK, riwayat audit) */
import * as E from './engine.js';
import { db, Store, Fire, DEMO } from './data.js';
import { h, $id, State, showToast, showCustomDialog, openModal, card, kosongKuning, setJudul } from './ui.js';

const num = E.num;
const nf = { akt: 'ALL', q: '', semua: false };
const aktif = () => Store.semesterAktif();
const pesertaOf = (sem, mk) => new Set(db.pesertaKelas.filter(p => p.semester === sem && p.mk === mk).map(p => String(p.nim)));
const scopeNim = mk => { const s = aktif(); if (!s) return null; const set = pesertaOf(s, mk); return set.size ? set : null; };
export function mkSaya() {
  const u = State.user; if (!u || u.role !== 'dosen') return db.mk;
  const me = db.users.find(x => x.username === u.username && x.role === 'dosen'), diampu = (me && me.mkDiampu) || u.mkDiampu || [];
  return db.mk.filter(m => diampu.includes(m.kode));
}

export function renderInputNilai(code) {
  setJudul('Input Nilai CPMK', 'Berikan penilaian langsung pada capaian instrumen per mahasiswa.');
  const host = $id('content-view'), role = State.user.role;
  if (!db.mk.length) { host.innerHTML = kosongKuning('Belum ada Mata Kuliah'); return; }
  const mks = mkSaya();
  if (!mks.length) { host.innerHTML = kosongKuning('Belum ada mata kuliah yang diampu', 'Minta admin mengatur mata kuliah yang Anda ampu.'); return; }
  if (code && !mks.some(m => m.kode === code)) code = null;
  if (!mks.some(m => m.kode === State.mkNilai)) State.mkNilai = null;
  const sebelum = State.mkNilai, mk = State.mkNilai = code || State.mkNilai || mks[0].kode;
  if (mk !== sebelum) nf.semua = false;
  const cps = E.cpmkOfMk(db, mk), sc = scopeNim(mk);
  const opts = mks.map(m => `<option value="${h(m.kode)}"${m.kode === mk ? ' selected' : ''}>${h(m.kode)} - ${h(m.nama)}</option>`).join('');
  const info = !aktif() ? 'Semester aktif belum ditentukan (Pengaturan Instansi). Nilai dicatat sebagai nilai tanpa semester.' : sc ? 'Semester ' + aktif() + ': ' + sc.size + ' peserta kelas ' + mk + '. Nilai baru dicatat pada semester ini.' : 'Peserta kelas belum diatur untuk ' + mk + ' pada semester ' + aktif() + ': semua mahasiswa ditampilkan.';
  const pilihMk = `<p class="text-xs font-bold ${sc ? 'text-brand' : 'text-amber-600'} mb-3"><i class="fas fa-users mr-1"></i>${h(info)}</p><div class="bg-white p-5 rounded-[2rem] card-shadow border border-gray-100 mb-8 flex items-center space-x-5"><div class="bg-brand-soft text-brand w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0"><i class="fas fa-filter"></i></div><div class="grow min-w-0"><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5">Pilih Mata Kuliah</label><select id="pilih-mk" class="w-full bg-transparent font-bold text-gray-800 outline-none cursor-pointer">${opts}</select></div></div>`;
  if (!cps.length) {
    host.innerHTML = pilihMk + kosongKuning('CPMK Belum Didefinisikan', 'Anda belum menetapkan Capaian (CPMK) untuk mata kuliah ini di Data Master.', 'fa-bullseye');
    $id('pilih-mk').onchange = e => renderInputNilai(e.target.value); return;
  }
  let total = 0;
  const bobotHtml = cps.map((c, i) => { const v = E.bobotOf(db, mk, c.kode); total += v; return `<div class="flex justify-between items-center gap-2"><span class="text-sm font-bold text-gray-700 truncate" title="${h(c.deskripsi)}">${h(c.kode)}</span><div class="flex items-center w-20 shrink-0 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-brand"><input type="number" data-i="${i}" class="w-full bg-transparent outline-none text-right text-sm font-bold bobot-input" value="${v}"><span class="text-xs text-gray-400 ml-1">%</span></div></div>`; }).join('');
  const valid = Math.abs(total - 100) < 0.01;
  const th = cps.map(c => `<th class="px-5 py-4 text-center" title="${h(c.deskripsi)}">${h(c.kode)}<br><span class="text-[9px] font-bold text-brand-light tracking-wide">${E.bobotOf(db, mk, c.kode)}%</span></th>`).join('');
  const mhs = db.users.filter(u => u.role === 'mahasiswa' && (!sc || sc.has(String(u.username))));
  const rowHtml = u => {
    let ada = false;
    const td = cps.map(c => { const n = Store.nilaiEfektif(u.username, mk, c.kode), hv = E.hasNilai(n); if (hv) ada = true; return `<td class="px-5 py-4 text-center font-bold text-sm ${hv ? 'text-gray-900' : 'text-gray-300'}">${hv ? h(n.nilai) : '-'}</td>`; }).join('');
    const nim = h(u.username);
    return `<tr class="hover:bg-brand-soft/40 transition" data-nim="${nim}"><td class="px-5 py-4 text-sm font-mono text-brand-blue font-bold">${nim}</td><td class="px-5 py-4 text-sm font-bold text-gray-800">${h(u.name)}</td>${td}<td class="px-5 py-4 text-center font-black text-brand bg-brand-soft/50">${ada ? E.mkScore(db, u.username, mk).toFixed(1) : '-'}</td><td class="px-5 py-4 text-right space-x-3">${valid ? `<button data-aksi="nilai-edit" data-id="${nim}" class="text-gray-300 hover:text-brand-light transition" title="Input/Edit Nilai"><i class="fas fa-edit text-base"></i></button>` : '<button disabled class="text-gray-100 cursor-not-allowed"><i class="fas fa-edit text-base"></i></button>'}${ada && valid ? `<button data-aksi="nilai-hapus" data-id="${nim}" class="text-gray-300 hover:text-red-500 transition" title="Hapus Nilai"><i class="fas fa-trash-alt text-base"></i></button>` : '<button disabled class="text-gray-100 cursor-not-allowed"><i class="fas fa-trash-alt text-base"></i></button>'}</td></tr>`;
  };
  const akts = [...new Set(db.users.filter(u => u.role === 'mahasiswa').map(E.aktOf))].sort();
  if (nf.akt !== 'ALL' && !akts.includes(nf.akt)) nf.akt = 'ALL';
  const fld = 'rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand focus:bg-white outline-none text-sm font-semibold text-gray-800';
  const filter = `<div class="flex flex-col md:flex-row gap-3 mb-5"><select id="nilai-akt" class="px-4 py-3 ${fld} cursor-pointer"><option value="ALL">Semua Angkatan</option>${akts.map(a => `<option value="${h(a)}"${a === nf.akt ? ' selected' : ''}>Angkatan ${h(a)}</option>`).join('')}</select><div class="relative grow"><i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i><input id="nilai-q" type="text" autocomplete="off" placeholder="Cari NIM / nama... (Enter = buka form nilai)" class="w-full pl-11 pr-4 py-3 ${fld}" value="${h(nf.q)}"></div><span id="nilai-count" class="self-center text-xs font-bold text-gray-400 whitespace-nowrap"></span></div>`;
  host.innerHTML = pilihMk + `<div class="grid grid-cols-1 lg:grid-cols-4 gap-8"><div class="lg:col-span-1 bg-white rounded-[2rem] card-shadow border border-gray-100 p-8 h-fit"><h4 class="font-extrabold text-gray-900 mb-4 flex items-center tracking-tight"><i class="fas fa-sliders-h mr-2 text-brand-light"></i> Bobot Transkrip</h4><p class="text-xs text-gray-500 mb-6 font-medium leading-relaxed">Tentukan persentase pengaruh setiap CPMK (Total wajib 100%).</p><div class="space-y-4" id="bobot-container">${bobotHtml}</div><div class="mt-6 pt-5 border-t border-gray-100 flex justify-between items-center"><span class="text-sm font-black text-gray-800">TOTAL</span><span id="bobot-total-display" class="text-base font-black ${valid ? 'text-brand' : 'text-red-500'}">${+total.toFixed(2)}%</span></div><button id="btn-bagi-rata" type="button" class="w-full mt-4 text-brand border-2 border-brand py-2 rounded-xl text-xs font-bold hover:bg-brand-soft transition">Bagi rata jadi 100%</button><button id="btn-save-bobot" class="w-full mt-4 bg-brand hover:bg-brand-dark text-white py-3 rounded-xl text-sm font-bold transition shadow-lg shadow-brand/20 tracking-wide">Simpan Bobot</button></div>` +
    `<div class="lg:col-span-3 bg-white rounded-[2rem] card-shadow border border-gray-100 p-6 md:p-8 flex flex-col overflow-hidden"><div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 w-full"><h4 class="font-extrabold text-lg text-gray-900 w-full md:w-auto tracking-tight"><i class="fas fa-list-ol mr-2 text-brand-light"></i> Rekapitulasi Nilai CPMK</h4><div class="flex flex-wrap gap-3 w-full md:w-auto">${valid ? `<button onclick="downloadTemplate('nilai')" class="text-brand border-2 border-brand px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-soft transition tracking-wide"><i class="fas fa-download mr-2"></i> Template</button><label class="bg-gradient-to-br from-brand-blue to-brand-light text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-brand-light/30 hover:opacity-90 cursor-pointer tracking-wide"><i class="fas fa-upload mr-2"></i> Upload<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="handleExcelUpload(this, 'nilai')"></label>` : '<div class="bg-yellow-50 text-yellow-600 px-5 py-2.5 rounded-xl text-xs font-bold border border-yellow-200 flex items-center w-full md:w-auto"><i class="fas fa-exclamation-triangle mr-2"></i> Atur & Simpan Bobot 100% untuk Mengisi Nilai</div>'}</div></div>${filter}<div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar w-full shadow-sm"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-5 py-4">NIM</th><th class="px-5 py-4">Nama Mahasiswa</th>${th}<th class="px-5 py-4 text-center text-brand">Nilai Akhir<br>Transkrip</th><th class="px-5 py-4 text-right">Aksi</th></tr></thead><tbody id="nilai-body" class="divide-y divide-gray-50/80 bg-white"></tbody></table></div></div></div>`;

  // ---- perilaku ----
  $id('pilih-mk').onchange = e => renderInputNilai(e.target.value);
  const ins = [...host.querySelectorAll('.bobot-input')];
  const updateSum = () => { const s = ins.reduce((a, i) => a + (parseFloat(i.value) || 0), 0), d = $id('bobot-total-display'); d.innerText = +s.toFixed(2) + '%'; const ok = Math.abs(s - 100) < 0.01; d.classList.toggle('text-brand', ok); d.classList.toggle('text-red-500', !ok); };
  ins.forEach(i => i.addEventListener('input', updateSum));
  $id('btn-bagi-rata').onclick = () => { const n = ins.length, b = Math.floor(100 / n), r = 100 - b * n; ins.forEach((i, k) => { i.value = b + (k < r ? 1 : 0); }); updateSum(); };
  $id('btn-save-bobot').onclick = () => {
    const vals = ins.map(i => parseFloat(i.value) || 0), t = vals.reduce((a, b) => a + b, 0);
    if (vals.some(v => v < 0 || v > 100)) return showCustomDialog('alert', 'Setiap bobot harus 0-100.');
    if (Math.abs(t - 100) > 0.01) return showCustomDialog('alert', 'Total proporsi bobot saat ini ' + +t.toFixed(2) + '%. Total wajib persis 100%.');
    db.bobotCpmk = db.bobotCpmk.filter(b => b.mk !== mk).concat(cps.map((c, k) => ({ mk, cpmk: c.kode, bobot: vals[k] })));
    Store.simpan('bobotCpmk'); showToast('Konfigurasi bobot berhasil disimpan.'); renderInputNilai(mk);
  };
  const tb = $id('nilai-body'), BATAS = 200;
  let cocok = mhs;
  const apply = () => {
    const q = nf.q.trim().toLowerCase();
    cocok = mhs.filter(u => (nf.akt === 'ALL' || E.aktOf(u) === nf.akt) && (!q || (u.username + ' ' + u.name).toLowerCase().includes(q)));
    const tampil = nf.semua ? cocok : cocok.slice(0, BATAS);
    tb.innerHTML = !mhs.length ? `<tr><td colspan="${4 + cps.length}" class="px-6 py-12 text-center text-gray-400 italic font-medium">Belum ada mahasiswa.</td></tr>`
      : !cocok.length ? '<tr><td colspan="20" class="px-5 py-10 text-center text-gray-400 italic font-medium">Tidak ada mahasiswa yang cocok.</td></tr>'
        : tampil.map(rowHtml).join('') + (cocok.length > tampil.length ? `<tr><td colspan="20" class="px-5 py-4 text-center"><button id="nilai-semua" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-xs font-bold hover:bg-brand-soft transition">Tampilkan semua ${cocok.length} mahasiswa</button><p class="text-[11px] text-gray-400 mt-2">Atau persempit dengan pencarian / filter angkatan.</p></td></tr>` : '');
    const b = $id('nilai-semua'); if (b) b.onclick = () => { nf.semua = true; apply(); };
    $id('nilai-count').textContent = cocok.length + ' dari ' + mhs.length + ' mahasiswa';
  };
  $id('nilai-akt').onchange = e => { nf.akt = e.target.value; nf.semua = false; apply(); };
  let tq = null; const q = $id('nilai-q'); q.oninput = () => { nf.q = q.value; nf.semua = false; clearTimeout(tq); tq = setTimeout(apply, 80); };
  q.onkeydown = e => {
    if (e.key !== 'Enter') return; e.preventDefault(); clearTimeout(tq); apply();
    if (cocok.length !== 1) return showToast(cocok.length ? cocok.length + ' hasil: persempit pencarian untuk langsung menginput.' : 'Tidak ada mahasiswa yang cocok.');
    if (!valid) return showToast('Atur & simpan bobot 100% terlebih dahulu.');
    formNilai(cocok[0].username);
  };
  apply();
  analisisCard(host, mk);
  if (role === 'admin') auditCard(host);
}

export function formNilai(nim) {
  const mk = State.mkNilai, u = db.users.find(x => String(x.username) === String(nim)); if (!u || !mk) return;
  const cps = E.cpmkOfMk(db, mk);
  const inp = cps.map((c, i) => { const n = Store.nilaiEfektif(nim, mk, c.kode); return `<div><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5" title="${h(c.deskripsi)}">Nilai ${h(c.kode)}${n && n.semester ? ` <span class="normal-case font-semibold text-gray-300">(${h(n.semester)})</span>` : ''}</label><input type="number" step="any" min="0" max="100" data-i="${i}" class="w-full px-5 py-3 rounded-xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-brand focus:bg-white text-sm font-bold text-gray-800 transition-all fnilai-input" value="${E.hasNilai(n) ? h(n.nilai) : ''}"></div>`; }).join('');
  openModal('Edit Nilai', `<div class="space-y-4"><div class="bg-brand-soft p-4 rounded-2xl mb-5 text-sm border border-blue-100"><p class="font-extrabold text-brand tracking-tight mb-1">${h(u.name)} <span class="font-mono text-xs text-brand-light">${h(nim)}</span></p><p class="text-brand-light font-semibold text-xs">${h(mk)}${aktif() ? ' · dicatat pada semester ' + h(aktif()) : ''}</p></div><div class="grid grid-cols-2 gap-5">${inp}</div><p class="text-[10px] text-gray-400">Kosongkan kotak untuk menghapus nilai CPMK tersebut. Enter = simpan.</p></div>`, () => {
    const per = {}, salah = [];
    document.querySelectorAll('.fnilai-input').forEach(i => { const c = cps[+i.dataset.i], raw = i.value.trim(); if (raw === '') { per[c.kode] = null; return; } const v = parseFloat(raw.replace(',', '.')); if (isNaN(v) || v < 0 || v > 100) salah.push(c.kode); else per[c.kode] = v; });
    if (salah.length) throw new Error('Nilai ' + salah.join(', ') + ' harus 0-100.');
    const n = Store.ubahNilai(nim, mk, per);
    showToast(n ? 'Data disimpan!' : 'Tidak ada perubahan.'); rerenderNilai();
  });
  setTimeout(() => { document.querySelectorAll('.fnilai-input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $id('modal-submit').click(); } }); }, 0);
}
export function hapusNilai(nim) {
  const mk = State.mkNilai;
  showCustomDialog('confirm', 'Hapus semua nilai ' + nim + ' pada ' + mk + '?', () => {
    const per = {}; E.cpmkOfMk(db, mk).forEach(c => { if (Store.nilaiEfektif(nim, mk, c.kode)) per[c.kode] = null; });
    Store.ubahNilai(nim, mk, per); showToast('Terhapus!'); rerenderNilai();
  });
}
function rerenderNilai() { const sc = $id('content-scroll'), top = sc ? sc.scrollTop : 0; renderInputNilai(State.mkNilai); if (sc) sc.scrollTop = top; }

function analisisMk(mk) {
  const ps = pesertaOf(aktif(), mk), min = E.minOf(db, mk);
  return E.cpmkOfMk(db, mk).map(c => {
    const v = db.nilaiCpmk.filter(n => n.mk === mk && n.cpmk === c.kode && E.hasNilai(n) && (!ps.size || ps.has(String(n.mhs)))).map(n => num(n.nilai));
    const b = [0, 0, 0, 0, 0]; v.forEach(x => b[x < 50 ? 0 : x < 60 ? 1 : x < 70 ? 2 : x < 80 ? 3 : 4]++);
    const cpl = [...new Set(db.mappingCpmk.filter(m => m.mk === mk && m.cpmk === c.kode).map(m => m.cpl))].join(', ');
    return { kode: c.kode, cpl, n: v.length, rata: v.length ? v.reduce((a, x) => a + x, 0) / v.length : null, min: v.length ? Math.min(...v) : null, lulus: v.length ? Math.round(v.filter(x => x >= min).length / v.length * 100) : null, b, thr: min };
  });
}
function analisisCard(host, mk) {
  const rows = analisisMk(mk), ok = rows.filter(r => r.rata !== null); if (!rows.length) return;
  const weak = ok.length ? ok.reduce((a, r) => r.rata < a.rata ? r : a) : null, c = card('mk-analisis'), th = 'px-4 py-3 text-center';
  c.innerHTML = `<h4 class="font-extrabold text-lg text-gray-900 mb-1"><i class="fas fa-chart-column text-brand-light mr-2"></i>Analisis Mata Kuliah ${h(mk)}</h4><p class="text-xs text-gray-400 font-medium mb-5">Dihitung dari nilai CPMK yang sudah terisi (peserta kelas semester aktif bila sudah diatur). Batas lulus CPMK: ${rows[0].thr}.</p>` +
    `<div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-4 py-3">CPMK</th><th class="${th}">Menyumbang ke CPL</th><th class="${th}">Terisi</th><th class="${th}">Rata-rata</th><th class="${th}">% lulus</th><th class="${th}">Terendah</th><th class="${th}">&lt;50 / 50-59 / 60-69 / 70-79 / 80+</th></tr></thead><tbody class="bg-white">` +
    rows.map(r => `<tr class="border-b border-gray-50"><td class="px-4 py-3 text-sm font-bold text-gray-800">${h(r.kode)}${weak && weak.kode === r.kode ? ' <span class="text-[9px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded font-bold uppercase">terlemah</span>' : ''}</td><td class="${th} text-xs font-bold text-gray-500">${h(r.cpl || '-')}</td><td class="${th} text-sm font-bold">${r.n}</td><td class="${th} text-sm font-black ${r.rata !== null && r.rata < r.thr ? 'text-red-600' : 'text-brand'}">${r.rata === null ? '-' : r.rata.toFixed(1)}</td><td class="${th} text-sm font-bold ${r.lulus !== null && r.lulus < 70 ? 'text-red-600' : 'text-gray-700'}">${r.lulus === null ? '-' : r.lulus + '%'}</td><td class="${th} text-sm font-bold">${r.min === null ? '-' : r.min}</td><td class="${th} text-xs font-bold text-gray-600">${r.b.join(' / ')}</td></tr>`).join('') + '</tbody></table></div>' +
    (weak && weak.rata < weak.thr ? `<p class="text-xs text-red-600 font-bold mt-4"><i class="fas fa-triangle-exclamation mr-1"></i>Rata-rata ${h(weak.kode)} (${weak.rata.toFixed(1)}) di bawah batas lulus. Tinjau metode dan asesmen CPMK ini, lalu catat perbaikannya pada RPS semester berikutnya.</p>` : '');
  host.appendChild(c);
}

function auditCard(host) {
  const c = card('audit-card');
  c.innerHTML = '<div class="flex flex-col md:flex-row justify-between md:items-center gap-4"><h4 class="font-extrabold text-lg text-gray-900"><i class="fas fa-clock-rotate-left text-brand-light mr-2"></i>Riwayat Perubahan Nilai &amp; Bobot</h4><button id="audit-load" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition">Muat 40 terakhir</button></div><div id="audit-list" class="mt-4 overflow-x-auto custom-scrollbar"></div>';
  host.appendChild(c);
  c.querySelector('#audit-load').onclick = async () => {
    const box = c.querySelector('#audit-list');
    if (DEMO) { box.innerHTML = '<p class="text-sm text-gray-400">Riwayat tersedia saat terhubung ke server (mode demo).</p>'; return; }
    box.innerHTML = '<p class="text-sm text-gray-400">Memuat...</p>';
    try {
      const docs = await Fire.query('jejak', { orderBy: 'at', desc: true, limit: 25 }), rows = [];
      docs.forEach(d => (d.data.perubahan || []).forEach(p => rows.push(Object.assign({ at: d.data.at, oleh: d.data.oleh, nama: d.data.nama }, p))));
      const aksi = r => r.sebelum === null || r.sebelum === undefined ? 'tambah' : r.sesudah === null || r.sesudah === undefined || r.sesudah === 'dihapus' ? 'hapus' : 'ubah';
      const v = x => x === null || x === undefined ? '-' : x;
      box.innerHTML = rows.length ? '<table class="w-full text-left text-xs whitespace-nowrap"><thead class="text-gray-400 uppercase tracking-widest font-extrabold"><tr><th class="py-2 pr-4">Waktu</th><th class="pr-4">Oleh</th><th class="pr-4">Aksi</th><th class="pr-4">Data</th><th>Perubahan</th></tr></thead><tbody class="font-semibold text-gray-700">' +
        rows.slice(0, 40).map(r => `<tr class="border-t border-gray-50"><td class="py-2 pr-4">${h(new Date(r.at).toLocaleString('id-ID'))}</td><td class="pr-4">${h(r.oleh)}</td><td class="pr-4 uppercase">${aksi(r)}</td><td class="pr-4">${h((r.tabel === 'bobot' ? 'Bobot ' : '') + r.id)}</td><td>${h(v(r.sebelum))} &rarr; ${h(v(r.sesudah))}</td></tr>`).join('') + '</tbody></table>' : '<p class="text-sm text-gray-400">Belum ada riwayat.</p>';
    } catch (e) { console.error(e); box.innerHTML = '<p class="text-sm text-red-500">Gagal memuat: ' + h(e.message) + '</p>'; }
  };
}
