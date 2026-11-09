/* excel.js — Template & unggah Excel yang aman (gabungan patch v8 + v9)
 * - Template berisi data saat ini; kode yang ada DIPERBARUI, kode baru DITAMBAHKAN, sel kosong = dibiarkan
 * - Cek judul kolom sebelum mengubah apa pun; laporan ringkas (baru / diperbarui / dihapus / dilewati)
 * - NIM yang kehilangan angka nol di depan (akibat Excel) dipulihkan bila cocok tepat 1 pengguna
 * SheetJS dimuat malas (hanya saat fitur Excel dipakai). */
import * as E from './engine.js';
import { db, Store } from './data.js';
import { State, showToast, showCustomDialog, XL } from './ui.js';

const T = E.T, pf = v => parseFloat(T(v).replace(',', '.')), inR = (v, a, b) => !isNaN(v) && v >= a && v <= b;
const hasMk = k => db.mk.some(m => T(m.kode) === k), hasCpl = k => db.cpl.some(c => T(c.kode) === k), hasPl = k => db.profilLulusan.some(p => T(p.kode) === k), hasCp = (m, k) => db.cpmk.some(c => T(c.mk) === m && T(c.kode) === k);
const resolveNim = k => { if (!/^\d+$/.test(k) || db.users.some(u => T(u.username) === k)) return k; const m = db.users.filter(u => T(u.username).replace(/^0+/, '') === k); return m.length === 1 ? T(m[0].username) : k; };
const users = role => db.users.filter(u => u.role === role);
const lapor = (j, r, s) => showCustomDialog('alert', j + '\n' + r + (s.length ? '\n\nDilewati / catatan (' + s.length + '):\n' + s.slice(0, 8).join('\n') + (s.length > 8 ? '\n...dan ' + (s.length - 8) + ' lainnya.' : '') : ''));
const rerender = () => window.App && window.App.rerender();

