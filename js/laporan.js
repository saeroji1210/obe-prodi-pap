/* laporan.js — Laporan Evaluasi OBE (matriks CPL/PL, status program, AI, penelusuran, rapor, peringatan dini, tren, RTL)
 * Semua dekorasi patch add-on/v2/v3/v5/v6/v7/v11 kini dirender SEKALI dari model data (tanpa menambal DOM). */
import * as E from './engine.js';
import { db, Store, api, Fire, DEMO } from './data.js';
import { h, $id, State, showToast, showCustomDialog, openModal, card, kosongKuning, setJudul, gambarChart, cetak } from './ui.js';
import { eksporLembar } from './excel.js';

const num = E.num, L = E.LABEL, COL = { OK: 'text-green-600', NO: 'text-red-600', DATA: 'text-gray-400' };
const BADGE = { OK: 'bg-green-50 text-green-600 border border-green-100', NO: 'bg-red-50 text-red-600 border border-red-100', DATA: 'bg-gray-100 text-gray-500' };
const badge = st => `<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${BADGE[st]}">${L[st]}</span>`;
const BATAS_BARIS = 150;
let semuaBaris = false;

function cakupan(sel) {
  const all = db.users.filter(u => u.role === 'mahasiswa');
  if (State.user.role === 'mahasiswa') return { list: all.filter(u => u.username === State.user.username), label: 'Satu mahasiswa (NIM ' + State.user.username + ')' };
  if (sel === 'ALL') return { list: all, label: 'Seluruh mahasiswa program studi' };
  if (sel.startsWith('AKT_')) return { list: all.filter(m => E.aktOf(m) === sel.slice(4)), label: 'Angkatan ' + sel.slice(4) };
  return { list: all.filter(m => m.username === sel), label: 'Satu mahasiswa (NIM ' + sel + ')' };
}

