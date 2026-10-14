/* gasss — tampilan & interaksi aplikasi. */
(function () {
  const L = window.HBLogic;
  const API_URL = (window.HB_CONFIG && window.HB_CONFIG.API_URL || '').trim();
  const DEMO = !API_URL;
  const CLIENT_ID = (window.HB_CONFIG && window.HB_CONFIG.GOOGLE_CLIENT_ID || '').trim();
  const SESSION_KEY = 'gs_session';   // { token, email, nama, owner }
  const LOGIN_KEY = 'gs_login';       // { state, nonce } selama proses login Google
  const MAX_REC_SEC = 60;
  const BACKUP_AFTER_MS = 9000; // jalur cadangan dikirim kalau 9 detik belum ada jawaban

  const S = { wallets: [], categories: [], transactions: [], goals: [], newIds: new Set(), transkrip: '',
    tab: 'home', reportMonth: thisMonth(), filter: { q: '', month: thisMonth(), wallet: '', cat: '' } };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = (n) => (n < 0 ? '-' : '') + 'Rp' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  const secs = (ms) => (ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' dtk';
  const digits = (s) => Number(String(s).replace(/\D/g, '')) || 0;

  function thisMonth() { return todayStr().slice(0, 7); }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function monthShort(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
  }
  function fmtMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }
  function fmtDay(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    if (ymd === todayStr()) return 'Hari ini';
    const kemarin = new Date(); kemarin.setDate(kemarin.getDate() - 1);
    const dt = new Date(y, m - 1, d);
    if (dt.toDateString() === kemarin.toDateString()) return 'Kemarin';
    return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // ---------- Komunikasi dengan server ----------

  /** Aksi yang dikirim ke server. Semua aksi lain (data) disimpan di HP lewat HBStore. */
  const SERVER_ACTIONS = { login: 1, parse: 1, plan: 1, legacyState: 1, feedback: 1, stats: 1, me: 1 };
  // Server lama (Google Apps Script) memakai satu alamat + nama aksi di isi permintaan;
  // server baru (Cloudflare Worker) memakai alamat per aksi, mis. https://…workers.dev/parse
  const LEGACY_SERVER = /script\.google\.com/.test(API_URL);

  async function api(action, req) {
    if (!SERVER_ACTIONS[action]) return window.HBStore.call(action, req);
    if (DEMO) throw new Error('Mode demo: fitur ini butuh server.');
    let res;
    try {
      res = await fetch(LEGACY_SERVER ? API_URL : API_URL.replace(/\/+$/, '') + '/' + action, {
        method: 'POST',
        // text/plain supaya tidak memicu pemeriksaan CORS tambahan dari Apps Script
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: session() ? session().token : '', ...(req || {}) }),
      });
    } catch (e) {
      throw new Error('Tidak bisa terhubung. Periksa koneksi internet.');
    }
    let body;
    try { body = await res.json(); } catch (e) { throw new Error('Jawaban server tidak terbaca (' + res.status + ').'); }
    if (!body.ok) {
      const err = new Error(body.error || 'Terjadi kesalahan');
      err.code = body.code;
      if (body.code === 'auth' && action !== 'login') logout(body.error);
      throw err;
    }
    return body.data;
  }

  async function refresh(silent) {
    try {
      const st = await api('state');
      S.wallets = st.wallets;
      S.categories = st.categories;
      S.transactions = st.transactions;
      S.goals = st.goals || [];
      render();
      maybeCelebrate();
    } catch (e) {
      if (!silent) toast(e.message);
    }
  }

  // ---------- Toast ----------

  let toastTimer;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 3000);
  }

  // ---------- Data turunan ----------

  const activeWallets = () => S.wallets.filter((w) => !w.arsip)
    .sort((a, b) => (a.id === L.UTAMA_ID ? -1 : b.id === L.UTAMA_ID ? 1 : Number(a.urutan) - Number(b.urutan)));
  const walletName = (id) => (S.wallets.find((w) => w.id === id) || { nama: '(dompet terhapus)' }).nama;
  const catsOf = (jenis) => S.categories.filter((c) => c.jenis === jenis);
  const ICON = { 'Makan & Minum': '🍜', Transportasi: '🛵', Belanja: '🛍️', Tagihan: '🧾', Kesehatan: '💊',
    Hiburan: '🎬', Keluarga: '👨‍👩‍👧', Gaji: '💼', Bonus: '🎁', 'Pindah dana': '🔁', 'Saldo awal': '🏁' };

  /** Warna pastel tiap dompet: tetap sama selama dompet ada (berdasarkan urutan dibuat). */
  const WALLET_COLORS = 8;   // warna otomatis bergilir di 8 warna pertama
  const PICK_COLORS = 12;    // pilihan warna yang bisa dipilih sendiri
  const COLOR_NAMES = ['Mint', 'Peach', 'Lavender', 'Biru langit', 'Kuning', 'Pink', 'Sage', 'Aqua',
    'Periwinkle', 'Aprikot', 'Ungu muda', 'Abu biru'];
  function walletColorIndex(id) {
    const w = S.wallets.find((x) => x.id === id);
    if (!w) return 0;
    if (w.warna !== undefined && w.warna !== '') return Number(w.warna) % PICK_COLORS;
    return (Number(w.urutan) || 0) % WALLET_COLORS;
  }
  function walletColor(id) { return 'wc-' + walletColorIndex(id); }
  function walletEmoji(nama) {
    const n = String(nama).toLowerCase();
    const rules = [[/utama|harian|dompet/, '💳'], [/makan|jajan|kopi|food|dapur/, '🍜'], [/bensin|motor|mobil|transport|ojek|bbm/, '⛽'],
      [/tabung|nabung|saving|invest/, '🐷'], [/darurat|cadangan/, '🛟'], [/belanja|bulanan|groceries/, '🛒'],
      [/tagihan|listrik|air|internet|pulsa|cicilan|kos|sewa/, '🧾'], [/sekolah|kuliah|pendidikan|anak|spp/, '🎓'],
      [/liburan|jalan|travel|hiburan|nonton/, '🏖️'], [/sehat|obat|dokter/, '💊'], [/zakat|sedekah|amal|infak/, '🤲'],
      [/hadiah|kado|arisan/, '🎁'], [/rumah|renov/, '🏠'], [/pet|kucing|anjing/, '🐾']];
    const hit = rules.find(([re]) => re.test(n));
    return hit ? hit[1] : '👛';
  }

  function computed() { return L.computeWallets(S.wallets, S.transactions); }

  // ---------- Render ----------

  function render() {
    const cw = computed();
    const aktif = cw.filter((w) => !w.arsip);
    $('total-saldo').textContent = rp(aktif.reduce((s, w) => s + w.saldo, 0));
    $('total-saldo').parentNode.classList.toggle('compact', !!activeGoal());
    const m = renderMood();
    const me = DEMO ? null : session();
    const first = me && (me.nama || me.email || '').split(/[\s@]/)[0];
    $('hello').textContent = greeting(m.zona, first);
    renderHome(cw);
    if (S.tab === 'history') renderHistory();
    if (S.tab === 'report') renderReport();
    if (S.tab === 'settings') renderSettings(cw);
  }

  function statsHtml(sum) {
    return '<div class="stat"><div class="stat-label">Masuk</div><div class="stat-value c-in">' + rp(sum.masuk) + '</div></div>' +
      '<div class="stat"><div class="stat-label">Keluar</div><div class="stat-value c-out">' + rp(sum.keluar) + '</div></div>' +
      '<div class="stat"><div class="stat-label">Selisih</div><div class="stat-value">' + rp(sum.selisih) + '</div></div>';
  }

  function renderHome(cw) {
    renderBackupBanner();
    renderGoalHome();
    const byId = Object.fromEntries(cw.map((w) => [w.id, w]));
    $('wallet-grid').innerHTML = activeWallets().map((w0) => {
      const w = byId[w0.id];
      const note = { menipis: 'Hampir habis', habis: w.saldo < 0 ? 'Minus' : 'Habis', kosong: '', aman: '' }[w.status];
      return '<button class="wallet ' + walletColor(w.id) + '" data-status="' + w.status + '" data-wallet="' + esc(w.id) + '">' +
        '<div class="wallet-top"><span class="wallet-emoji">' + wEmoji(w) + '</span>' +
        (note ? '<span class="badge">' + note + '</span>' : '') +
        '<span class="wallet-edit" role="button" tabindex="0" aria-label="Ubah dompet ' + esc(w.nama) + '" data-edit-wallet="' + esc(w.id) + '">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span></div>' +
        '<div class="wallet-name">' + esc(w.nama) + '</div>' +
        '<div class="wallet-saldo">' + rp(w.saldo) + '</div>' +
        '<div class="bar"><i style="width:' + Math.round(w.persen * 100) + '%"></i></div></button>';
    }).join('');

    const recent = S.transactions.slice().sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat))).slice(0, 6);
    $('recent-head').hidden = !recent.length;
    $('home-hint').hidden = !!recent.length && !S.newIds.size;
    $('recent').innerHTML = (S.transkrip ? '<div class="transcript">“' + esc(S.transkrip) + '”</div>' : '') +
      recent.map(txHtml).join('');
  }

  function txHtml(t) {
    let sub, amt, cls;
    if (t.jenis === 'pindah') {
      sub = walletName(t.dompet_id) + ' → ' + walletName(t.dompet_tujuan_id);
      if (!t.keterangan) t = { ...t, keterangan: 'Isi ' + walletName(t.dompet_tujuan_id) };
      amt = rp(t.nominal); cls = 'c-move';
    } else {
      const wn = walletName(t.dompet_id);
      sub = wn === t.kategori ? t.kategori : t.kategori + ' · ' + wn;
      amt = (t.jenis === 'masuk' ? '+' : '-') + rp(t.nominal); cls = t.jenis === 'masuk' ? 'c-in' : 'c-out';
    }
    if (S.tab === 'home' && t.tanggal !== todayStr()) sub += ' · ' + shortDay(t.tanggal);
    return '<button class="tx' + (S.newIds.has(t.id) ? ' new' : '') + '" data-tx="' + esc(t.id) + '">' +
      '<span class="tx-icon ' + walletColor(t.jenis === 'pindah' ? t.dompet_tujuan_id : t.dompet_id) + '">' +
        (ICON[t.kategori] || (t.jenis === 'masuk' ? '💰' : '💸')) + '</span>' +
      '<span class="tx-main"><div class="tx-title">' + esc(t.keterangan || t.kategori) + '</div>' +
      '<div class="tx-sub">' + esc(sub) + '</div></span>' +
      '<span class="tx-amt ' + cls + '">' + amt + '</span></button>';
  }

  /** "Kemarin" atau "1 Okt" (untuk daftar singkat di Beranda). */
  function shortDay(ymd) {
    const d = fmtDay(ymd);
    if (d === 'Kemarin') return d;
    const [y, m, dd] = ymd.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  function renderHistory() {
    const f = S.filter;
    const months = Array.from(new Set(S.transactions.map((t) => L.monthOf(t.tanggal)).concat([thisMonth()]))).sort().reverse();
    $('f-month').innerHTML = '<option value="">Semua bulan</option>' +
      months.map((m) => '<option value="' + m + '"' + (m === f.month ? ' selected' : '') + '>' + monthShort(m) + '</option>').join('');
    $('f-wallet').innerHTML = '<option value="">Dompet</option>' +
      S.wallets.map((w) => '<option value="' + esc(w.id) + '"' + (w.id === f.wallet ? ' selected' : '') + '>' +
        esc(w.nama) + (w.arsip ? ' (dihapus)' : '') + '</option>').join('');
    const catNames = Array.from(new Set(S.categories.map((c) => c.nama).concat(['Pindah dana'])));
    $('f-cat').innerHTML = '<option value="">Kategori</option>' +
      catNames.map((c) => '<option' + (c === f.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('');

    const q = f.q.trim().toLowerCase();
    const list = L.sortTx(S.transactions).reverse().filter((t) =>
      (!f.month || L.monthOf(t.tanggal) === f.month) &&
      (!f.wallet || t.dompet_id === f.wallet || t.dompet_tujuan_id === f.wallet) &&
      (!f.cat || t.kategori === f.cat) &&
      (!q || (t.keterangan + ' ' + t.kategori + ' ' + t.transkrip + ' ' + t.nominal).toLowerCase().indexOf(q) >= 0));

    if (!list.length) { $('history-list').innerHTML = '<div class="empty">Belum ada transaksi.</div>'; return; }
    let html = '', day = '';
    list.forEach((t) => {
      if (t.tanggal !== day) {
        day = t.tanggal;
        const keluar = list.filter((x) => x.tanggal === day && x.jenis === 'keluar').reduce((s, x) => s + x.nominal, 0);
        html += '<div class="day-head"><span>' + fmtDay(day) + '</span><span>' + (keluar ? '-' + rp(keluar) : '') + '</span></div>';
      }
      html += txHtml(t);
    });
    $('history-list').innerHTML = html;
  }

  // ---------- Grafik posisi kas ----------

  const ZONE_ICON = { hijau: '☁️', kuning: '😎', oranye: '👀', merah: '🆘' };
  /** Warna tegas tiap zona untuk garis grafik (hijau di atas -> merah di bawah). */
  const ZONE_HEX = { hijau: '#22c55e', kuning: '#eab308', oranye: '#f97316', merah: '#ef4444' };
  const pct = (p) => Math.round(p * 100) + '%';
  /** Kalimat Gen Z untuk zona; berganti per hari, bisa digeser dengan mengetuk judul. */
  const zoneText = (p, seed) => { const z = L.cashZone(p); return { zona: z, icon: ZONE_ICON[z], label: L.cashLine(z, (seed || 0) + (S.lineShift || 0)) }; };
  /** Kurva halus melalui titik-titik [x, y]. */
  const smoothPath = (pts) => pts.map((p, i) => {
    if (!i) return 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    const a = pts[i - 1], t = (p[0] - a[0]) / 2;
    return 'C' + (a[0] + t).toFixed(1) + ' ' + a[1].toFixed(1) + ',' + (p[0] - t).toFixed(1) + ' ' + p[1].toFixed(1) + ',' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
  }).join(' ');

  /** Data posisi kas bulan laporan: titik harian yang sudah punya data. */
  function cashData(m) {
    const cp = L.cashPosition(S.transactions, m, m === thisMonth() ? todayStr() : null);
    const pts = m > thisMonth() ? [] : cp.days.map((d, i) => ({ ...d, i, d: i + 1 })).filter((d) => d.persen !== null);
    const [yy, mm] = m.split('-').map(Number);
    return { pts, daysInMonth: new Date(yy, mm, 0).getDate() };
  }

  function renderCash() {
    const m = S.reportMonth;
    const box = $('r-cash'), head = $('r-cash-head'), tip = $('r-cash-tip');
    tip.hidden = true;
    const { pts, daysInMonth } = cashData(m);
    $('btn-share-cash').hidden = !pts.length;
    if (!pts.length) {
      head.innerHTML = '';
      box.innerHTML = '<div class="empty">Belum ada pemasukan atau saldo di bulan ini.</div>';
      return;
    }
    const last = pts[pts.length - 1];
    const drawHead = () => {
      const z = zoneText(last.persen, last.d);
      head.innerHTML = '<span class="cash-big" style="color:' + ZONE_HEX[z.zona] + '">' + pct(last.persen) + '</span>' +
        '<button type="button" class="cash-line-btn" id="cash-line-next" aria-label="Ganti kalimat"><b>' + z.icon + ' ' + esc(z.label) + '</b><small>' +
        (m === thisMonth() ? 'Hari ini' : 'Akhir bulan') + ' · saldo ' + rp(last.saldo) + ' 🔄</small></button>';
      $('cash-line-next').onclick = () => { S.lineShift = (S.lineShift || 0) + 1; drawHead(); };
    };
    drawHead();

    const W = 340, H = 200, L0 = 32, R0 = 10, T0 = 12, B0 = 22, pw = W - L0 - R0, ph = H - T0 - B0;
    const x = (d) => L0 + (daysInMonth > 1 ? (d - 1) / (daysInMonth - 1) : 0) * pw;
    const y = (p) => T0 + (1 - p) * ph;
    const xy = pts.map((d) => [x(d.d), y(d.persen)]);
    const line = smoothPath(xy);
    const lx = xy[xy.length - 1];
    const stops = [[0, 'hijau'], [0.25, 'hijau'], [0.4, 'kuning'], [0.62, 'oranye'], [1, 'merah']]
      .map(([o, z]) => '<stop offset="' + o + '" stop-color="' + ZONE_HEX[z] + '"/>').join('');
    const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => '<line class="cash-grid" x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + y(p) + '" y2="' + y(p) + '"' +
      (p > 0 && p < 1 ? ' stroke-dasharray="3 4"' : '') + '/><text class="axis" x="' + (L0 - 6) + '" y="' + (y(p) + 3.5) + '" text-anchor="end">' + pct(p) + '</text>').join('');
    const ticksX = [1, 8, 15, 22, daysInMonth].map((d) => '<text class="axis" x="' + x(d) + '" y="' + (H - 6) + '" text-anchor="middle">' + d + '</text>').join('');
    const lastHex = ZONE_HEX[L.cashZone(last.persen)];
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik posisi kas ' + esc(fmtMonth(m)) + ', terakhir ' + pct(last.persen) + '">' +
      '<defs><linearGradient id="cash-zone" gradientUnits="userSpaceOnUse" x1="0" y1="' + y(1) + '" x2="0" y2="' + y(0) + '">' + stops + '</linearGradient>' +
      '<linearGradient id="cash-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="cash-mask"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#cash-fade)"/></mask></defs>' +
      grid + ticksX +
      '<path d="' + line + ' L' + lx[0].toFixed(1) + ' ' + y(0) + ' L' + xy[0][0].toFixed(1) + ' ' + y(0) + ' Z" fill="url(#cash-zone)" mask="url(#cash-mask)"/>' +
      '<path class="cash-curve" d="' + line + '" fill="none" stroke="url(#cash-zone)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      (lx[0] < x(daysInMonth) - 1 ? '<line class="cash-rest" x1="' + lx[0] + '" x2="' + x(daysInMonth) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>' : '') +
      '<line class="cross" id="cash-cross" x1="0" x2="0" y1="' + T0 + '" y2="' + (T0 + ph) + '" visibility="hidden"/>' +
      '<circle id="cash-halo" r="11" cx="' + lx[0] + '" cy="' + lx[1] + '" fill="' + lastHex + '" opacity=".18"/>' +
      '<circle class="cash-dot" id="cash-dot" r="5" cx="' + lx[0] + '" cy="' + lx[1] + '" fill="' + lastHex + '"/>' +
      '<rect id="cash-hit" x="' + L0 + '" y="0" width="' + pw + '" height="' + (H - B0) + '" fill="transparent"/></svg>';
    const curve = box.querySelector('.cash-curve');
    curve.style.setProperty('--len', Math.ceil(curve.getTotalLength()));

    // Ketuk / geser di grafik untuk melihat rincian hari itu.
    const svg = box.querySelector('svg'), hit = box.querySelector('#cash-hit'), cross = box.querySelector('#cash-cross');
    const dot = box.querySelector('#cash-dot'), halo = box.querySelector('#cash-halo');
    const place = (cx, cy, hex) => { [dot, halo].forEach((c) => { c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('fill', hex); }); };
    const show = (ev) => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * W;
      let best = pts[0];
      pts.forEach((d) => { if (Math.abs(x(d.d) - sx) < Math.abs(x(best.d) - sx)) best = d; });
      const bx = x(best.d), by = y(best.persen), bz = zoneText(best.persen, best.d);
      cross.setAttribute('x1', bx); cross.setAttribute('x2', bx); cross.setAttribute('visibility', 'visible');
      place(bx, by, ZONE_HEX[bz.zona]);
      tip.replaceChildren();
      const add = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; tip.appendChild(e); };
      add('strong', bz.icon + ' ' + pct(best.persen) + ' · ' + fmtDay(best.tanggal));
      add('div', bz.label, 'tip-zone');
      add('div', 'Saldo ' + rp(best.saldo) + ' · keluar ' + rpShort(best.keluar) + (best.masuk ? ' · masuk ' + rpShort(best.masuk) : ''));
      tip.hidden = false;
      const cr = box.parentNode.getBoundingClientRect();
      const left = r.left - cr.left + bx / W * r.width;
      tip.style.left = Math.min(Math.max(left - tip.offsetWidth / 2, 4), cr.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = Math.max(4, r.top - cr.top + by / H * r.height - tip.offsetHeight - 14) + 'px';
    };
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'mouse') return; // di HP rincian tetap tampil setelah diketuk
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      place(lx[0], lx[1], lastHex);
    });
  }

  function renderReport() {
    const m = S.reportMonth;
    $('r-month').textContent = fmtMonth(m);
    $('r-summary').innerHTML = statsHtml(L.monthSummary(S.transactions, m));
    $('btn-share-hemat').hidden = !(m < thisMonth() && L.monthAchievement(S.transactions, m));
    renderCash();
    renderCompare();
    const rep = L.categoryReport(S.transactions, m);
    $('r-cats').innerHTML = rep.rows.length ? rep.rows.map((r, i) =>
      '<button class="cat-row tx wc-' + (i % WALLET_COLORS) + '" style="display:block" data-cat-report="' + esc(r.kategori) + '">' +
      '<div class="cat-top"><span>' + (ICON[r.kategori] || '💸') + ' ' + esc(r.kategori) + '</span><span>' + rp(r.total) + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.round(r.persen * 100) + '%"></i></div>' +
      '<div class="cat-pct">' + Math.round(r.persen * 100) + '% dari total pengeluaran</div></button>').join('')
      : '<div class="empty">Belum ada pengeluaran di bulan ini.</div>';
  }

  function renderSettings(cw) {
    const byId = Object.fromEntries(cw.map((w) => [w.id, w]));
    $('s-wallets').innerHTML = activeWallets().map((w) =>
      '<button class="list-item ' + walletColor(w.id) + '" data-edit-wallet="' + esc(w.id) + '"><span><i class="dot"></i>' + wEmoji(w) + ' ' + esc(w.nama) +
      (w.id === L.UTAMA_ID ? ' <small>(utama)</small>' : '') + '</span><small>' + rp(byId[w.id].saldo) + ' ›</small></button>').join('');
    ['keluar', 'masuk'].forEach((j) => {
      $('s-cats-' + j).innerHTML = catsOf(j).map((c) =>
        '<button class="list-item" data-edit-cat="' + esc(c.nama) + '" data-jenis="' + j + '"><span>' +
        (ICON[c.nama] || '•') + ' ' + esc(c.nama) + '</span><small>›</small></button>').join('');
    });
    $('s-conn').innerHTML = DEMO ? '🟡 Mode demo: tanpa AI suara' : '🟢 Tersambung ke server AI';
    renderDataInfo();
    const lt = S.lastTiming;
    $('s-timing').hidden = !lt;
    if (lt) {
      $('s-timing').innerHTML = '<span>⏱ Proses terakhir: <b>' + secs(lt.total) + '</b><br><small>' +
        (lt.conv ? 'siapkan rekaman ' + secs(lt.conv) + ' (' + lt.kb + ' KB) · ' : '') +
        (lt.ai != null ? 'AI ' + secs(lt.ai) + ' · server & internet ' + secs(lt.total - lt.ai) : '') +
        (lt.model ? '<br>model ' + esc(lt.model) + (lt.lane === 1 ? ' (jalur cadangan)' : '') : '') +
        (lt.log.length > 1 ? '<br>percobaan: ' + lt.log.map((x) => esc(x.m.replace('gemini-', '')) + ' ' +
          (x.s === 200 ? '✓' : x.s) + ' ' + secs(x.ms)).join(' → ') : '') + '</small></span>';
    }

    const me = session();
    $('btn-logout').hidden = DEMO || !me;
    $('s-account').hidden = DEMO || !me;
    if (me) $('s-account').innerHTML = '<span>👤 ' + esc(me.nama || me.email) + '<br><small>' + esc(me.email) +
      (me.owner ? ' · pemilik' : '') + '</small></span>';
    $('btn-migrate').hidden = DEMO || !me || !LEGACY_SERVER;
    $('btn-feedback').hidden = DEMO || !me || LEGACY_SERVER;
    $('btn-stats').hidden = DEMO || !me || !me.owner || LEGACY_SERVER;
  }

  // ---------- Tujuan (One Active Goal) ----------

  const activeGoal = () => S.goals.find((g) => g.status === 'aktif') || null;
  const goalProg = (g) => L.goalProgress(g, S.transactions, todayStr());
  const pctW = (p) => Math.round(Math.max(0, Math.min(1, p)) * 1000) / 10 + '%';
  const STATUS = {
    sesuai: { icon: '✅', label: 'Sesuai jalur' },
    sedikit: { icon: '🟡', label: 'Sedikit tertinggal' },
    kejar: { icon: '🔥', label: 'Perlu dikejar' },
    lewat: { icon: '⏰', label: 'Tenggat lewat' },
    tercapai: { icon: '🏆', label: 'Tercapai!' },
  };
  const MOOD = { hijau: '😎', kuning: '🙂', oranye: '😠', merah: '😤' };

  function wEmoji(w) {
    if (w.tujuan) { const g = S.goals.find((x) => x.id === w.tujuan); return g ? g.emoji : '🎯'; }
    return walletEmoji(w.nama);
  }
  function fmtDate(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtMonthShort(ymd) {
    const [y, m] = String(ymd).split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
  }
  function sisaHariText(n) { return n < 0 ? 'lewat ' + -n + ' hari' : n === 0 ? 'hari ini' : n + ' hari lagi'; }
  function safeDaily() {
    const g = activeGoal();
    return L.safeDaily(S.transactions, todayStr(), { goalWallet: g ? g.dompet_id : '', porsiTujuan: g ? goalProg(g).targetBulanIni : 0 });
  }
  /** Jatah aman hari ini untuk makan, belanja & hiburan (dari isi amplop; cara lama kalau belum ada dompet kategori). */
  function allowance() {
    const g = activeGoal();
    return L.dailyAllowance(S.wallets, S.transactions, todayStr(), { goalWallet: g ? g.dompet_id : '', porsiTujuan: g ? goalProg(g).targetBulanIni : 0 });
  }
  function rincianTable(g) {
    if (!g.rincian || !g.rincian.length) return '';
    return '<table class="stat-table gd-table">' + g.rincian.map((r) => '<tr><td>' + esc(r.nama) + '</td><td>' + rp(r.nominal) + '</td></tr>').join('') +
      '<tr><th>Total</th><th>' + rp(g.rincian.reduce((s, r) => s + r.nominal, 0)) + '</th></tr></table>';
  }

  function renderGoalHome() {
    const g = activeGoal();
    const jatah = allowance();
    if (!g) {
      S.scene = null;
      const ide = S.goals.filter((x) => x.status === 'ide').length;
      $('goal-area').innerHTML = '<div class="goal-empty"><div class="goal-empty-top"><span class="goal-emoji">🎯</span><span><b>Mau nabung buat apa?</b><br>' +
        '<small>Satu tujuan + tenggat bikin nabung lebih semangat. Ceritakan saja, AI bikinin rincian biayanya.</small></span></div>' +
        '<button class="btn primary" data-goal-new>Buat tujuan</button>' +
        (ide ? '<button class="link-btn" data-goal-ideas>Lihat ' + ide + ' ide tujuan</button>' : '') + '</div>';
    } else {
      renderGoalCard(g);
    }

    let html = '';
    if (g) {
      const p = goalProg(g);
      if (p.status !== 'tercapai') {
        const ratio = p.targetBulanIni > 0 ? Math.max(0, p.masukBulanIni) / p.targetBulanIni : 1;
        html += '<div class="mini mini-save"><div class="mini-label">Sisihkan bulan ini</div><div class="mini-value">' + rp(p.targetBulanIni) + '</div>' +
          '<div class="bar"><i style="width:' + pctW(ratio) + '"></i></div>' +
          '<div class="mini-sub">' + (p.kurangBulanIni > 0 ? 'kurang ' + rp(p.kurangBulanIni) + '<br>≈ ' + rpShort(p.perMinggu) + ' per minggu' : '✅ Beres bulan ini!') + '</div>' +
          (p.kurangBulanIni > 0 ? '<button class="mini-btn" data-set-aside>💸 Sisihkan</button>' : '') + '</div>';
      }
    }
    html += '<div class="mini mini-safe' + (jatah && jatah.sisaHariIni < 0 ? ' over' : '') + '"><div class="mini-label">Jatah aman hari ini</div>' +
      (jatah && jatah.mode === 'amplop' ? '<div class="mini-kind">makan · belanja · hiburan</div>' : '') +
      (jatah && jatah.kosong ? '<div class="mini-value muted">Rp0</div><div class="mini-sub">Amplop makan, belanja & hiburan masih kosong. Bagi dulu uang dari Utama.</div>' +
        '<button class="mini-btn" data-split-now>👛 Bagi uang</button>'
        : jatah ? '<div class="mini-value">' + rp(Math.max(0, jatah.sisaHariIni)) + '</div>' +
        '<div class="bar"><i style="width:' + pctW(jatah.perHari > 0 ? Math.max(0, jatah.sisaHariIni) / jatah.perHari : 0) + '"></i></div>' +
        '<div class="mini-sub">' + (jatah.sisaHariIni < 0 ? 'lewat ' + rp(-jatah.sisaHariIni) + '!' : 'dari ' + rp(jatah.perHari)) +
        '<br>terpakai ' + rp(jatah.terpakai) + '</div><button class="mini-btn ghost" data-safe-info>Cara hitung</button>'
        : '<div class="mini-value muted">–</div><div class="mini-sub">Catat pemasukan dulu, mis. “gajian 5 juta”</div>') + '</div>';
    $('goal-duo').innerHTML = html;
    $('goal-duo').classList.toggle('single', html.indexOf('mini-save') < 0);
    renderSay(jatah);
  }

  /** Checkpoint ilustrasi = rincian biaya kumulatif (bagian dari target). */
  function goalCheckpoints(g) {
    const sum = (g.rincian || []).reduce((t, x) => t + x.nominal, 0);
    const base = Math.max(Number(g.target) || 0, sum) || 1;
    let acc = 0;
    return (g.rincian || []).map((x) => { const from = acc / base; acc += x.nominal; return { nama: x.nama, from, f: Math.min(1, acc / base) }; });
  }

  /**
   * Kartu tujuan bergambar (tema sesuai jenis tujuan, lihat scenes.js). Adegan hanya dibangun ulang kalau tujuan/tema/rincian
   * berubah; selain itu penjalan bergerak halus dari posisi lama ke posisi baru.
   */
  function renderGoalCard(g) {
    const p = goalProg(g);
    const st = STATUS[p.status];
    const telat = p.perkiraan && p.perkiraan > g.tenggat && p.status !== 'tercapai';
    const tema = g.tema ? L.normalizeTheme(g.tema) : L.guessTheme(g.nama, g.emoji);
    const cps = goalCheckpoints(g);
    const sig = JSON.stringify([g.id, tema, cps, Math.round(p.persenSeharusnya * 200)]);
    const area = $('goal-area');
    let sc = S.scene;
    if (!sc || sc.sig !== sig || !area.querySelector('.goal-scene')) {
      area.innerHTML = '<button class="goal-card" data-goal-open><div class="goal-top"></div>' +
        '<div class="goal-scene"><svg viewBox="0 0 340 210" role="img"></svg></div>' +
        '<div class="goal-amount"></div><div class="goal-cps">' + cps.map(() => '<span></span>').join('') + '</div><div class="goal-foot"></div></button>';
      const svg = area.querySelector('svg');
      const same = sc && sc.goalId === g.id;
      const shown = same ? sc.shown : 0;
      sc = S.scene = { sig, goalId: g.id, nama: g.nama, svg, cps, shown, target: shown, dir: 1, raf: 0, quiet: !same, msgs: [],
        api: window.HBScenes.mount(svg, { tema, checkpoints: cps, seharusnya: p.persenSeharusnya }) };
      drawScene(sc);
    }
    const card = area.querySelector('.goal-card');
    card.className = 'goal-card st-' + p.status;
    card.querySelector('.goal-top').innerHTML = '<span class="goal-emoji">' + esc(g.emoji) + '</span><span class="goal-head"><span class="goal-label">Tujuan aktif</span>' +
      '<span class="goal-name">' + esc(g.nama) + '</span></span><span class="goal-chip">' + st.icon + ' ' + st.label + '</span>';
    sc.svg.setAttribute('aria-label', 'Terkumpul ' + Math.round(p.persen * 100) + '%, seharusnya ' + Math.round(p.persenSeharusnya * 100) + '%');
    card.querySelector('.goal-amount').innerHTML = '<b>' + rp(p.terkumpul) + '</b><span>dari ' + rp(p.target) + '</span><em>' + Math.round(p.persen * 100) + '%</em>';
    card.querySelector('.goal-foot').innerHTML = '<span>⏳ ' + fmtDate(g.tenggat) + ' · ' + sisaHariText(p.sisaHari) + '</span>' +
      '<span class="' + (telat ? 'c-warn' : '') + '">' + (p.status === 'tercapai' ? '🎉 Selamat!' : p.perkiraan ? '🏁 Perkiraan ' + fmtMonthShort(p.perkiraan) : '🏁 Mulai sisihkan dulu') + '</span>' +
      '';
    animateScene(p.status === 'tercapai' ? 1 : p.persen);
  }

  function drawScene(sc) {
    sc.api.draw(sc.shown, sc.dir);
    const chips = $('goal-area').querySelectorAll('.goal-cps span');
    sc.cps.forEach((c, i) => {
      const inside = Math.max(0, Math.min(1, (sc.shown - c.from) / Math.max(1e-6, c.f - c.from)));
      const ok = inside >= 1 - 1e-6;
      if (!chips[i]) return;
      chips[i].className = ok ? 'ok' : inside > 0 ? 'now' : '';
      chips[i].textContent = (ok ? '✅ ' : inside > 0 ? '⏳ ' : '') + c.nama + (!ok && inside > 0 ? ' ' + Math.round(inside * 100) + '%' : '');
    });
  }

  /** Gerakkan ilustrasi ke progres baru; rayakan checkpoint yang terlewati (kecuali saat pembukaan). */
  function animateScene(to) {
    const sc = S.scene;
    if (!sc) return;
    sc.target = Math.max(0, Math.min(1, to));
    if (Math.abs(sc.target - sc.shown) < 1e-4) { drawScene(sc); return; }
    sc.dir = sc.target >= sc.shown ? 1 : -1;
    cancelAnimationFrame(sc.raf);
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = () => {
      if (S.scene !== sc) return;
      const prev = sc.shown, diff = sc.target - sc.shown;
      if (reduce || Math.abs(diff) < 0.0015) sc.shown = sc.target;
      else {
        sc.shown += Math.sign(diff) * Math.max(0.0018, Math.abs(diff) * 0.06);
        if ((diff > 0 && sc.shown > sc.target) || (diff < 0 && sc.shown < sc.target)) sc.shown = sc.target;
      }
      drawScene(sc);
      if (!sc.quiet) celebrateCrossing(sc, prev, sc.shown);
      if (sc.shown !== sc.target) sc.raf = requestAnimationFrame(step);
      else sc.quiet = false;
    };
    sc.raf = requestAnimationFrame(step);
  }

  function celebrateCrossing(sc, prev, p) {
    if (p <= prev) return;
    const at = (f) => window.HBScenes.toScreen(sc.svg, sc.api.point(f));
    sc.cps.forEach((c, i) => {
      if (prev < c.f - 1e-6 && p >= c.f - 1e-6) {
        const pt = at(c.f);
        const last = c.f >= 0.999;
        window.HBScenes.burst(pt.x, pt.y, last ? 160 : 60, last);
        const chip = $('goal-area').querySelectorAll('.goal-cps span')[i];
        if (chip) { chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
        const next = sc.cps[i + 1];
        sc.msgs.push(last ? '🏆 ' + sc.nama + ' terkumpul penuh!' : '✅ ' + c.nama + ' aman!' + (next ? ' Lanjut ' + next.nama.charAt(0).toLowerCase() + next.nama.slice(1) + ' 💪' : ''));
      }
    });
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      if (prev < f && p >= f && !sc.cps.some((c) => Math.abs(c.f - f) < 0.005)) {
        const pt = at(f);
        window.HBScenes.burst(pt.x, pt.y, f === 1 ? 160 : 30, f === 1);
      }
    });
    if (sc.msgs.length && !sc.msgTimer) {
      // Tunggu toast "transaksi tersimpan" selesai dulu.
      sc.msgTimer = setTimeout(() => { toast(sc.msgs.join('\n'), 3500); sc.msgs = []; sc.msgTimer = null; }, 3300);
    }
  }

  /** Kartu "Kata Gasss": komentar terakhir hari ini, atau saran sesuai zona posisi kas. */
  function renderSay(jatah) {
    const z = mood();
    const k = META.komentar;
    const fresh = k && k.tanggal === todayStr() && k.text;
    const zona = fresh ? k.zona : (z ? z.zona : '');
    const text = fresh ? k.text : tipFor(z, jatah);
    const el = $('gasss-say');
    el.hidden = !text;
    el.className = 'say zone-' + (zona || 'none') + (S.sayPop ? ' pop' : '');
    el.innerHTML = '<span class="say-face">' + (MOOD[zona] || '🤖') + '</span><span class="say-body"><b>Kata Gasss</b>' + esc(text) + '</span>';
    S.sayPop = false;
  }

  function tipFor(z, jatah) {
    const g = activeGoal();
    const p = g && goalProg(g);
    const nama = g ? g.nama : '';
    if (!S.transactions.length) {
      return g ? 'Tujuan udah ada, tinggal gas! Catat pemasukan & pengeluaranmu, nanti aku awasin 😏'
        : 'Halo! Aku Gasss. Bikin satu tujuan dulu, terus catat pengeluaranmu. Aku bakal ngingetin (dan ngomel) 😏';
    }
    if (!z.zona) return 'Belum ada pemasukan bulan ini. Catat gajianmu, nanti aku hitung jatah aman harianmu.';
    const kas = z.persen === null ? 'sedikit' : Math.round(z.persen * 100) + '%';
    if (z.alasan === 'target') {
      return 'STOP dulu! Uang bebas bulan ini udah habis' + (g ? ', sisanya jatah ' + nama : '') + '. Tahan belanja sampai ada pemasukan lagi 😤';
    }
    const kurang = p && p.kurangBulanIni > 0 ? rp(p.kurangBulanIni) : '';
    if (p && p.status === 'lewat') return 'Tenggat ' + nama + ' udah lewat. Santai, bukan gagal kok. Perpanjang tenggatnya di kartu tujuan ya 🙂';
    if (p && p.status === 'kejar' && (z.zona === 'hijau' || z.zona === 'kuning')) {
      return nama + ' perlu dikejar 🔥 Sisihkan ≈ ' + rpShort(p.perMinggu) + ' per minggu biar balik ke jalur.';
    }
    switch (z.zona) {
      case 'hijau': return g ? (kurang ? 'Kas masih adem ☁️ Pas banget buat sisihkan ' + kurang + ' ke ' + nama + ' sekarang.' : nama + ' aman, kas adem. Pertahankan, bos 😎')
        : 'Kas masih adem ☁️ Daripada nganggur, bikin tujuan yuk biar uangnya ada arah.';
      case 'kuning': return 'Kas udah lewat setengah jalan. ' + (jatah ? 'Jatah aman hari ini ' + rp(Math.max(0, jatah.sisaHariIni)) + ', jangan lebih ya 👀' : 'Pelan-pelan belanjanya ya 👀');
      case 'oranye': return 'Waspada! Kas tinggal ' + kas + '. Rem jajan yang nggak penting' + (kurang ? ', ' + nama + ' masih butuh ' + kurang + ' bulan ini ✋' : ' ✋');
      default: return 'MODE SURVIVAL! Kas tinggal ' + kas + '. Stop belanja yang nggak penting' + (g ? ', ' + nama + ' lagi nangis di pojokan 😤' : ' 😤');
    }
  }

  /** Suasana keuangan sekarang (zona posisi kas + jatah/target), dipakai warna latar & nada Gasss. */
  function mood() {
    const g = activeGoal();
    return L.moodZone(S.transactions, todayStr(), { goalWallet: g ? g.dompet_id : '', porsiTujuan: g ? goalProg(g).targetBulanIni : 0 });
  }

  /** Sapaan 2–4 kata mengikuti suasana keuangan; variasinya berganti setiap hari. */
  const GREET = {
    hijau: ['Aman jaya', 'Santuy dulu', 'Cuan aman'],
    kuning: ['Pelan-pelan ya', 'Mulai hemat', 'Jaga ritme'],
    oranye: ['Rem dikit', 'Waspada', 'Tahan jajan'],
    merah: ['Awas boncos', 'Stop jajan', 'Darurat dompet'],
  };
  const GREET_ICON = { hijau: '😎', kuning: '🙂', oranye: '✋', merah: '😤' };
  function greeting(zona, name) {
    if (!zona) return 'Halo' + (name ? ', ' + name : '') + ' 👋';
    const list = GREET[zona];
    const pick = list[Number(todayStr().slice(8)) % list.length];
    return pick + (name ? ', ' + name : '') + (zona === 'merah' ? '!' : '') + ' ' + GREET_ICON[zona];
  }
  /** Warna latar seluruh aplikasi mengikuti suasana keuangan + label kecil di bagian atas. */
  function renderMood() {
    const m = mood();
    const root = document.documentElement;
    root.dataset.mood = m.zona || 'netral';
    const el = $('mood-label');
    // Suasana sudah terbaca dari warna & sapaan; label cukup angkanya.
    el.hidden = !m.zona;
    if (m.zona) el.textContent = m.alasan === 'target' ? 'Uang bebas habis' : m.persen === null ? 'Belum ada uang' : 'Sisa kas ' + Math.round(m.persen * 100) + '%';
    // Warna bilah status browser / iPhone ikut latar.
    const c = getComputedStyle(root).getPropertyValue('--page').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((x) => x.setAttribute('content', c));
    return m;
  }

  async function setKomentar(text, zona) {
    META.komentar = { text, zona: zona || '', tanggal: todayStr() };
    S.sayPop = true;
    render();
    try { await api('setMeta', { key: 'komentar', value: META.komentar }); } catch (e) { /* tidak penting */ }
  }

  /** Konteks untuk AI supaya komentarnya sesuai zona posisi kas & tujuan. */
  function aiContext() {
    const z = mood();
    const g = activeGoal();
    const p = g && goalProg(g);
    const j = allowance();
    return { zona: z.zona || 'kuning', alasan: z.alasan, persenKas: z.persen === null ? null : Math.round(z.persen * 100),
      tujuan: g ? g.nama : '', dompetTujuan: g ? walletName(g.dompet_id) : '', sisa: p ? p.sisa : null,
      tenggat: g ? g.tenggat : '', status: p ? STATUS[p.status].label : '', jatahHarian: j ? Math.max(0, j.sisaHariIni) : null };
  }

  /** Setelah mencatat: komentar Gasss + ajakan menyisihkan kalau ada pemasukan. */
  function afterRecord(saved, komentar) {
    const g = activeGoal();
    const p = g ? goalProg(g) : null;
    const z = mood();
    const gw = g ? g.dompet_id : '';
    const sum = (list) => list.reduce((s, t) => s + t.nominal, 0);
    const keluar = sum(saved.filter((t) => t.jenis === 'keluar' && t.dompet_id !== gw));
    const keTujuan = sum(saved.filter((t) => t.jenis === 'pindah' && gw && t.dompet_tujuan_id === gw));
    const days = g ? L.goalDelayDays(p, keTujuan || keluar) : null;
    const text = komentar ? L.fillDays(komentar, days)
      : L.localComment({ saved, zona: z.zona || 'kuning', alasan: z.alasan, persenKas: z.persen, goalName: g ? g.nama : '', goalWallet: gw, prog: p });
    if (text) setKomentar(text, z.zona || 'kuning');
    const masuk = saved.filter((t) => t.jenis === 'masuk' && t.kategori !== L.KATEGORI_SALDO_AWAL && t.dompet_id !== gw);
    if (g && p.kurangBulanIni > 0 && masuk.length) {
      setTimeout(() => {
        if ($('sheet-backdrop').hidden) {
          openSetAside(Math.min(p.kurangBulanIni, sum(masuk)), masuk[0].dompet_id, '💸 Cuan masuk! Sisihkan dulu ke ' + g.emoji + ' ' + g.nama + '?');
        }
      }, 800);
    }
  }

  /** Pindahkan uang ke dompet tujuan (satu ketukan). */
  function openSetAside(amount, fromId, title) {
    const g = activeGoal();
    if (!g) return;
    const p = goalProg(g);
    const saldo = Object.fromEntries(computed().map((w) => [w.id, w.saldo]));
    const ws = activeWallets().filter((w) => w.id !== g.dompet_id);
    const from = ws.some((w) => w.id === fromId) ? fromId : L.UTAMA_ID;
    openSheet('<h3>' + esc(title || '💸 Sisihkan ke ' + g.emoji + ' ' + g.nama) + '</h3>' +
      '<div class="field"><label>Jumlah</label><input id="sa-amt" inputmode="numeric" placeholder="0" value="' + (amount ? amount.toLocaleString('id-ID') : '') + '"></div>' +
      '<div class="field"><label>Ambil dari dompet</label><select id="sa-from">' + ws.map((w) => '<option value="' + esc(w.id) + '"' + (w.id === from ? ' selected' : '') + '>' +
        esc(w.nama) + ' (' + rp(saldo[w.id]) + ')</option>').join('') + '</select></div>' +
      '<p class="transcript">' + (p.kurangBulanIni > 0 ? 'Bulan ini masih kurang ' + rp(p.kurangBulanIni) + ' untuk ' + esc(g.nama) + '.' : 'Target bulan ini sudah beres, ini bonus 💪') + '</p>' +
      '<div class="btn-row"><button class="btn" id="sa-no">Nanti</button><button class="btn primary" id="sa-yes">Sisihkan</button></div>', (el) => {
      moneyInput(el.querySelector('#sa-amt'));
      el.querySelector('#sa-no').onclick = closeSheet;
      el.querySelector('#sa-yes').onclick = async () => {
        const n = digits(el.querySelector('#sa-amt').value);
        if (!n) { toast('Isi jumlahnya dulu'); return; }
        const tx = { jenis: 'pindah', nominal: n, dompet_id: el.querySelector('#sa-from').value, dompet_tujuan_id: g.dompet_id,
          keterangan: 'Sisihkan untuk ' + g.nama, tanggal: todayStr() };
        closeSheet();
        const saved = await run(() => api('addTxs', { txs: [tx] }), 'Tersisihkan ' + rp(n) + ' 🚀');
        if (saved) { S.newIds = new Set(saved.map((t) => t.id)); afterRecord(saved, ''); }
      };
    });
  }

  function openSafeInfo() {
    const j = allowance();
    if (!j) return;
    const row = (a, b, strong) => '<tr><' + (strong ? 'th' : 'td') + '>' + a + '</' + (strong ? 'th' : 'td') + '><' + (strong ? 'th' : 'td') + '>' + b + '</' + (strong ? 'th' : 'td') + '></tr>';
    if (j.mode === 'amplop') {
      openSheet('<h3>🧮 Jatah aman hari ini</h3><p class="transcript">Batas belanja konsumtif (makan & minum, belanja, hiburan) supaya isi amplop cukup sampai akhir bulan.</p>' +
        '<table class="stat-table calc-table">' +
        row('Isi amplop ' + esc(j.dompet.join(', ')) + ' (sebelum belanja hari ini)', rp(j.isi)) +
        row('÷ Sisa hari bulan ini', j.hariSisa + ' hari') +
        row('Jatah hari ini', rp(j.perHari), true) +
        row('− Sudah dipakai hari ini', rp(j.terpakai)) +
        row(j.sisaHariIni < 0 ? 'Lewat dari jatah' : 'Sisa jatah hari ini', rp(Math.abs(j.sisaHariIni)), true) + '</table>' +
        '<p class="transcript">Hemat hari ini, jatah besok otomatis naik. Kebablasan hari ini, jatah besok mengecil. ' +
        'Bensin, tagihan, atau obat tidak memotong jatah ini karena punya dompet sendiri. Isi amplop lewat <b>Bagi uang</b> di Beranda.</p>' +
        '<div class="btn-row"><button class="btn" id="si-close">Tutup</button><button class="btn primary" id="si-split">👛 Bagi uang</button></div>', (el) => {
        el.querySelector('#si-close').onclick = closeSheet;
        el.querySelector('#si-split').onclick = () => { closeSheet(); openSplit(); };
      });
      return;
    }
    openSheet('<h3>🧮 Jatah aman hari ini</h3><table class="stat-table calc-table">' +
      row('Pemasukan (' + j.sumber + ')', rp(j.pemasukan)) +
      row('− Tagihan rutin yang belum dibayar', rp(j.sisaTagihan)) +
      row('− Porsi tujuan bulan ini', rp(j.porsiTujuan)) +
      row('− Pengeluaran bulan ini sebelum hari ini', rp(j.pengeluaran)) +
      row('= Uang bebas', rp(j.bebas), true) +
      row('÷ Sisa hari bulan ini', j.hariSisa + ' hari') +
      row('Jatah per hari', rp(j.perHari), true) + '</table>' +
      '<p class="transcript">Pemasukan memakai yang lebih besar antara pemasukan bulan ini dan rata-rata 3 bulan sebelumnya, jadi tetap jalan walau pemasukanmu tidak tetap. ' +
      'Tagihan rutin = rata-rata kategori Tagihan. Belanja dari dompet tujuan tidak dihitung.</p>' +
      '<div class="btn-row"><button class="btn" id="si-close">Tutup</button></div>', (el) => { el.querySelector('#si-close').onclick = closeSheet; });
  }

  /** Pengguna lama (belum punya dompet per kategori): tawarkan sekali. */
  async function offerCategoryWallets() {
    if (META.dompetKategoriDitawarkan || !$('sheet-backdrop').hidden || !$('tutorial').hidden) return;
    const belum = S.categories.filter((c) => c.jenis === 'keluar' && c.nama !== 'Lainnya' && !L.walletForCategory(c.nama, S.wallets));
    META.dompetKategoriDitawarkan = true;
    await api('setMeta', { key: 'dompetKategoriDitawarkan', value: true });
    if (!belum.length) return;
    openSheet('<h3>👛 Pakai dompet per kategori?</h3>' +
      '<p>Gasss sekarang memakai <b>sistem amplop</b>: setiap kategori pengeluaran punya dompet sendiri. Gajian masuk ke Utama, lalu kamu bagi ke tiap dompet.</p>' +
      '<div class="chips" style="margin-bottom:10px">' + belum.map((c) => '<span class="chip">' + (ICON[c.nama] || '•') + ' ' + esc(c.nama) + '</span>').join('') + '</div>' +
      '<p class="transcript">Dompet yang sudah ada tidak diubah. Pengeluaran makan, belanja, dan hiburan diambil dari amplopnya, dan <b>jatah aman hari ini</b> dihitung dari isi amplop itu.</p>' +
      '<div class="btn-row"><button class="btn" id="ck-no">Nanti saja</button><button class="btn primary" id="ck-yes">Buat dompetnya</button></div>', (el) => {
      el.querySelector('#ck-no').onclick = () => { closeSheet(); toast('Oke. Bisa dibuat kapan saja dari Atur → Dompet.'); };
      el.querySelector('#ck-yes').onclick = async () => {
        closeSheet();
        const n = await run(() => api('ensureCategoryWallets'));
        if (n !== null) { toast((n ? n + ' dompet baru dibuat. ' : '') + 'Sekarang bagi uang dari Utama ke tiap dompet 👛', 4500); setTimeout(openSplit, 900); }
      };
    });
  }

  /** Tanya tujuan saat pertama kali (boleh "Nanti dulu"). */
  function maybeAskGoal() {
    if (!S.goals.length && !META.tujuanNanti && $('sheet-backdrop').hidden && $('tutorial').hidden) openGoalCreate({ onboarding: true });
  }

  /** Langkah 1 membuat tujuan: cerita lewat ketik/suara, atau pilih template. o = { ide, onboarding } */
  function openGoalCreate(o) {
    o = o || {};
    const T = L.GOAL_TEMPLATES;
    openSheet('<h3>' + (o.ide ? '💡 Simpan ide tujuan' : '🎯 Mau mewujudkan apa?') + '</h3>' +
      '<p class="transcript">Ceritakan tujuan & kapan, mis. “ikut Jakarta Marathon Juni 2027”. AI bikinin rincian biayanya.</p>' +
      '<div class="field gc-row"><input id="gc-text" placeholder="Tujuanku…" autocomplete="off">' +
      '<button type="button" class="gc-mic" id="gc-mic" aria-label="Ceritakan lewat suara">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg></button></div>' +
      '<div class="gc-status" id="gc-status"></div>' +
      '<div class="field"><label>Atau pilih template</label><div class="chips" id="gc-tpl">' +
      T.map((t) => '<button type="button" class="chip" data-tpl="' + t.key + '">' + t.emoji + ' ' + esc(t.label) + '</button>').join('') + '</div></div>' +
      '<div class="btn-row"><button class="btn" id="gc-later">' + (o.onboarding ? 'Nanti dulu' : 'Batal') + '</button><button class="btn primary" id="gc-go">Lanjut</button></div>', (el) => {
      const inp = el.querySelector('#gc-text'), status = el.querySelector('#gc-status'), mic = el.querySelector('#gc-mic');
      let rec = false, working = false, t0 = 0, timer = null;
      const stopRec = () => { if (rec) { rec = false; clearInterval(timer); window.HBRecorder.stop(); } };
      S.onSheetClose = stopRec;
      const lock = (on) => el.querySelectorAll('button, input').forEach((b) => { b.disabled = on; });
      const go = async (req) => {
        if (working) return;
        working = true;
        lock(true);
        const tick = Date.now();
        status.textContent = 'AI sedang menyusun rincian biaya…';
        const iv = setInterval(() => { status.textContent = 'AI sedang menyusun rincian biaya… ' + Math.floor((Date.now() - tick) / 1000) + ' dtk'; }, 1000);
        try {
          const plan = await planGoal(req);
          if (req.template) plan.tema = req.template;
          clearInterval(iv);
          openGoalReview(plan, o);
        } catch (e) {
          clearInterval(iv);
          status.textContent = e.message;
          working = false;
          lock(false);
        }
      };
      el.querySelector('#gc-later').onclick = async () => {
        closeSheet();
        if (o.onboarding) {
          META.tujuanNanti = true;
          await api('setMeta', { key: 'tujuanNanti', value: true });
          toast('Oke! Buat tujuan kapan saja dari Beranda.');
        }
      };
      el.querySelector('#gc-go').onclick = () => {
        const text = inp.value.trim();
        if (!text) { toast('Ceritakan dulu tujuanmu, atau pilih template'); return; }
        go({ text });
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') el.querySelector('#gc-go').click(); };
      el.querySelector('#gc-tpl').onclick = (e) => {
        const b = e.target.closest('[data-tpl]');
        if (!b) return;
        const t = T.find((x) => x.key === b.dataset.tpl);
        inp.value = t.contoh;
        go({ text: t.contoh, template: t.key });
      };
      mic.onclick = async () => {
        if (!rec) {
          if (recording || busy) return;
          if (DEMO) { toast('Mode demo belum bisa memproses suara. Ketik saja ya.'); return; }
          try {
            await window.HBRecorder.start();
          } catch (e) {
            toast(e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Aktifkan di pengaturan Safari.' : e.message, 5000);
            return;
          }
          rec = true; t0 = Date.now();
          mic.classList.add('recording');
          status.textContent = 'Mendengarkan… ketuk mikrofon lagi kalau selesai';
          timer = setInterval(() => {
            const sec = Math.floor((Date.now() - t0) / 1000);
            status.textContent = 'Mendengarkan… ' + sec + ' dtk · ketuk mikrofon lagi kalau selesai';
            if (sec >= MAX_REC_SEC) mic.click();
          }, 500);
          return;
        }
        rec = false;
        clearInterval(timer);
        mic.classList.remove('recording');
        const blob = await window.HBRecorder.stop();
        if (!blob || Date.now() - t0 < 700) { status.textContent = 'Rekaman terlalu pendek'; return; }
        status.textContent = 'Menyiapkan rekaman…';
        const payload = await window.HBRecorder.toPayload(blob);
        go({ audio: payload.data, mime: payload.mime });
      };
    });
  }

  /** Minta rencana ke AI (atau template lokal di mode demo). */
  async function planGoal(req) {
    if (DEMO) {
      if (req.audio) throw new Error('Mode demo belum bisa memproses suara. Ketik saja ya.');
      return L.planDemo(req.text, todayStr());
    }
    let p;
    try {
      p = await api('plan', { text: req.text, audio: req.audio, mime: req.mime, lane: 0 });
    } catch (e) {
      if (e.code === 'auth' || e.code === 'forbidden') throw e;
      p = await api('plan', { text: req.text, audio: req.audio, mime: req.mime, lane: 1 });
    }
    return L.cleanPlan(p, todayStr());
  }

  /** Langkah 2: cek & koreksi rencana. o.goal = tujuan yang sedang diubah (mode ubah). */
  function openGoalReview(plan, o) {
    o = o || {};
    const edit = !!o.goal;
    const rows = plan.rincian.map((r) => ({ ...r }));
    const minDate = L.addDays(todayStr(), 1);
    openSheet('<h3>' + (edit ? '✏️ Ubah tujuan' : '📝 Cek rencananya') + '</h3>' +
      (plan.transkrip && !edit ? '<p class="transcript">“' + esc(plan.transkrip) + '”</p>' : '') +
      '<div class="field"><label>Nama tujuan</label><div class="gr-name"><input id="gr-emoji" class="gr-emoji" value="' + esc(plan.emoji) +
        '" aria-label="Emoji"><input id="gr-nama" value="' + esc(plan.nama) + '" placeholder="mis. Jakarta Marathon 2027"></div></div>' +
      '<div class="field"><label>Tampilan kartu</label><div class="chips" id="gr-tema">' + L.THEMES.map((t) =>
        '<button type="button" class="chip" data-tema="' + t.key + '">' + t.emoji + ' ' + esc(t.label) + '</button>').join('') + '</div></div>' +
      '<div class="field"><label>Tenggat (kapan uangnya harus terkumpul)</label><input type="date" id="gr-tenggat" min="' + minDate + '" value="' + esc(plan.tenggat) + '"></div>' +
      '<div class="field"><label>Rincian biaya' + (edit ? '' : ' · perkiraan AI, silakan koreksi') + '</label><div id="gr-rows"></div>' +
        '<button type="button" class="link-btn" id="gr-add">+ Tambah rincian</button></div>' +
      '<div class="field"><label>Target total</label><input id="gr-target" inputmode="numeric" placeholder="0" value="' +
        (plan.target ? Number(plan.target).toLocaleString('id-ID') : '') + '"></div>' +
      (edit ? '<p class="transcript">Mengubah target atau tenggat itu wajar, rencana memang menyesuaikan hidup 😉</p>'
        : (o.ide ? '' : '<div class="field"><label>Sudah ada tabungan untuk ini? (opsional)</label><input id="gr-awal" inputmode="numeric" placeholder="0"></div>')) +
      (plan.catatan && !edit ? '<p class="say-note">💡 ' + esc(plan.catatan) + '</p>' : '') +
      '<p class="gr-calc" id="gr-calc"></p>' +
      '<div class="btn-row"><button class="btn" id="gr-cancel">Batal</button><button class="btn primary" id="gr-save">' +
        (edit ? 'Simpan' : o.ide ? 'Simpan ide' : 'Gasss! 🚀') + '</button></div>', (el) => {
      const box = el.querySelector('#gr-rows'), target = el.querySelector('#gr-target'), tenggat = el.querySelector('#gr-tenggat');
      const awalEl = el.querySelector('#gr-awal');
      moneyInput(target);
      if (awalEl) moneyInput(awalEl);
      let tema = plan.tema ? L.normalizeTheme(plan.tema) : L.guessTheme(plan.nama, plan.emoji);
      const temaBox = el.querySelector('#gr-tema');
      const drawTema = () => temaBox.querySelectorAll('[data-tema]').forEach((b) => b.classList.toggle('on', b.dataset.tema === tema));
      temaBox.onclick = (e) => { const b = e.target.closest('[data-tema]'); if (b) { tema = b.dataset.tema; drawTema(); } };
      drawTema();
      const sumRows = () => rows.reduce((s, r) => s + (r.nominal || 0), 0);
      const calc = () => {
        const t = digits(target.value) - (awalEl ? digits(awalEl.value) : 0);
        const tg = tenggat.value;
        if (t > 0 && tg > todayStr()) {
          const bln = Math.max(1, Math.round(L.daysBetween(thisMonth() + '-01', tg) / 30.44));
          el.querySelector('#gr-calc').textContent = '≈ ' + rp(Math.ceil(t / bln / 1000) * 1000) + ' per bulan selama ' + bln + ' bulan';
        } else el.querySelector('#gr-calc').textContent = '';
      };
      const draw = () => {
        box.innerHTML = rows.map((r, i) => '<div class="gr-row"><input data-i="' + i + '" data-k="nama" value="' + esc(r.nama) + '" placeholder="Pos biaya">' +
          '<input data-i="' + i + '" data-k="nominal" inputmode="numeric" placeholder="0" value="' + (r.nominal ? r.nominal.toLocaleString('id-ID') : '') + '">' +
          '<button type="button" data-del="' + i + '" aria-label="Hapus rincian">×</button></div>').join('');
        box.querySelectorAll('[data-k="nominal"]').forEach(moneyInput);
      };
      box.addEventListener('input', (e) => {
        const i = e.target.dataset.i;
        if (i === undefined) return;
        if (e.target.dataset.k === 'nama') rows[i].nama = e.target.value;
        else {
          rows[i].nominal = digits(e.target.value);
          const s = sumRows();
          if (s) target.value = s.toLocaleString('id-ID');
        }
        calc();
      });
      box.onclick = (e) => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        rows.splice(Number(b.dataset.del), 1);
        draw();
        const s = sumRows();
        if (s) target.value = s.toLocaleString('id-ID');
        calc();
      };
      el.querySelector('#gr-add').onclick = () => {
        rows.push({ nama: '', nominal: 0 });
        draw();
        const last = box.querySelectorAll('[data-k="nama"]');
        last[last.length - 1].focus();
      };
      target.addEventListener('input', calc);
      tenggat.addEventListener('input', calc);
      if (awalEl) awalEl.addEventListener('input', calc);
      draw();
      calc();
      el.querySelector('#gr-cancel').onclick = closeSheet;
      el.querySelector('#gr-save').onclick = async () => {
        const goal = { nama: el.querySelector('#gr-nama').value.trim(), emoji: el.querySelector('#gr-emoji').value.trim() || '🎯',
          tenggat: tenggat.value, target: digits(target.value), rincian: rows.filter((r) => r.nama.trim() && r.nominal > 0), catatan: plan.catatan || '', tema };
        try {
          if (edit) await api('updateGoal', { goal: { ...goal, id: o.goal.id } });
          else await api('createGoal', { goal, aktif: !o.ide, awal: awalEl ? digits(awalEl.value) : 0 });
        } catch (e) {
          toast(e.message, 4000);
          return;
        }
        closeSheet();
        await refresh(true);
        if (edit) { toast('Tujuan diperbarui'); return; }
        if (o.ide) { toast('Ide tujuan disimpan 💡'); return; }
        toast('Tujuan dibuat! Gasss 🚀');
        const g = activeGoal();
        const p = g && goalProg(g);
        if (p) setKomentar('Mantap, ' + g.nama + ' resmi jadi tujuan! Sisihkan ' + rp(p.targetBulanIni) + ' bulan ini ya. Aku awasin 👀', '');
      };
    });
  }

  function openGoalDetail() {
    const g = activeGoal();
    if (!g) return;
    const p = goalProg(g);
    const ide = S.goals.filter((x) => x.status === 'ide').length;
    openSheet('<h3>' + esc(g.emoji) + ' ' + esc(g.nama) + '</h3>' +
      '<p><b>' + rp(p.terkumpul) + '</b> dari ' + rp(p.target) + ' · tenggat ' + fmtDate(g.tenggat) + '<br><small class="muted">' +
      STATUS[p.status].icon + ' ' + STATUS[p.status].label + (p.status !== 'tercapai' ? ' · seharusnya sudah ' + rp(p.seharusnya) : '') + '</small></p>' +
      rincianTable(g) +
      '<div class="list">' +
      (p.sisa > 0 ? '<button class="list-item" id="gd-save"><span>💸 Sisihkan sekarang</span><small>›</small></button>' : '') +
      '<button class="list-item" id="gd-edit"><span>✏️ Ubah target, tenggat, atau rincian</span><small>›</small></button>' +
      '<button class="list-item" id="gd-share"><span>📸 Bagikan progres <small>ke story</small></span><small>›</small></button>' +
      '<button class="list-item" id="gd-ideas"><span>💡 Ide tujuan lain' + (ide ? ' (' + ide + ')' : '') + '</span><small>›</small></button>' +
      '<button class="list-item" id="gd-history"><span>📜 Riwayat dompet tujuan</span><small>›</small></button>' +
      '<button class="list-item" id="gd-done"><span>🏆 Tandai sudah tercapai</span><small>›</small></button>' +
      '<button class="list-item danger-text" id="gd-del">Hapus tujuan ini</button>' +
      '</div><div class="btn-row"><button class="btn" id="gd-close">Tutup</button></div>', (el) => {
      el.querySelector('#gd-close').onclick = closeSheet;
      if (p.sisa > 0) el.querySelector('#gd-save').onclick = () => openSetAside(p.kurangBulanIni || 0);
      el.querySelector('#gd-edit').onclick = () => openGoalReview(g, { goal: g });
      el.querySelector('#gd-share').onclick = () => openShareGoal(g);
      el.querySelector('#gd-ideas').onclick = openGoalIdeas;
      el.querySelector('#gd-history').onclick = () => { closeSheet(); showWalletHistory(g.dompet_id); };
      el.querySelector('#gd-done').onclick = async () => {
        if (!(await confirmBox('Tandai "' + g.nama + '" sudah tercapai? Uang di dompetnya tetap ada untuk dipakai.', 'Tercapai! 🏆'))) { openGoalDetail(); return; }
        await achieve(g);
      };
      el.querySelector('#gd-del').onclick = async () => {
        if (!(await confirmBox('Hapus tujuan "' + g.nama + '"? Dompet tujuannya juga dihapus (harus kosong dulu).', 'Hapus'))) { openGoalDetail(); return; }
        await run(() => api('deleteGoal', { id: g.id }), 'Tujuan dihapus');
      };
    });
  }

  function openGoalIdeas() {
    const ide = S.goals.filter((g) => g.status === 'ide'), done = S.goals.filter((g) => g.status === 'tercapai');
    const item = (g, attr, right) => '<button class="list-item" ' + attr + '="' + esc(g.id) + '"><span>' + esc(g.emoji) + ' ' + esc(g.nama) +
      '<br><small>' + rp(g.target) + ' · ' + (g.status === 'tercapai' ? 'tercapai ' + fmtDate(g.tercapai || g.tenggat) : 'tenggat ' + fmtDate(g.tenggat)) +
      '</small></span><small>' + right + '</small></button>';
    openSheet('<h3>💡 Ide tujuan</h3><p class="transcript">Satu tujuan aktif dulu biar fokus. Ide lain disimpan di sini sampai giliran.</p>' +
      '<div class="list">' + ide.map((g) => item(g, 'data-idea', '›')).join('') +
      '<button class="list-item" id="gi-add"><span>➕ Tambah ' + (activeGoal() ? 'ide tujuan' : 'tujuan') + '</span><small>›</small></button></div>' +
      (done.length ? '<h2>🏆 Sudah tercapai</h2><div class="list">' + done.map((g) => item(g, 'data-done', '📸')).join('') + '</div>' : '') +
      '<div class="btn-row"><button class="btn" id="gi-close">Tutup</button></div>', (el) => {
      el.querySelector('#gi-close').onclick = closeSheet;
      el.querySelector('#gi-add').onclick = () => openGoalCreate({ ide: !!activeGoal() });
      el.querySelectorAll('[data-idea]').forEach((b) => { b.onclick = () => openIdea(b.dataset.idea); });
      el.querySelectorAll('[data-done]').forEach((b) => { b.onclick = () => openShareGoal(S.goals.find((g) => g.id === b.dataset.done)); });
    });
  }

  function openIdea(id) {
    const g = S.goals.find((x) => x.id === id);
    const cur = activeGoal();
    openSheet('<h3>' + esc(g.emoji) + ' ' + esc(g.nama) + '</h3><p>Target ' + rp(g.target) + ' · tenggat ' + fmtDate(g.tenggat) + '</p>' + rincianTable(g) +
      '<div class="list"><button class="list-item" id="id-on"><span>🎯 Jadikan tujuan aktif</span><small>›</small></button>' +
      '<button class="list-item" id="id-edit"><span>✏️ Ubah</span><small>›</small></button>' +
      '<button class="list-item danger-text" id="id-del">Hapus ide ini</button></div>' +
      '<div class="btn-row"><button class="btn" id="id-back">Kembali</button></div>', (el) => {
      el.querySelector('#id-back').onclick = openGoalIdeas;
      el.querySelector('#id-edit').onclick = () => openGoalReview(g, { goal: g });
      el.querySelector('#id-on').onclick = async () => {
        if (cur && !(await confirmBox('Jadikan "' + g.nama + '" tujuan aktif? "' + cur.nama + '" disimpan sebagai ide, uangnya tetap di dompetnya.', 'Jadikan aktif'))) { openIdea(id); return; }
        const ok = await run(() => api('activateGoal', { id }), g.emoji + ' ' + g.nama + ' jadi tujuan aktif. Gasss!');
        if (ok && g.tenggat <= todayStr()) { toast('Tenggatnya sudah lewat, atur ulang dulu ya'); openGoalReview(activeGoal(), { goal: activeGoal() }); }
      };
      el.querySelector('#id-del').onclick = async () => {
        if (!(await confirmBox('Hapus ide "' + g.nama + '"?', 'Hapus'))) { openIdea(id); return; }
        await run(() => api('deleteGoal', { id }), 'Ide dihapus');
      };
    });
  }

  async function achieve(g) {
    const ok = await run(() => api('achieveGoal', { id: g.id }));
    if (ok) celebrate(g.id);
  }

  /** Tujuan aktif sudah terkumpul penuh: tandai tercapai lalu rayakan (sekali). */
  async function maybeCelebrate() {
    const g = activeGoal();
    if (!g || S.celebrating || !$('sheet-backdrop').hidden || !$('tutorial').hidden || $('app').hidden) return;
    if (goalProg(g).status !== 'tercapai') return;
    S.celebrating = true;
    try {
      await api('achieveGoal', { id: g.id });
      await refresh(true);
    } finally { S.celebrating = false; }
    celebrate(g.id);
  }

  function celebrate(id) {
    const g = S.goals.find((x) => x.id === id);
    if (!g) return;
    const ide = S.goals.filter((x) => x.status === 'ide').length;
    openSheet('<div class="congrats"><div class="congrats-emoji">🎉' + esc(g.emoji) + '🎉</div><h3>' + esc(g.nama) + ' TERCAPAI!</h3>' +
      '<p>Target ' + rp(g.target) + ' sudah terkumpul. Kamu keren banget, sumpah. Galakku selama ini terbayar 🥹</p></div>' +
      '<div class="list"><button class="list-item" id="ce-share"><span>📸 Bagikan kartu pencapaian</span><small>›</small></button>' +
      (ide ? '<button class="list-item" id="ce-ideas"><span>💡 Pilih tujuan berikutnya dari ide (' + ide + ')</span><small>›</small></button>' : '') +
      '<button class="list-item" id="ce-new"><span>🎯 Buat tujuan berikutnya</span><small>›</small></button></div>' +
      '<div class="btn-row"><button class="btn" id="ce-close">Nanti</button></div>', (el) => {
      el.querySelector('#ce-close').onclick = closeSheet;
      el.querySelector('#ce-share').onclick = () => openShareGoal(g);
      if (ide) el.querySelector('#ce-ideas').onclick = openGoalIdeas;
      el.querySelector('#ce-new').onclick = () => openGoalCreate({});
    });
  }

  /** Kartu progres / pencapaian tujuan untuk story. */
  function openShareGoal(g) {
    const p = L.goalProgress(g, S.transactions, todayStr());
    const tercapai = g.status === 'tercapai' || p.status === 'tercapai';
    const st = { hide: false, dark: false, photo: null, final: null, sticker: null, busy: 0 };
    openSheet('<h3>📸 ' + (tercapai ? 'Kartu pencapaian' : 'Kartu progres') + '</h3>' +
      '<div class="sh-preview" id="sh-preview"><img id="sh-img" alt="Pratinjau kartu tujuan"></div>' +
      '<div class="sh-opts"><label class="sh-toggle"><input type="checkbox" id="sh-hide"> Sembunyikan nominal</label>' +
      '<div class="seg seg-sm" id="sh-ink" style="margin:0"><button type="button" data-dark="0" class="on">Teks putih</button><button type="button" data-dark="1">Teks gelap</button></div>' +
      '</div>' + sharePhotoAndButtons(), (el) => {
      const data = () => ({ nama: g.nama, emoji: g.emoji, appName: APP_NAME, tercapai,
        terkumpul: tercapai ? Math.max(p.terkumpul, p.target) : p.terkumpul, target: p.target, persen: tercapai ? 1 : p.persen,
        subjudul: tercapai ? '🎉 Tercapai' + (g.tercapai ? ' ' + fmtDate(g.tercapai) : '') + '. Gasss!' : '⏳ ' + sisaHariText(p.sisaHari) + ' · ' + STATUS[p.status].label });
      const redraw = shareRedraw(el, st, () => [data(), { kind: 'tujuan', dark: st.dark, photo: st.photo, hideAmount: st.hide }]);
      el.querySelector('#sh-hide').onchange = (e) => { st.hide = e.target.checked; redraw(); };
      bindShareControls(el, st, redraw, 'tujuan', todayStr(), (tercapai ? 'Pencapaian ' : 'Progres ') + g.nama);
      redraw();
    });
  }

  // ---------- Tab ----------

  function setTab(tab) {
    S.tab = tab;
    ['home', 'history', 'report', 'settings'].forEach((t) => { $('view-' + t).hidden = t !== tab; });
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('voice-bar').hidden = tab === 'settings';
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Lembar bawah (modal) ----------

  function openSheet(html, onMount) {
    sheetCleanup();
    $('sheet').innerHTML = html;
    $('sheet-backdrop').hidden = false;
    if (onMount) onMount($('sheet'));
  }
  function closeSheet() { sheetCleanup(); $('sheet-backdrop').hidden = true; $('sheet').innerHTML = ''; }
  /** Hentikan hal yang masih berjalan di lembar sebelumnya (mis. rekaman suara). */
  function sheetCleanup() { const f = S.onSheetClose; S.onSheetClose = null; if (f) f(); }

  function askText(title, value, placeholder) {
    return new Promise((resolve) => {
      openSheet('<h3>' + esc(title) + '</h3><div class="field"><input id="ask-input" value="' + esc(value || '') +
        '" placeholder="' + esc(placeholder || '') + '"></div><div class="btn-row"><button class="btn" id="ask-no">Batal</button>' +
        '<button class="btn primary" id="ask-yes">Simpan</button></div>', (el) => {
        const inp = el.querySelector('#ask-input');
        setTimeout(() => inp.focus(), 50);
        el.querySelector('#ask-no').onclick = () => { closeSheet(); resolve(null); };
        el.querySelector('#ask-yes').onclick = () => { closeSheet(); resolve(inp.value.trim() || null); };
        inp.onkeydown = (e) => { if (e.key === 'Enter') el.querySelector('#ask-yes').click(); };
      });
    });
  }

  function confirmBox(msg, yesLabel) {
    return new Promise((resolve) => {
      openSheet('<h3>' + esc(msg) + '</h3><div class="btn-row"><button class="btn" id="c-no">Batal</button>' +
        '<button class="btn primary" id="c-yes">' + esc(yesLabel || 'Ya') + '</button></div>', (el) => {
        el.querySelector('#c-no').onclick = () => { closeSheet(); resolve(false); };
        el.querySelector('#c-yes').onclick = () => { closeSheet(); resolve(true); };
      });
    });
  }

  function moneyInput(inp) {
    inp.addEventListener('input', () => {
      const n = digits(inp.value);
      inp.value = n ? n.toLocaleString('id-ID') : '';
    });
  }

  // ---------- Form transaksi (tambah/edit) ----------

  function openTxForm(tx) {
    const isNew = !tx.id;
    let jenis = tx.jenis || 'keluar';
    const walletOpts = (sel) => activeWallets().concat(S.wallets.filter((w) => w.arsip && w.id === sel))
      .map((w) => '<option value="' + esc(w.id) + '"' + (w.id === sel ? ' selected' : '') + '>' + esc(w.nama) + '</option>').join('');

    openSheet(
      '<h3>' + (isNew ? 'Tambah transaksi' : 'Ubah transaksi') + '</h3>' +
      '<div class="field seg" id="tf-jenis"><button data-j="keluar">Keluar</button><button data-j="masuk">Masuk</button><button data-j="pindah">Pindah</button></div>' +
      '<div class="field"><label>Nominal</label><input id="tf-nominal" inputmode="numeric" placeholder="0" value="' +
        (tx.nominal ? Number(tx.nominal).toLocaleString('id-ID') : '') + '"></div>' +
      '<div class="field"><label>Keterangan</label><input id="tf-ket" value="' + esc(tx.keterangan || '') + '"></div>' +
      '<div class="field" id="tf-cat-field"><label>Kategori</label><select id="tf-cat"></select></div>' +
      '<div class="field"><label id="tf-wallet-label">Dompet</label><select id="tf-wallet">' + walletOpts(tx.dompet_id || L.UTAMA_ID) + '</select></div>' +
      '<div class="field" id="tf-to-field"><label>Ke dompet</label><select id="tf-to">' + walletOpts(tx.dompet_tujuan_id || '') + '</select></div>' +
      '<div class="field"><label>Tanggal</label><input type="date" id="tf-date" value="' + esc(tx.tanggal || todayStr()) + '"></div>' +
      (tx.transkrip ? '<p class="transcript">Dari ucapan: “' + esc(tx.transkrip) + '”</p>' : '') +
      '<div class="btn-row">' + (isNew ? '' : '<button class="btn danger" id="tf-del">Hapus</button>') +
      '<button class="btn" id="tf-cancel">Batal</button><button class="btn primary" id="tf-save">Simpan</button></div>',
      (el) => {
        moneyInput(el.querySelector('#tf-nominal'));
        const sync = () => {
          el.querySelectorAll('#tf-jenis button').forEach((b) => b.classList.toggle('on', b.dataset.j === jenis));
          el.querySelector('#tf-cat-field').hidden = jenis === 'pindah';
          el.querySelector('#tf-to-field').hidden = jenis !== 'pindah';
          el.querySelector('#tf-wallet-label').textContent = jenis === 'masuk' ? 'Masuk ke dompet' : 'Dari dompet';
          const cur = el.querySelector('#tf-cat').value || tx.kategori;
          el.querySelector('#tf-cat').innerHTML = catsOf(jenis === 'pindah' ? 'keluar' : jenis).map((c) =>
            '<option' + (c.nama === cur ? ' selected' : '') + '>' + esc(c.nama) + '</option>').join('');
        };
        el.querySelectorAll('#tf-jenis button').forEach((b) => { b.onclick = () => { jenis = b.dataset.j; sync(); }; });
        // Pengeluaran baru: dompet otomatis mengikuti kategori yang dipilih.
        el.querySelector('#tf-cat').addEventListener('change', () => {
          if (!isNew || jenis !== 'keluar') return;
          const w = L.walletForCategory(el.querySelector('#tf-cat').value, S.wallets);
          el.querySelector('#tf-wallet').value = w || L.UTAMA_ID;
        });
        sync();
        el.querySelector('#tf-cancel').onclick = closeSheet;
        if (!isNew) {
          el.querySelector('#tf-del').onclick = async () => {
            if (!(await confirmBox('Hapus transaksi ini?', 'Hapus'))) { openTxForm(tx); return; }
            await run(() => api('deleteTx', { id: tx.id }), 'Transaksi dihapus');
          };
        }
        el.querySelector('#tf-save').onclick = async () => {
          const data = {
            id: tx.id, jenis,
            nominal: digits(el.querySelector('#tf-nominal').value),
            keterangan: el.querySelector('#tf-ket').value.trim(),
            kategori: el.querySelector('#tf-cat').value,
            dompet_id: el.querySelector('#tf-wallet').value,
            dompet_tujuan_id: jenis === 'pindah' ? el.querySelector('#tf-to').value : '',
            tanggal: el.querySelector('#tf-date').value || todayStr(),
          };
          if (!data.nominal) { toast('Isi nominalnya dulu'); return; }
          if (jenis === 'pindah' && data.dompet_id === data.dompet_tujuan_id) { toast('Dompet asal dan tujuan harus berbeda'); return; }
          closeSheet();
          await run(() => api(isNew ? 'addTx' : 'updateTx', { tx: data }), isNew ? 'Tersimpan' : 'Perubahan disimpan');
        };
      });
  }

  /** Jalankan aksi ke server lalu muat ulang data. */
  async function run(fn, okMsg) {
    try {
      const out = await fn();
      await refresh();
      if (okMsg) toast(okMsg);
      return out;
    } catch (e) {
      toast(e.message, 4000);
      return null;
    }
  }

  // ---------- Bagi uang ----------

  function openSplit() {
    const cw = computed();
    const saldo = Object.fromEntries(cw.map((w) => [w.id, w.saldo]));
    const ws = activeWallets();
    if (ws.length < 2) {
      toast('Buat dompet lain dulu di menu Atur');
      return;
    }
    openSheet(
      '<h3>Bagi uang ke dompet</h3>' +
      '<div class="field"><label>Ambil dari</label><select id="sp-from">' +
        ws.map((w) => '<option value="' + esc(w.id) + '">' + esc(w.nama) + ' (' + rp(saldo[w.id]) + ')</option>').join('') + '</select></div>' +
      '<div id="sp-rows"></div>' +
      '<div class="split-total"><span>Total dibagi</span><strong id="sp-total">Rp0</strong></div>' +
      '<div class="split-total" style="border:0;padding-top:4px"><span>Sisa di dompet asal</span><strong id="sp-sisa"></strong></div>' +
      '<div class="btn-row"><button class="btn" id="sp-cancel">Batal</button><button class="btn primary" id="sp-save">Bagi</button></div>',
      (el) => {
        const from = el.querySelector('#sp-from');
        const drawRows = () => {
          el.querySelector('#sp-rows').innerHTML = ws.filter((w) => w.id !== from.value).map((w) =>
            '<div class="split-row field"><label style="margin:0">' + esc(w.nama) + '<br><small>' + rp(saldo[w.id]) + '</small></label>' +
            '<input inputmode="numeric" placeholder="0" data-to="' + esc(w.id) + '"></div>').join('');
          el.querySelectorAll('[data-to]').forEach((inp) => { moneyInput(inp); inp.addEventListener('input', total); });
          total();
        };
        const total = () => {
          const t = Array.from(el.querySelectorAll('[data-to]')).reduce((s, i) => s + digits(i.value), 0);
          el.querySelector('#sp-total').textContent = rp(t);
          const sisa = saldo[from.value] - t;
          const sisaEl = el.querySelector('#sp-sisa');
          sisaEl.textContent = rp(sisa);
          sisaEl.className = sisa < 0 ? 'c-out' : '';
        };
        from.onchange = drawRows;
        drawRows();
        el.querySelector('#sp-cancel').onclick = closeSheet;
        el.querySelector('#sp-save').onclick = async () => {
          const txs = Array.from(el.querySelectorAll('[data-to]')).filter((i) => digits(i.value) > 0).map((i) => ({
            jenis: 'pindah', nominal: digits(i.value), dompet_id: from.value, dompet_tujuan_id: i.dataset.to,
            keterangan: 'Isi dompet ' + walletName(i.dataset.to), tanggal: todayStr(),
          }));
          if (!txs.length) { toast('Isi jumlah untuk minimal satu dompet'); return; }
          closeSheet();
          await run(() => api('addTxs', { txs }), 'Uang sudah dibagi ke ' + txs.length + ' dompet');
        };
      });
  }

  // ---------- Pengaturan dompet & kategori ----------

  async function editWallet(id) {
    const w = S.wallets.find((x) => x.id === id);
    const saldo = computed().find((x) => x.id === id).saldo;
    const cur = walletColorIndex(id);
    openSheet('<h3>' + wEmoji(w) + ' ' + esc(w.nama) + '</h3><p>Saldo: <strong>' + rp(saldo) + '</strong></p>' +
      '<div class="field"><label>Warna dompet</label><div class="swatches">' +
      Array.from({ length: PICK_COLORS }, (_, i) => '<button class="swatch wc-' + i + (i === cur ? ' on' : '') +
        '" data-color="' + i + '" aria-label="' + COLOR_NAMES[i] + '"></button>').join('') + '</div></div>' +
      '<div class="list"><button class="list-item" id="ew-rename">Ganti nama</button>' +
      '<button class="list-item" id="ew-history">Lihat riwayat dompet ini</button>' +
      (id === L.UTAMA_ID || w.tujuan ? '' : '<div class="list-item"><label for="ew-kat" style="flex:1">Dompet untuk kategori</label><select id="ew-kat" class="ew-kat">' +
        '<option value="">(tidak ada)</option>' + catsOf('keluar').filter((c) => c.nama !== 'Lainnya').map((c) => '<option' + (w.kategori === c.nama ? ' selected' : '') + '>' +
        esc(c.nama) + '</option>').join('') + '</select></div>') +
      (id === L.UTAMA_ID ? '' : '<button class="list-item danger-text" id="ew-del">Hapus dompet</button>') + '</div>' +
      '<div class="btn-row"><button class="btn" id="ew-close">Tutup</button></div>', (el) => {
      el.querySelector('#ew-close').onclick = closeSheet;
      el.querySelectorAll('[data-color]').forEach((b) => {
        b.onclick = async () => {
          const warna = Number(b.dataset.color);
          if (warna === walletColorIndex(id)) return;
          el.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
          // Langsung tampilkan warnanya, lalu simpan ke server.
          const prev = w.warna;
          w.warna = String(warna);
          render();
          try {
            await api('setWalletColor', { id, warna });
            toast('Warna ' + w.nama + ': ' + COLOR_NAMES[warna]);
          } catch (e) {
            w.warna = prev;
            render();
            toast(e.message, 4000);
          }
        };
      });
      el.querySelector('#ew-history').onclick = () => { closeSheet(); showWalletHistory(id); };
      const kat = el.querySelector('#ew-kat');
      if (kat) kat.onchange = async () => { await api('setWalletCategory', { id, kategori: kat.value }); await refresh(true); toast(kat.value ? 'Pengeluaran ' + kat.value + ' sekarang diambil dari ' + w.nama : 'Tautan kategori dilepas'); };
      el.querySelector('#ew-rename').onclick = async () => {
        const nama = await askText('Nama dompet', w.nama);
        if (nama && nama !== w.nama) await run(() => api('renameWallet', { id, nama }), 'Nama dompet diganti');
      };
      if (id !== L.UTAMA_ID) {
        el.querySelector('#ew-del').onclick = async () => {
          if (saldo !== 0) {
            closeSheet();
            toast('Saldo dompet masih ' + rp(saldo) + '. Pindahkan dulu sisanya ke dompet lain.', 5000);
            return;
          }
          if (await confirmBox('Hapus dompet "' + w.nama + '"? Riwayat transaksinya tetap tersimpan.', 'Hapus')) {
            await run(() => api('deleteWallet', { id }), 'Dompet dihapus');
          }
        };
      }
    });
  }

  function showWalletHistory(id) {
    S.filter = { q: '', month: '', wallet: id, cat: '' };
    $('f-search').value = '';
    setTab('history');
  }

  async function editCategory(nama, jenis) {
    openSheet('<h3>' + esc(nama) + '</h3><div class="list">' +
      '<button class="list-item" id="ec-rename">Ganti nama</button>' +
      (nama === 'Lainnya' ? '' : '<button class="list-item danger-text" id="ec-del">Hapus kategori</button>') + '</div>' +
      '<div class="btn-row"><button class="btn" id="ec-close">Tutup</button></div>', (el) => {
      el.querySelector('#ec-close').onclick = closeSheet;
      el.querySelector('#ec-rename').onclick = async () => {
        const baru = await askText('Nama kategori', nama);
        if (baru && baru !== nama) await run(() => api('renameCategory', { lama: nama, baru, jenis }), 'Kategori diganti');
      };
      if (nama !== 'Lainnya') {
        el.querySelector('#ec-del').onclick = async () => {
          if (await confirmBox('Hapus kategori "' + nama + '"? Transaksi lama tetap memakai nama ini.', 'Hapus')) {
            await run(() => api('deleteCategory', { nama, jenis }), 'Kategori dihapus');
          }
        };
      }
    });
  }

  // ---------- Suara & ketik ----------

  let recording = false, busy = false, recTimer = null, recStart = 0;

  function setVoiceStatus(text) { $('voice-status').textContent = text || ''; }

  async function onMic() {
    if (busy) return;
    if (!recording) {
      try {
        await window.HBRecorder.start();
      } catch (e) {
        toast(e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Aktifkan di pengaturan Safari.' : e.message, 5000);
        return;
      }
      recording = true;
      recStart = Date.now();
      $('btn-mic').classList.add('recording');
      setVoiceStatus('Mendengarkan… 0 dtk');
      recTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - recStart) / 1000);
        setVoiceStatus('Mendengarkan… ' + sec + ' dtk\nTekan lagi untuk selesai');
        if (sec >= MAX_REC_SEC) onMic();
      }, 500);
      return;
    }
    recording = false;
    clearInterval(recTimer);
    $('btn-mic').classList.remove('recording');
    const blob = await window.HBRecorder.stop();
    if (!blob || Date.now() - recStart < 700) { setVoiceStatus(''); toast('Rekaman terlalu pendek'); return; }
    const tConv = Date.now();
    setVoiceStatus('Menyiapkan rekaman…');
    const payload = await window.HBRecorder.toPayload(blob);
    S.convMs = Date.now() - tConv;
    await processAi({ audio: payload.data, mime: payload.mime });
  }

  /**
   * Kirim ke server lewat jalur utama. Kalau belum ada jawaban dalam BACKUP_AFTER_MS (atau jalur utama gagal),
   * kirim juga lewat jalur cadangan yang memakai model AI lain. Yang selesai duluan dipakai.
   * Server hanya membaca ucapan; transaksi disimpan di HP sekali saja oleh processAi.
   */
  function aiWithBackup(req) {
    if (DEMO) {
      if (req.audio) return Promise.reject(new Error('Mode demo belum bisa memproses suara. Coba fitur ketik.'));
      // Mode demo: kata "tujuan" diartikan dompet tujuan aktif.
      const g = activeGoal();
      const text = g ? req.text.replace(/\btujuan(ku)?\b/i, walletName(g.dompet_id).toLowerCase()) : req.text;
      return Promise.resolve({ transkrip: req.text, demoTxs: L.parseDemo(text, S.wallets, S.categories, todayStr()) });
    }
    const lists = {
      wallets: activeWallets().map((w) => ({ id: w.id, nama: w.nama })),
      categories: S.categories.map((c) => ({ nama: c.nama, jenis: c.jenis })),
      konteks: aiContext(),
    };
    return new Promise((resolve, reject) => {
      let finished = false, pending = 0, backupSent = false, lastErr = null, timer = null;
      const send = (lane) => {
        pending++;
        api('parse', { ...req, ...lists, lane }).then((out) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve(out);
        }, (err) => {
          pending--;
          lastErr = err;
          if (finished) return;
          if (err.code === 'auth' || err.code === 'forbidden') { finished = true; clearTimeout(timer); reject(err); return; }
          if (!backupSent && !DEMO) { clearTimeout(timer); backup(); return; }
          if (pending === 0) { finished = true; reject(lastErr); }
        });
      };
      const backup = () => {
        if (backupSent || finished) return;
        backupSent = true;
        send(1);
      };
      send(0);
      if (!DEMO) timer = setTimeout(backup, BACKUP_AFTER_MS);
    });
  }

  async function processAi(req) {
    busy = true;
    $('btn-mic').classList.add('busy');
    const t0 = Date.now();
    setVoiceStatus('Memproses… 0 dtk');
    const tick = setInterval(() => setVoiceStatus('Memproses… ' + Math.floor((Date.now() - t0) / 1000) + ' dtk'), 1000);
    try {
      const out = await aiWithBackup(req);
      const sumber = req.audio ? 'suara' : 'ketik';
      const txs = out.demoTxs ? out.demoTxs.map((t) => ({ ...t, sumber, transkrip: out.transkrip }))
        : L.mapAiResult(out, S.wallets, S.categories, { sumber, transkrip: out.transkrip, today: todayStr() });
      out.saved = txs.length ? await api('addTxs', { txs }) : [];
      const totalMs = Date.now() - t0;
      S.lastTiming = { total: totalMs, ai: out.timing && out.timing.ai_ms, model: out.timing && out.timing.model,
        attempts: out.timing && out.timing.attempts, lane: out.timing && out.timing.lane, log: (out.timing && out.timing.log) || [], conv: req.audio ? S.convMs : 0, kb: req.audio ? Math.round(req.audio.length * 0.75 / 1024) : 0 };
      S.transkrip = out.transkrip || '';
      S.newIds = new Set(out.saved.map((t) => t.id));
      await refresh(true);
      if (S.tab !== 'home') setTab('home');
      if (out.saved.length) {
        const total = out.saved.reduce((s, t) => s + t.nominal, 0);
        toast(out.saved.length + ' transaksi tersimpan (' + rp(total) + ') · ' + secs(totalMs) + '\nKetuk untuk koreksi.');
        warnWallets(out.saved);
        afterRecord(out.saved, out.komentar || '');
      } else {
        toast('Tidak ada transaksi yang dikenali. Coba ulangi dengan menyebut nominalnya.', 4000);
      }
    } catch (e) {
      offerRetry(req, e.message);
    } finally {
      clearInterval(tick);
      busy = false;
      $('btn-mic').classList.remove('busy');
      setVoiceStatus('');
    }
  }

  /** Simpan rekaman/teks yang gagal diproses supaya bisa dicoba lagi tanpa bicara ulang. */
  function offerRetry(req, msg) {
    openSheet('<h3>Belum berhasil diproses</h3><p>' + esc(msg) + '</p>' +
      '<p class="transcript">' + (req.audio ? 'Rekaman suara Anda masih disimpan.' : 'Teks: “' + esc(req.text) + '”') + '</p>' +
      '<div class="btn-row"><button class="btn" id="rt-no">Buang</button><button class="btn primary" id="rt-yes">Coba lagi</button></div>', (el) => {
      el.querySelector('#rt-no').onclick = closeSheet;
      el.querySelector('#rt-yes').onclick = () => { closeSheet(); processAi(req); };
    });
  }

  /** Beri tahu kalau dompet yang baru dipakai jadi menipis/habis. */
  function warnWallets(saved) {
    const ids = new Set(saved.filter((t) => t.jenis !== 'masuk').map((t) => t.dompet_id));
    const bad = computed().filter((w) => ids.has(w.id) && (w.status === 'menipis' || w.status === 'habis'));
    if (bad.length) {
      setTimeout(() => toast(bad.map((w) => '⚠️ ' + w.nama + (w.status === 'habis' ? ' habis' : ' hampir habis') +
        ' (' + rp(w.saldo) + ')').join('\n'), 5000), 3200);
    }
  }

  function openTyping() {
    openSheet('<h3>Ketik transaksi</h3><div class="field"><input id="ty-text" placeholder="mis. bakso 25rb, parkir 2rb dari uang makan" autocomplete="off"></div>' +
      '<div class="btn-row"><button class="btn" id="ty-manual">Isi formulir</button><button class="btn primary" id="ty-go">Catat</button></div>', (el) => {
      const inp = el.querySelector('#ty-text');
      setTimeout(() => inp.focus(), 50);
      el.querySelector('#ty-manual').onclick = () => openTxForm({});
      const go = () => {
        const text = inp.value.trim();
        if (!text) return;
        closeSheet();
        processAi({ text });
      };
      el.querySelector('#ty-go').onclick = go;
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  }

  // ---------- Login Google ----------
  // Memakai pengalihan halaman (bukan pop-up) supaya juga berjalan di aplikasi layar utama iPhone.

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }

  function randomStr() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  /** Alamat aplikasi ini tanpa "index.html", harus sama persis dengan yang didaftarkan di Google Cloud. */
  function appUrl() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }

  function logout(msg) {
    localStorage.removeItem(SESSION_KEY);
    $('app').hidden = true;
    $('login-screen').hidden = false;
    $('btn-login').disabled = false;
    $('login-error').textContent = msg || '';
    if (window.HBLogin) window.HBLogin.start();
  }

  function startLogin() {
    if (!CLIENT_ID) {
      $('login-error').textContent = 'Client ID Google belum diisi di config.js.';
      return;
    }
    const st = { state: randomStr(), nonce: randomStr() };
    localStorage.setItem(LOGIN_KEY, JSON.stringify(st));
    const q = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: appUrl(), response_type: 'id_token', scope: 'openid email profile',
      state: st.state, nonce: st.nonce, prompt: 'select_account',
    });
    $('btn-login').disabled = true;
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString();
  }

  /** Dipanggil saat Google mengembalikan pengguna ke aplikasi dengan #id_token=... */
  async function finishLogin() {
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', appUrl()); // buang token dari alamat
    let st = null;
    try { st = JSON.parse(localStorage.getItem(LOGIN_KEY)); } catch (e) { /* abaikan */ }
    localStorage.removeItem(LOGIN_KEY);
    logout();
    if (p.get('error')) {
      $('login-error').textContent = p.get('error') === 'access_denied'
        ? 'Login dibatalkan atau ditolak Google. Kalau Anda tidak membatalkan, minta pemilik aplikasi mendaftarkan email Anda sebagai Test user.' :
        'Login Google gagal (' + p.get('error') + '). Alamat yang harus didaftarkan: ' + appUrl();
      return;
    }
    if (!st || p.get('state') !== st.state) {
      $('login-error').textContent = 'Login tidak valid. Silakan coba lagi.';
      return;
    }
    $('btn-login').disabled = true;
    $('login-error').textContent = 'Memeriksa akun…';
    try {
      const out = await api('login', { idToken: p.get('id_token'), nonce: st.nonce });
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: out.token, email: out.email, nama: out.nama, owner: out.owner }));
      $('login-error').textContent = '';
      showApp();
    } catch (e) {
      logout(e.message);
    }
  }

  // ---------- Masukan & statistik ----------

  function sendFeedback() {
    openSheet('<h3>Kirim masukan</h3><p class="transcript">Ceritakan apa yang menyenangkan, membingungkan, atau ingin ditambahkan.</p>' +
      '<div class="field"><textarea id="fb-text" maxlength="2000" placeholder="Tulis masukan Anda…"></textarea></div>' +
      '<div class="btn-row"><button class="btn" id="fb-no">Batal</button><button class="btn primary" id="fb-yes">Kirim</button></div>', (el) => {
      const ta = el.querySelector('#fb-text');
      setTimeout(() => ta.focus(), 50);
      el.querySelector('#fb-no').onclick = closeSheet;
      el.querySelector('#fb-yes').onclick = async () => {
        const text = ta.value.trim();
        if (!text) { toast('Masukan masih kosong'); return; }
        try {
          await api('feedback', { text });
          closeSheet();
          toast('Terima kasih! Masukan Anda sudah terkirim 🙏');
        } catch (e) {
          toast(e.message, 5000);
        }
      };
    });
  }

  async function showStats() {
    let st;
    try {
      st = await withBusy('Mengambil statistik…', () => api('stats'));
    } catch (e) {
      toast(e.message, 5000);
      return;
    }
    const rows = st.hari.slice().reverse().map((d) =>
      '<tr><td>' + esc(fmtDay(d.day)) + '</td><td>' + d.aktif + '</td><td>' + d.catatan + '</td></tr>').join('');
    const fb = st.masukan.length ? st.masukan.map((f) =>
      '<div class="fb-item"><small>' + esc(f.email) + ' · ' + esc(fmtDateTime(f.ts)) + '</small>' + esc(f.text) + '</div>').join('')
      : '<p class="transcript">Belum ada masukan.</p>';
    openSheet('<h3>📈 Statistik pemakaian</h3>' +
      '<div class="month-strip" style="margin-top:0"><div class="stat"><div class="stat-label">Total pengguna</div><div class="stat-value">' +
      st.totalPengguna + '</div></div><div class="stat"><div class="stat-label">Baru (14 hari)</div><div class="stat-value">' + st.penggunaBaru14 + '</div></div></div>' +
      '<h2>14 hari terakhir</h2>' +
      (rows ? '<table class="stat-table"><tr><th>Hari</th><th>Pengguna aktif</th><th>Catatan AI</th></tr>' + rows + '</table>'
        : '<p class="transcript">Belum ada pemakaian AI.</p>') +
      '<h2>Masukan terbaru</h2>' + fb +
      '<div class="btn-row"><button class="btn" id="st-close">Tutup</button></div>', (el) => {
      el.querySelector('#st-close').onclick = closeSheet;
    });
  }

  async function showApp() {
    try {
      await window.HBStore.open(DEMO ? null : session().email);
    } catch (e) {
      toast('Penyimpanan HP tidak bisa dibuka: ' + e.message, 6000);
      return;
    }
    $('login-screen').hidden = true;
    if (window.HBLogin) window.HBLogin.stop();
    $('app').hidden = false;
    $('demo-banner').hidden = !DEMO;
    await loadMeta();
    setTab('home');
    await refresh();
    if (!DEMO && LEGACY_SERVER) offerMigrationOnce();
    if (!META.tutorialSelesai) showTutorial();
    else congratulateOnce().then(maybeAskGoal, maybeAskGoal).then(offerCategoryWallets);
  }

  // ---------- Ucapan selamat & stiker pencapaian hemat ----------

  /** Sekali tiap ganti bulan: kalau bulan lalu pemasukan masih bersisa, beri ucapan selamat. */
  async function congratulateOnce() {
    const lalu = L.shiftMonth(thisMonth(), -1);
    if (META.ucapanBulan === lalu) return;
    META.ucapanBulan = lalu;
    await api('setMeta', { key: 'ucapanBulan', value: lalu });
    const a = L.monthAchievement(S.transactions, lalu);
    if (!a) return;
    openSheet('<div class="congrats"><div class="congrats-emoji">🎉</div><h3>Selamat, kamu berhasil hemat!</h3>' +
      '<p>Di ' + esc(fmtMonth(lalu)) + ' pemasukanmu masih sisa <b>' + rp(a.sisa) + '</b> (' + Math.round(a.persen * 100) +
      '% dari ' + rp(a.masuk) + ').</p><p class="transcript">' + esc(window.HBShare.praiseLine(a.persen)) + '</p></div>' +
      '<div class="btn-row"><button class="btn" id="cg-close">Tutup</button><button class="btn primary" id="cg-share">📸 Bagikan ke story</button></div>', (el) => {
      el.querySelector('#cg-close').onclick = closeSheet;
      el.querySelector('#cg-share').onclick = () => openShareAchievement(lalu);
    });
  }

  function openShareAchievement(m) {
    const a = L.monthAchievement(S.transactions, m);
    if (!a) { toast('Belum ada sisa pemasukan di ' + fmtMonth(m) + '.'); return; }
    const st = { hide: false, dark: false, photo: null, final: null, sticker: null, busy: 0 };
    openSheet('<h3>🏆 Pencapaian ' + esc(fmtMonth(m)) + '</h3>' +
      '<div class="sh-preview" id="sh-preview"><img id="sh-img" alt="Pratinjau stiker pencapaian"></div>' +
      '<div class="sh-opts">' +
      '<label class="sh-toggle"><input type="checkbox" id="sh-hide"> Sembunyikan nominal</label>' +
      '<div class="seg seg-sm" id="sh-ink" style="margin:0"><button type="button" data-dark="0" class="on">Teks putih</button><button type="button" data-dark="1">Teks gelap</button></div>' +
      '</div>' + sharePhotoAndButtons(), (el) => {
      const data = () => ({ bulanLabel: fmtMonth(m), sisa: a.sisa, persen: a.persen, appName: APP_NAME });
      const redraw = shareRedraw(el, st, () => [data(), { kind: 'hemat', dark: st.dark, photo: st.photo, hideAmount: st.hide }]);
      el.querySelector('#sh-hide').onchange = (e) => { st.hide = e.target.checked; redraw(); };
      bindShareControls(el, st, redraw, 'hemat', m, 'Pencapaian hemat ' + fmtMonth(m));
      redraw();
    });
  }

  // ---------- Bagikan rekap bulanan (stiker story) ----------

  const APP_NAME = (window.HB_CONFIG && window.HB_CONFIG.APP_NAME) || 'Gasss';

  function openShareRecap() {
    const m = S.reportMonth;
    const rows = L.categoryReport(S.transactions, m).rows;
    if (!rows.length) { toast('Belum ada pengeluaran di ' + fmtMonth(m) + ' untuk dibagikan.'); return; }
    const st = { chosen: new Set(rows.slice(0, 3).map((r) => r.kategori)), line: true, dark: false, photo: null, final: null, sticker: null, busy: 0 };
    const keterangan = (kat) => S.transactions.filter((t) => t.jenis === 'keluar' && L.monthOf(t.tanggal) === m && t.kategori === kat)
      .map((t) => t.keterangan || '');

    openSheet('<h3>📸 Bagikan rekap ' + esc(fmtMonth(m)) + '</h3>' +
      '<div class="sh-preview" id="sh-preview"><img id="sh-img" alt="Pratinjau kartu rekap"></div>' +
      '<div class="field"><label>Kategori yang ditampilkan (maks. 5)</label><div class="sh-cats" id="sh-cats">' +
      rows.map((r) => '<button type="button" class="sh-chip" data-cat="' + esc(r.kategori) + '">' + (ICON[r.kategori] || '💸') + ' ' +
        esc(r.kategori) + ' <small>' + esc(rpShort(r.total)) + '</small></button>').join('') + '</div></div>' +
      '<div class="sh-opts">' +
      '<label class="sh-toggle"><input type="checkbox" id="sh-line" checked> Kalimat lucu</label>' +
      '<div class="seg seg-sm" id="sh-ink" style="margin:0"><button type="button" data-dark="0" class="on">Teks putih</button><button type="button" data-dark="1">Teks gelap</button></div>' +
      '</div>' + sharePhotoAndButtons(), (el) => {
      const drawChips = () => el.querySelectorAll('.sh-chip').forEach((b) => b.classList.toggle('on', st.chosen.has(b.dataset.cat)));
      const data = () => {
        const items = rows.filter((r) => st.chosen.has(r.kategori)).slice(0, 5)
          .map((r) => ({ nama: r.kategori, total: r.total, icon: ICON[r.kategori] || '💸' }));
        return {
          bulanLabel: fmtMonth(m), total: L.monthSummary(S.transactions, m).keluar, items, appName: APP_NAME,
          line: st.line && items.length ? window.HBShare.funnyLine(items[0], keterangan(items[0].nama)) : '',
        };
      };
      const redraw = shareRedraw(el, st, () => [data(), { dark: st.dark, photo: st.photo }]);
      el.querySelector('#sh-cats').onclick = (e) => {
        const b = e.target.closest('.sh-chip');
        if (!b) return;
        const k = b.dataset.cat;
        if (st.chosen.has(k)) st.chosen.delete(k);
        else if (st.chosen.size >= 5) { toast('Maksimal 5 kategori'); return; }
        else st.chosen.add(k);
        drawChips(); redraw();
      };
      el.querySelector('#sh-line').onchange = (e) => { st.line = e.target.checked; redraw(); };
      bindShareControls(el, st, redraw, 'rekap', m, 'Rekap ' + fmtMonth(m));
      drawChips();
      redraw();
    });
  }

  /** Bagian bawah lembar bagikan: pilih foto + tombol Simpan stiker / Bagikan. */
  function sharePhotoAndButtons() {
    return '<div class="sh-photo"><button type="button" class="btn" id="sh-pick">📷 Pakai foto sendiri</button>' +
      '<button type="button" class="btn" id="sh-nophoto" hidden>Hapus foto</button></div>' +
      '<input type="file" id="sh-file" accept="image/*" hidden>' +
      '<div class="btn-row"><button class="btn" id="sh-sticker">Simpan stiker transparan</button><button class="btn primary" id="sh-go">Bagikan</button></div>' +
      '<p class="transcript" style="margin-top:10px">Tips: pilih "Simpan stiker transparan" untuk ditempel di foto langsung dari Instagram (fitur stiker → galeri).</p>';
  }

  /**
   * Gambar disiapkan setiap kali pilihan berubah, supaya tombol Bagikan langsung membuka menu bagikan
   * (iPhone hanya mengizinkan menu bagikan tepat setelah ketukan). args() -> [data, opts].
   */
  function shareRedraw(el, st, args) {
    const img = el.querySelector('#sh-img');
    return async () => {
      const my = ++st.busy;
      const [d, opts] = args();
      const fin = await window.HBShare.render(d, opts, 'final');
      const stc = await window.HBShare.render(d, opts, 'sticker');
      const [bf, bs] = await Promise.all([window.HBShare.toBlob(fin), window.HBShare.toBlob(stc)]);
      if (my !== st.busy) return;
      st.final = bf; st.sticker = bs;
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      img.dataset.url = URL.createObjectURL(st.photo ? bf : bs);
      img.src = img.dataset.url;
      el.querySelector('#sh-preview').classList.toggle('has-photo', !!st.photo);
      el.querySelector('#sh-preview').classList.toggle('dark-ink', st.dark);
    };
  }

  /** Pasang tombol teks putih/gelap, foto, dan bagikan pada lembar bagikan. */
  function bindShareControls(el, st, redraw, kind, m, title) {
    el.querySelector('#sh-ink').onclick = (e) => {
      const b = e.target.closest('[data-dark]');
      if (!b) return;
      st.dark = b.dataset.dark === '1';
      el.querySelectorAll('#sh-ink button').forEach((x) => x.classList.toggle('on', x === b));
      redraw();
    };
    el.querySelector('#sh-pick').onclick = () => el.querySelector('#sh-file').click();
    el.querySelector('#sh-file').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { st.photo = await window.HBShare.loadPhoto(f); } catch (err) { toast(err.message); return; }
      el.querySelector('#sh-pick').textContent = '📷 Ganti foto';
      el.querySelector('#sh-nophoto').hidden = false;
      redraw();
    };
    el.querySelector('#sh-nophoto').onclick = () => {
      st.photo = null;
      el.querySelector('#sh-pick').textContent = '📷 Pakai foto sendiri';
      el.querySelector('#sh-nophoto').hidden = true;
      redraw();
    };
    const name = (suffix) => APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + suffix + '-' + m + '.png';
    el.querySelector('#sh-go').onclick = () => { if (st.final) shareImage(st.final, name(kind), title); };
    el.querySelector('#sh-sticker').onclick = () => { if (st.sticker) shareImage(st.sticker, name('stiker-' + kind), 'Stiker ' + title.toLowerCase()); };
  }

  /** Buka menu bagikan HP untuk gambar; kalau tidak didukung, unduh filenya. */
  function shareImage(blob, filename, title) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title }).catch((e) => { if (e.name !== 'AbortError') toast('Gagal membagikan: ' + e.message); });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Gambar disimpan');
  }

  // ---------- Perbandingan pengeluaran (Laporan) ----------

  function renderCompare() {
    const n = S.compareN || 3;
    document.querySelectorAll('#cmp-seg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
    const c = L.compareMonths(S.transactions, S.reportMonth, n);
    const cur = c.bulan[c.bulan.length - 1];
    const box = $('r-compare');
    if (!c.bulan.some((b) => b.keluar > 0)) {
      box.innerHTML = '<div class="empty">Belum ada pengeluaran untuk dibandingkan.</div>';
      return;
    }
    const short = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' }); };
    let verdict;
    if (c.persen === null) verdict = 'Belum ada data pengeluaran di bulan-bulan sebelumnya.';
    else if (Math.abs(c.persen) < 0.05) verdict = '⚖️ Pengeluaran ' + fmtMonth(cur.bulan) + ' kurang lebih sama dengan rata-rata sebelumnya.';
    else if (c.persen < 0) verdict = '🎉 Lebih hemat <b>' + Math.round(-c.persen * 100) + '%</b> (' + rp(-c.selisih) + ') dibanding rata-rata ' + c.dibanding + ' bulan sebelumnya.';
    else verdict = '🔥 Lebih boros <b>' + Math.round(c.persen * 100) + '%</b> (' + rp(c.selisih) + ') dibanding rata-rata ' + c.dibanding + ' bulan sebelumnya.';
    const partial = cur.bulan === thisMonth() ? '<p class="cmp-note">Bulan ini baru sampai tanggal ' + Number(todayStr().slice(8)) + ', jadi angkanya masih bisa bertambah.</p>' : '';
    // Batang memudar ke bawah; bulan laporan berwarna utama, bulan sebelumnya abu. Garis putus-putus = rata-rata.
    const W = 340, H = 190, L0 = 8, R0 = 8, T0 = 26, B0 = 24, pw = W - L0 - R0, ph = H - T0 - B0;
    const max = Math.max(...c.bulan.map((b) => b.keluar), c.rataSebelum, 1) * 1.1;
    const yv = (v) => T0 + (1 - v / max) * ph;
    const slot = pw / c.bulan.length, bw = Math.min(54, slot * 0.56);
    const bars = c.bulan.map((b, i) => {
      const cx = L0 + slot * (i + 0.5), last = i === c.bulan.length - 1;
      const label = '<text class="axis" x="' + cx + '" y="' + (H - 7) + '" text-anchor="middle"' + (last ? ' style="font-weight:800;fill:var(--text)"' : '') + '>' + esc(short(b.bulan)) + '</text>';
      if (!b.adaData || !b.keluar) return label + '<text class="axis" x="' + cx + '" y="' + (yv(0) - 8) + '" text-anchor="middle">–</text>';
      const top = yv(b.keluar), rr = Math.min(8, (yv(0) - top) / 2);
      const d = 'M' + (cx - bw / 2) + ' ' + yv(0) + ' V' + (top + rr) + ' Q' + (cx - bw / 2) + ' ' + top + ' ' + (cx - bw / 2 + rr) + ' ' + top +
        ' H' + (cx + bw / 2 - rr) + ' Q' + (cx + bw / 2) + ' ' + top + ' ' + (cx + bw / 2) + ' ' + (top + rr) + ' V' + yv(0) + ' Z';
      return '<path class="cmp-bar" style="animation-delay:' + (i * 0.08) + 's" d="' + d + '" fill="url(#' + (last ? 'cmp-cur' : 'cmp-old') + ')"/>' +
        '<rect x="' + (cx - bw / 2) + '" y="' + top + '" width="' + bw + '" height="3" rx="1.5" fill="var(' + (last ? '--brand' : '--cmp-old') + ')"/>' +
        '<text class="axis" x="' + cx + '" y="' + (top - 8) + '" text-anchor="middle" style="font-size:11px;font-weight:' + (last ? 800 : 600) + ';fill:var(' + (last ? '--text' : '--muted') + ')">' +
        rpShort(b.keluar) + '</text>' + label +
        '<rect class="cmp-hit" data-i="' + i + '" x="' + (cx - slot / 2) + '" y="0" width="' + slot + '" height="' + (H - B0) + '" fill="transparent"/>';
    }).join('');
    const fade = (id, color) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '"/>' +
      '<stop offset=".7" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity=".04"/></linearGradient>';
    const css = getComputedStyle(document.documentElement);
    const avgY = c.rataSebelum > 0 ? yv(c.rataSebelum) : null;
    const chart = '<div class="cmp-svg"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Pengeluaran ' + c.bulan.length + ' bulan terakhir">' +
      '<defs>' + fade('cmp-cur', css.getPropertyValue('--brand').trim()) + fade('cmp-old', css.getPropertyValue('--cmp-old').trim() || '#b9c6c2') + '</defs>' +
      '<line class="cash-grid" x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + yv(0) + '" y2="' + yv(0) + '"/>' + bars +
      (avgY !== null ? '<line x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + avgY + '" y2="' + avgY + '" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>' +
        '' : '') +
      '</svg><div class="cash-tip" id="cmp-tip" hidden></div></div>' +
      (avgY !== null ? '<p class="cmp-legend"><i></i>rata-rata ' + c.dibanding + ' bulan sebelumnya: ' + rp(c.rataSebelum) + '</p>' : '');
    const rows = c.kategori.slice(0, 8).map((k) => {
      const up = k.selisih > 0.5, down = k.selisih < -0.5;
      return '<tr><td>' + (ICON[k.kategori] || '•') + ' ' + esc(k.kategori) + '</td><td>' + rpShort(k.ini) + '</td><td>' + rpShort(k.rata) + '</td>' +
        '<td class="' + (up ? 'c-out' : down ? 'c-in' : '') + '">' + (up ? '▲ ' : down ? '▼ ' : '') + rpShort(Math.abs(k.selisih)) + '</td></tr>';
    }).join('');
    box.innerHTML = '<p class="cmp-verdict">' + verdict + '</p>' + partial + chart +
      (c.persen === null ? '' : '<div class="cmp-table-wrap"><table class="stat-table cmp-table"><tr><th>Kategori</th><th>' + esc(short(cur.bulan)) +
        '</th><th>Rata²</th><th>±</th></tr>' + rows + '</table></div>') +
      '<button class="share-cta" id="btn-share-cmp">📸 Bagikan perbandingan <small>ke story</small></button>';
    $('btn-share-cmp').onclick = () => openShareChart('banding');
    // Ketuk batang untuk rincian.
    const tip = $('cmp-tip'), svg = box.querySelector('.cmp-svg svg');
    box.querySelectorAll('.cmp-hit').forEach((h) => {
      const show = () => {
        const b = c.bulan[Number(h.dataset.i)], last = Number(h.dataset.i) === c.bulan.length - 1;
        tip.replaceChildren();
        const add = (tag, text) => { const e = document.createElement(tag); e.textContent = text; tip.appendChild(e); };
        add('strong', fmtMonth(b.bulan));
        add('div', 'Keluar ' + rp(b.keluar));
        if (last && c.rataSebelum > 0) add('div', (b.keluar <= c.rataSebelum ? '▼ ' : '▲ ') + rpShort(Math.abs(b.keluar - c.rataSebelum)) + ' dari rata-rata');
        tip.hidden = false;
        const rb = svg.getBoundingClientRect(), hb = h.getBoundingClientRect(), wrap = svg.parentNode.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(hb.left - wrap.left + hb.width / 2 - tip.offsetWidth / 2, 4), wrap.width - tip.offsetWidth - 4) + 'px';
        tip.style.top = Math.max(0, rb.height * 0.15 - tip.offsetHeight / 2) + 'px';
      };
      h.addEventListener('pointerdown', show);
      h.addEventListener('pointerenter', show);
      h.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
    });
  }

  /** Bagikan grafik posisi kas / perbandingan ke story (stiker transparan atau di atas foto). */
  function openShareChart(kind) {
    const m = S.reportMonth;
    let data;
    if (kind === 'kas') {
      const { pts, daysInMonth } = cashData(m);
      if (!pts.length) { toast('Belum ada data posisi kas di ' + fmtMonth(m) + '.'); return; }
      const last = pts[pts.length - 1], z = zoneText(last.persen, last.d);
      data = { bulanLabel: fmtMonth(m), days: daysInMonth, pts: pts.map((p) => ({ d: p.d, persen: p.persen })), persen: last.persen, saldo: last.saldo,
        zona: z.zona, line: z.icon + ' ' + z.label, appName: APP_NAME };
    } else {
      const c = L.compareMonths(S.transactions, m, S.compareN || 3);
      const short = (ym) => { const [y, mm] = ym.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('id-ID', { month: 'short' }); };
      data = { bulanLabel: fmtMonth(m), bulan: c.bulan.map((b) => ({ label: short(b.bulan), keluar: b.adaData ? b.keluar : 0 })), rata: c.rataSebelum,
        persen: c.persen, appName: APP_NAME };
    }
    const st = { hide: false, dark: false, photo: null, final: null, sticker: null, busy: 0 };
    openSheet('<h3>📸 ' + (kind === 'kas' ? 'Posisi kas ' : 'Perbandingan ') + esc(fmtMonth(m)) + '</h3>' +
      '<div class="sh-preview" id="sh-preview"><img id="sh-img" alt="Pratinjau stiker grafik"></div>' +
      '<div class="sh-opts"><label class="sh-toggle"><input type="checkbox" id="sh-hide"> Sembunyikan nominal</label>' +
      '<div class="seg seg-sm" id="sh-ink" style="margin:0"><button type="button" data-dark="0" class="on">Teks putih</button><button type="button" data-dark="1">Teks gelap</button></div>' +
      '</div>' + sharePhotoAndButtons(), (el) => {
      const redraw = shareRedraw(el, st, () => [data, { kind, dark: st.dark, photo: st.photo, hideAmount: st.hide }]);
      el.querySelector('#sh-hide').onchange = (e) => { st.hide = e.target.checked; redraw(); };
      bindShareControls(el, st, redraw, kind === 'kas' ? 'posisi-kas' : 'perbandingan', m, (kind === 'kas' ? 'Posisi kas ' : 'Perbandingan ') + fmtMonth(m));
      redraw();
    });
  }

  function rpShort(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (a >= 1e3) return 'Rp' + Math.round(n / 1e3).toLocaleString('id-ID') + ' rb';
    return rp(n);
  }

  // ---------- Tutorial singkat (pertama kali masuk) ----------

  const TUTORIAL = [
    { icon: '👋', title: 'Halo, bos! Aku Gasss', text: 'Aku bantu kamu mewujudkan <b>satu tujuan</b>: liburan, HP baru, ikut race lari, nikah… lengkap dengan tenggatnya. Bukan cuma nyatet, tapi ngawal sampai kesampaian.' },
    { icon: '🎯', title: 'Satu tujuan, satu fokus', text: 'Ceritakan tujuanmu, mis. <b>“ikut Jakarta Marathon Juni 2027”</b>. AI bikinin rincian biayanya, kamu tinggal koreksi. Uangnya disimpan di <b>dompet khusus tujuan</b>. Ide tujuan lain boleh disimpan buat giliran berikutnya.' },
    { icon: '🎙️', title: 'Nggak usah ngetik, ngomong aja', text: 'Tekan tombol mic, terus cerita kayak lagi curhat:<br><b>“makan siang 25 ribu, parkir 2 ribu”</b> atau <b>“nabung 500 ribu ke tujuan”</b>.<br>Goceng, ceban, cepek? Paham kok. Kalau salah tangkap, ketuk transaksinya terus benerin.' },
    { icon: '😤', title: 'Hati-hati, aku bisa galak', text: 'Kas masih aman? Aku santai & lucu. Kas menipis? Aku makin tegas, sampai <b>marah-marah</b>. Galak karena sayang, biar tujuanmu nggak mundur. Lihat juga <b>jatah aman hari ini</b> di Beranda.' },
    { icon: '💾', title: 'Datamu, HP-mu, tanggung jawabmu', text: 'Semua catatan cuma disimpan di HP ini, nggak di server mana pun. Jadi rajin-rajin <b>Simpan cadangan</b> ke Excel atau Google Sheets di menu Atur, biar nggak nangis kalau HP nyemplung.' },
    { icon: '🚀', title: 'Udah, gitu doang!', text: 'Habis ini kita bikin tujuan pertamamu (boleh <b>Nanti dulu</b>). Ada ide atau keluhan? <b>Atur → Kirim masukan</b>. Gasss!' },
  ];

  function showTutorial() {
    let i = 0;
    const el = $('tutorial');
    const draw = () => {
      const s = TUTORIAL[i];
      el.querySelector('.tut-icon').textContent = s.icon;
      el.querySelector('.tut-title').textContent = s.title;
      el.querySelector('.tut-text').innerHTML = s.text;
      el.querySelector('.tut-dots').innerHTML = TUTORIAL.map((_, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('');
      el.querySelector('#tut-back').hidden = i === 0;
      el.querySelector('#tut-skip').hidden = i === TUTORIAL.length - 1;
      el.querySelector('#tut-next').textContent = i === TUTORIAL.length - 1 ? 'Gas! 🚀' : 'Lanjut';
    };
    const done = async () => {
      el.hidden = true;
      META.tutorialSelesai = true;
      await api('setMeta', { key: 'tutorialSelesai', value: true });
      maybeAskGoal();
    };
    el.querySelector('#tut-next').onclick = () => { if (i < TUTORIAL.length - 1) { i++; draw(); } else done(); };
    el.querySelector('#tut-back').onclick = () => { if (i > 0) { i--; draw(); } };
    el.querySelector('#tut-skip').onclick = done;
    let x0 = null;
    el.ontouchstart = (e) => { x0 = e.touches[0].clientX; };
    el.ontouchend = (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (dx < -50 && i < TUTORIAL.length - 1) { i++; draw(); }
      if (dx > 50 && i > 0) { i--; draw(); }
    };
    draw();
    el.hidden = false;
  }

  // ---------- Cadangan ke Google Sheets ----------

  const GTOKEN_KEY = 'gs_gtoken';     // izin Google Sheets sementara (±1 jam), hanya di sesi browser ini
  const GPENDING_KEY = 'gs_gpending'; // aksi yang menunggu izin: { state, action }

  function sheetsToken() {
    try {
      const t = JSON.parse(sessionStorage.getItem(GTOKEN_KEY));
      const me = session();
      if (t && t.exp > Date.now() + 60000 && me && t.email === me.email) return t.token;
    } catch (e) { /* abaikan */ }
    return null;
  }

  /** Pastikan ada izin Google Sheets; kalau belum, pindah ke halaman izin Google lalu lanjut otomatis. */
  function withSheets(action) {
    const token = sheetsToken();
    if (token) return runSheetsAction(action, token);
    const st = 'gs.' + randomStr();
    localStorage.setItem(GPENDING_KEY, JSON.stringify({ state: st, action }));
    location.href = window.HBSheets.authUrl({ clientId: CLIENT_ID, redirect: appUrl(), state: st, email: session().email });
  }

  /** Dipanggil saat Google mengembalikan pengguna dengan #access_token=... */
  async function finishSheetsAuth() {
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', appUrl());
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(GPENDING_KEY)); } catch (e) { /* abaikan */ }
    localStorage.removeItem(GPENDING_KEY);
    await showApp();
    if (!pending || p.get('state') !== pending.state) { toast('Izin Google tidak valid. Coba lagi.'); return; }
    if (p.get('error') || !p.get('access_token')) {
      toast(p.get('error') === 'access_denied' ? 'Izin Google Sheets dibatalkan.' : 'Izin Google gagal: ' + (p.get('error') || '-'), 5000);
      return;
    }
    if (!/drive\.file/.test(p.get('scope') || '')) {
      toast('Centang izin Google Drive supaya cadangan bisa dibuat. Coba lagi.', 6000);
      return;
    }
    const token = p.get('access_token');
    sessionStorage.setItem(GTOKEN_KEY, JSON.stringify({ token, email: session().email, exp: Date.now() + Number(p.get('expires_in') || 3600) * 1000 }));
    setTab('settings');
    runSheetsAction(pending.action, token);
  }

  async function runSheetsAction(action, token) {
    try {
      if (action === 'backup') await sheetsBackup(token);
      else if (action === 'restore') await sheetsRestore(token);
    } catch (e) {
      if (e.code === 'auth') sessionStorage.removeItem(GTOKEN_KEY);
      toast(e.message, 6000);
    }
  }

  async function sheetsBackup(token) {
    const me = session();
    const knownId = await api('getMeta', { key: 'sheetsId' });
    const r = await withBusy('Menyimpan ke Google Sheets…', () => window.HBSheets.backup(token, window.HBStore.snapshot(),
      { dibuat: new Date().toISOString(), akun: me ? me.email : '' }, knownId));
    await api('setMeta', { key: 'sheetsId', value: r.id });
    META.sheetsId = r.id;
    META.lastBackup = new Date().toISOString();
    await api('setMeta', { key: 'lastBackup', value: META.lastBackup });
    await api('setMeta', { key: 'lastSheetsBackup', value: META.lastBackup });
    META.lastSheetsBackup = META.lastBackup;
    await markBackedUp();
    render();
    openSheet('<h3>Tersimpan di Google Sheets ✅</h3><p>' + window.HBStore.snapshot().transactions.length + ' transaksi sudah dicadangkan ke Google Drive Anda.</p>' +
      '<p class="transcript">Cadangan berikutnya akan memperbarui spreadsheet yang sama.</p>' +
      '<div class="btn-row"><button class="btn" id="gs-close">Tutup</button><a class="btn primary" id="gs-open" href="' + esc(r.url) +
      '" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Buka spreadsheet</a></div>', (el) => {
      el.querySelector('#gs-close').onclick = closeSheet;
    });
  }

  async function sheetsRestore(token) {
    const file = await withBusy('Mencari cadangan di Google Drive…', () => window.HBSheets.findLatest(token));
    if (!file) { toast('Belum ada cadangan Google Sheets dari aplikasi ini di akun Google Anda.', 5000); return; }
    const data = await withBusy('Membaca cadangan…', () => window.HBSheets.read(token, file.id));
    const when = fmtDateTime(file.modifiedTime);
    if (!(await confirmBox('Pulihkan dari "' + file.name + '" (diperbarui ' + when + ', ' + data.transactions.length +
      ' transaksi)? Data yang sekarang ada di HP ini akan diganti.', 'Pulihkan'))) return;
    const r = await api('replaceAll', { data });
    await api('setMeta', { key: 'sheetsId', value: file.id });
    META.sheetsId = file.id;
    S.newIds.clear(); S.transkrip = '';
    await refresh();
    toast('Berhasil dipulihkan dari Google Sheets: ' + r.transaksi + ' transaksi');
  }

  /** Pilihan cadangan dari banner pengingat. */
  function chooseBackup() {
    openSheet('<h3>Simpan cadangan ke…</h3><div class="list">' +
      (DEMO ? '' : '<button class="list-item" id="cb-sheets"><span>🟩 Google Sheets <small>(di Google Drive Anda)</small></span><small>›</small></button>') +
      '<button class="list-item" id="cb-excel"><span>💾 File Excel <small>(simpan di HP / kirim ke WA)</small></span><small>›</small></button></div>' +
      '<div class="btn-row"><button class="btn" id="cb-close">Batal</button></div>', (el) => {
      el.querySelector('#cb-close').onclick = closeSheet;
      el.querySelector('#cb-excel').onclick = () => { closeSheet(); makeBackup(); };
      if (!DEMO) el.querySelector('#cb-sheets').onclick = () => { closeSheet(); withSheets('backup'); };
    });
  }

  // ---------- Data di HP: cadangan, pulihkan, laporan, pindahan ----------

  const BACKUP_EVERY_DAYS = 30;
  const META = {};   // salinan meta dari penyimpanan HP (lastBackup, migrasiDicek)

  async function loadMeta() {
    META.lastBackup = await api('getMeta', { key: 'lastBackup' });
    META.migrasiDicek = await api('getMeta', { key: 'migrasiDicek' });
    META.tutorialSelesai = await api('getMeta', { key: 'tutorialSelesai' });
    META.sheetsId = await api('getMeta', { key: 'sheetsId' });
    META.lastSheetsBackup = await api('getMeta', { key: 'lastSheetsBackup' });
    META.backupSig = await api('getMeta', { key: 'backupSig' });
    META.ucapanBulan = await api('getMeta', { key: 'ucapanBulan' });
    META.tujuanNanti = await api('getMeta', { key: 'tujuanNanti' });
    META.komentar = await api('getMeta', { key: 'komentar' });
    META.dompetKategoriDitawarkan = await api('getMeta', { key: 'dompetKategoriDitawarkan' });
    META.cadanganNanti = await api('getMeta', { key: 'cadanganNanti' });
  }

  /** Catat sidik jari data yang baru saja dicadangkan (syarat tombol "Mulai pencatatan baru"). */
  async function markBackedUp() {
    META.backupSig = window.HBStore.signature();
    await api('setMeta', { key: 'backupSig', value: META.backupSig });
  }

  function daysSince(iso) {
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }
  function fmtDateTime(iso) {
    return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fileStamp() { return todayStr(); }

  function renderBackupBanner() {
    const b = $('backup-banner');
    // Patokan: cadangan terakhir, atau catatan pertama kalau belum pernah mencadangkan. "Nanti" menyembunyikan sampai bulan berikutnya.
    const pertama = S.transactions.reduce((m, t) => (!m || String(t.dibuat) < m ? String(t.dibuat) : m), '');
    const due = S.transactions.length > 0 && daysSince(META.lastBackup || pertama) >= BACKUP_EVERY_DAYS && META.cadanganNanti !== thisMonth();
    b.hidden = !due;
    if (due) {
      b.innerHTML = '<span>💾 ' + (META.lastBackup ? 'Sudah ' + daysSince(META.lastBackup) + ' hari belum simpan cadangan.'
        : 'Sudah sebulan mencatat. Data hanya ada di HP ini, simpan cadangan yuk.') + '</span><span class="bb-btns"><button data-backup-later>Nanti</button><button data-backup-now>Simpan</button></span>';
    }
  }

  function renderDataInfo() {
    $('s-data-info').innerHTML = '<span>📱 Data tersimpan di HP ini<br><small>' + S.transactions.length + ' transaksi · ' +
      (META.lastBackup ? 'cadangan terakhir ' + esc(fmtDateTime(META.lastBackup)) : 'belum pernah dicadangkan') +
      (META.sheetsId ? '<br><a href="https://docs.google.com/spreadsheets/d/' + esc(META.sheetsId) + '" target="_blank" rel="noopener">Buka cadangan Google Sheets</a>' : '') +
      '</small></span>';
    $('btn-sheets-backup').hidden = DEMO;
    $('btn-sheets-restore').hidden = DEMO;
    $('btn-reset').hidden = !META.backupSig;
  }

  /** Mulai pencatatan baru. Hanya boleh kalau data sekarang sudah tersimpan di cadangan terakhir. */
  function startFresh() {
    if (META.backupSig !== window.HBStore.signature()) {
      openSheet('<h3>Simpan cadangan dulu ya</h3><p>Ada catatan baru atau perubahan sejak cadangan terakhir. ' +
        'Supaya tidak ada yang hilang, simpan cadangan dulu, lalu buka menu ini lagi.</p>' +
        '<div class="btn-row"><button class="btn" id="rs-close">Batal</button><button class="btn primary" id="rs-backup">Simpan cadangan</button></div>', (el) => {
        el.querySelector('#rs-close').onclick = closeSheet;
        el.querySelector('#rs-backup').onclick = () => { closeSheet(); chooseBackup(); };
      });
      return;
    }
    const cw = L.computeWallets(S.wallets, S.transactions);
    const sisa = L.openingBalances(S.wallets, S.transactions, todayStr()).reduce((s, t) => s + t.nominal, 0);
    const minus = cw.some((w) => w.saldo < 0);
    openSheet('<h3>🧹 Mulai pencatatan baru</h3><p>Semua ' + S.transactions.length + ' transaksi di HP ini akan dihapus. ' +
      'Dompet dan kategori tetap ada. Data lama aman di cadangan terakhir (' + esc(fmtDateTime(META.lastBackup)) +
      ') dan bisa dikembalikan lewat menu Pulihkan.</p><div class="list">' +
      '<button class="list-item" id="rs-bawa"><span>💼 Bawa sisa saldo<br><small>Sisa uang tiap dompet (total ' + rp(sisa) +
      ') dicatat sebagai "Saldo awal"' + (minus ? '; saldo minus jadi Rp0' : '') + '</small></span><small>›</small></button>' +
      '<button class="list-item" id="rs-nol"><span>0️⃣ Mulai dari nol<br><small>Semua saldo dompet jadi Rp0</small></span><small>›</small></button></div>' +
      '<div class="btn-row"><button class="btn" id="rs-close">Batal</button></div>', (el) => {
      el.querySelector('#rs-close').onclick = closeSheet;
      el.querySelector('#rs-bawa').onclick = () => confirmFresh('bawa');
      el.querySelector('#rs-nol').onclick = () => confirmFresh('nol');
    });
  }

  async function confirmFresh(mode) {
    const msg = 'Yakin? ' + S.transactions.length + ' transaksi akan dihapus dari HP ini' +
      (mode === 'bawa' ? ' dan sisa saldo dibawa sebagai saldo awal.' : ' dan semua saldo jadi Rp0.');
    if (!(await confirmBox(msg, 'Ya, mulai baru'))) return;
    try {
      const r = await api('resetBook', { mode });
      S.newIds.clear(); S.transkrip = '';
      await refresh();
      toast(r.dihapus + ' transaksi dihapus. Pencatatan baru dimulai' + (r.dibawa ? ' dengan saldo awal ' + rp(r.dibawa) : '') + '.', 5000);
    } catch (e) {
      toast(e.message, 6000);
    }
  }

  /**
   * Tawarkan file ke pengguna. Dibuat dua langkah (siapkan, lalu ketuk "Simpan / Bagikan") karena
   * iPhone hanya mengizinkan menu bagikan langsung dari ketukan pengguna.
   */
  function offerFile(blob, filename, title, onSaved) {
    const file = new File([blob], filename, { type: blob.type });
    openSheet('<h3>' + esc(title) + '</h3><p>' + esc(filename) + ' · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB</p>' +
      '<p class="transcript">Di iPhone pilih "Simpan ke File" atau kirim lewat WhatsApp/email.</p>' +
      '<div class="btn-row"><button class="btn" id="of-close">Tutup</button><button class="btn primary" id="of-go">Simpan / Bagikan</button></div>', (el) => {
      el.querySelector('#of-close').onclick = closeSheet;
      el.querySelector('#of-go').onclick = async () => {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title });
            closeSheet();
            if (onSaved) await onSaved();
            return true;
          } catch (e) {
            if (e.name === 'AbortError') return false;
          }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        closeSheet();
        if (onSaved) await onSaved();
        return true;
      };
    });
  }

  async function withBusy(label, fn) {
    toast(label, 20000);
    try { return await fn(); } finally { $('toast').hidden = true; }
  }

  async function makeBackup() {
    try {
      const me = session();
      const blob = await withBusy('Menyiapkan cadangan…', () => window.HBExport.backupXlsx(window.HBStore.snapshot(),
        { dibuat: new Date().toISOString(), akun: me ? me.email : '' }));
      const sig = window.HBStore.signature();
      // Tombol "Mulai pencatatan baru" baru boleh dipakai setelah file benar-benar disimpan/dibagikan.
      offerFile(blob, 'gasss-cadangan-' + fileStamp() + '.xlsx', 'Cadangan siap', async () => {
        META.backupSig = sig;
        await api('setMeta', { key: 'backupSig', value: sig });
        render();
      });
      // Dianggap sudah dicadangkan begitu file dibuat.
      META.lastBackup = new Date().toISOString();
      await api('setMeta', { key: 'lastBackup', value: META.lastBackup });
      render();
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async function restoreBackup(file) {
    let data;
    try {
      data = await withBusy('Membaca file…', async () => window.HBExport.readBackup(await file.arrayBuffer()));
    } catch (e) {
      toast(e.message, 6000);
      return;
    }
    const msg = 'Ganti semua data di HP ini dengan isi cadangan? (' + data.transactions.length + ' transaksi, ' +
      data.wallets.filter((w) => !String(w.arsip)).length + ' dompet). Data yang sekarang akan terhapus.';
    if (!(await confirmBox(msg, 'Pulihkan'))) return;
    try {
      const r = await api('replaceAll', { data });
      S.newIds.clear(); S.transkrip = '';
      await refresh();
      toast('Berhasil dipulihkan: ' + r.transaksi + ' transaksi');
    } catch (e) {
      toast(e.message, 6000);
    }
  }

  /** Data lama dari Google Sheets (versi sebelum data disimpan di HP). */
  async function migrateFromSheets(auto) {
    let legacy;
    try {
      legacy = await withBusy('Mengambil data dari Google Sheets…', () => api('legacyState'));
    } catch (e) {
      if (!auto) toast(e.message, 5000);
      return;
    }
    await api('setMeta', { key: 'migrasiDicek', value: true });
    META.migrasiDicek = true;
    if (!legacy || !legacy.transactions.length) {
      if (!auto) toast('Tidak ada data lama di Google Sheets untuk akun ini.');
      return;
    }
    const replace = S.transactions.length > 0;
    const msg = 'Ada ' + legacy.transactions.length + ' transaksi lama di Google Sheets. Pindahkan ke HP ini?' +
      (replace ? ' Data yang sekarang ada di HP ini akan diganti.' : '');
    if (!(await confirmBox(msg, 'Pindahkan'))) return;
    try {
      const r = await api('replaceAll', { data: legacy });
      await refresh();
      toast(r.transaksi + ' transaksi dipindahkan ke HP ini. Jangan lupa simpan cadangan.', 5000);
    } catch (e) {
      toast(e.message, 6000);
    }
  }

  async function offerMigrationOnce() {
    if (!META.migrasiDicek && !S.transactions.length) migrateFromSheets(true);
  }

  /** Susun isi laporan bulan yang sedang dilihat di halaman Laporan. */
  function buildReport() {
    const m = S.reportMonth;
    const me = session();
    const cw = computed().filter((w) => !w.arsip);
    const statusText = { aman: 'Aman', menipis: 'Hampir habis', habis: 'Habis', kosong: 'Belum diisi' };
    const cp = L.cashPosition(S.transactions, m, m === thisMonth() ? todayStr() : null);
    const pts = cp.days.filter((d) => d.persen !== null);
    const last = pts[pts.length - 1];
    return {
      bulan: fmtMonth(m),
      akun: me ? (me.nama ? me.nama + ' (' + me.email + ')' : me.email) : '',
      dibuat: new Date().toLocaleString('id-ID'),
      ringkasan: L.monthSummary(S.transactions, m),
      totalSaldo: cw.reduce((s, w) => s + w.saldo, 0),
      posisiKas: last ? { persen: pct(last.persen), label: zoneText(last.persen, Number(String(last.tanggal).slice(8))).label } : null,
      dompet: activeWallets().map((w0) => { const w = cw.find((x) => x.id === w0.id); return { nama: w.nama, saldo: w.saldo, status: statusText[w.status] }; }),
      kategori: L.categoryReport(S.transactions, m).rows,
      transaksi: L.sortTx(S.transactions).filter((t) => L.monthOf(t.tanggal) === m).map((t) => ({
        tanggal: t.tanggal, jenis: t.jenis, keterangan: t.keterangan || t.kategori, kategori: t.kategori,
        dompet: walletName(t.dompet_id), tujuan: t.jenis === 'pindah' ? walletName(t.dompet_tujuan_id) : '', nominal: t.nominal })),
    };
  }

  async function exportReport(kind) {
    try {
      const rep = buildReport();
      const name = 'gasss-laporan-' + S.reportMonth + (kind === 'pdf' ? '.pdf' : '.xlsx');
      const blob = await withBusy('Menyiapkan laporan…', () =>
        kind === 'pdf' ? window.HBExport.reportPdf(rep, rp) : window.HBExport.reportXlsx(rep));
      offerFile(blob, name, 'Laporan ' + rep.bulan + ' siap');
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  // ---------- Event ----------

  function bind() {
    document.querySelector('.tabbar').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab === 'history') S.filter.wallet = S.filter.wallet || '';
      setTab(b.dataset.tab);
    };
    $('btn-refresh').onclick = () => refresh().then(() => toast('Data diperbarui'));
    $('btn-mic').onclick = onMic;
    $('btn-type').onclick = openTyping;
    $('btn-split').onclick = openSplit;
    $('btn-add-manual').onclick = () => openTxForm({});
    $('btn-add-wallet').onclick = async () => {
      const nama = await askText('Nama dompet baru', '', 'mis. Uang Makan');
      if (nama) await run(() => api('addWallet', { nama }), 'Dompet "' + nama + '" dibuat');
    };
    $('btn-add-wallet-home').onclick = () => $('btn-add-wallet').onclick();
    // Pensil dompet bisa dibuka dengan keyboard juga.
    document.body.addEventListener('keydown', (e) => {
      const ew = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-edit-wallet]');
      if (ew) { e.preventDefault(); editWallet(ew.dataset.editWallet); }
    });
    document.querySelectorAll('[data-add-cat]').forEach((b) => {
      b.onclick = async () => {
        const nama = await askText('Kategori ' + (b.dataset.addCat === 'masuk' ? 'pemasukan' : 'pengeluaran') + ' baru', '');
        if (nama) await run(() => api('addCategory', { nama, jenis: b.dataset.addCat }), 'Kategori dibuat');
      };
    });
    $('btn-backup').onclick = makeBackup;
    $('btn-restore').onclick = () => $('restore-file').click();
    $('restore-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); };
    $('btn-migrate').onclick = () => migrateFromSheets(false);
    $('btn-report-pdf').onclick = () => exportReport('pdf');
    $('btn-report-xlsx').onclick = () => exportReport('xlsx');
    $('backup-banner').onclick = async (e) => {
      if (e.target.closest('[data-backup-now]')) chooseBackup();
      if (e.target.closest('[data-backup-later]')) {
        META.cadanganNanti = thisMonth();
        render();
        await api('setMeta', { key: 'cadanganNanti', value: META.cadanganNanti });
      }
    };
    $('btn-sheets-backup').onclick = () => withSheets('backup');
    $('btn-sheets-restore').onclick = () => withSheets('restore');
    $('btn-tutorial').onclick = showTutorial;
    $('btn-share-recap').onclick = openShareRecap;
    $('btn-share-cash').onclick = () => openShareChart('kas');
    $('btn-share-hemat').onclick = () => openShareAchievement(S.reportMonth);
    $('btn-reset').onclick = startFresh;
    $('cmp-seg').onclick = (e) => { const b = e.target.closest('[data-n]'); if (b) { S.compareN = Number(b.dataset.n); renderCompare(); } };
    $('btn-logout').onclick = async () => {
      if (await confirmBox('Keluar dari akun ini di HP ini?', 'Keluar')) logout();
    };
    $('btn-login').onclick = startLogin;
    $('btn-feedback').onclick = sendFeedback;
    $('btn-stats').onclick = showStats;
    $('btn-reset-data').onclick = async () => {
      if (!(await confirmBox('Hapus SEMUA transaksi, dompet & kategori di HP ini? Simpan cadangan dulu kalau masih dibutuhkan. Tindakan ini tidak bisa dibatalkan.', 'Hapus semua'))) return;
      await window.HBStore.reset(); S.newIds.clear(); S.transkrip = '';
      META.komentar = null; META.tujuanNanti = null;
      await refresh();
      toast('Semua data di HP ini sudah dihapus');
    };

    // Klik di daftar (delegasi)
    document.body.addEventListener('click', (e) => {
      const txBtn = e.target.closest('[data-tx]');
      if (txBtn) { const t = S.transactions.find((x) => x.id === txBtn.dataset.tx); if (t) openTxForm(t); return; }
      if (e.target.closest('[data-goal-new]')) { openGoalCreate({}); return; }
      if (e.target.closest('[data-goal-open]')) { openGoalDetail(); return; }
      if (e.target.closest('[data-goal-ideas]')) { openGoalIdeas(); return; }
      if (e.target.closest('[data-set-aside]')) { const g = activeGoal(); if (g) openSetAside(goalProg(g).kurangBulanIni); return; }
      if (e.target.closest('[data-safe-info]')) { openSafeInfo(); return; }
      if (e.target.closest('[data-split-now]')) { openSplit(); return; }
      const ewFirst = e.target.closest('[data-edit-wallet]');
      if (ewFirst) { editWallet(ewFirst.dataset.editWallet); return; }
      const wBtn = e.target.closest('[data-wallet]');
      if (wBtn) { showWalletHistory(wBtn.dataset.wallet); return; }
      const ew = e.target.closest('[data-edit-wallet]');
      if (ew) { editWallet(ew.dataset.editWallet); return; }
      const ec = e.target.closest('[data-edit-cat]');
      if (ec) { editCategory(ec.dataset.editCat, ec.dataset.jenis); return; }
      const cr = e.target.closest('[data-cat-report]');
      if (cr) {
        S.filter = { q: '', month: S.reportMonth, wallet: '', cat: cr.dataset.catReport };
        $('f-search').value = '';
        setTab('history');
      }
    });
    $('sheet-backdrop').addEventListener('click', (e) => { if (e.target === $('sheet-backdrop')) closeSheet(); });

    // Filter riwayat
    $('f-search').oninput = (e) => { S.filter.q = e.target.value; renderHistory(); };
    $('f-month').onchange = (e) => { S.filter.month = e.target.value; renderHistory(); };
    $('f-wallet').onchange = (e) => { S.filter.wallet = e.target.value; renderHistory(); };
    $('f-cat').onchange = (e) => { S.filter.cat = e.target.value; renderHistory(); };

    // Laporan
    $('r-prev').onclick = () => { S.reportMonth = shiftMonth(S.reportMonth, -1); renderReport(); };
    $('r-next').onclick = () => { S.reportMonth = shiftMonth(S.reportMonth, 1); renderReport(); };

    // Grafik menyesuaikan lebar layar (mis. HP diputar)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (S.tab === 'report') renderCash(); }, 150);
    });

    // Muat ulang data saat aplikasi dibuka kembali
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !$('app').hidden) refresh(true);
    });
  }

  // ---------- Mulai ----------

  bind();
  if (DEMO) showApp();
  else if (session() && (location.hash.indexOf('access_token=') >= 0 ||
    (location.hash.indexOf('state=gs.') >= 0 && location.hash.indexOf('error=') >= 0))) finishSheetsAuth();
  else if (location.hash.indexOf('id_token=') >= 0 || location.hash.indexOf('error=') >= 0) finishLogin();
  else if (session()) showApp();
  else logout();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