const CFG = {
  profil: { tb: 'profilLulusan', h: ['Kode Profil', 'Deskripsi Profil'], req: ['Kode Profil'], rows: () => db.profilLulusan.map(p => ({ 'Kode Profil': p.kode, 'Deskripsi Profil': p.deskripsi })), ex: { 'Kode Profil': 'PL-01', 'Deskripsi Profil': '' },
    key: r => T(r['Kode Profil']), get: k => db.profilLulusan.find(x => T(x.kode) === k), neu: k => ({ kode: k, deskripsi: '' }), set: (o, r) => { if (T(r['Deskripsi Profil'])) o.deskripsi = T(r['Deskripsi Profil']); } },
  cpl: { tb: 'cpl', h: ['Kode CPL', 'Deskripsi', 'Target (%)'], req: ['Kode CPL'], rows: () => db.cpl.map(c => ({ 'Kode CPL': c.kode, 'Deskripsi': c.deskripsi, 'Target (%)': c.target })), ex: { 'Kode CPL': 'CPL-01', 'Deskripsi': '', 'Target (%)': 70 },
    key: r => T(r['Kode CPL']), get: k => db.cpl.find(x => T(x.kode) === k), neu: k => ({ kode: k, deskripsi: '', target: 70 }),
    set: (o, r) => { if (T(r['Deskripsi'])) o.deskripsi = T(r['Deskripsi']); if (T(r['Target (%)']) !== '') { const v = pf(r['Target (%)']); if (!inR(v, 0, 100)) return 'target harus 0-100'; o.target = v; } } },
  mk: { tb: 'mk', h: ['Kode MK', 'Nama MK', 'SKS', 'Semester'], req: ['Kode MK'], rows: () => db.mk.map(m => ({ 'Kode MK': m.kode, 'Nama MK': m.nama, 'SKS': m.sks, 'Semester': m.semester })), ex: { 'Kode MK': 'MK-01', 'Nama MK': '', 'SKS': 3, 'Semester': 1 },
    key: r => T(r['Kode MK']), get: k => db.mk.find(x => T(x.kode) === k), neu: k => ({ kode: k, nama: '', sks: 3, semester: 1 }),
    set: (o, r) => { if (T(r['Nama MK'])) o.nama = T(r['Nama MK']); for (const [hd, f] of [['SKS', 'sks'], ['Semester', 'semester']]) if (T(r[hd]) !== '') { const v = parseInt(pf(r[hd])); if (!inR(v, 0, 99)) return hd + ' tidak valid'; o[f] = v; } } },
  cpmk: { tb: 'cpmk', h: ['Kode CPMK', 'Kode MK', 'Deskripsi Capaian'], req: ['Kode CPMK', 'Kode MK'], rows: () => db.cpmk.map(c => ({ 'Kode CPMK': c.kode, 'Kode MK': c.mk, 'Deskripsi Capaian': c.deskripsi })), ex: { 'Kode CPMK': 'CPMK-1', 'Kode MK': '', 'Deskripsi Capaian': '' },
    key: r => T(r['Kode CPMK']) && T(r['Kode MK']) ? T(r['Kode MK']) + '\u0001' + T(r['Kode CPMK']) : '', get: k => { const [m, c] = k.split('\u0001'); return db.cpmk.find(x => T(x.mk) === m && T(x.kode) === c); }, neu: k => { const [m, c] = k.split('\u0001'); return { kode: c, mk: m, deskripsi: '' }; },
    set: (o, r) => { if (!hasMk(o.mk)) return 'mata kuliah ' + o.mk + ' belum terdaftar (unggah Mata Kuliah dulu)'; if (T(r['Deskripsi Capaian'])) o.deskripsi = T(r['Deskripsi Capaian']); } },
  mhs: { tb: 'users', h: ['NIM', 'Nama Lengkap', 'Angkatan', 'Password'], req: ['NIM'], txt: 1, rows: () => users('mahasiswa').map(u => ({ 'NIM': String(u.username), 'Nama Lengkap': u.name, 'Angkatan': u.angkatan || '', 'Password': '' })), ex: { 'NIM': '', 'Nama Lengkap': '', 'Angkatan': '', 'Password': '' },
    key: r => resolveNim(T(r['NIM'])), get: k => db.users.find(u => T(u.username) === k), neu: (k, r) => { const o = { username: k, name: '', role: 'mahasiswa', angkatan: '' }; if (T(r['Password'])) o._pw = T(r['Password']); return o; },
    set: (o, r) => { if (o.role !== 'mahasiswa') return 'ID ini milik pengguna dengan peran lain'; if (T(r['Nama Lengkap'])) o.name = T(r['Nama Lengkap']); if (T(r['Angkatan'])) o.angkatan = T(r['Angkatan']); if (o._pw !== undefined && o._pw.length < 6) return 'password minimal 6 karakter'; } },
  dosen: { tb: 'users', h: ['ID / Username', 'Nama Lengkap', 'Password', 'MK Diampu'], req: ['ID / Username'], txt: 1, rows: () => users('dosen').map(u => ({ 'ID / Username': String(u.username), 'Nama Lengkap': u.name, 'Password': '', 'MK Diampu': (u.mkDiampu || []).join(', ') })), ex: { 'ID / Username': '', 'Nama Lengkap': '', 'Password': '', 'MK Diampu': 'MK001, MK002' },
    key: r => resolveNim(T(r['ID / Username'])), get: k => db.users.find(u => T(u.username) === k), neu: (k, r) => { const o = { username: k, name: '', role: 'dosen', angkatan: '', mkDiampu: [] }; if (T(r['Password'])) o._pw = T(r['Password']); return o; },
    set: (o, r, w) => {
      if (o.role !== 'dosen') return 'ID ini milik pengguna dengan peran lain'; if (T(r['Nama Lengkap'])) o.name = T(r['Nama Lengkap']);
      if (o._pw !== undefined && o._pw.length < 6) return 'password minimal 6 karakter';
      if (T(r['MK Diampu'])) { const cs = T(r['MK Diampu']).split(/[,;\s]+/).filter(Boolean), ok = cs.filter(hasMk); cs.filter(c => !hasMk(c)).forEach(c => w('MK ' + c + ' tidak terdaftar, diabaikan')); o.mkDiampu = ok; }
    } },
  mapcpl: { tb: 'mappingCpmk', h: ['Kode MK', 'Kode CPMK', 'Kode CPL', 'Bobot (%)'], req: ['Kode MK', 'Kode CPMK', 'Kode CPL', 'Bobot (%)'], rows: () => db.mappingCpmk.map(m => ({ 'Kode MK': m.mk, 'Kode CPMK': m.cpmk, 'Kode CPL': m.cpl, 'Bobot (%)': m.bobot })), ex: { 'Kode MK': 'MK001', 'Kode CPMK': 'CPMK-1', 'Kode CPL': 'CPL-01', 'Bobot (%)': 100 },
    key: r => T(r['Kode MK']) && T(r['Kode CPMK']) && T(r['Kode CPL']) ? [T(r['Kode MK']), T(r['Kode CPMK']), T(r['Kode CPL'])].join('\u0001') : '', get: k => { const [m, c, l] = k.split('\u0001'); return db.mappingCpmk.find(x => T(x.mk) === m && T(x.cpmk) === c && T(x.cpl) === l); },
    neu: k => { const [m, c, l] = k.split('\u0001'); return { cpmk: c, mk: m, cpl: l, bobot: 0 }; }, del: r => T(r['Bobot (%)']) === '' || pf(r['Bobot (%)']) === 0,
    set: (o, r) => { if (!hasCp(o.mk, o.cpmk)) return 'CPMK ' + o.mk + '/' + o.cpmk + ' belum terdaftar'; if (!hasCpl(o.cpl)) return 'CPL ' + o.cpl + ' belum terdaftar'; const v = pf(r['Bobot (%)']); if (!inR(v, 0, 100)) return 'bobot harus 0-100'; o.bobot = v; } },
  mapprofil: { tb: 'mappingCplProfil', h: ['Kode CPL', 'Kode Profil', 'Bobot (%)'], req: ['Kode CPL', 'Kode Profil', 'Bobot (%)'], rows: () => db.mappingCplProfil.map(m => ({ 'Kode CPL': m.cpl, 'Kode Profil': m.profil, 'Bobot (%)': m.bobot })), ex: { 'Kode CPL': 'CPL-01', 'Kode Profil': 'PL-01', 'Bobot (%)': 100 },
    key: r => T(r['Kode CPL']) && T(r['Kode Profil']) ? T(r['Kode CPL']) + '\u0001' + T(r['Kode Profil']) : '', get: k => { const [l, p] = k.split('\u0001'); return db.mappingCplProfil.find(x => T(x.cpl) === l && T(x.profil) === p); }, neu: k => { const [l, p] = k.split('\u0001'); return { cpl: l, profil: p, bobot: 0 }; },
    del: r => T(r['Bobot (%)']) === '' || pf(r['Bobot (%)']) === 0, set: (o, r) => { if (!hasCpl(o.cpl)) return 'CPL ' + o.cpl + ' belum terdaftar'; if (!hasPl(o.profil)) return 'Profil ' + o.profil + ' belum terdaftar'; const v = pf(r['Bobot (%)']); if (!inR(v, 0, 100)) return 'bobot harus 0-100'; o.bobot = v; } },
  bobot: { tb: 'bobotCpmk', h: ['Kode MK', 'Kode CPMK', 'Bobot (%)'], req: ['Kode MK', 'Kode CPMK', 'Bobot (%)'], rows: () => db.cpmk.map(c => ({ 'Kode MK': c.mk, 'Kode CPMK': c.kode, 'Bobot (%)': (b => b ? b.bobot : '')(db.bobotCpmk.find(x => T(x.mk) === T(c.mk) && T(x.cpmk) === T(c.kode))) })), ex: { 'Kode MK': 'MK001', 'Kode CPMK': 'CPMK-1', 'Bobot (%)': 40 },
    key: r => T(r['Kode MK']) && T(r['Kode CPMK']) ? T(r['Kode MK']) + '\u0001' + T(r['Kode CPMK']) : '', get: k => { const [m, c] = k.split('\u0001'); return db.bobotCpmk.find(x => T(x.mk) === m && T(x.cpmk) === c); }, neu: k => { const [m, c] = k.split('\u0001'); return { mk: m, cpmk: c, bobot: 0 }; },
    set: (o, r) => { if (!hasCp(o.mk, o.cpmk)) return 'CPMK ' + o.mk + '/' + o.cpmk + ' belum terdaftar'; const v = pf(r['Bobot (%)']); if (!inR(v, 0, 100)) return 'bobot harus 0-100 (tidak boleh kosong)'; o.bobot = v; } }
};
const NOTE = { mhs: 'Password hanya dipakai untuk NIM baru (kosong = password bawaan, wajib diganti saat login pertama). Password mahasiswa yang sudah ada tidak diubah lewat Excel.', dosen: 'MK Diampu: kode dipisah koma. Password hanya untuk dosen baru (kosong = password bawaan).', mapcpl: 'Bobot kosong atau 0 = hapus pemetaan itu.', mapprofil: 'Bobot kosong atau 0 = hapus pemetaan itu.', bobot: 'Total bobot CPMK per mata kuliah harus 100 agar nilai bisa diinput.' };

