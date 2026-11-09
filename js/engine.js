/* =====================================================================
 * OBE ENGINE v4 — mesin perhitungan capaian (murni, tanpa DOM)
 * Menggabungkan OBE_ENGINE patch v2 + ambang CPMK v3 + aturan % mhs v10
 * menjadi SATU modul dengan indeks O(1) dan memo per (mahasiswa, CPL).
 * Memo dikosongkan otomatis lewat E.invalidate() setiap data berubah.
 * ===================================================================== */

export const num = (v, d = 0) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? d : x; };
export const T = v => String(v == null ? '' : v).trim();
const K3 = (a, b, c) => T(a) + '\u0001' + T(b) + '\u0001' + T(c);
const K2 = (a, b) => T(a) + '\u0001' + T(b);
export const hasNilai = r => !!r && r.nilai !== undefined && r.nilai !== null && r.nilai !== '';
export const aktOf = u => (u && u.angkatan && T(u.angkatan)) ? T(u.angkatan) : 'Lainnya';
export const natural = (a, b) => String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });

// Urutan semester kronologis: "Ganjil"=0, "Genap"=1, "Pendek/Antara"=2; nilai lama (tanpa semester) paling awal
export const semKey = k => { if (!k) return -1; const y = (String(k).match(/\d{4}/) || ['0'])[0], t = /genap/i.test(k) ? 1 : /pendek|antara/i.test(k) ? 2 : 0; return +y * 10 + t; };
export const sortSem = rows => rows.slice().sort((a, b) => semKey(a.kode) - semKey(b.kode) || natural(a.kode, b.kode));

// Nilai efektif: untuk tiap (mahasiswa, MK, CPMK) dipakai nilai dari semester paling baru
export function effective(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = K3(r.mhs, r.mk, r.cpmk), o = m.get(k);
    if (!o || semKey(r.semester) >= semKey(o.semester)) m.set(k, r);
  }
  return [...m.values()];
}

let VER = 0, C = null;
export function invalidate() { VER++; C = null; }

function ctx(db) {
  if (C && C.ver === VER && C.db === db && C.n === db.nilaiCpmk && C.nl === db.nilaiCpmk.length && C.m === db.mappingCpmk && C.ml === db.mappingCpmk.length && C.s === db.settings) return C;
  const st = (db.settings && db.settings[0]) || {};
  // Indeks bersarang: tanpa merangkai string kunci di setiap pencarian
  const byMhs = new Map(), byCp = new Map(), byCpl = new Map(), byPl = new Map(), cplBy = new Map(), mkCp = new Map(), bobot = new Map();
  for (const n of db.nilaiCpmk) {
    const nim = T(n.mhs), k = T(n.mk) + '\u0001' + T(n.cpmk);
    let a = byMhs.get(nim); if (!a) byMhs.set(nim, a = new Map()); if (!a.has(k)) a.set(k, n);
    let b = byCp.get(k); if (!b) byCp.set(k, b = new Map()); if (!b.has(nim)) b.set(nim, n);
  }
  for (const m of db.mappingCpmk) { const k = T(m.cpl); (byCpl.get(k) || byCpl.set(k, []).get(k)).push({ m, k: T(m.mk) + '\u0001' + T(m.cpmk), w: num(m.bobot) }); }
  for (const m of (db.mappingCplProfil || [])) { const k = T(m.profil); (byPl.get(k) || byPl.set(k, []).get(k)).push(m); }
  for (const c of db.cpl) cplBy.set(T(c.kode), c);
  for (const c of (db.cpmk || [])) { const k = T(c.mk); (mkCp.get(k) || mkCp.set(k, []).get(k)).push(c); }
  for (const b of (db.bobotCpmk || [])) bobot.set(K2(b.mk, b.cpmk), b);
  const mp = parseFloat(st.minProgres), g = parseFloat(st.ambangCpmk), pm = parseFloat(st.minPctMhs);
  C = { ver: VER, db, n: db.nilaiCpmk, nl: db.nilaiCpmk.length, m: db.mappingCpmk, ml: db.mappingCpmk.length, s: db.settings,
    byMhs, byCp, byCpl, byPl, cplBy, mkCp, bobot, st,
    minProg: isNaN(mp) ? 100 : mp, ambang: isNaN(g) ? 60 : g, ambangMk: st.ambangMk || {}, minPctMhs: isNaN(pm) ? 0 : pm,
    memoS: new Map(), memoQ: new Map(), memoF: new Map(), memoMin: new Map() };
  return C;
}

