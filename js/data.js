/* =====================================================================
 * data.js — Lapisan data OBE Tracker v4
 *   Api   : klien REST Apps Script (POST text/plain → bebas preflight CORS)
 *   Sesi  : token sesi HMAC + token Firebase (disimpan di localStorage)
 *   Fire  : pembaca Firestore REST memakai ID token (tanpa SDK → muat cepat)
 *   IDB   : cache IndexedDB → buka ulang aplikasi instan (stale-while-revalidate)
 *   Store : dokumen mentah → tabel turunan (database) + operasi optimistis
 *   Sync  : antrean simpan (gabung, kirim berkelompok, ulang otomatis, tahan tutup tab)
 *   Demo  : mode tanpa server (GAS_URL kosong) memakai data contoh
 * ===================================================================== */
import * as E from './engine.js';

const CFG = window.APP_CONFIG || {};
export const DEMO = !CFG.GAS_URL;
const SKEMA = 4;
const T = E.T;

// ---------- Event bus kecil ----------
const handlers = {};
export const Bus = {
  on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
  emit(ev, x) { (handlers[ev] || []).forEach(fn => { try { fn(x); } catch (e) { console.error(e); } }); }
};

// ---------- localStorage aman (private mode / kuota penuh tidak memecahkan aplikasi) ----------
export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};

// ---------- IndexedDB key-value ----------
export const IDB = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      try { const r = indexedDB.open('obe4', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
      catch (e) { rej(e); }
    }).catch(() => null);
    return this._db;
  },
  async tx(mode, fn) { const db = await this.open(); if (!db) return null; return new Promise(res => { try { const t = db.transaction('kv', mode), st = t.objectStore('kv'), r = fn(st); t.oncomplete = () => res(r && 'result' in r ? r.result : null); t.onerror = () => res(null); } catch (e) { res(null); } }); },
  get(k) { return this.tx('readonly', st => st.get(k)); },
  set(k, v) { return this.tx('readwrite', st => st.put(v, k)); },
  del(k) { return this.tx('readwrite', st => st.delete(k)); }
};

// ---------- Sesi ----------
const KS = 'obe4_sesi';
export const Sesi = {
  d: LS.get(KS, null),
  token() { return (this.d && this.d.token) || ''; },
  user() { return this.d && this.d.user; },
  valid() { return !!(this.d && this.d.token && this.d.user && this.d.exp > Date.now() + 60000); },
  set(d) { this.d = d; LS.set(KS, d); },
  patch(o) { this.d = Object.assign({}, this.d, o); LS.set(KS, this.d); },
  clear() { this.d = null; LS.del(KS); }
};

// ---------- Klien REST Apps Script ----------
const inflight = {};
export async function api(action, data = {}, opt = {}) {
  if (DEMO) return Demo.api(action, data);
  const timeout = opt.timeout || 30000, get = opt.method === 'GET';
  const k = get ? action : '';
  if (k && inflight[k]) return inflight[k]; // GET kembar menumpang permintaan yang sama
  const p = (async () => {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = get
        ? await fetch(CFG.GAS_URL + '?action=' + encodeURIComponent(action), { signal: ctl.signal })
        : await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: Sesi.token() }, data)), signal: ctl.signal });
      const j = await res.json();
      if (!j.ok && j.kode === 'SESI') Bus.emit('sesi-habis', j.pesan);
      return j;
    } catch (e) {
      return { ok: false, kode: 'JARINGAN', pesan: e.name === 'AbortError' ? 'Waktu tunggu server habis. Coba lagi.' : 'Tidak dapat terhubung ke server. Periksa koneksi internet.' };
    } finally { clearTimeout(to); }
  })();
  if (k) { inflight[k] = p; p.finally(() => delete inflight[k]); }
  return p;
}

/* =====================================================================
 *  Firestore REST (baca saja). ID token Firebase berumur 1 jam, diperbarui otomatis.
 * ===================================================================== */