async function bacaFile(file) {
  const X = await XL(), buf = await file.arrayBuffer(), wb = X.read(new Uint8Array(buf), { type: 'array' });
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
}

async function tpl(type) {
  const X = await XL(), c = CFG[type], rows = c.rows(); if (!rows.length) rows.push(c.ex);
  const ws = X.utils.json_to_sheet(rows, { header: c.h }), wb = X.utils.book_new(), n = rows.length;
  if (c.txt) { for (let i = 2; i <= n + 201; i++) { const a = 'A' + i; if (ws[a]) { ws[a].t = 's'; ws[a].z = '@'; ws[a].v = String(ws[a].v); } else ws[a] = { t: 's', v: '', z: '@' }; } ws['!ref'] = 'A1:' + X.utils.encode_col(c.h.length - 1) + (n + 201); }
  X.utils.book_append_sheet(wb, ws, 'Data');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['PETUNJUK'], ['1. Jangan ubah judul kolom.'], ['2. Kode yang sudah ada akan DIPERBARUI; kode baru akan DITAMBAHKAN; sel kosong = nilai lama dibiarkan.'], ['3. ' + (NOTE[type] || 'Data induk (mata kuliah, CPL, profil) harus sudah terdaftar.')], ['4. Kolom kode/NIM sebaiknya berformat Text agar angka nol di depan tidak hilang.']]), 'Petunjuk');
  X.writeFile(wb, 'Template_' + type.toUpperCase() + '.xlsx'); showToast('Template berisi data saat ini diunduh.');
}