export const minProg = db => ctx(db).minProg;
export const globalMin = db => ctx(db).ambang;
export const minOf = (db, mk) => { const c = ctx(db), k = T(mk); let v = c.memoMin.get(k); if (v === undefined) { v = parseFloat(c.ambangMk[k]); if (isNaN(v)) v = c.ambang; c.memoMin.set(k, v); } return v; };
export const nilaiOf = (db, mhs, mk, cpmk) => { const a = ctx(db).byMhs.get(T(mhs)); return a ? a.get(T(mk) + '\u0001' + T(cpmk)) : undefined; };
const entriOf = (db, cpl) => ctx(db).byCpl.get(T(cpl)) || [];
export const mappingsOf = (db, cpl) => entriOf(db, cpl).map(e => e.m);
export const cplOf = (db, kode) => ctx(db).cplBy.get(T(kode));
export const cpmkOfMk = (db, mk) => ctx(db).mkCp.get(T(mk)) || [];
export const bobotOf = (db, mk, cpmk) => { const b = ctx(db).bobot.get(K2(mk, cpmk)); return b ? num(b.bobot) : 0; };

// Statistik 1 mahasiswa x 1 CPL (bobot relatif; hanya CPMK yang sudah bernilai ikut "performa")
export function cplStats(db, mhs, cplKode) {
  const c = ctx(db), nim = T(mhs), key = nim + '\u0001' + T(cplKode), hit = c.memoS.get(key); if (hit) return hit;
  const mm = c.byMhs.get(nim); let all = 0, taken = 0, score = 0;
  for (const e of (c.byCpl.get(T(cplKode)) || [])) {
    all += e.w;
    const n = mm && mm.get(e.k);
    if (hasNilai(n)) { taken += e.w; score += num(n.nilai) * e.w; }
  }
  const r = { performa: taken > 0 ? score / taken : 0, pemenuhan: all > 0 ? score / all : 0, progres: all > 0 ? taken / all * 100 : 0, taken, all, totalBobotTaken: taken };
  c.memoS.set(key, r); return r;
}

// OK / NO hanya bila progres >= syarat minimal; selain itu DATA (belum cukup data, bukan gagal)
export function status(db, s, target) {
  if (s.taken <= 0 || s.progres < minProg(db) - 0.001) return 'DATA';
  return s.performa >= num(target) - 1e-9 ? 'OK' : 'NO';
}

const penentu = (db, cplKode) => entriOf(db, cplKode).filter(e => e.w > 0);

// CPMK penentu milik mahasiswa yang nilainya di bawah nilai minimum MK (dimemo)
export function failedCpmk(db, mhs, cplKode) {
  const c = ctx(db), nim = T(mhs), key = nim + '\u0001' + T(cplKode), hit = c.memoF.get(key); if (hit) return hit;
  const mm = c.byMhs.get(nim), out = [];
  if (mm) for (const e of penentu(db, cplKode)) { const r = mm.get(e.k); if (hasNilai(r) && num(r.nilai) < minOf(db, e.m.mk) - 1e-9) out.push(e.m); }
  c.memoF.set(key, out); return out;
}

// Status 1 mahasiswa x 1 CPL: OK hanya bila rata-rata memenuhi target DAN tidak ada CPMK penentu di bawah minimum
export function cplStatus(db, mhs, c) {
  const x = ctx(db), key = T(mhs) + '\u0001' + T(c.kode), hit = x.memoQ.get(key); if (hit) return hit;
  const s = cplStats(db, mhs, c.kode), base = status(db, s, c.target), failed = base === 'DATA' ? [] : failedCpmk(db, mhs, c.kode);
  const r = { s, failed, st: base === 'OK' && failed.length ? 'NO' : base };
  x.memoQ.set(key, r); return r;
}