function dec(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return decMap((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(dec);
  return null;
}
function decMap(f) { const o = {}; for (const k in f) o[k] = dec(f[k]); return o; }
const ms = iso => { const t = Date.parse(iso || ''); return isNaN(t) ? 0 : t; };

export const Fire = {
  async tukar(fb) {
    if (!fb || !fb.customToken) throw new Error('Token database tidak diterima dari server.');
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + encodeURIComponent(fb.apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: fb.customToken, returnSecureToken: true })
    });
    const j = await r.json().catch(() => ({}));
    if (!j.idToken) throw new Error('Login database gagal: ' + ((j.error && j.error.message) || r.status) + '. Periksa FIREBASE_WEB_API_KEY dan batasan API key (izinkan domain GitHub Pages).');
    Sesi.patch({ fb: { idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000, apiKey: fb.apiKey, projectId: fb.projectId } });
  },
  async segarkan() {
    const fb = Sesi.d && Sesi.d.fb;
    if (fb && fb.refreshToken) {
      try {
        const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(fb.apiKey), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fb.refreshToken) });
        const j = await r.json();
        if (j.id_token) { Sesi.patch({ fb: Object.assign({}, fb, { idToken: j.id_token, refreshToken: j.refresh_token || fb.refreshToken, exp: Date.now() + (+j.expires_in || 3600) * 1000 }) }); return; }
      } catch (e) { }
    }
    const r = await api('tokenFirebase'); // refresh token dicabut/kedaluwarsa → minta token baru ke Apps Script
    if (!r.ok) throw new Error(r.pesan || 'Sesi database berakhir.');
    await this.tukar(r.fb);
  },
  _seg: null,
  async idToken(paksa) {
    const fb = Sesi.d && Sesi.d.fb;
    if (!paksa && fb && fb.idToken && fb.exp > Date.now() + 120000) return fb.idToken;
    if (!this._seg) this._seg = this.segarkan().finally(() => { this._seg = null; });
    await this._seg;
    return Sesi.d.fb.idToken;
  },
  base() { return 'https://firestore.googleapis.com/v1/projects/' + Sesi.d.fb.projectId + '/databases/(default)/documents'; },
  async req(method, path, body, ulang = true) {
    const tok = await this.idToken();
    const r = await fetch(this.base() + path, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if ((r.status === 401 || r.status === 403) && ulang) {
      if (Sesi.d && Sesi.d.fb) Sesi.patch({ fb: Object.assign({}, Sesi.d.fb, { exp: 0, refreshToken: r.status === 403 ? '' : Sesi.d.fb.refreshToken }) });
      return this.req(method, path, body, false);
    }
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const m = (j.error && j.error.message) || (Array.isArray(j) && j[0] && j[0].error && j[0].error.message) || ('HTTP ' + r.status); throw new Error('Database: ' + m); }
    return j;
  },
  async batchGet(paths) {
    if (!paths.length) return {};
    const pid = Sesi.d.fb.projectId, nama = p => 'projects/' + pid + '/databases/(default)/documents/' + p;
    const j = await this.req('POST', ':batchGet', { documents: paths.map(nama) }) || [];
    const out = {}; paths.forEach(p => { out[p] = null; });
    j.forEach(x => { if (x.found) out[x.found.name.split('/documents/')[1]] = Object.assign(decMap(x.found.fields || {}), { __u: x.found.updateTime }); });
    return out;
  },
  async query(koleksi, opsi = {}) {
    const sq = { from: [{ collectionId: koleksi }] };
    if (opsi.since) sq.where = { fieldFilter: { field: { fieldPath: 'updatedAt' }, op: 'GREATER_THAN', value: { timestampValue: new Date(opsi.since).toISOString() } } };
    if (opsi.orderBy) sq.orderBy = [{ field: { fieldPath: opsi.orderBy }, direction: opsi.desc ? 'DESCENDING' : 'ASCENDING' }];
    if (opsi.limit) sq.limit = opsi.limit;
    const j = await this.req('POST', ':runQuery', { structuredQuery: sq }) || [];
    return j.filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), data: decMap(x.document.fields || {}) }));
  }
};

/* =====================================================================
 *  STORE — dokumen mentah (cermin Firestore) → tabel turunan "database"
 * ===================================================================== */
export const db = { settings: [{}], users: [], profilLulusan: [], cpl: [], mk: [], cpmk: [], mappingCpmk: [], mappingCplProfil: [], bobotCpmk: [], nilaiCpmk: [], semester: [], pesertaKelas: [], rtl: [], hist: [] };
const kosong = () => ({ pengaturan: {}, kurikulum: { profil: {}, cpl: {}, mk: {}, cpmk: {}, mapCpmk: {}, mapProfil: {}, bobot: {} }, rtl: { items: {} }, dirMhs: { m: {} }, dirDosen: { m: {} }, kelas: {}, rapor: null, since: 0 });
const kKelas = (sem, mk) => (sem || '') + '\u0001' + mk;
const SET_FIELDS = ['namaProdi', 'fakultas', 'kaprodi', 'logoUrl', 'minProgres', 'ambangCpmk', 'ambangMk', 'semesterAktif', 'minPctMhs'];
const RTL_FIELDS = ['temuan', 'cpl', 'tindakan', 'pic', 'tenggat', 'status', 'hasil', 'semester', 'dibuat'];
const canon = o => JSON.stringify(o, Object.keys(o).sort());