function up(type, json) {
  const c = CFG[type]; if (!json.length) return showCustomDialog('alert', 'File kosong.');
  const miss = c.req.filter(hd => !(hd in json[0])); if (miss.length) return showCustomDialog('alert', 'Kolom hilang: ' + miss.join(', ') + '.\nTidak ada data yang diubah. Gunakan template terbaru.');
  let add = 0, upd = 0, del = 0, same = 0; const skip = [], seen = new Set();
  json.forEach((r, i) => {
    const k = c.key(r); if (!k) return; const line = i + 2;
    if (seen.has(k)) { skip.push('Baris ' + line + ': duplikat di file, dilewati'); return; } seen.add(k);
    const o = c.get(k), arr = db[c.tb];
    if (c.del && c.del(r)) { if (o) { db[c.tb] = arr.filter(x => x !== o); del++; } return; }
    const t = o ? Object.assign({}, o, { mkDiampu: o.mkDiampu ? o.mkDiampu.slice() : o.mkDiampu }) : c.neu(k, r), err = c.set(t, r, m => skip.push('Baris ' + line + ': ' + m));
    if (err) { skip.push('Baris ' + line + ': ' + err); return; }
    if (!o) { arr.push(t); add++; } else if (JSON.stringify(t) !== JSON.stringify(o)) { arr[arr.indexOf(o)] = t; upd++; } else same++;
  });
  if (add || upd || del) Store.simpan(c.tb);
  rerender(); lapor('Hasil impor', 'Baru: ' + add + ' | Diperbarui: ' + upd + ' | Dihapus: ' + del + ' | Tidak berubah: ' + same + '.', skip);
}