// Tingkat program untuk 1 CPL (rata-rata mhs data cukup + CPMK kohort lemah + ambang % mahasiswa)
export function programCpl(db, nims, c) {
  const t = num(c.target), cnt = { OK: 0, NO: 0, DATA: 0 }, perf = []; let tahan = 0;
  for (const n of nims) {
    const r = cplStatus(db, n, c); cnt[r.st]++;
    if (r.st !== 'DATA') perf.push(r.s.performa);
    if (r.st === 'NO' && r.failed.length && r.s.performa >= t - 1e-9) tahan++;
  }
  const himp = nims.length > 50 ? new Set(nims.map(T)) : null, x = ctx(db);
  const lemah = penentu(db, c.kode).filter(e => {
    const peta = x.byCp.get(e.k); if (!peta) return false; let sum = 0, k = 0;
    if (himp && peta.size < nims.length) { for (const [nim, r] of peta) if (himp.has(nim) && hasNilai(r)) { sum += num(r.nilai); k++; } }
    else for (const n of nims) { const r = peta.get(T(n)); if (hasNilai(r)) { sum += num(r.nilai); k++; } }
    return k && sum / k < minOf(db, e.m.mk) - 1e-9;
  }).map(e => e.m.mk + '/' + e.m.cpmk);
  const el = cnt.OK + cnt.NO, rata = perf.length ? perf.reduce((a, b) => a + b, 0) / perf.length : null;
  const r = { kode: c.kode, deskripsi: c.deskripsi, target: t, rata, elig: el, OK: cnt.OK, NO: cnt.NO, DATA: cnt.DATA, tahan, lemah,
    pct: el ? Math.round(cnt.OK / el * 100) : null, status: el === 0 ? 'DATA' : (rata >= t - 1e-9 && !lemah.length ? 'OK' : 'NO') };
  const m = ctx(db).minPctMhs;
  if (m > 0 && r.pct !== null && r.pct < m && r.status === 'OK') { r.status = 'NO'; r.pctRendah = true; }
  return r;
}
export const programAll = (db, nims) => db.cpl.map(c => programCpl(db, nims, c));

// Kesiapan Profil Lulusan: strict bila SEMUA CPL pembentuk berstatus OK (termasuk ambang CPMK)
export function plStats(db, mhs, pl) {
  let all = 0, taken = 0, sp = 0, sg = 0, strict = true, has = false, n = 0;
  for (const m of (ctx(db).byPl.get(T(pl)) || [])) {
    n++; const w = num(m.bobot), c = cplOf(db, m.cpl), s = cplStats(db, mhs, m.cpl);
    all += w; sg += s.progres * w;
    if (s.taken > 0) { has = true; taken += w; sp += s.performa * w; }
    if (!c || cplStatus(db, mhs, c).st !== 'OK') strict = false;
  }
  return { performa: taken > 0 ? sp / taken : 0, progres: all > 0 ? sg / all : 0, hasData: has, isStrictMet: n > 0 && has && strict };
}

// Nilai akhir transkrip MK (bobot CPMK; bila semua bobot 0 → rata-rata sama rata)
export function mkScore(db, mhs, mk) {
  const cps = cpmkOfMk(db, mk); let total = 0, tw = 0;
  for (const c of cps) { const w = bobotOf(db, mk, c.kode), n = nilaiOf(db, mhs, mk, c.kode); if (n && n.nilai !== undefined) total += num(n.nilai) * (w / 100); tw += w; }
  if (tw === 0 && cps.length) for (const c of cps) { const n = nilaiOf(db, mhs, mk, c.kode); total += num(n && n.nilai) * (1 / cps.length); }
  return total;
}

export const LABEL = { OK: 'Tercapai', NO: 'Belum tercapai', DATA: 'Belum cukup data' };
export default { num, T, hasNilai, aktOf, natural, semKey, sortSem, effective, invalidate, minProg, globalMin, minOf, nilaiOf, mappingsOf, cplOf, cpmkOfMk, bobotOf, cplStats, status, failedCpmk, cplStatus, programCpl, programAll, plStats, mkScore, LABEL };