// Definisi tabel kecil: kunci & data → op server (diff otomatis)
const TBL = {
  profilLulusan: { t: () => 'profil', key: r => T(r.kode), data: r => ({ deskripsi: T(r.deskripsi) }) },
  cpl: { t: () => 'cpl', key: r => T(r.kode), data: r => ({ deskripsi: T(r.deskripsi), target: E.num(r.target) }) },
  mk: { t: () => 'mk', key: r => T(r.kode), data: r => ({ nama: T(r.nama), sks: Math.round(E.num(r.sks)), semester: Math.round(E.num(r.semester)) }) },
  cpmk: { t: () => 'cpmk', key: r => [T(r.mk), T(r.kode)], data: r => ({ deskripsi: T(r.deskripsi) }) },
  mappingCpmk: { t: () => 'mapCpmk', key: r => [T(r.mk), T(r.cpmk), T(r.cpl)], data: r => ({ bobot: E.num(r.bobot) }) },
  mappingCplProfil: { t: () => 'mapProfil', key: r => [T(r.cpl), T(r.profil)], data: r => ({ bobot: E.num(r.bobot) }) },
  bobotCpmk: { t: () => 'bobot', key: r => [T(r.mk), T(r.cpmk)], data: r => ({ bobot: E.num(r.bobot) }) },
  users: { t: r => r.role === 'dosen' ? 'dosen' : 'mhs', key: r => T(r.username), data: r => r.role === 'dosen' ? { name: T(r.name), mkDiampu: (r.mkDiampu || []).map(T) } : { name: T(r.name), angkatan: T(r.angkatan) } },
  rtl: { t: () => 'rtl', key: r => r.id, data: r => { const o = {}; RTL_FIELDS.forEach(f => { o[f] = T(r[f]); }); return o; } }
};