// ---------- Nilai: template berisi peserta kelas + nilai yang sudah ada ----------
const pesertaMk = mk => new Set(db.pesertaKelas.filter(p => p.semester === Store.semesterAktif() && p.mk === mk).map(p => String(p.nim)));
async function templateNilai() {
  const mk = State.mkNilai; if (!mk) return showToast('Pilih Mata Kuliah terlebih dahulu!');
  const cps = db.cpmk.filter(c => c.mk === mk); if (!cps.length) return showCustomDialog('alert', 'Mata Kuliah belum memiliki CPMK.');
  const X = await XL(), ps = pesertaMk(mk), akt = (document.getElementById('nilai-akt') || {}).value || 'ALL';
  const studs = db.users.filter(u => u.role === 'mahasiswa' && (!ps.size || ps.has(String(u.username))) && (akt === 'ALL' || E.aktOf(u) === akt));
  const rows = studs.map(s => { const r = { 'NIM': String(s.username), 'Nama Mahasiswa': s.name }; cps.forEach(c => { const n = Store.nilaiEfektif(s.username, mk, c.kode); r[c.kode] = E.hasNilai(n) ? n.nilai : ''; }); return r; });
  if (!rows.length) { const r = { 'NIM': '', 'Nama Mahasiswa': '' }; cps.forEach(c => r[c.kode] = ''); rows.push(r); }
  const ws = X.utils.json_to_sheet(rows), wb = X.utils.book_new();
  for (let i = 2; i <= rows.length + 1; i++) if (ws['A' + i]) { ws['A' + i].t = 's'; ws['A' + i].z = '@'; }
  X.utils.book_append_sheet(wb, ws, 'Data');
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['PETUNJUK'], ['1. Jangan ubah judul kolom (NIM dan kode CPMK).'], ['2. Isi nilai 0-100. Desimal boleh memakai titik atau koma.'], ['3. Sel kosong = nilai lama dibiarkan (tidak dihapus).'], ['4. Format kolom NIM sebagai Text agar angka nol di depan tidak hilang.'], ['5. Baris NIM yang tidak terdaftar / bukan peserta kelas akan dilewati.'], ['6. Nilai baru/berubah dicatat pada semester aktif: ' + (Store.semesterAktif() || '(belum ditentukan)') + '.']]), 'Petunjuk');
  X.writeFile(wb, 'Template_Nilai_' + mk + (akt !== 'ALL' ? '_Angkatan_' + akt : '') + '.xlsx');
  showToast('Template ' + rows.length + ' mahasiswa diunduh (' + (ps.size ? 'peserta kelas' : 'semua mahasiswa; peserta kelas belum diatur') + ').');
}
function importNilai(json) {
  const mk = State.mkNilai; if (!mk) return showToast('Pilih Mata Kuliah terlebih dahulu!');
  const cps = db.cpmk.filter(c => c.mk === mk); if (!json.length) return showCustomDialog('alert', 'File kosong.');
  const heads = Object.keys(json[0]), miss = ['NIM'].concat(cps.map(c => c.kode)).filter(x => !heads.includes(x));
  if (miss.length) return showCustomDialog('alert', 'Judul kolom tidak cocok. Kolom yang hilang: ' + miss.join(', ') + '.\nTidak ada data yang diubah. Gunakan template terbaru.');
  const ps = pesertaMk(mk), mhs = new Set(users('mahasiswa').map(u => T(u.username)));
  let baru = 0, ubah = 0, sama = 0; const skip = [], ops = [];
  json.forEach((row, i) => {
    const nim = resolveNim(T(row.NIM)), line = i + 2; if (!nim) return;
    if (!mhs.has(nim)) { skip.push('Baris ' + line + ': NIM ' + nim + ' tidak terdaftar'); return; }
    if (ps.size && !ps.has(nim)) { skip.push('Baris ' + line + ': NIM ' + nim + ' bukan peserta kelas'); return; }
    const per = {};
    cps.forEach(c => {
      const raw = T(row[c.kode]); if (raw === '') return;
      const v = pf(raw);
      if (isNaN(v) || v < 0 || v > 100) { skip.push('Baris ' + line + ' ' + c.kode + ': nilai "' + raw + '" tidak valid (harus 0-100)'); return; }
      const old = Store.nilaiEfektif(nim, mk, c.kode);
      if (old && E.hasNilai(old) && E.num(old.nilai) === v) { sama++; return; }
      if (old) ubah++; else baru++;
      per[c.kode] = v;
    });
    ops.push(...Store.opsNilai(nim, mk, per));
  });
  if (ops.length) Store.terapkanOps(ops);
  rerender();
  lapor('Hasil impor nilai ' + mk, 'Nilai baru: ' + baru + ' | Diperbarui: ' + ubah + ' | Tidak berubah: ' + sama + '.', skip);
}

export async function downloadTemplate(type) {
  try { if (type === 'nilai') return await templateNilai(); if (CFG[type]) return await tpl(type); }
  catch (e) { console.error(e); showCustomDialog('alert', 'Gagal membuat template: ' + (e.message || e)); }
}
export async function handleExcelUpload(input, type) {
  const f = input.files && input.files[0]; if (!f) return;
  try {
    const json = await bacaFile(f);
    if (type === 'nilai') importNilai(json); else if (CFG[type]) up(type, json);
  } catch (e) { console.error(e); showCustomDialog('alert', 'Gagal memproses file: ' + (e.message || e)); }
  input.value = '';
}
// Ekspor tabel umum (laporan, RTL)
export async function eksporLembar(namaFile, lembar) {
  const X = await XL(), wb = X.utils.book_new();
  lembar.forEach(([nama, rows]) => X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows.length ? rows : [{}]), nama));
  X.writeFile(wb, namaFile);
}