export function renderLaporan(sel) {
  setJudul('Laporan Evaluasi OBE', 'Analisis Capaian Pembelajaran Lulusan (CPL) dan Profil Lulusan (PL).');
  const host = $id('content-view'), role = State.user.role, mhsRole = role === 'mahasiswa';
  if (sel !== undefined && sel !== State.laporanSel) semuaBaris = false;
  if (sel !== undefined) State.laporanSel = sel;
  sel = mhsRole ? State.user.username : (State.laporanSel || 'ALL');
  if (!db.cpl.length || !db.mk.length || !db.mappingCpmk.length) { host.innerHTML = kosongKuning('Data Belum Memadai', 'Laporan CPL membutuhkan Data Master serta Pemetaan Matriks (Level 2) yang sudah dikonfigurasi.'); return; }
  const { list, label } = cakupan(sel), nims = list.map(m => m.username), pr = E.programAll(db, nims), pls = db.profilLulusan;

  // ---- Filter + semester ----
  const allMhs = db.users.filter(u => u.role === 'mahasiswa'), akts = [...new Set(allMhs.map(E.aktOf))].sort();
  let filterUI;
  if (mhsRole) filterUI = `<div class="bg-white p-7 rounded-[2rem] card-shadow border border-gray-100 flex flex-col justify-center"><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3"><i class="fas fa-user mr-1 text-brand"></i> Profil Mahasiswa</label><div class="w-full px-4 py-3 rounded-xl border border-brand-soft bg-brand-soft text-sm font-bold text-brand overflow-hidden truncate">${h(State.user.username)} - ${h(State.user.name)}</div>`;
  else filterUI = `<div class="bg-white p-7 rounded-[2rem] card-shadow border border-gray-100 flex flex-col justify-center"><label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-3"><i class="fas fa-filter mr-1 text-brand"></i> Filter Analisis</label><select id="lap-sel" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-brand outline-none text-sm font-bold text-gray-800 bg-gray-50 cursor-pointer transition"><option value="ALL"${sel === 'ALL' ? ' selected' : ''}>Semua Mahasiswa (Rata-rata)</option>${akts.length ? '<optgroup label="Berdasarkan Angkatan">' + akts.map(a => `<option value="AKT_${h(a)}"${sel === 'AKT_' + a ? ' selected' : ''}>Angkatan ${h(a)} (Rata-rata)</option>`).join('') + '</optgroup>' : ''}<optgroup label="Berdasarkan Mahasiswa">${allMhs.map(u => `<option value="${h(u.username)}"${sel === u.username ? ' selected' : ''}>${h(u.username)} - ${h(u.name)}</option>`).join('')}</optgroup></select>`;
  const adaLama = db.hist.some(r => !r.semester), semOpts = [['ALL', 'Semua semester (nilai terbaru)']].concat(db.semester.map(s => [s.kode, 'Semester ' + s.kode]), adaLama ? [['LAMA', 'Sebelum pencatatan semester']] : []);
  if (db.semester.length) filterUI += `<label class="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mt-3 mb-1">Semester</label><select id="sem-view" class="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-brand">${semOpts.map(o => `<option value="${h(o[0])}"${o[0] === Store.view ? ' selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
  filterUI += '</div>';
  const pctTarget = db.cpl.length ? Math.round(pr.filter(r => r.status === 'OK').length / db.cpl.length * 100) : 0;

  // ---- Matriks per mahasiswa ----
  const sem = Store.semesterAktif(), pk = new Map();
  if (sem && Store.view === 'ALL') db.pesertaKelas.filter(p => p.semester === sem).forEach(p => (pk.get(p.mk) || pk.set(p.mk, new Set()).get(p.mk)).add(String(p.nim)));
  const tampil = semuaBaris ? list : list.slice(0, BATAS_BARIS);
  const rows = tampil.map(mhs => {
    const n = mhs.username;
    const cplTd = db.cpl.map(c => {
      const r = E.cplStatus(db, n, c), s = r.s, tgt = num(c.target), lulus = s.performa >= tgt;
      let skorCls = lulus ? 'text-green-600' : 'text-red-600', bar = lulus ? 'bg-green-500' : 'bg-red-500', extra = '';
      if (r.st === 'DATA') { skorCls = 'text-gray-400'; bar = 'bg-gray-300'; extra += '<div class="text-[9px] font-bold mt-1 uppercase tracking-wider text-gray-400" title="Progres di bawah syarat minimal">Belum cukup data</div>'; }
      else if (r.failed.length) { if (lulus) skorCls = 'text-red-600'; extra += `<div class="text-[9px] font-bold mt-1 text-red-500 uppercase tracking-wider" title="${h(r.failed.map(m => m.mk + ' ' + m.cpmk + ' < ' + E.minOf(db, m.mk)).join(', '))}">${r.failed.length} CPMK &lt; minimum</div>`; }
      if (pk.size) {
        const miss = E.mappingsOf(db, c.kode).filter(m => pk.has(m.mk) && pk.get(m.mk).has(n) && !E.nilaiOf(db, n, m.mk, m.cpmk));
        if (miss.length) extra += `<div class="text-[9px] font-bold mt-1 text-amber-600 uppercase tracking-wider" title="${h(miss.map(m => m.mk + ' ' + m.cpmk).join(', '))}">${miss.length} belum dinilai</div>`;
      }
      return `<td class="px-5 py-4 text-center align-middle border-l border-gray-50"><div class="font-bold text-sm ${skorCls}">${s.performa.toFixed(1)}</div><div class="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden" title="Progres Kurikulum: ${s.progres.toFixed(0)}%"><div class="${bar} h-1.5 rounded-full" style="width:${Math.min(100, s.progres)}%"></div></div>${extra}</td>`;
    }).join('');
    const plTd = pls.map(p => {
      const s = E.plStats(db, n, p.kode), col = s.isStrictMet ? 'text-brand' : (s.performa > 0 ? 'text-yellow-600' : 'text-gray-300');
      return `<td class="px-5 py-4 text-center align-middle border-l-2 border-brand/20 bg-brand-soft/20"><div class="font-black text-sm ${col}">${s.hasData ? s.performa.toFixed(1) : '-'}${s.isStrictMet ? '<i class="fas fa-check-circle ml-1 text-green-500" title="Semua CPL pembentuk tercapai"></i>' : ''}</div><div class="text-[9px] text-gray-400 font-bold mt-1 tracking-wider uppercase">Prg: ${s.hasData ? s.progres.toFixed(0) : 0}%</div></td>`;
    }).join('');
    return `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition"><td class="px-5 py-4 font-mono text-sm text-gray-500 sticky left-0 bg-white border-r border-gray-100 z-10 align-middle">${h(n)}</td><td class="px-5 py-4 text-sm font-bold text-gray-800 align-middle">${h(mhs.name)}</td>${cplTd}${plTd}</tr>`;
  }).join('') || `<tr><td colspan="${2 + db.cpl.length + pls.length}" class="px-5 py-10 text-center text-gray-400 italic">Belum ada mahasiswa pada cakupan ini.</td></tr>`;
  const thCpl = db.cpl.map(c => `<th class="px-5 py-4 text-center border-l border-gray-100" title="${h(c.deskripsi)}">${h(c.kode)}<br><span class="text-[9px] font-bold text-gray-400">Target: ${num(c.target)}%</span></th>`).join('');
  const thPl = pls.map(p => `<th class="px-5 py-4 text-center border-l-2 border-brand/20 bg-brand-soft/40" title="${h(p.deskripsi)}"><span class="text-brand-dark">${h(p.kode)}</span><br><span class="text-[9px] font-bold text-brand uppercase tracking-wider">Kesiapan PL</span></th>`).join('');
  const lebih = list.length > tampil.length ? `<div class="text-center mt-4"><button id="lap-semua" class="text-brand border-2 border-brand px-5 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition">Tampilkan semua ${list.length} mahasiswa</button><p class="text-[11px] text-gray-400 mt-2">Menampilkan ${tampil.length} pertama agar halaman tetap ringan. Grafik, status, dan ekspor memakai seluruh ${list.length} mahasiswa.</p></div>` : '';

  host.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">${filterUI}<div class="bg-gradient-to-br from-brand-blue to-brand-light p-7 rounded-[2rem] shadow-xl shadow-brand-light/20 border border-transparent flex items-center justify-between text-white overflow-hidden relative"><i class="fas fa-chart-pie absolute -right-6 -bottom-6 text-7xl opacity-20 rotate-12"></i><div class="relative z-10"><p class="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">CPL Memenuhi Target</p><h3 class="text-4xl font-black">${pctTarget}<span class="text-lg font-bold text-blue-200 ml-1">%</span></h3></div><button id="lap-ekspor" class="bg-white/20 hover:bg-white/30 backdrop-blur-md px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center border border-white/20 relative z-10 tracking-wide"><i class="fas fa-file-excel mr-2"></i> Ekspor</button></div></div>` +
    `<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8"><div class="bg-white p-6 md:p-8 rounded-[2rem] card-shadow border border-gray-100"><h4 class="font-extrabold text-gray-900 text-base mb-6 tracking-tight"><i class="fas fa-chart-area text-brand-light mr-2"></i> Analisis Performa CPL Berjalan</h4><div class="relative h-72 w-full flex justify-center"><canvas id="cplChart"></canvas></div></div><div class="bg-white p-6 md:p-8 rounded-[2rem] card-shadow border border-gray-100"><h4 class="font-extrabold text-gray-900 text-base mb-6 tracking-tight"><i class="fas fa-user-tie text-brand mr-2"></i> Kesiapan Profil Lulusan berbasis CPL</h4><div class="relative h-72 w-full flex justify-center"><canvas id="plChart"></canvas></div></div></div>` +
    `<div class="cv-auto bg-white rounded-[2rem] card-shadow border border-gray-100 p-6 md:p-8 overflow-hidden"><h4 class="font-extrabold text-xl text-gray-900 mb-6 tracking-tight"><i class="fas fa-table text-brand-light mr-2"></i> Matriks Performa & Progres Mahasiswa</h4><div class="overflow-x-auto border border-gray-100 rounded-2xl relative shadow-sm custom-scrollbar w-full"><table class="w-full text-left whitespace-nowrap" id="table-laporan-cpl"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-5 py-5 sticky left-0 bg-gray-50 z-20 border-r border-gray-100">NIM</th><th class="px-5 py-5">Nama Mahasiswa</th>${thCpl}${thPl}</tr></thead><tbody class="divide-y divide-gray-50/80 bg-white">${rows}</tbody></table></div>${lebih}<p class="text-xs text-gray-500 mt-5 font-medium leading-relaxed bg-brand-soft/50 p-4 rounded-xl border border-blue-50"><i class="fas fa-info-circle mr-1 text-brand"></i> <strong>Panduan Membaca Matriks:</strong><br>Angka pada kolom CPL menunjukkan kualitas performa berjalan. Baris progres menunjukkan persentase pemenuhan sks/bobot. Pada kolom PL (Profil Lulusan), tanda <i class="fas fa-check-circle text-green-500 mx-1"></i> menunjukkan mahasiswa telah melampaui <strong>semua</strong> target minimal CPL pembentuk Profil tersebut secara mutlak.</p></div>`;

  // ---- perilaku dasar ----
  const ls = $id('lap-sel'); if (ls) ls.onchange = e => window.loadPage('laporan', e.target.value);
  const sv = $id('sem-view'); if (sv) sv.onchange = e => { Store.lihatSemester(e.target.value); renderLaporan(); };
  const sb = $id('lap-semua'); if (sb) sb.onclick = () => { semuaBaris = true; renderLaporan(); };
  $id('lap-ekspor').onclick = () => ekspor(nims, list);
  gambarChart('cplChart', { type: 'radar', data: { labels: db.cpl.map(c => c.kode), datasets: [{ label: 'Performa Kualitas', data: pr.map(r => r.rata === null ? 0 : +r.rata.toFixed(1)), backgroundColor: 'rgba(0, 86, 179, 0.15)', borderColor: '#0056b3', pointBackgroundColor: '#0056b3', borderWidth: 2.5 }, { label: 'Target Minimal', data: db.cpl.map(c => num(c.target)), backgroundColor: 'rgba(248, 113, 113, 0.1)', borderColor: '#f87171', borderDash: [5, 5], pointBackgroundColor: '#f87171', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, scales: { r: { min: 0, max: 100, grid: { color: '#f3f4f6' }, angleLines: { color: '#e5e7eb' } } } } });
  const avgPl = f => pls.map(p => { const v = nims.map(n => E.plStats(db, n, p.kode)).filter(x => x.hasData); return v.length ? +(v.reduce((s, x) => s + x[f], 0) / v.length).toFixed(1) : 0; });
  gambarChart('plChart', { type: 'bar', data: { labels: pls.map(p => p.kode), datasets: [{ label: 'Performa Kualitas (%)', data: avgPl('performa'), backgroundColor: '#112a6a', borderRadius: 6 }, { label: 'Persentase Progres (%)', data: avgPl('progres'), backgroundColor: '#007bff', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, scales: { y: { min: 0, max: 100, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } } });

  kartuKualitas(host, pr);
  const scope = mhsRole ? State.user.username : sel;
  kartuAi(host, scope, label, list);
  kartuTelusur(host, list);
  if (!mhsRole && nims.length > 1) kartuPeringatan(host, list);
  kartuTren(host, nims);
  if (!mhsRole) kartuRtl(host, pr);
}

/* ---------- Status Ketercapaian CPL (tingkat program) ---------- */
function kartuKualitas(host, pr) {
  const min = E.minProg(db), admin = State.user.role === 'admin', c = card('quality-card');
  const opts = [...new Set([100, 75, 50, 25, min])].sort((a, b) => b - a).map(v => `<option value="${v}"${v === min ? ' selected' : ''}>${v}%</option>`).join('');
  c.innerHTML = '<div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6"><div><h4 class="font-extrabold text-xl text-gray-900 tracking-tight"><i class="fas fa-clipboard-check text-brand-light mr-2"></i>Status Ketercapaian CPL (Tingkat Program)</h4><p class="text-xs text-gray-400 font-medium mt-1">Status dinilai hanya jika progres bobot CPMK mahasiswa memenuhi syarat minimal.</p></div>' +
    `<div class="flex items-center gap-3 text-sm font-bold text-gray-600"><span>Syarat progres minimal</span>${admin ? `<select id="min-prog" class="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-brand">${opts}</select>` : `<span class="text-brand">${min}%</span>`}</div></div>` +
    '<div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-5 py-4">CPL</th><th class="px-5 py-4 text-center">Target</th><th class="px-5 py-4 text-center">Rata-rata (data cukup)</th><th class="px-5 py-4 text-center">% Mahasiswa Mencapai</th><th class="px-5 py-4 text-center">Tercapai / Belum / Belum cukup data</th><th class="px-5 py-4 text-center">CPMK rata-rata di bawah minimum</th><th class="px-5 py-4 text-center">Status</th></tr></thead><tbody class="bg-white">' +
    pr.map(r => `<tr class="border-b border-gray-50"><td class="px-5 py-4 text-sm font-bold text-gray-800">${h(r.kode)}<br><span class="text-[10px] text-gray-400 font-medium whitespace-normal">${h(r.deskripsi || '')}</span></td><td class="px-5 py-4 text-center text-sm font-bold text-gray-600">${r.target}%</td><td class="px-5 py-4 text-center text-sm font-bold">${r.rata === null ? '-' : r.rata.toFixed(1)}</td><td class="px-5 py-4 text-center text-sm font-black text-brand">${r.pct === null ? '-' : r.pct + '% <span class="text-[10px] text-gray-400 font-bold">(' + r.OK + '/' + r.elig + ')</span>'}</td><td class="px-5 py-4 text-center text-xs font-bold"><span class="text-green-600">${r.OK}</span> / <span class="text-red-600">${r.NO}</span> / <span class="text-gray-400">${r.DATA}</span></td><td class="px-5 py-4 text-center text-xs font-bold">${r.lemah.length ? '<span class="text-red-600">' + h(r.lemah.join(', ')) + '</span>' : '<span class="text-gray-300">-</span>'}</td><td class="px-5 py-4 text-center">${badge(r.status)}${r.pctRendah ? '<div class="text-[9px] text-red-500 font-bold mt-1">% mhs di bawah ambang</div>' : ''}</td></tr>`).join('') + '</tbody></table></div>' +
    '<p class="text-xs text-gray-500 mt-5 font-medium leading-relaxed bg-brand-soft/50 p-4 rounded-xl border border-blue-50"><i class="fas fa-info-circle mr-1 text-brand"></i><strong>Cara membaca:</strong> rata-rata hanya dihitung dari mahasiswa yang datanya cukup, jadi mahasiswa yang belum cukup data tidak dianggap gagal. Rata-rata yang tinggi tetap perlu dibaca bersama persentase mahasiswa yang mencapai target. <strong>Profil Lulusan</strong> di aplikasi ini adalah <em>kesiapan berbasis CPL</em>; ketercapaian profil yang sesungguhnya (setelah lulus) memerlukan tracer study dan survei pengguna lulusan.</p>' +
    `<p class="text-xs text-gray-500 mt-3 font-medium"><i class="fas fa-shield-halved mr-1 text-brand"></i>CPL tercapai bila rata-rata memenuhi target <strong>dan</strong> tidak ada CPMK penentu di bawah nilai minimum (global ${E.globalMin(db)}, dapat diatur per mata kuliah di Pengaturan Instansi).</p>`;
  host.appendChild(c);
  const s = c.querySelector('#min-prog'); if (s) s.onchange = () => { (db.settings[0] || (db.settings[0] = {})).minProgres = parseFloat(s.value); Store.simpan('settings'); showToast('Syarat progres minimal: ' + s.value + '%'); renderLaporan(); };
}

/* ---------- Ekspor Excel: nilai, progres, dan status (bukan teks tampilan) ---------- */
async function ekspor(nims, list) {
  if (!nims.length) return showToast('Tidak ada data untuk diekspor.');
  const rd = x => +x.toFixed(1);
  const rows = list.map(u => {
    const o = { NIM: u.username, 'Nama Mahasiswa': u.name };
    db.cpl.forEach(c => { const r = E.cplStatus(db, u.username, c); o[c.kode + ' Performa'] = r.s.taken > 0 ? rd(r.s.performa) : ''; o[c.kode + ' Progres %'] = Math.round(r.s.progres); o[c.kode + ' CPMK < Minimum'] = r.failed.length; o[c.kode + ' Status'] = L[r.st]; });
    db.profilLulusan.forEach(p => { const s = E.plStats(db, u.username, p.kode); o[p.kode + ' Kesiapan (berbasis CPL)'] = s.hasData ? rd(s.performa) : ''; o[p.kode + ' Progres %'] = Math.round(s.progres); });
    return o;
  });
  const ring = E.programAll(db, nims).map(r => ({ CPL: r.kode, 'Target %': r.target, 'Rata-rata (data cukup)': r.rata === null ? '' : rd(r.rata), 'Mhs Data Cukup': r.elig, 'Mhs Tercapai': r.OK, 'Mhs Belum Tercapai': r.NO, 'Mhs Belum Cukup Data': r.DATA, '% Mhs Mencapai': r.pct === null ? '' : r.pct, 'CPMK Rata-rata < Minimum': r.lemah.join(', '), Status: L[r.status], 'Syarat Progres Minimal %': E.minProg(db), 'Tampilan Semester': Store.view === 'ALL' ? 'Nilai terbaru' : Store.view }));
  try { await eksporLembar('Rekapitulasi_CPL_OBE.xlsx', [['Laporan_CPL', rows], ['Ringkasan_CPL', ring]]); showToast('Laporan Excel berhasil diunduh!'); }
  catch (e) { showCustomDialog('alert', 'Gagal mengekspor: ' + e.message); }
}

/* ---------- Evaluasi & Tindak Lanjut AI ---------- */
const evKey = s => 'rep_' + String(s).replace(/[^A-Za-z0-9_.-]/g, '_');
function mdToHtml(t) {
  const inl = x => h(x).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  let out = '', ul = false;
  String(t).split('\n').forEach(l => {
    const li = l.match(/^\s*[-*]\s+(.*)/) || l.match(/^\s*\d+[.)]\s+(.*)/);
    if (li) { if (!ul) { out += '<ul class="list-disc pl-6 space-y-1.5 my-2">'; ul = true; } out += '<li>' + inl(li[1]) + '</li>'; return; }
    if (ul) { out += '</ul>'; ul = false; }
    const hd = l.match(/^#{1,4}\s+(.*)/);
    if (hd) out += '<h5 class="font-extrabold text-gray-900 mt-6 mb-2 text-base">' + inl(hd[1]) + '</h5>'; else if (l.trim()) out += '<p class="my-2">' + inl(l) + '</p>';
  });
  return out + (ul ? '</ul>' : '');
}
// Ringkasan angka untuk AI — tanpa nama & tanpa NIM mahasiswa
function aiPayload(list, label) {
  const nims = list.map(m => m.username), avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
  const cpl = db.cpl.map(c => {
    const s = nims.map(n => E.cplStats(db, n, c.kode)), d = s.filter(x => x.taken > 0), t = num(c.target), q = E.programCpl(db, nims, c);
    return { kode: c.kode, deskripsi: c.deskripsi, target: t, rataPerforma: avg(d.map(x => x.performa)), rataProgresPersen: avg(s.map(x => x.progres)), mahasiswaBerdata: d.length, mahasiswaMemenuhiTarget: d.filter(x => x.performa >= t).length, rataPerformaDataCukup: q.rata === null ? null : +q.rata.toFixed(1), mahasiswaDataCukup: q.elig, mahasiswaTercapai: q.OK, mahasiswaBelumTercapai: q.NO, mahasiswaBelumCukupData: q.DATA, persenMahasiswaTercapai: q.pct, cpmkKohortDiBawahMinimum: q.lemah, statusProgram: L[q.status] };
  });
  const profil = db.profilLulusan.map(p => { const d = nims.map(n => E.plStats(db, n, p.kode)).filter(x => x.hasData); return { kode: p.kode, deskripsi: p.deskripsi, rataPerforma: avg(d.map(x => x.performa)), rataProgresPersen: avg(d.map(x => x.progres)), mahasiswaBerdata: d.length, mahasiswaMemenuhiSemuaCPL: d.filter(x => x.isStrictMet).length }; });
  const set = new Set(nims), mkNama = new Map(db.mk.map(m => [m.kode, m.nama])), cpDesk = new Map(db.cpmk.map(c => [c.mk + '|' + c.kode, c.deskripsi]));
  const cpmk = db.mappingCpmk.map(m => { const v = db.nilaiCpmk.filter(n => set.has(n.mhs) && n.mk === m.mk && n.cpmk === m.cpmk && E.hasNilai(n)).map(n => num(n.nilai)); return { mk: m.mk, namaMk: mkNama.get(m.mk) || '', cpmk: m.cpmk, deskripsi: cpDesk.get(m.mk + '|' + m.cpmk) || '', cpl: m.cpl, bobotKeCPL: m.bobot, rataNilai: avg(v), jumlahNilai: v.length }; }).filter(x => x.rataNilai !== null).sort((a, b) => a.rataNilai - b.rataNilai);
  return { cakupan: /^Satu mahasiswa/.test(label) ? 'Satu mahasiswa' : label, syaratProgresMinimalPersen: E.minProg(db), nilaiMinimumCpmk: E.globalMin(db), jumlahMahasiswa: nims.length, tampilanSemester: Store.view === 'ALL' ? 'nilai terbaru' : Store.view, cpl, profilLulusan: profil, cpmkTerendah: cpmk.slice(0, 10), cpmkTertinggi: cpmk.slice(-3) };
}
async function kartuAi(host, scope, label, list) {
  const el = card('ai-eval-card'); el.innerHTML = '<div class="text-center py-6 text-gray-300"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>'; host.appendChild(el);
  let ev = null;
  if (!DEMO) { try { const id = 'evaluasi/' + evKey(scope); ev = (await Fire.batchGet([id]))[id]; } catch (e) { console.warn(e); } }
  if (!el.isConnected) return;
  gambarAi(el, ev, scope, label, list);
}
function gambarAi(el, ev, scope, label, list) {
  const admin = State.user.role === 'admin', when = ev ? new Date(ev.createdAt).toLocaleString('id-ID') : '';
  el.innerHTML = '<div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6"><div><h4 class="font-extrabold text-xl text-gray-900 tracking-tight"><i class="fas fa-wand-magic-sparkles text-brand-light mr-2"></i>Evaluasi &amp; Tindak Lanjut AI</h4>' +
    `<p class="text-xs text-gray-400 font-medium mt-1">${h(label)}${ev ? ' &middot; dibuat ' + h(when) + ' &middot; model ' + h(ev.model) : ''}</p></div><div class="flex flex-wrap gap-3">` +
    (ev ? '<button data-a="copy" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition"><i class="fas fa-copy mr-2"></i>Salin</button><button data-a="print" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition"><i class="fas fa-print mr-2"></i>Cetak</button>' : '') +
    (admin ? `<button data-a="gen" class="bg-brand text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark transition disabled:opacity-60"><i class="fas fa-bolt mr-2"></i>${ev ? 'Perbarui Analisis AI' : 'Buat Analisis AI'}</button>` : '') + '</div></div>' +
    `<div id="ai-body" class="text-sm text-gray-700 leading-relaxed">${ev ? mdToHtml(ev.text) : `<div class="text-center text-gray-400 py-10 font-medium"><i class="fas fa-robot text-4xl mb-3 block"></i>${admin ? 'Belum ada analisis untuk cakupan ini. Klik &quot;Buat Analisis AI&quot;.' : 'Belum ada analisis AI untuk cakupan ini. Hubungi admin program studi.'}</div>`}</div>` +
    (ev ? '<p class="text-[11px] text-gray-400 mt-6 border-t border-gray-100 pt-4"><i class="fas fa-info-circle mr-1"></i>Dibuat otomatis oleh AI dari ringkasan angka laporan (tanpa nama/NIM mahasiswa). Mohon ditinjau oleh pengelola program studi sebelum dijadikan dasar keputusan.</p>' : '');
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'copy') { try { await navigator.clipboard.writeText(ev.text); showToast('Analisis disalin.'); } catch (e) { showCustomDialog('alert', 'Gagal menyalin. Salin manual dari layar.'); } }
    else if (a === 'print') cetak('Evaluasi OBE', '<h2>Evaluasi &amp; Tindak Lanjut OBE</h2><p><em>' + h(ev.label || label) + ' &middot; ' + h(when) + '</em></p>' + mdToHtml(ev.text));
    else if (a === 'gen') {
      b.disabled = true; const body = el.querySelector('#ai-body'), t0 = Date.now();
      body.innerHTML = '<div class="text-center text-gray-400 py-10 font-medium"><i class="fas fa-circle-notch fa-spin text-3xl mb-3 block"></i>Menunggu respons AI... (biasanya 10–40 detik)</div>';
      const tick = () => { b.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>AI sedang menyusun... ' + Math.round((Date.now() - t0) / 1000) + ' dtk'; };
      tick(); const tm = setInterval(tick, 1000);
      const r = await api('ai', { scope, label, data: aiPayload(list, label) }, { timeout: 170000 });
      clearInterval(tm);
      if (r.ok) { gambarAi(el, r.ev, scope, label, list); showToast('Analisis AI berhasil dibuat.'); }
      else { gambarAi(el, ev, scope, label, list); showCustomDialog('alert', 'Gagal membuat analisis: ' + r.pesan); }
    }
  });
}

/* ---------- Penelusuran CPL + Rapor PDF ---------- */
function rapor(n) {
  const u = db.users.find(x => String(x.username) === n) || {}, st = db.settings[0] || {};
  const rows = db.cpl.map(c => { const r = E.cplStatus(db, n, c); return '<tr><td>' + h(c.kode) + '</td><td>' + h(c.deskripsi || '') + '</td><td align="center">' + num(c.target) + '</td><td align="center">' + (r.s.taken > 0 ? r.s.performa.toFixed(1) : '-') + '</td><td align="center">' + Math.round(r.s.progres) + '%</td><td align="center">' + L[r.st] + (r.failed.length && r.st !== 'DATA' ? ' (' + r.failed.length + ' CPMK &lt; minimum)' : '') + '</td></tr>'; }).join('');
  cetak('Rapor CPL ' + n, '<div class="k"><h3 style="margin:0">' + h(st.namaProdi || '') + '</h3><div>' + h(st.fakultas || '') + '</div><h2 style="margin:12px 0 0">RAPOR CAPAIAN PEMBELAJARAN LULUSAN (CPL)</h2></div><p>NIM: <b>' + h(n) + '</b><br>Nama: <b>' + h(u.name || '') + '</b><br>Angkatan: ' + h(u.angkatan || '-') + '<br>Dicetak: ' + new Date().toLocaleDateString('id-ID') + (Store.view !== 'ALL' ? '<br>Semester: ' + h(Store.view) : '') + '</p><table><thead><tr><th>CPL</th><th>Deskripsi</th><th>Target</th><th>Performa</th><th>Progres</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table><p style="font-size:11px">Status tercapai dinilai bila progres bobot CPMK memenuhi syarat minimal (' + E.minProg(db) + '%), rata-rata memenuhi target, dan tidak ada CPMK penentu di bawah nilai minimum.</p><div class="t">Ketua Program Studi<br><br><br><br><b>' + h(st.kaprodi || '') + '</b></div>',
    'table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px 8px;vertical-align:top}th{background:#eee}.k{text-align:center;margin-bottom:16px}.t{margin-top:48px;float:right;text-align:center}');
}
function kartuTelusur(host, list) {
  if (!list.length || !db.cpl.length) return;
  const f = 'px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-100 focus:ring-2 focus:ring-brand outline-none text-sm font-bold text-gray-800 max-w-full', c = card('trace-card');
  c.innerHTML = `<div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-5"><h4 class="font-extrabold text-lg text-gray-900"><i class="fas fa-magnifying-glass-chart text-brand-light mr-2"></i>Penelusuran Capaian CPL</h4><div class="flex flex-wrap gap-2"><select id="tr-m" class="${f}">${list.slice(0, 2000).map((u, i) => `<option value="${i}">${h(u.username)} - ${h(u.name)}</option>`).join('')}</select><select id="tr-c" class="${f}">${db.cpl.map((x, i) => `<option value="${i}">${h(x.kode)}</option>`).join('')}</select><button id="tr-p" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition"><i class="fas fa-print mr-2"></i>Rapor PDF</button></div></div><div id="tr-o"></div>`;
  host.appendChild(c);
  const draw = () => {
    const n = list[+c.querySelector('#tr-m').value].username, cpl = db.cpl[+c.querySelector('#tr-c').value]; if (!cpl) return;
    const r = E.cplStatus(db, n, cpl), tgt = num(cpl.target), ms = E.mappingsOf(db, cpl.kode), tot = ms.reduce((a, m) => a + num(m.bobot), 0) || 1, mkNama = new Map(db.mk.map(m => [m.kode, m.nama]));
    const rows = ms.map(m => {
      const nv = E.nilaiOf(db, n, m.mk, m.cpmk), v = E.hasNilai(nv) ? num(nv.nilai) : null;
      return `<tr class="border-b border-gray-50"><td class="px-4 py-3 text-sm font-bold text-gray-800">${h(m.mk)}<br><span class="text-[10px] text-gray-400 font-medium">${h(mkNama.get(m.mk) || '')}</span></td><td class="px-4 py-3 text-sm font-mono text-brand-blue font-bold">${h(m.cpmk)}${nv && nv.semester ? `<br><span class="text-[9px] text-gray-400 font-sans">${h(nv.semester)}</span>` : ''}</td><td class="px-4 py-3 text-center text-sm font-bold text-gray-600">${+(num(m.bobot) / tot * 100).toFixed(1)}%</td><td class="px-4 py-3 text-center text-sm font-black ${v === null ? 'text-gray-300' : v < tgt ? 'text-red-600' : 'text-green-600'}">${v === null ? 'belum dinilai' : v}</td><td class="px-4 py-3 text-center text-sm font-bold text-gray-700">${v === null ? '-' : (v * num(m.bobot) / tot).toFixed(1)}</td></tr>`;
    }).join('');
    c.querySelector('#tr-o').innerHTML = `<p class="text-sm font-bold mb-3 text-gray-700">Performa <span class="${COL[r.st]}">${r.s.taken > 0 ? r.s.performa.toFixed(1) : '-'}</span> dari target ${tgt} &middot; progres ${Math.round(r.s.progres)}% &middot; <span class="${COL[r.st]}">${L[r.st]}</span>${r.failed.length && r.st !== 'DATA' ? ` &middot; <span class="text-red-600">${r.failed.length} CPMK di bawah nilai minimum</span>` : ''}</p><div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar"><table class="w-full text-left whitespace-nowrap"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold border-b border-gray-100"><tr><th class="px-4 py-3">Mata Kuliah</th><th class="px-4 py-3">CPMK</th><th class="px-4 py-3 text-center">Porsi ke CPL</th><th class="px-4 py-3 text-center">Nilai</th><th class="px-4 py-3 text-center">Kontribusi (poin)</th></tr></thead><tbody class="bg-white">${rows || '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400 italic">CPL ini belum dipetakan ke CPMK.</td></tr>'}</tbody></table></div><p class="text-[11px] text-gray-400 mt-3">Nilai merah = di bawah target CPL. Kontribusi = nilai &times; porsi; jumlahnya adalah pemenuhan CPL bila semua CPMK sudah dinilai.</p>`;
  };
  c.querySelector('#tr-m').onchange = draw; c.querySelector('#tr-c').onchange = draw;
  c.querySelector('#tr-p').onclick = () => rapor(list[+c.querySelector('#tr-m').value].username);
  draw();
}

/* ---------- Peringatan dini ---------- */
function kartuPeringatan(host, list) {
  const nm = new Map(list.map(u => [u.username, u.name]));
  const data = list.map(u => { const f = new Set(), cp = []; db.cpl.forEach(c => { const x = E.failedCpmk(db, u.username, c.kode); x.forEach(m => f.add(m.mk + '/' + m.cpmk)); if (x.length) cp.push(c.kode); }); return { n: u.username, f: [...f], cp }; }).filter(x => x.f.length).sort((a, b) => b.f.length - a.f.length).slice(0, 10);
  const c = card('early-card');
  c.innerHTML = '<h4 class="font-extrabold text-lg text-gray-900 mb-1"><i class="fas fa-bell text-amber-500 mr-2"></i>Peringatan Dini Mahasiswa</h4><p class="text-xs text-gray-400 font-medium mb-4">Mahasiswa dengan CPMK penentu di bawah batas lulus, termasuk yang progresnya belum penuh (10 teratas).</p>' + (data.length
    ? '<div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar"><table class="w-full text-left text-sm whitespace-nowrap"><tbody>' + data.map(x => `<tr class="border-b border-gray-50"><td class="px-4 py-3 font-mono font-bold text-brand-blue">${h(x.n)}</td><td class="px-4 py-3 font-bold text-gray-800">${h(nm.get(x.n))}</td><td class="px-4 py-3 text-red-600 font-black">${x.f.length} CPMK</td><td class="px-4 py-3 text-xs text-gray-500 whitespace-normal">${h(x.f.join(', '))} &rarr; CPL ${h(x.cp.join(', '))}</td></tr>`).join('') + '</tbody></table></div>'
    : '<p class="text-sm text-green-600 font-bold"><i class="fas fa-check-circle mr-1"></i>Tidak ada mahasiswa dengan CPMK di bawah batas lulus pada cakupan ini.</p>');
  host.appendChild(c);
}

/* ---------- Tren per semester ---------- */
function kartuTren(host, nims) {
  const t = card('trend-card');
  t.innerHTML = '<div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4"><div><h4 class="font-extrabold text-lg text-gray-900"><i class="fas fa-chart-line text-brand-light mr-2"></i>Tren Performa CPL per Semester</h4><p class="text-xs text-gray-400 font-medium mt-1">Rata-rata performa mahasiswa pada cakupan laporan ini, dihitung dari nilai yang tercatat di tiap semester.</p></div><button id="tr-load" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition">Muat tren</button></div><div id="tr-box"></div>';
  host.appendChild(t);
  t.querySelector('#tr-load').onclick = () => {
    const box = t.querySelector('#tr-box'), sems = db.semester.map(s => s.kode).filter(s => db.hist.some(r => r.semester === s));
    if (!sems.length) { box.innerHTML = '<p class="text-sm text-gray-400">Belum ada nilai yang tercatat per semester. Tren muncul setelah nilai diinput pada semester aktif.</p>'; return; }
    const set = new Set(nims), data = db.cpl.map(() => []);
    sems.forEach(s => {
      const view = Object.assign({}, db, { nilaiCpmk: db.hist.filter(r => r.semester === s && set.has(r.mhs)) });
      db.cpl.forEach((c, k) => { const v = nims.map(n => E.cplStats(view, n, c.kode)).filter(x => x.taken > 0).map(x => x.performa); data[k].push(v.length ? +(v.reduce((a, x) => a + x, 0) / v.length).toFixed(1) : null); });
    });
    E.invalidate();
    box.innerHTML = '<div class="relative h-72 w-full"><canvas id="trend-chart"></canvas></div>';
    gambarChart('trend-chart', { type: 'line', data: { labels: sems, datasets: db.cpl.map((c, k) => ({ label: c.kode, data: data[k], tension: 0.3, spanGaps: true, borderWidth: 2.5 })) }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } } });
  };
}

/* ---------- Rencana Tindak Lanjut (siklus PPEPP) ---------- */
const ST = ['Direncanakan', 'Berjalan', 'Selesai', 'Ditunda'], SCOL = { Direncanakan: 'bg-blue-50 text-blue-600 border-blue-100', Berjalan: 'bg-amber-50 text-amber-600 border-amber-100', Selesai: 'bg-green-50 text-green-600 border-green-100', Ditunda: 'bg-gray-100 text-gray-500 border-gray-200' };
function formRtl(r, pre) {
  const ed = !!r, x = r ? Object.assign({}, r) : Object.assign({ id: 'rtl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), temuan: '', cpl: '', tindakan: '', pic: '', tenggat: '', status: 'Direncanakan', hasil: '', semester: Store.semesterAktif(), dibuat: new Date().toISOString() }, pre || {});
  const f = 'w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-brand text-sm font-semibold text-gray-800', l = 'block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1.5';
  openModal(ed ? 'Ubah Rencana Tindak Lanjut' : 'Rencana Tindak Lanjut Baru', `<div class="space-y-4"><div><label class="${l}">Temuan / masalah</label><textarea id="rtl-t" class="${f} h-20">${h(x.temuan)}</textarea></div>` +
    `<div class="grid grid-cols-2 gap-4"><div><label class="${l}">CPL terkait</label><select id="rtl-c" class="${f}"><option value="">-</option>${db.cpl.map(c => `<option value="${h(c.kode)}"${c.kode === x.cpl ? ' selected' : ''}>${h(c.kode)}</option>`).join('')}</select></div><div><label class="${l}">Status</label><select id="rtl-s" class="${f}">${ST.map(s => `<option${s === x.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div></div>` +
    `<div><label class="${l}">Tindakan perbaikan</label><textarea id="rtl-a" class="${f} h-20">${h(x.tindakan)}</textarea></div>` +
    `<div class="grid grid-cols-2 gap-4"><div><label class="${l}">Penanggung jawab</label><input id="rtl-p" class="${f}" value="${h(x.pic)}"></div><div><label class="${l}">Tenggat</label><input id="rtl-d" type="date" class="${f}" value="${h(x.tenggat)}"></div></div>` +
    `<div><label class="${l}">Hasil evaluasi (wajib bila Selesai)</label><textarea id="rtl-h" class="${f} h-16">${h(x.hasil)}</textarea></div></div>`, () => {
    const v = id => $id(id).value.trim(), n = Object.assign(x, { temuan: v('rtl-t'), cpl: v('rtl-c'), tindakan: v('rtl-a'), pic: v('rtl-p'), tenggat: v('rtl-d'), status: v('rtl-s'), hasil: v('rtl-h') });
    if (!n.temuan || !n.tindakan) throw new Error('Temuan dan tindakan perbaikan wajib diisi.');
    if (n.status === 'Selesai' && !n.hasil) throw new Error('Isi hasil evaluasi sebelum menandai Selesai: apakah tindakan berhasil memperbaiki capaian?');
    const i = db.rtl.findIndex(t => t.id === n.id); if (i >= 0) db.rtl[i] = n; else db.rtl.unshift(n);
    Store.simpan('rtl'); showToast('RTL disimpan.'); renderLaporan();
  });
}
function kartuRtl(host, prSemua) {
  const admin = State.user.role === 'admin', today = new Date().toISOString().slice(0, 10), c = card('rtl-card');
  const open = db.rtl.filter(r => r.status !== 'Selesai'), late = open.filter(r => r.tenggat && r.tenggat < today).length;
  const pr = admin ? prSemua : [], sug = pr.filter(r => r.status === 'NO' && !open.some(t => t.cpl === r.kode));
  c.innerHTML = `<div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-5"><div><h4 class="font-extrabold text-lg text-gray-900"><i class="fas fa-rotate text-brand-light mr-2"></i>Rencana Tindak Lanjut (Perbaikan Mutu)</h4><p class="text-xs text-gray-400 font-medium mt-1">${db.rtl.length} rencana &middot; ${open.length} belum selesai${late ? ' &middot; <span class="text-red-600 font-bold">' + late + ' terlambat</span>' : ''}. Evaluasi hasilnya pada semester berikutnya untuk menutup siklus.</p></div><div class="flex flex-wrap gap-2">` +
    (admin ? '<button id="rtl-add" class="bg-brand text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-dark transition"><i class="fas fa-plus mr-2"></i>RTL Baru</button>' : '') + '<button id="rtl-xls" class="text-brand border-2 border-brand px-4 py-2 rounded-xl text-sm font-bold hover:bg-brand-soft transition"><i class="fas fa-file-excel mr-2"></i>Ekspor</button></div></div>' +
    (sug.length ? '<div class="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200"><p class="text-xs font-extrabold text-amber-700 uppercase tracking-wider mb-2">Saran: CPL belum tercapai dan belum punya RTL</p><div class="flex flex-wrap gap-2">' + sug.map((r, i) => `<button class="rtl-sug text-xs font-bold bg-white border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100" data-i="${i}">+ ${h(r.kode)}${r.rata !== null ? ' (rata ' + r.rata.toFixed(1) + ' / target ' + r.target + ')' : ''}</button>`).join('') + '</div></div>' : '') +
    (db.rtl.length ? '<div class="overflow-x-auto border border-gray-100 rounded-2xl custom-scrollbar"><table class="w-full text-left text-sm"><thead class="bg-gray-50/90 text-[10px] uppercase tracking-widest text-gray-400 font-extrabold"><tr><th class="px-4 py-3">CPL</th><th class="px-4 py-3">Temuan &amp; tindakan</th><th class="px-4 py-3">PIC</th><th class="px-4 py-3">Tenggat</th><th class="px-4 py-3">Status</th>' + (admin ? '<th class="px-4 py-3"></th>' : '') + '</tr></thead><tbody class="bg-white">' +
      db.rtl.map((r, i) => { const tl = r.status !== 'Selesai' && r.tenggat && r.tenggat < today; return `<tr class="border-t border-gray-50 align-top"><td class="px-4 py-3 font-bold text-brand-blue whitespace-nowrap">${h(r.cpl || '-')}</td><td class="px-4 py-3 min-w-[260px]"><p class="font-bold text-gray-800">${h(r.temuan)}</p><p class="text-xs text-gray-500 mt-1">&rarr; ${h(r.tindakan)}</p>${r.hasil ? `<p class="text-xs text-green-700 mt-1">Hasil: ${h(r.hasil)}</p>` : ''}</td><td class="px-4 py-3 text-xs font-semibold text-gray-600">${h(r.pic || '-')}</td><td class="px-4 py-3 text-xs font-bold whitespace-nowrap ${tl ? 'text-red-600' : 'text-gray-600'}">${h(r.tenggat || '-')}${tl ? '<br>terlambat' : ''}</td><td class="px-4 py-3">` +
        (admin ? `<select class="rtl-st text-xs font-bold rounded-lg border px-2 py-1 ${SCOL[r.status] || ''}" data-i="${i}">${ST.map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select>` : `<span class="text-[10px] font-bold px-2 py-1 rounded-lg border ${SCOL[r.status] || ''}">${h(r.status)}</span>`) + '</td>' +
        (admin ? `<td class="px-4 py-3 whitespace-nowrap"><button class="rtl-ed text-gray-300 hover:text-brand-light mr-3" data-i="${i}"><i class="fas fa-edit"></i></button><button class="rtl-del text-gray-300 hover:text-red-500" data-i="${i}"><i class="fas fa-trash-alt"></i></button></td>` : '') + '</tr>'; }).join('') + '</tbody></table></div>'
      : '<p class="text-sm text-gray-400 text-center py-6">Belum ada rencana tindak lanjut.</p>');
  host.appendChild(c);
  const q = (s, fn) => c.querySelectorAll(s).forEach(fn);
  const add = c.querySelector('#rtl-add'); if (add) add.onclick = () => formRtl(null);
  c.querySelector('#rtl-xls').onclick = () => eksporLembar('Rencana_Tindak_Lanjut.xlsx', [['RTL', db.rtl.map(r => ({ CPL: r.cpl, Temuan: r.temuan, Tindakan: r.tindakan, PIC: r.pic, Tenggat: r.tenggat, Status: r.status, 'Hasil evaluasi': r.hasil, Semester: r.semester }))]]).catch(e => showCustomDialog('alert', e.message));
  q('.rtl-sug', b => b.onclick = () => { const r = sug[+b.dataset.i]; formRtl(null, { cpl: r.kode, temuan: 'CPL ' + r.kode + ' belum tercapai' + (r.rata !== null ? ': rata-rata ' + r.rata.toFixed(1) + ' dari target ' + r.target : '') + (r.pctRendah ? ' (persentase mahasiswa tercapai di bawah ambang)' : '') + (r.lemah && r.lemah.length ? '. CPMK lemah: ' + r.lemah.join(', ') : '') + '.' }); });
  q('.rtl-ed', b => b.onclick = () => formRtl(db.rtl[+b.dataset.i]));
  q('.rtl-del', b => b.onclick = () => { const r = db.rtl[+b.dataset.i]; showCustomDialog('confirm', 'Hapus rencana tindak lanjut ini?', () => { db.rtl = db.rtl.filter(t => t !== r); Store.simpan('rtl'); renderLaporan(); }); });
  q('.rtl-st', s => s.onchange = () => { const r = db.rtl[+s.dataset.i]; if (!r) return; if (s.value === 'Selesai' && !r.hasil) { s.value = r.status; return formRtl(r, { status: 'Selesai' }); } db.rtl[+s.dataset.i] = Object.assign({}, r, { status: s.value }); Store.simpan('rtl'); renderLaporan(); });
}