export const Store = {
  raw: kosong(), user: null, shadow: {}, view: 'ALL', siap: false,
  kunciCache() { return 'raw:' + (DEMO ? 'demo' : ((Sesi.d && Sesi.d.fb && Sesi.d.fb.projectId) || '')) + ':' + this.user.role + ':' + this.user.username; },
  staf() { return this.user && this.user.role !== 'mahasiswa'; },

  // ---------- turunan ----------
  turunMaster() {
    const R = this.raw, P = R.pengaturan || {}, K = R.kurikulum || {}, nat = E.natural, ent = o => Object.entries(o || {});
    const st = { id: 1 }; SET_FIELDS.forEach(f => { if (P[f] !== undefined && P[f] !== null) st[f] = P[f]; });
    db.settings = [st];
    db.semester = E.sortSem((P.semester || []).map(s => ({ kode: s.kode, nama: s.nama || s.kode })));
    db.profilLulusan = ent(K.profil).map(([kode, v]) => ({ kode, deskripsi: (v && v.deskripsi) || '' })).sort((a, b) => nat(a.kode, b.kode));
    db.cpl = ent(K.cpl).map(([kode, v]) => ({ kode, deskripsi: (v && v.deskripsi) || '', target: E.num(v && v.target) })).sort((a, b) => nat(a.kode, b.kode));
    db.mk = ent(K.mk).map(([kode, v]) => ({ kode, nama: (v && v.nama) || '', sks: E.num(v && v.sks), semester: E.num(v && v.semester) })).sort((a, b) => nat(a.kode, b.kode));
    const urutMk = new Map(db.mk.map((m, i) => [m.kode, i]));
    db.cpmk = []; ent(K.cpmk).forEach(([mk, cs]) => ent(cs).forEach(([kode, v]) => db.cpmk.push({ kode, mk, deskripsi: (v && v.deskripsi) || '' })));
    db.cpmk.sort((a, b) => ((urutMk.get(a.mk) ?? 1e9) - (urutMk.get(b.mk) ?? 1e9)) || nat(a.kode, b.kode));
    db.mappingCpmk = []; ent(K.mapCpmk).forEach(([mk, cs]) => ent(cs).forEach(([cpmk, ls]) => ent(ls).forEach(([cpl, b]) => db.mappingCpmk.push({ cpmk, mk, cpl, bobot: E.num(b) }))));
    db.mappingCplProfil = []; ent(K.mapProfil).forEach(([cpl, ps]) => ent(ps).forEach(([profil, b]) => db.mappingCplProfil.push({ cpl, profil, bobot: E.num(b) })));
    db.bobotCpmk = []; ent(K.bobot).forEach(([mk, cs]) => ent(cs).forEach(([cpmk, b]) => db.bobotCpmk.push({ mk, cpmk, bobot: E.num(b) })));
    if (this.staf()) {
      const mh = ent((R.dirMhs || {}).m).map(([u, v]) => ({ username: u, name: (v && v.n) || '', role: 'mahasiswa', angkatan: (v && v.a) || '' })).sort((a, b) => nat(a.username, b.username));
      const ds = ent((R.dirDosen || {}).m).map(([u, v]) => ({ username: u, name: (v && v.n) || '', role: 'dosen', angkatan: '', mkDiampu: (v && v.mk) || [] })).sort((a, b) => nat(a.username, b.username));
      db.users = ds.concat(mh);
    } else db.users = [Object.assign({}, this.user, { role: 'mahasiswa' })];
    db.rtl = ent((R.rtl || {}).items).map(([id, v]) => Object.assign({ id }, v)).sort((a, b) => String(b.dibuat || '').localeCompare(String(a.dibuat || '')));
    this.shadow = {}; Object.keys(TBL).forEach(t => { this.shadow[t] = this.peta(t, db[t]); });
    this.shadow.settings = JSON.stringify(db.settings[0]); this.shadow.semester = JSON.stringify(db.semester);
  },
  turunNilai() {
    const rows = [], peserta = [];
    if (this.staf()) {
      for (const d of Object.values(this.raw.kelas)) {
        if (!d || d.hapus) continue; const sem = d.semester || '', mk = d.mk;
        for (const [nim, cs] of Object.entries(d.nilai || {})) for (const [cpmk, v] of Object.entries(cs || {})) if (v !== null && v !== undefined) rows.push({ mhs: nim, mk, cpmk, nilai: v, semester: sem });
        (d.peserta || []).forEach(nim => peserta.push({ semester: sem, mk, nim }));
      }
    } else if (this.raw.rapor) {
      const nim = this.user.username;
      for (const [sem, mks] of Object.entries(this.raw.rapor.nilai || {})) for (const [mk, cs] of Object.entries(mks || {})) for (const [cpmk, v] of Object.entries(cs || {})) rows.push({ mhs: nim, mk, cpmk, nilai: v, semester: sem === 'LAMA' ? '' : sem });
      for (const [sem, mks] of Object.entries(this.raw.rapor.ambil || {})) for (const mk of Object.keys(mks || {})) peserta.push({ semester: sem, mk, nim });
    }
    db.hist = rows; db.pesertaKelas = peserta;
    db.nilaiEff = E.effective(rows);
    db.nilaiCpmk = this.view === 'ALL' ? db.nilaiEff : this.barisSemester(this.view);
  },
  turun() { this.turunMaster(); this.turunNilai(); E.invalidate(); },
  barisSemester(v) { return db.hist.filter(r => (v === 'LAMA' ? !r.semester : r.semester === v)); },
  // Tampilan semester khusus halaman Laporan (ALL = nilai terbaru)
  lihatSemester(v) { if (this.view === v) return; this.view = v || 'ALL'; db.nilaiCpmk = this.view === 'ALL' ? db.nilaiEff : this.barisSemester(this.view); E.invalidate(); },
  peta(t, rows) { const d = TBL[t], m = new Map(); (rows || []).forEach(r => { const k = d.key(r); m.set(JSON.stringify([d.t(r), k]), canon(d.data(r))); }); return m; },

  // ---------- muat ----------
  async muat(user, { cacheDulu } = {}) {
    this.user = user; this.view = 'ALL';
    if (DEMO) { this.raw = Demo.raw(); this.turun(); this.siap = true; return 'demo'; }
    if (cacheDulu) {
      const c = await IDB.get(this.kunciCache());
      if (c && c.v === SKEMA && c.raw) { this.raw = c.raw; this.turun(); this.siap = true; this.segarkan().catch(e => console.warn(e)); return 'cache'; }
    }
    this.raw = kosong();
    await this.ambilServer(true);
    this.turun(); this.siap = true; this.simpanCache();
    return 'server';
  },
  async ambilServer(penuh) {
    if (DEMO) { this.raw = Demo.raw(); return true; }
    const R = this.raw, before = JSON.stringify([R.pengaturan.__u, R.kurikulum.__u, R.rtl.__u, R.dirMhs.__u, R.dirDosen.__u, R.rapor && R.rapor.__u]);
    let berubah = false;
    if (this.staf()) {
      const paths = ['aplikasi/pengaturan', 'aplikasi/kurikulum', 'aplikasi/rtl', 'direktori/mahasiswa', 'direktori/dosen'];
      const [docs, kelas] = await Promise.all([Fire.batchGet(paths), Fire.query('kelas', penuh || !R.since ? {} : { since: R.since - 120000 })]);
      R.pengaturan = docs['aplikasi/pengaturan'] || {}; R.kurikulum = docs['aplikasi/kurikulum'] || kosong().kurikulum; R.rtl = docs['aplikasi/rtl'] || { items: {} };
      R.dirMhs = docs['direktori/mahasiswa'] || { m: {} }; R.dirDosen = docs['direktori/dosen'] || { m: {} };
      if (penuh || !R.since) R.kelas = {};
      for (const x of kelas) {
        const d = x.data, k = kKelas(d.semester, d.mk), lama = R.kelas[k];
        if (d.hapus) { if (lama) { delete R.kelas[k]; berubah = true; } }
        else if (!lama || lama.updatedAt !== d.updatedAt) { R.kelas[k] = d; berubah = true; }
        R.since = Math.max(R.since || 0, ms(d.updatedAt));
      }
    } else {
      const nim = this.user.username, rp = 'rapor/' + String(nim).replace(/\//g, '-');
      const docs = await Fire.batchGet(['aplikasi/pengaturan', 'aplikasi/kurikulum', rp]);
      R.pengaturan = docs['aplikasi/pengaturan'] || {}; R.kurikulum = docs['aplikasi/kurikulum'] || kosong().kurikulum; R.rapor = docs[rp] || { nilai: {}, ambil: {} };
    }
    const after = JSON.stringify([R.pengaturan.__u, R.kurikulum.__u, R.rtl.__u, R.dirMhs.__u, R.dirDosen.__u, R.rapor && R.rapor.__u]);
    return berubah || before !== after;
  },
  _seg: null, terakhir: 0,
  // Segarkan dari server (delta) lalu terapkan ulang perubahan yang belum terkirim
  async segarkan(penuh) {
    if (this._seg) return this._seg;
    this._seg = (async () => {
      const berubah = await this.ambilServer(!!penuh) || !!penuh;
      this.terakhir = Date.now();
      if (!berubah) return false;
      Sync.ops.forEach(op => terapkan(this.raw, op));
      this.turun(); this.simpanCache(); Bus.emit('data-baru');
      return true;
    })().finally(() => { this._seg = null; });
    return this._seg;
  },
  _tc: null,
  simpanCache() { clearTimeout(this._tc); this._tc = setTimeout(() => { if (this.user) IDB.set(this.kunciCache(), { v: SKEMA, at: Date.now(), raw: this.raw }); if (DEMO) Demo.simpan(this.raw); }, 600); },
  async lupakan() { if (this.user) await IDB.del(this.kunciCache()); this.raw = kosong(); this.user = null; this.siap = false; },

  // ---------- tulis (optimistis) ----------
  terapkanOps(ops) {
    if (!ops.length) return;
    ops.forEach(op => terapkan(this.raw, op));
    const hanyaNilai = ops.every(o => o.t === 'nilai' || o.t === 'peserta');
    if (hanyaNilai) { this.turunNilai(); E.invalidate(); } else this.turun();
    this.simpanCache(); Sync.dorong(ops);
  },
  // Diff tabel yang diubah UI → op server (dipanggil setelah UI mengubah db[tabel])
  simpan(tabel) {
    const ops = [];
    if (tabel === 'settings' || tabel === 'semester') {
      const cur = db.settings[0] || {}, old = JSON.parse(this.shadow.settings || '{}'), d = {};
      SET_FIELDS.forEach(f => { const a = cur[f] === undefined ? null : cur[f], b = old[f] === undefined ? null : old[f]; if (JSON.stringify(a) !== JSON.stringify(b)) d[f] = a; });
      if (JSON.stringify(db.semester) !== this.shadow.semester) d.semester = db.semester.map(s => ({ kode: s.kode, nama: s.nama || s.kode }));
      if (Object.keys(d).length) ops.push({ t: 'pengaturan', d });
    } else {
      const def = TBL[tabel], baru = this.peta(tabel, db[tabel]), lama = this.shadow[tabel] || new Map();
      const pw = new Map(); if (tabel === 'users') db.users.forEach(u => { if (u._pw !== undefined) { pw.set(JSON.stringify([def.t(u), def.key(u)]), u._pw); delete u._pw; } });
      lama.forEach((v, id) => { if (!baru.has(id)) { const [t, k] = JSON.parse(id); ops.push({ t, k, d: null }); } });
      baru.forEach((v, id) => { if (lama.get(id) !== v || pw.has(id)) { const [t, k] = JSON.parse(id), d = JSON.parse(v); if (pw.has(id)) d.pw = pw.get(id); ops.push({ t, k, d }); } });
      // Hapus berantai nilai bila MK/CPMK dihapus
      if (tabel === 'mk') lama.forEach((v, id) => { if (!baru.has(id)) ops.push({ t: 'hapusNilaiMk', k: [JSON.parse(id)[1], ''] }); });
      if (tabel === 'cpmk') lama.forEach((v, id) => { if (!baru.has(id)) { const k = JSON.parse(id)[1]; if (db.mk.some(m => m.kode === k[0])) ops.push({ t: 'hapusNilaiMk', k: [k[0], k[1]] }); } });
    }
    this.terapkanOps(ops);
    return ops.length;
  },
  semesterAktif() { return (db.settings[0] || {}).semesterAktif || ''; },
  // Ubah nilai efektif (mahasiswa, MK, CPMK): baru/ubah → semester aktif; kosong → hapus nilai pada semester yang sedang efektif
  _ie: null, _ieSrc: null,
  indeksEff() { if (this._ieSrc !== db.nilaiEff) { this._ie = new Map(db.nilaiEff.map(r => [T(r.mhs) + '\u0001' + T(r.mk) + '\u0001' + T(r.cpmk), r])); this._ieSrc = db.nilaiEff; } return this._ie; },
  nilaiEfektif(nim, mk, cpmk) { return this.indeksEff().get(T(nim) + '\u0001' + T(mk) + '\u0001' + T(cpmk)); },
  opsNilai(nim, mk, perubahan) {
    const sem = this.semesterAktif(), ops = [];
    for (const [cpmk, nilai] of Object.entries(perubahan)) {
      const old = this.nilaiEfektif(nim, mk, cpmk);
      if (nilai === null) { if (old) ops.push({ t: 'nilai', k: [old.semester || '', mk, nim, cpmk], v: null }); }
      else if (!old || E.num(old.nilai) !== nilai) ops.push({ t: 'nilai', k: [sem, mk, nim, cpmk], v: nilai });
    }
    return ops;
  },
  ubahNilai(nim, mk, perubahan) { const ops = this.opsNilai(nim, mk, perubahan); this.terapkanOps(ops); return ops.length; },
  aturPeserta(sem, mk, nims) { this.terapkanOps([{ t: 'peserta', k: [sem, mk], nims: [...new Set(nims)] }]); }
};

// Terapkan 1 op ke dokumen mentah (cermin semantik server Api.gs)
function terapkan(R, op) {
  const K = R.kurikulum = R.kurikulum || kosong().kurikulum;
  ['profil', 'cpl', 'mk', 'cpmk', 'mapCpmk', 'mapProfil', 'bobot'].forEach(f => { K[f] = K[f] || {}; });
  const k = op.k, d = op.d, del = (o, a) => { if (o) delete o[a]; };
  switch (op.t) {
    case 'pengaturan': Object.entries(d || {}).forEach(([f, v]) => { if (v === null) delete R.pengaturan[f]; else R.pengaturan[f] = v; }); break;
    case 'profil': if (d) K.profil[k] = d; else { del(K.profil, k); Object.values(K.mapProfil).forEach(m => del(m, k)); } break;
    case 'cpl': if (d) K.cpl[k] = d; else { del(K.cpl, k); del(K.mapProfil, k); Object.values(K.mapCpmk).forEach(cs => Object.values(cs || {}).forEach(ls => del(ls, k))); } break;
    case 'mk': if (d) K.mk[k] = d; else ['mk', 'cpmk', 'mapCpmk', 'bobot'].forEach(f => del(K[f], k)); break;
    case 'cpmk': if (d) (K.cpmk[k[0]] = K.cpmk[k[0]] || {})[k[1]] = d; else { del(K.cpmk[k[0]], k[1]); del(K.mapCpmk[k[0]], k[1]); del(K.bobot[k[0]], k[1]); } break;
    case 'mapCpmk': if (d) ((K.mapCpmk[k[0]] = K.mapCpmk[k[0]] || {})[k[1]] = K.mapCpmk[k[0]][k[1]] || {})[k[2]] = d.bobot; else if (K.mapCpmk[k[0]]) del(K.mapCpmk[k[0]][k[1]], k[2]); break;
    case 'mapProfil': if (d) (K.mapProfil[k[0]] = K.mapProfil[k[0]] || {})[k[1]] = d.bobot; else del(K.mapProfil[k[0]], k[1]); break;
    case 'bobot': if (d) (K.bobot[k[0]] = K.bobot[k[0]] || {})[k[1]] = d.bobot; else del(K.bobot[k[0]], k[1]); break;
    case 'mhs': R.dirMhs = R.dirMhs || { m: {} }; R.dirMhs.m = R.dirMhs.m || {}; if (d) R.dirMhs.m[k] = { n: d.name, a: d.angkatan || '' }; else del(R.dirMhs.m, k); break;
    case 'dosen': R.dirDosen = R.dirDosen || { m: {} }; R.dirDosen.m = R.dirDosen.m || {}; if (d) R.dirDosen.m[k] = { n: d.name, mk: d.mkDiampu || [] }; else del(R.dirDosen.m, k); break;
    case 'nilai': {
      const [sem, mk, nim, cpmk] = k, key = kKelas(sem, mk), doc = R.kelas[key] || (R.kelas[key] = { semester: sem, mk, peserta: [], nilai: {} });
      delete doc.hapus; doc.nilai = doc.nilai || {};
      if (op.v === null) { if (doc.nilai[nim]) { delete doc.nilai[nim][cpmk]; if (!Object.keys(doc.nilai[nim]).length) delete doc.nilai[nim]; } }
      else (doc.nilai[nim] = doc.nilai[nim] || {})[cpmk] = op.v;
      break;
    }
    case 'peserta': { const [sem, mk] = k, key = kKelas(sem, mk), doc = R.kelas[key] || (R.kelas[key] = { semester: sem, mk, peserta: [], nilai: {} }); delete doc.hapus; doc.peserta = op.nims.slice(); break; }
    case 'rtl': R.rtl = R.rtl || { items: {} }; R.rtl.items = R.rtl.items || {}; if (d) R.rtl.items[k] = d; else del(R.rtl.items, k); break;
    case 'hapusNilaiMk': Object.keys(R.kelas).forEach(key => { const doc = R.kelas[key]; if (!doc || doc.mk !== k[0]) return; if (k[1]) Object.values(doc.nilai || {}).forEach(cs => del(cs, k[1])); else delete R.kelas[key]; }); break;
  }
}

/* =====================================================================
 *  SYNC — antrean simpan optimistis
 * ===================================================================== */
export const Sync = {
  ops: [], kirim: null, timer: null, gagal: 0, kunci: '', status: 'diam',
  mulai(username) { this.kunci = 'obe4_antre_' + username; const s = LS.get(this.kunci, null); this.ops = (s && s.ops) || []; this.kirim = (s && s.kirim) || null; this.gagal = 0; this.lapor(); if (this.ops.length) this.jadwal(300); },
  simpanLokal() { if (this.kunci) LS.set(this.kunci, { ops: this.ops, kirim: this.kirim }); },
  idOp: op => op.t === 'pengaturan' ? 'pengaturan' : op.t + '|' + JSON.stringify(op.k),
  dorong(ops) {
    if (DEMO) { this.lapor(); return; }
    const mulai = this.kirim ? this.kirim.n : 0;
    ops.forEach(op => {
      const id = this.idOp(op);
      for (let i = this.ops.length - 1; i >= mulai; i--) {
        if (this.idOp(this.ops[i]) !== id) continue;
        if (op.t === 'pengaturan') op = { t: 'pengaturan', d: Object.assign({}, this.ops[i].d, op.d) };
        this.ops.splice(i, 1); break;
      }
      this.ops.push(op);
    });
    this.simpanLokal(); this.lapor(); this.jadwal(500);
  },
  jadwal(msTunda) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), msTunda); },
  _jalan: null,
  flush() {
    if (DEMO || this._jalan || !this.ops.length) return this._jalan || Promise.resolve();
    if (!navigator.onLine) { this.status = 'offline'; this.lapor(); this.jadwal(5000); return Promise.resolve(); }
    if (!this.kirim) this.kirim = { n: Math.min(this.ops.length, 1500), cid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
    this.simpanLokal(); this.status = 'kirim'; this.lapor();
    const batch = this.ops.slice(0, this.kirim.n), cid = this.kirim.cid;
    this._jalan = api('simpan', { ops: batch, cid }, { timeout: 150000 }).then(r => {
      if (r.ok) {
        this.ops.splice(0, batch.length); this.kirim = null; this.gagal = 0; this.status = 'diam';
        if (r.ditolak && r.ditolak.length) Bus.emit('ditolak', r.ditolak);
      } else if (r.kode === 'SESI') { this.status = 'sesi'; }
      else if (r.kode === 'IZIN') { this.ops.splice(0, batch.length); this.kirim = null; Bus.emit('ditolak', batch.map((op, i) => ({ i, t: op.t, k: op.k, alasan: r.pesan }))); this.status = 'diam'; }
      else { this.gagal++; this.status = 'gagal'; if (this.gagal === 2) Bus.emit('sync-gagal', r.pesan); }
      this.simpanLokal();
    }).finally(() => {
      this._jalan = null; this.lapor();
      if (this.ops.length && this.status !== 'sesi') this.jadwal(this.status === 'gagal' ? Math.min(60000, 2000 * Math.pow(2, this.gagal)) : 100);
    });
    return this._jalan;
  },
  // Tunggu sampai antrean kosong (dipakai sebelum logout); batas waktu default 20 detik
  async kuras(batas = 20000) {
    const t0 = Date.now();
    while ((this.ops.length || this._jalan) && Date.now() - t0 < batas && this.status !== 'sesi') {
      if (!this._jalan) this.flush(); await (this._jalan || new Promise(r => setTimeout(r, 300)));
      if (this.status === 'gagal') await new Promise(r => setTimeout(r, 800));
    }
    return !this.ops.length;
  },
  sibuk() { return this.ops.length > 0 || !!this._jalan; },
  lapor() { Bus.emit('sync', { n: this.ops.length, status: this.status, jalan: !!this._jalan }); },
  reset() { clearTimeout(this.timer); this.ops = []; this.kirim = null; this.gagal = 0; this.status = 'diam'; if (this.kunci) LS.del(this.kunci); this.kunci = ''; this.lapor(); }
};
window.addEventListener('online', () => { if (Sync.ops.length) Sync.jadwal(500); });

