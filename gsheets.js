/*
 * Cadangan ke Google Sheets milik pengguna sendiri.
 * Izin yang diminta hanya "drive.file": aplikasi hanya bisa melihat file yang dibuatnya sendiri,
 * bukan isi Google Drive pengguna yang lain.
 */
(function (root) {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const MARK = { key: 'gasss', value: 'cadangan' };
  const TX_COLS = ['id', 'tanggal', 'jenis', 'nominal', 'kategori', 'dompet_id', 'dompet_tujuan_id',
    'keterangan', 'sumber', 'transkrip', 'dibuat'];
  const WALLET_COLS = ['id', 'nama', 'urutan', 'arsip', 'dibuat', 'warna', 'tujuan'];
  const GOAL_COLS = ['id', 'nama', 'emoji', 'tema', 'target', 'tenggat', 'mulai', 'awal', 'dompet_id', 'status', 'rincian', 'catatan', 'dibuat', 'tercapai'];
  const CAT_COLS = ['nama', 'jenis'];
  const TABS = ['Transaksi', 'Dompet', 'Kategori', 'Tujuan', 'Info'];

  /** Alamat izin Google (pengalihan halaman, cocok untuk aplikasi di layar utama iPhone). */
  function authUrl(o) {
    const q = new URLSearchParams({
      client_id: o.clientId, redirect_uri: o.redirect, response_type: 'token', scope: SCOPE,
      state: o.state, include_granted_scopes: 'true', prompt: o.consent ? 'consent' : '',
    });
    if (o.email) q.set('login_hint', o.email);
    if (!o.consent) q.delete('prompt');
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString();
  }

  async function call(token, url, opts) {
    let res;
    try {
      res = await fetch(url, { ...(opts || {}), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    } catch (e) {
      throw new Error('Tidak bisa terhubung ke Google. Periksa koneksi internet.');
    }
    if (res.status === 401) { const e = new Error('Izin Google Sheets sudah kedaluwarsa. Coba lagi.'); e.code = 'auth'; throw e; }
    if (res.status === 404) { const e = new Error('File cadangan tidak ditemukan.'); e.code = 'notfound'; throw e; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body.error && body.error.message || ('status ' + res.status);
      if (/has not been used|is disabled/i.test(msg)) throw new Error('Google Sheets API belum diaktifkan oleh pemilik aplikasi.');
      throw new Error('Google menolak permintaan: ' + msg);
    }
    return body;
  }

  const rows = (list, cols) => [cols].concat(list.map((o) => cols.map((c) => (c === 'nominal' || c === 'target' || c === 'awal' ? Number(o[c]) || 0 : c === 'rincian' ? JSON.stringify(o[c] || []) : (o[c] == null ? '' : String(o[c]))))));

  async function create(token, title) {
    const file = await call(token, DRIVE + '?fields=id', { method: 'POST', body: JSON.stringify({
      name: title, mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { [MARK.key]: MARK.value } }) });
    const meta = await call(token, SHEETS + '/' + file.id + '?fields=sheets.properties');
    const firstId = meta.sheets[0].properties.sheetId;
    await call(token, SHEETS + '/' + file.id + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests:
      TABS.map((t) => ({ addSheet: { properties: { title: t } } })).concat([{ deleteSheet: { sheetId: firstId } }]) }) });
    return file.id;
  }

  /** Tulis seluruh data ke spreadsheet cadangan (dibuat kalau belum ada). Mengembalikan { id, url }. */
  async function backup(token, snap, info, knownId) {
    let id = knownId;
    if (id) {
      try {
        // Spreadsheet lama mungkin belum punya lembar baru (mis. Tujuan): tambahkan dulu.
        const meta = await call(token, SHEETS + '/' + id + '?fields=sheets.properties.title');
        const ada = meta.sheets.map((x) => x.properties.title);
        const kurang = TABS.filter((t) => ada.indexOf(t) < 0);
        if (kurang.length) await call(token, SHEETS + '/' + id + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: kurang.map((t) => ({ addSheet: { properties: { title: t } } })) }) });
      } catch (e) { if (e.code === 'notfound') id = null; else throw e; }
    }
    if (!id) id = await create(token, 'Gasss - Cadangan' + (info.akun ? ' (' + info.akun + ')' : ''));
    await call(token, SHEETS + '/' + id + '/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: TABS }) });
    await call(token, SHEETS + '/' + id + '/values:batchUpdate', { method: 'POST', body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        { range: 'Transaksi!A1', values: rows(snap.transactions, TX_COLS) },
        { range: 'Dompet!A1', values: rows(snap.wallets, WALLET_COLS) },
        { range: 'Kategori!A1', values: rows(snap.categories, CAT_COLS) },
        { range: 'Tujuan!A1', values: rows(snap.goals || [], GOAL_COLS) },
        { range: 'Info!A1', values: [['aplikasi', 'Gasss'], ['format', 'cadangan-1'], ['dibuat', info.dibuat],
          ['akun', info.akun || ''], ['catatan', 'Jangan ubah nama lembar & kolom supaya cadangan ini bisa dipulihkan.']] },
      ],
    }) });
    return { id, url: 'https://docs.google.com/spreadsheets/d/' + id };
  }

  /** Cari spreadsheet cadangan terbaru yang dibuat aplikasi ini di akun pengguna. */
  async function findLatest(token) {
    const q = "appProperties has { key='" + MARK.key + "' and value='" + MARK.value + "' } and trashed=false";
    const res = await call(token, DRIVE + '?q=' + encodeURIComponent(q) + '&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id,name,modifiedTime)');
    return res.files && res.files[0] || null;
  }

  /** Baca isi cadangan menjadi { wallets, categories, transactions }. */
  async function read(token, id) {
    const res = await call(token, SHEETS + '/' + id + '/values:batchGet?ranges=Transaksi&ranges=Dompet&ranges=Kategori&ranges=Tujuan&valueRenderOption=UNFORMATTED_VALUE');
    const toObjects = (vr) => {
      const v = vr.values || [];
      const head = (v[0] || []).map(String);
      return v.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
    };
    const [tx, w, c, g] = res.valueRanges;
    const transactions = toObjects(tx).map((t) => ({ ...t, tanggal: String(t.tanggal), nominal: Number(t.nominal) || 0 }));
    const goals = toObjects(g || {}).map((x) => ({ ...x, tenggat: String(x.tenggat), mulai: String(x.mulai) }));
    return { transactions, wallets: toObjects(w), categories: toObjects(c), goals };
  }

  root.HBSheets = { authUrl, backup, findLatest, read };
})(this);
