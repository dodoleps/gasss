/*
 * Penyimpanan data di HP (IndexedDB browser; cadangan ke localStorage kalau IndexedDB tidak tersedia).
 * Setiap akun punya buku sendiri di HP yang sama. Semua perubahan langsung disimpan.
 */
(function (root) {
  const L = root.HBLogic;
  const DB_NAME = 'gasss', STORE = 'kv';
  const DEFAULT_CATS = [
    ['Makan & Minum', 'keluar'], ['Transportasi', 'keluar'], ['Belanja', 'keluar'], ['Tagihan', 'keluar'],
    ['Kesehatan', 'keluar'], ['Hiburan', 'keluar'], ['Keluarga', 'keluar'], ['Lainnya', 'keluar'],
    ['Gaji', 'masuk'], ['Bonus', 'masuk'], ['Lainnya', 'masuk'],
  ].map(([nama, jenis]) => ({ nama, jenis }));

  let idb = null, key = '', db = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function now() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function today() { return now().slice(0, 10); }
  function newId() {
    return (root.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)).slice(0, 12);
  }

  function fresh() {
    return { versi: 1, wallets: [{ id: L.UTAMA_ID, nama: 'Utama', urutan: '0', arsip: '', dibuat: now(), warna: '' }],
      categories: DEFAULT_CATS.map((c) => ({ ...c })), transactions: [], goals: [], meta: {} };
  }

  // ---------- IndexedDB kecil ----------
  function openIdb() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function rawGet(k) {
    if (!idb) {
      try { return Promise.resolve(JSON.parse(localStorage.getItem('gsdb:' + k))); } catch (e) { return Promise.resolve(null); }
    }
    return new Promise((resolve) => {
      const r = idb.transaction(STORE).objectStore(STORE).get(k);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  }
  function rawSet(k, v) {
    if (!idb) {
      try { localStorage.setItem('gsdb:' + k, JSON.stringify(v)); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
    }
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function persist() {
    try {
      await rawSet(key, db);
    } catch (e) {
      throw new Error('Gagal menyimpan di HP (memori penuh?). Segera simpan cadangan.');
    }
  }

  // ---------- Aksi (sama seperti server lama) ----------
  function add(txs) {
    const stamp = now();
    const saved = txs.map((t) => ({ ...L.cleanTx(t, today()), id: newId(), dibuat: stamp }));
    db.transactions.push(...saved);
    return saved;
  }
  const findWallet = (id) => {
    const w = db.wallets.find((x) => x.id === id);
    if (!w) throw new Error('Dompet tidak ditemukan');
    return w;
  };

  // ---------- Tujuan ----------
  const findGoal = (id) => {
    const g = db.goals.find((x) => x.id === id);
    if (!g) throw new Error('Tujuan tidak ditemukan');
    return g;
  };
  /** Periksa isian tujuan yang boleh diubah pengguna. */
  function checkGoal(g) {
    const nama = String(g.nama || '').trim().slice(0, 60);
    if (!nama) throw new Error('Nama tujuan masih kosong');
    const target = Math.round(Number(g.target)) || 0;
    if (!(target > 0)) throw new Error('Isi target nominalnya dulu');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.tenggat || '') || g.tenggat <= today()) throw new Error('Tenggat harus setelah hari ini');
    const rincian = (Array.isArray(g.rincian) ? g.rincian : []).map((r) => ({ nama: String(r.nama || '').trim().slice(0, 60),
      nominal: Math.round(Number(r.nominal)) || 0 })).filter((r) => r.nama && r.nominal > 0).slice(0, 20);
    return { nama, emoji: Array.from(String(g.emoji || '🎯')).slice(0, 4).join(''), target, tenggat: g.tenggat, rincian,
      catatan: String(g.catatan || '').slice(0, 300) };
  }
  /** Nama dompet tujuan = nama tujuan; ditambah " (tujuan)" kalau sudah dipakai dompet lain. */
  function walletNameFor(nama, selfId) {
    const taken = (n) => db.wallets.some((w) => !w.arsip && w.id !== selfId && w.nama.toLowerCase() === n.toLowerCase());
    let n = nama;
    for (let i = 2; taken(n); i++) n = nama + ' (tujuan' + (i > 2 ? ' ' + (i - 1) : '') + ')';
    return n;
  }
  function activate(goal, awal) {
    db.goals.forEach((g) => { if (g.status === 'aktif' && g.id !== goal.id) g.status = 'ide'; });
    let w = goal.dompet_id && db.wallets.find((x) => x.id === goal.dompet_id);
    if (!w) {
      w = { id: newId(), nama: walletNameFor(goal.nama), urutan: String(db.wallets.length), arsip: '', dibuat: now(), warna: '', tujuan: goal.id };
      db.wallets.push(w);
      goal.dompet_id = w.id;
    }
    w.arsip = '';
    if (awal > 0) add([{ jenis: 'masuk', nominal: awal, kategori: L.KATEGORI_SALDO_AWAL, dompet_id: w.id, keterangan: 'Tabungan awal untuk ' + goal.nama }]);
    // Garis "seharusnya" dimulai dari hari ini dan saldo dompet tujuan sekarang.
    goal.status = 'aktif';
    goal.mulai = today();
    goal.awal = Math.max(0, L.walletBalance(w.id, db.transactions));
    goal.tercapai = '';
  }
  function restoreGoal(g) {
    if (!g || !g.id || !g.nama) return null;
    let rincian = g.rincian;
    if (typeof rincian === 'string') { try { rincian = JSON.parse(rincian || '[]'); } catch (e) { rincian = []; } }
    return { id: String(g.id), nama: String(g.nama), emoji: String(g.emoji || '🎯'), target: Number(g.target) || 0,
      tenggat: String(g.tenggat || ''), mulai: String(g.mulai || today()), awal: Number(g.awal) || 0, dompet_id: String(g.dompet_id || ''),
      rincian: Array.isArray(rincian) ? rincian : [], catatan: String(g.catatan || ''),
      status: ['aktif', 'ide', 'tercapai'].indexOf(g.status) >= 0 ? g.status : 'ide', dibuat: String(g.dibuat || now()), tercapai: String(g.tercapai || '') };
  }

  const actions = {
    state: () => ({ wallets: db.wallets, categories: db.categories, transactions: db.transactions, goals: db.goals }),
    addTx: (req) => add([req.tx])[0],
    addTxs: (req) => add(req.txs),
    updateTx: (req) => {
      const i = db.transactions.findIndex((t) => t.id === req.tx.id);
      if (i < 0) throw new Error('Transaksi tidak ditemukan');
      const old = db.transactions[i];
      db.transactions[i] = { ...L.cleanTx({ ...req.tx, sumber: old.sumber, transkrip: old.transkrip }, today()),
        id: old.id, dibuat: old.dibuat };
      return db.transactions[i];
    },
    deleteTx: (req) => { db.transactions = db.transactions.filter((t) => t.id !== req.id); return req.id; },
    addWallet: (req) => {
      const nama = String(req.nama || '').trim();
      if (!nama) throw new Error('Nama dompet kosong');
      if (db.wallets.some((w) => !w.arsip && w.nama.toLowerCase() === nama.toLowerCase())) throw new Error('Dompet "' + nama + '" sudah ada');
      const w = { id: newId(), nama, urutan: String(db.wallets.length), arsip: '', dibuat: now(), warna: '' };
      db.wallets.push(w);
      return w;
    },
    renameWallet: (req) => {
      const nama = String(req.nama || '').trim();
      if (!nama) throw new Error('Nama dompet kosong');
      findWallet(req.id).nama = nama;
      return req.id;
    },
    setWalletColor: (req) => {
      const n = Number(req.warna);
      if (!(n >= 0 && n < 12 && n === Math.floor(n))) throw new Error('Warna tidak valid');
      findWallet(req.id).warna = String(n);
      return req.id;
    },
    deleteWallet: (req) => {
      if (req.id === L.UTAMA_ID) throw new Error('Dompet Utama tidak bisa dihapus');
      if (db.goals.some((g) => g.status === 'aktif' && g.dompet_id === req.id)) throw new Error('Ini dompet tujuan aktif. Ganti atau hapus tujuannya dulu.');
      findWallet(req.id).arsip = '1';
      return req.id;
    },
    addCategory: (req) => {
      const nama = String(req.nama || '').trim();
      if (!nama) throw new Error('Nama kategori kosong');
      if (req.jenis !== 'masuk' && req.jenis !== 'keluar') throw new Error('Jenis kategori tidak valid');
      if (db.categories.some((c) => c.jenis === req.jenis && c.nama.toLowerCase() === nama.toLowerCase())) throw new Error('Kategori sudah ada');
      db.categories.push({ nama, jenis: req.jenis });
      return { nama, jenis: req.jenis };
    },
    renameCategory: (req) => {
      const baru = String(req.baru || '').trim();
      if (!baru) throw new Error('Nama kategori kosong');
      const c = db.categories.find((x) => x.nama === req.lama && x.jenis === req.jenis);
      if (!c) throw new Error('Kategori tidak ditemukan');
      c.nama = baru;
      db.transactions.forEach((t) => { if (t.kategori === req.lama && t.jenis === req.jenis) t.kategori = baru; });
      return baru;
    },
    deleteCategory: (req) => {
      db.categories = db.categories.filter((c) => !(c.nama === req.nama && c.jenis === req.jenis));
      return req.nama;
    },
    /** Ganti seluruh isi buku (dipakai saat pulihkan cadangan / pindahan dari Google Sheets). */
    replaceAll: (req) => {
      const d = req.data;
      if (!d || !Array.isArray(d.wallets) || !Array.isArray(d.transactions)) throw new Error('Data cadangan tidak valid');
      const wallets = d.wallets.map((w, i) => ({ id: String(w.id), nama: String(w.nama), urutan: String(w.urutan ?? i),
        arsip: w.arsip ? '1' : '', dibuat: String(w.dibuat || now()), warna: w.warna === undefined || w.warna === null ? '' : String(w.warna),
        tujuan: w.tujuan ? String(w.tujuan) : '' }));
      if (!wallets.some((w) => w.id === L.UTAMA_ID)) wallets.unshift(fresh().wallets[0]);
      const categories = (d.categories && d.categories.length ? d.categories : DEFAULT_CATS)
        .filter((c) => c.nama && (c.jenis === 'masuk' || c.jenis === 'keluar')).map((c) => ({ nama: String(c.nama), jenis: c.jenis }));
      const transactions = [];
      d.transactions.forEach((t) => {
        try {
          transactions.push({ ...L.cleanTx(t, today()), id: String(t.id || newId()), dibuat: String(t.dibuat || now()) });
        } catch (e) { /* lewati baris rusak */ }
      });
      const goals = (Array.isArray(d.goals) ? d.goals : []).map(restoreGoal).filter(Boolean);
      let adaAktif = false;
      goals.forEach((g) => { if (g.status === 'aktif') { if (adaAktif) g.status = 'ide'; adaAktif = true; } });
      db = { versi: 1, wallets, categories, transactions, goals, meta: db.meta || {} };
      return { transaksi: transactions.length, dompet: wallets.length };
    },
    /**
     * Mulai pencatatan baru: semua transaksi dihapus, dompet & kategori tetap.
     * mode 'bawa' = sisa uang tiap dompet dicatat sebagai "Saldo awal"; mode 'nol' = semua saldo jadi 0.
     */
    resetBook: (req) => {
      const tanggal = today();
      const opening = req.mode === 'bawa' ? L.openingBalances(db.wallets, db.transactions, tanggal) : [];
      const dihapus = db.transactions.length;
      db.transactions = [];
      add(opening);
      return { dihapus, dibawa: opening.reduce((s, t) => s + t.nominal, 0) };
    },
    // ---------- Tujuan ----------
    /** Buat tujuan. aktif = jadikan tujuan aktif (dibuatkan dompet tujuan); kalau tidak, disimpan sebagai ide. */
    createGoal: (req) => {
      const g = checkGoal(req.goal || {});
      const goal = { id: newId(), ...g, mulai: today(), awal: 0, dompet_id: '', status: 'ide', dibuat: now(), tercapai: '' };
      db.goals.push(goal);
      if (req.aktif) activate(goal, Math.max(0, Math.round(Number(req.awal)) || 0));
      return goal;
    },
    updateGoal: (req) => {
      const goal = findGoal(req.goal && req.goal.id);
      const g = checkGoal({ ...goal, ...req.goal });
      if (goal.dompet_id && g.nama !== goal.nama) {
        const w = db.wallets.find((x) => x.id === goal.dompet_id);
        if (w && !w.arsip) w.nama = walletNameFor(g.nama, w.id);
      }
      Object.assign(goal, g);
      return goal;
    },
    /** Jadikan tujuan aktif; tujuan aktif sebelumnya kembali menjadi ide (dompet & uangnya tetap). */
    activateGoal: (req) => { const goal = findGoal(req.id); activate(goal, 0); return goal; },
    achieveGoal: (req) => {
      const goal = findGoal(req.id);
      goal.status = 'tercapai';
      goal.tercapai = today();
      return goal;
    },
    deleteGoal: (req) => {
      const goal = findGoal(req.id);
      if (goal.dompet_id) {
        const saldo = L.walletBalance(goal.dompet_id, db.transactions);
        if (saldo !== 0) throw new Error('Dompet tujuan ini masih berisi Rp' + saldo.toLocaleString('id-ID') + '. Pindahkan dulu uangnya.');
        const w = db.wallets.find((x) => x.id === goal.dompet_id);
        if (w) w.arsip = '1';
      }
      db.goals = db.goals.filter((x) => x.id !== goal.id);
      return req.id;
    },
    getMeta: (req) => (db.meta || {})[req.key],
    setMeta: (req) => { db.meta = db.meta || {}; db.meta[req.key] = req.value; return req.value; },
  };
  const READ_ONLY = { state: 1, getMeta: 1 };

  root.HBStore = {
    /** Buka buku milik akun tertentu (mis. email). Data mode demo lama ikut dipindahkan. */
    async open(account) {
      idb = idb || await openIdb();
      key = 'db:' + (account || 'demo');
      db = await rawGet(key);
      if (!db) db = fresh();
      db.meta = db.meta || {};
      db.goals = db.goals || [];
      await persist();
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* abaikan */ }
    },
    async call(action, req) {
      if (!db) throw new Error('Data belum siap');
      const fn = actions[action];
      if (!fn) throw new Error('Aksi tidak dikenal: ' + action);
      const data = fn(req || {});
      if (!READ_ONLY[action]) await persist();
      return JSON.parse(JSON.stringify(data === undefined ? null : data));
    },
    /** Salinan lengkap untuk cadangan. */
    snapshot() { return JSON.parse(JSON.stringify(db)); },
    /** Sidik jari isi buku (dompet, kategori, transaksi) untuk mengecek apakah ada perubahan sejak cadangan. */
    signature() {
      const s = JSON.stringify([db.wallets, db.categories, db.transactions]);
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return s.length + ':' + h.toString(16);
    },
    async reset() { db = fresh(); await persist(); },
  };
})(this);