/* =====================================================================
 *  MODE DEMO — tanpa server (GAS_URL kosong): data contoh di browser
 * ===================================================================== */
export const Demo = {
  USERS: [
    { username: 'admin', name: 'Dr. Administrator', role: 'admin' },
    { username: '19800101', name: 'Dr. Dosen Pengampu', role: 'dosen', mkDiampu: ['MK001', 'MK002'] },
    { username: '2024001', name: 'Budi Mahasiswa', role: 'mahasiswa', angkatan: '2024' },
    { username: '211119', name: 'Andi Pradana', role: 'mahasiswa', angkatan: '2021' }
  ],
  awal() {
    const R = kosong();
    R.pengaturan = { namaProdi: 'S1 Pendidikan Administrasi Perkantoran', fakultas: 'Fakultas Ekonomika dan Bisnis', kaprodi: 'Ahmad Saroji, M.Pd.', logoUrl: '', minProgres: 100, ambangCpmk: 60, ambangMk: {}, minPctMhs: 0, semesterAktif: '2026/2027 Ganjil', semester: [{ kode: '2025/2026 Genap', nama: '2025/2026 Genap' }, { kode: '2026/2027 Ganjil', nama: '2026/2027 Ganjil' }] };
    R.kurikulum = {
      profil: { 'PL-01': { deskripsi: 'Pendidik/Instruktur di bidang Administrasi Perkantoran.' }, 'PL-02': { deskripsi: 'Praktisi Bisnis dan Perkantoran.' } },
      cpl: { 'CPL-01': { deskripsi: 'Mampu menerapkan etika profesi.', target: 70 }, 'CPL-02': { deskripsi: 'Mampu merancang sistem perangkat lunak.', target: 75 } },
      mk: { MK001: { nama: 'Pemrograman Web', sks: 3, semester: 3 }, MK002: { nama: 'Rekayasa Perangkat Lunak', sks: 4, semester: 4 } },
      cpmk: { MK001: { 'CPMK-1': { deskripsi: 'Mampu menjelaskan konsep arsitektur.' }, 'CPMK-2': { deskripsi: 'Mampu membangun aplikasi web interaktif.' } }, MK002: { 'CPMK-1': { deskripsi: 'Mampu menganalisis kebutuhan sistem.' } } },
      mapCpmk: { MK001: { 'CPMK-1': { 'CPL-01': 100 }, 'CPMK-2': { 'CPL-02': 100 } }, MK002: { 'CPMK-1': { 'CPL-01': 100 } } },
      mapProfil: { 'CPL-01': { 'PL-01': 100 }, 'CPL-02': { 'PL-02': 100 } },
      bobot: { MK001: { 'CPMK-1': 40, 'CPMK-2': 60 }, MK002: { 'CPMK-1': 100 } }
    };
    R.dirMhs.m = { '2024001': { n: 'Budi Mahasiswa', a: '2024' }, '211119': { n: 'Andi Pradana', a: '2021' } };
    R.dirDosen.m = { '19800101': { n: 'Dr. Dosen Pengampu', mk: ['MK001', 'MK002'] } };
    R.kelas[kKelas('', 'MK001')] = { semester: '', mk: 'MK001', peserta: [], nilai: { '2024001': { 'CPMK-1': 80, 'CPMK-2': 85 }, '211119': { 'CPMK-1': 70, 'CPMK-2': 75 } } };
    R.kelas[kKelas('2026/2027 Ganjil', 'MK002')] = { semester: '2026/2027 Ganjil', mk: 'MK002', peserta: ['2024001', '211119'], nilai: { '2024001': { 'CPMK-1': 78 } } };
    return R;
  },
  raw() {
    const R = LS.get('obe4_demo_raw', null) || this.awal(), u = Store.user;
    if (u && u.role === 'mahasiswa') { // proyeksi rapor seperti di server
      const rp = { nilai: {}, ambil: {} };
      Object.values(R.kelas).forEach(d => { const s = d.semester || 'LAMA'; const cs = (d.nilai || {})[u.username]; if (cs) (rp.nilai[s] = rp.nilai[s] || {})[d.mk] = Object.assign({}, cs); if ((d.peserta || []).includes(u.username) && d.semester) (rp.ambil[d.semester] = rp.ambil[d.semester] || {})[d.mk] = true; });
      return Object.assign(kosong(), { pengaturan: R.pengaturan, kurikulum: R.kurikulum, rapor: rp });
    }
    return JSON.parse(JSON.stringify(R));
  },
  simpan(R) { if (Store.user && Store.user.role !== 'mahasiswa') LS.set('obe4_demo_raw', R); },
  async api(action, data) {
    await new Promise(r => setTimeout(r, 120));
    if (action === 'publik') return { ok: true, branding: { namaProdi: 'S1 Pendidikan Administrasi Perkantoran', fakultas: 'Fakultas Ekonomika dan Bisnis', logoUrl: '' } };
    if (action === 'login') {
      const R = LS.get('obe4_demo_raw', null) || this.awal(), u = String(data.username || '').trim();
      const ada = u === 'admin' ? this.USERS[0] : (R.dirDosen.m[u] ? { username: u, name: R.dirDosen.m[u].n, role: 'dosen', mkDiampu: R.dirDosen.m[u].mk || [] } : R.dirMhs.m[u] ? { username: u, name: R.dirMhs.m[u].n, role: 'mahasiswa', angkatan: R.dirMhs.m[u].a } : null);
      if (!ada || data.password !== 'edudigital') return { ok: false, pesan: 'Username atau password salah! (Mode demo: password semua akun "edudigital")' };
      return { ok: true, token: 'demo', exp: Date.now() + 12 * 3600e3, user: Object.assign({ angkatan: '', mkDiampu: [] }, ada), fb: null, wajibGanti: false };
    }
    if (action === 'aiStatus') return { ok: true, ada: false, samaran: '', model: '', modelOtomatis: true };
    if (action === 'ai' || action === 'aiSimpan') return { ok: false, pesan: 'Fitur AI memerlukan server Apps Script (mode demo).' };
    if (action === 'ubahPassword' || action === 'resetPassword') return { ok: false, pesan: 'Mode demo: password tidak dapat diubah.' };
    return { ok: true };
  }
};
