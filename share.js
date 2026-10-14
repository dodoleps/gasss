/*
 * Kartu rekap bulanan & stiker pencapaian hemat untuk dibagikan ke story (ala stiker Strava).
 * Digambar di HP dengan <canvas> (1080×1920), tanpa server.
 *  - stiker transparan: hanya teks & grafik batang tembus pandang
 *  - gambar jadi: foto pengguna (atau latar pastel) + stiker
 */
(function (root) {
  const W = 1080, H = 1920;
  // Teks di gambar ikut bahasa aplikasi (lihat i18n.js). T('Masih sisa') / T('{p} dari {t}', { p, t }).
  const T = (str, vars) => (root.HBI18n ? root.HBI18n.t(str, vars) : (vars ? str.replace(/\{(\w+)\}/g, (x, n) => (n in vars ? vars[n] : x)) : str));
  const EN = () => !!root.HBI18n && root.HBI18n.lang === 'en';
  const FONT = '"Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, sans-serif';

  /** Kalimat lucu berdasarkan kata di keterangan (lebih spesifik) atau kategori. */
  const KEYWORDS = [
    [/kopi|coffee|starbucks|kopken|janji jiwa|fore|latte/i, '☕', 'Barista udah hafal namamu.'],
    [/gofood|grabfood|shopeefood|pesan antar/i, '🛵', 'Kurir makanan udah kayak teman sendiri.'],
    [/bensin|pertalite|pertamax|bbm|shell/i, '⛽', 'Tangki penuh, dompet yang kosong.'],
    [/gojek|grab|ojol|ojek|maxim/i, '🛵', 'Abang ojol udah kayak sopir pribadi.'],
    [/parkir/i, '🅿️', 'Tukang parkir: muncul tanpa diundang.'],
    [/shopee|tokopedia|tiktok shop|lazada|checkout/i, '🛍️', 'Checkout dulu, mikir belakangan.'],
    [/netflix|spotify|youtube|disney|langganan/i, '🎬', 'Langganan banyak, nontonnya dikit.'],
  ];
  const CATEGORY_LINES = {
    'Makan & Minum': ['🍜', 'Perut kenyang, dompet melayang.'],
    Transportasi: ['🛵', 'Jalan terus, saldonya yang berhenti.'],
    Belanja: ['🛍️', 'Checkout dulu, mikir belakangan.'],
    Tagihan: ['🧾', 'Tagihan: yang paling setia datang tiap bulan.'],
    Kesehatan: ['💊', 'Investasi terbaik: badan sehat.'],
    Hiburan: ['🎬', 'Healing itu perlu, katanya.'],
    Keluarga: ['👨‍👩‍👧', 'Buat keluarga, nggak ada kata rugi.'],
  };

  /** Pilih kalimat lucu untuk kategori teratas yang dipilih. */
  function funnyLine(top, keterangan) {
    if (!top) return '';
    const text = (keterangan || []).join(' ');
    const kw = KEYWORDS.find(([re]) => re.test(text));
    if (kw) return kw[1] + ' ' + T(kw[2]);
    const c = CATEGORY_LINES[top.nama];
    return c ? c[0] + ' ' + T(c[1]) : '💸 ' + T('Habis ke mana? Rahasia.');
  }

  function short(n) {
    const loc = EN() ? 'en-US' : 'id-ID';
    if (n >= 1e6) return 'Rp' + (n / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 }) + (EN() ? 'M' : ' jt');
    if (n >= 1e3) return 'Rp' + Math.round(n / 1e3).toLocaleString(loc) + (EN() ? 'K' : ' rb');
    return 'Rp' + Math.round(n).toLocaleString('id-ID');
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Gambar stiker (tanpa latar) ke ctx. opts.dark = teks gelap untuk foto terang. */
  // Ukuran stiker: K mengecilkan semua huruf & batang (1 = ukuran awal). Lebar blok dibuat ramping
  // supaya foto pengguna lebih banyak terlihat.
  const K = 0.7, MARGIN = 150;

  function drawSticker(ctx, d, opts) {
    const ink = opts.dark ? '#14201c' : '#ffffff';
    const soft = opts.dark ? 'rgba(20,32,28,.62)' : 'rgba(255,255,255,.78)';
    const track = opts.dark ? 'rgba(20,32,28,.16)' : 'rgba(255,255,255,.28)';
    const fill = opts.dark ? 'rgba(20,32,28,.82)' : 'rgba(255,255,255,.92)';
    const px = (n) => Math.round(n * K);
    const font = (w, size) => w + ' ' + px(size) + 'px ' + FONT;
    ctx.save();
    ctx.shadowColor = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
    ctx.shadowBlur = px(18);
    ctx.textBaseline = 'alphabetic';
    const X = MARGIN, R = W - MARGIN;
    const items = d.items.slice(0, 5);
    // Tinggi blok dihitung supaya stiker selalu menempel di bagian bawah.
    const rowH = px(132);
    const blockH = px(120) + px(190) + (d.line ? px(110) : px(20)) + items.length * rowH + px(150);
    let y = H - 140 - blockH;

    ctx.fillStyle = soft;
    ctx.font = font(700, 40);
    ctx.letterSpacing = px(6) + 'px';
    ctx.fillText(d.bulanLabel.toUpperCase(), X, y + px(40));
    ctx.letterSpacing = '0px';
    y += px(120);
    ctx.fillStyle = soft;
    ctx.font = font(600, 46);
    ctx.fillText((d.items.length ? (EN() ? 'Spent' : 'Habis') : T('Total pengeluaran')), X, y - px(10));
    ctx.fillStyle = ink;
    ctx.font = font(800, 150);
    ctx.fillText(short(d.total), X, y + px(150));
    y += px(190);

    if (d.line) {
      ctx.fillStyle = ink;
      ctx.font = font(600, 44);
      ctx.fillText(d.line, X, y + px(40), R - X);
      y += px(110);
    } else y += px(20);

    const max = Math.max(1, ...items.map((i) => i.total));
    const barH = px(30);
    items.forEach((it) => {
      ctx.shadowBlur = px(18);
      ctx.fillStyle = ink;
      ctx.font = font(700, 46);
      ctx.fillText((it.icon ? it.icon + '  ' : '') + T(it.nama), X, y + px(46), R - X - px(260));
      ctx.textAlign = 'right';
      ctx.fillText(short(it.total), R, y + px(46));
      ctx.textAlign = 'left';
      ctx.shadowBlur = 0;
      roundRect(ctx, X, y + px(70), R - X, barH, barH / 2);
      ctx.fillStyle = track;
      ctx.fill();
      roundRect(ctx, X, y + px(70), Math.max(barH, (R - X) * (it.total / max)), barH, barH / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      y += rowH;
    });

    ctx.shadowBlur = px(18);
    drawFooter(ctx, d.appName, opts, X, y + px(40));
    ctx.restore();
  }

  /** Logo kecil + nama aplikasi di bagian bawah stiker. */
  function drawFooter(ctx, appName, opts, X, y) {
    const c = colors(opts);
    const px = (n) => Math.round(n * K);
    const font = (w, size) => w + ' ' + px(size) + 'px ' + FONT;
    const r = px(34);
    ctx.beginPath();
    ctx.arc(X + r, y + px(40), r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.fillStyle = opts.dark ? '#ffffff' : '#2f8a75';
    ctx.font = font(700, 36);
    ctx.textAlign = 'center';
    ctx.fillText('🎙', X + r, y + px(54));
    ctx.textAlign = 'left';
    ctx.fillStyle = c.ink;
    ctx.font = font(800, 42);
    ctx.fillText(appName, X + px(90), y + px(38));
    ctx.fillStyle = c.soft;
    ctx.font = font(600, 32);
    ctx.fillText(T('cukup ngomong, tujuan tercapai'), X + px(90), y + px(80));
  }

  function colors(opts) {
    return {
      ink: opts.dark ? '#14201c' : '#ffffff',
      soft: opts.dark ? 'rgba(20,32,28,.62)' : 'rgba(255,255,255,.78)',
      track: opts.dark ? 'rgba(20,32,28,.16)' : 'rgba(255,255,255,.28)',
      fill: opts.dark ? 'rgba(20,32,28,.82)' : 'rgba(255,255,255,.92)',
    };
  }

  /** Kalimat apresiasi sesuai persen pemasukan yang tersisa. */
  function praiseLine(persen) {
    if (persen >= 0.5) return '👑 ' + T('Sultan hemat! Separuh pemasukan masih utuh.');
    if (persen >= 0.25) return '💪 ' + T('Dompet tebal, hati tenang.');
    if (persen >= 0.1) return '🌱 ' + T('Hemat level aman. Pertahankan!');
    return '😄 ' + T('Tipis-tipis, yang penting masih sisa.');
  }

  function pct(persen) { return Math.round(persen * 100) + '%'; }

  /**
   * Stiker pencapaian hemat bulanan.
   * d = { bulanLabel, sisa, persen, appName }; opts.hideAmount = tampilkan persen saja tanpa rupiah.
   */
  function drawAchievement(ctx, d, opts) {
    const c = colors(opts);
    const px = (n) => Math.round(n * K);
    const font = (w, size) => w + ' ' + px(size) + 'px ' + FONT;
    ctx.save();
    ctx.shadowColor = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
    ctx.shadowBlur = px(18);
    ctx.textBaseline = 'alphabetic';
    const X = MARGIN, R = W - MARGIN;
    const blockH = px(120) + px(130) + px(190) + px(90) + px(150) + px(150);
    let y = H - 140 - blockH;

    ctx.fillStyle = c.soft;
    ctx.font = font(700, 40);
    ctx.letterSpacing = px(6) + 'px';
    ctx.fillText(d.bulanLabel.toUpperCase(), X, y + px(40));
    ctx.letterSpacing = '0px';
    y += px(120);
    ctx.fillStyle = c.ink;
    ctx.font = font(800, 64);
    ctx.fillText('🏆 ' + T('Berhasil hemat!'), X, y + px(50), R - X);
    y += px(130);
    ctx.fillStyle = c.soft;
    ctx.font = font(600, 46);
    ctx.fillText(T(opts.hideAmount ? 'Pemasukan yang tersisa' : 'Masih sisa'), X, y - px(10));
    ctx.fillStyle = c.ink;
    ctx.font = font(800, 150);
    ctx.fillText(opts.hideAmount ? pct(d.persen) : short(d.sisa), X, y + px(150));
    y += px(190);
    ctx.fillStyle = c.soft;
    ctx.font = font(600, 44);
    ctx.fillText(opts.hideAmount ? T('dari total pemasukan') : T('{p} dari total pemasukan', { p: pct(d.persen) }), X, y + px(40), R - X);
    y += px(90);

    const barH = px(30);
    ctx.shadowBlur = 0;
    roundRect(ctx, X, y, R - X, barH, barH / 2);
    ctx.fillStyle = c.track;
    ctx.fill();
    roundRect(ctx, X, y, Math.max(barH, (R - X) * Math.min(1, d.persen)), barH, barH / 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.shadowBlur = px(18);
    y += px(60);
    ctx.fillStyle = c.ink;
    ctx.font = font(600, 44);
    ctx.fillText(praiseLine(d.persen), X, y + px(50), R - X);
    y += px(150);

    drawFooter(ctx, d.appName, opts, X, y);
    ctx.restore();
  }

  /**
   * Kartu progres tujuan (ala Strava). d = { nama, emoji, terkumpul, target, persen, tercapai, subjudul, appName };
   * opts.hideAmount = tampilkan persen saja.
   */
  function drawGoal(ctx, d, opts) {
    const c = colors(opts);
    const px = (n) => Math.round(n * K);
    const font = (w, size) => w + ' ' + px(size) + 'px ' + FONT;
    ctx.save();
    ctx.shadowColor = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
    ctx.shadowBlur = px(18);
    ctx.textBaseline = 'alphabetic';
    const X = MARGIN, R = W - MARGIN;
    const blockH = px(120) + px(150) + px(190) + px(90) + px(150) + px(150);
    let y = H - 140 - blockH;

    ctx.fillStyle = c.soft;
    ctx.font = font(700, 40);
    ctx.letterSpacing = px(6) + 'px';
    ctx.fillText(T(d.tercapai ? 'Tujuan tercapai' : 'Menuju tujuan').toUpperCase(), X, y + px(40));
    ctx.letterSpacing = '0px';
    y += px(120);
    ctx.fillStyle = c.ink;
    ctx.font = font(800, 64);
    ctx.fillText((d.tercapai ? '🏆 ' : (d.emoji || '🎯') + ' ') + d.nama, X, y + px(50), R - X);
    y += px(150);
    ctx.fillStyle = c.soft;
    ctx.font = font(600, 46);
    ctx.fillText(T(opts.hideAmount ? 'Sudah terkumpul' : 'Terkumpul'), X, y - px(10));
    ctx.fillStyle = c.ink;
    ctx.font = font(800, 150);
    ctx.fillText(opts.hideAmount ? pct(d.persen) : short(d.terkumpul), X, y + px(150));
    y += px(190);
    ctx.fillStyle = c.soft;
    ctx.font = font(600, 44);
    ctx.fillText(opts.hideAmount ? T('dari target') : T('{p} dari {t}', { p: pct(d.persen), t: short(d.target) }), X, y + px(40), R - X);
    y += px(90);

    const barH = px(30);
    ctx.shadowBlur = 0;
    roundRect(ctx, X, y, R - X, barH, barH / 2);
    ctx.fillStyle = c.track;
    ctx.fill();
    roundRect(ctx, X, y, Math.max(barH, (R - X) * Math.min(1, d.persen)), barH, barH / 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.shadowBlur = px(18);
    y += px(60);
    ctx.fillStyle = c.ink;
    ctx.font = font(600, 44);
    ctx.fillText(T(d.subjudul || ''), X, y + px(50), R - X);
    y += px(150);

    drawFooter(ctx, d.appName, opts, X, y);
    ctx.restore();
  }

  const ZONE_HEX = { hijau: '#22c55e', kuning: '#eab308', oranye: '#f97316', merah: '#ef4444' };

  /** Judul kecil berhuruf kapital + jarak, dipakai stiker grafik. */
  function eyebrow(ctx, c, text, X, y) {
    ctx.fillStyle = c.soft;
    ctx.font = '700 ' + Math.round(40 * K) + 'px ' + FONT;
    ctx.letterSpacing = Math.round(6 * K) + 'px';
    ctx.fillText(text.toUpperCase(), X, y);
    ctx.letterSpacing = '0px';
  }

  /**
   * Stiker posisi kas: persen besar, kalimat zona, dan garis halus berwarna zona dengan area memudar.
   * d = { bulanLabel, days, pts: [{ d, persen }], persen, saldo, zona, line, appName }
   */
  function drawCash(ctx, d, opts) {
    const c = colors(opts);
    const px = (n) => Math.round(n * K);
    const font = (w, size) => w + ' ' + px(size) + 'px ' + FONT;
    const X = MARGIN, R = W - MARGIN, cw = R - X;
    const chartH = px(620);
    const blockH = px(120) + px(190) + px(90) + (opts.hideAmount ? 0 : px(70)) + px(60) + chartH + px(110) + px(150);
    let y = H - 140 - blockH;
    ctx.save();
    ctx.shadowColor = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
    ctx.shadowBlur = px(18);
    ctx.textBaseline = 'alphabetic';
    eyebrow(ctx, c, T('Posisi kas') + ' · ' + d.bulanLabel, X, y + px(40));
    y += px(120);
    ctx.fillStyle = c.ink; ctx.font = font(800, 150);
    ctx.fillText(pct(d.persen), X, y + px(150));
    y += px(190);
    ctx.font = font(700, 50);
    ctx.fillText(d.line, X, y + px(50), cw);
    y += px(90);
    if (!opts.hideAmount) { ctx.fillStyle = c.soft; ctx.font = font(600, 44); ctx.fillText(T('saldo {x}', { x: short(d.saldo) }), X, y + px(44)); y += px(70); }
    y += px(60);
    // grafik
    const top = y, bottom = y + chartH;
    const gx = (day) => X + (d.days > 1 ? (day - 1) / (d.days - 1) : 0) * cw;
    const gy = (p) => top + (1 - p) * chartH;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = c.track; ctx.lineWidth = px(4); ctx.setLineDash([px(12), px(16)]);
    [0.25, 0.5, 0.75].forEach((p) => { ctx.beginPath(); ctx.moveTo(X, gy(p)); ctx.lineTo(R, gy(p)); ctx.stroke(); });
    ctx.setLineDash([]);
    const pts = d.pts.map((p) => [gx(p.d), gy(p.persen)]);
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        if (!i) { ctx.moveTo(p[0], p[1]); return; }
        const a = pts[i - 1], t = (p[0] - a[0]) / 2;
        ctx.bezierCurveTo(a[0] + t, a[1], p[0] - t, p[1], p[0], p[1]);
      });
    };
    const zg = ctx.createLinearGradient(0, gy(1), 0, gy(0));
    [[0, 'hijau'], [0.25, 'hijau'], [0.4, 'kuning'], [0.62, 'oranye'], [1, 'merah']].forEach(([o, z]) => zg.addColorStop(o, ZONE_HEX[z]));
    const last = pts[pts.length - 1];
    // area memudar: digambar di kanvas terpisah supaya transparansinya tidak memotong foto latar
    const area = document.createElement('canvas');
    area.width = W; area.height = H;
    const a2 = area.getContext('2d');
    a2.beginPath();
    pts.forEach((p, i) => { if (!i) a2.moveTo(p[0], p[1]); else { const q = pts[i - 1], t = (p[0] - q[0]) / 2; a2.bezierCurveTo(q[0] + t, q[1], p[0] - t, p[1], p[0], p[1]); } });
    a2.lineTo(last[0], bottom); a2.lineTo(pts[0][0], bottom); a2.closePath();
    a2.fillStyle = zg; a2.globalAlpha = 0.6; a2.fill();
    a2.globalCompositeOperation = 'destination-in';
    const fade = a2.createLinearGradient(0, top, 0, bottom);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    a2.globalAlpha = 1; a2.fillStyle = fade; a2.fillRect(0, top, W, chartH);
    ctx.drawImage(area, 0, 0);
    ctx.shadowColor = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.3)'; ctx.shadowBlur = px(14);
    trace(); ctx.strokeStyle = zg; ctx.lineWidth = px(12); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(last[0], last[1], px(26), 0, Math.PI * 2); ctx.fillStyle = c.ink; ctx.fill();
    ctx.beginPath(); ctx.arc(last[0], last[1], px(16), 0, Math.PI * 2); ctx.fillStyle = ZONE_HEX[d.zona] || c.fill; ctx.fill();
    ctx.fillStyle = c.soft; ctx.font = font(700, 36); ctx.textAlign = 'center';
    [1, Math.ceil(d.days / 2), d.days].forEach((day) => ctx.fillText(String(day), gx(day), bottom + px(60)));
    ctx.textAlign = 'left';
    y = bottom + px(110);
    drawFooter(ctx, d.appName, opts, X, y + px(10));
    ctx.restore();
  }

  /**
   * Stiker perbandingan: hemat/boros berapa persen + batang memudar per bulan + garis rata-rata.
   * d = { bulanLabel, bulan: [{ label, keluar }], rata, persen, appName }
   */
  function drawCompare(ctx, d, opts) {
    const c = colors(opts);
    const px = (n) => Math.round(n * K);
    const font = (w, size) => w + ' ' + px(size) + 'px ' + FONT;
    const X = MARGIN, R = W - MARGIN, cw = R - X;
    const chartH = px(640);
    const blockH = px(120) + px(170) + px(80) + px(100) + chartH + px(110) + px(150);
    let y = H - 140 - blockH;
    ctx.save();
    ctx.shadowColor = opts.dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
    ctx.shadowBlur = px(18);
    ctx.textBaseline = 'alphabetic';
    eyebrow(ctx, c, T('Pengeluaran') + ' · ' + d.bulanLabel, X, y + px(40));
    y += px(120);
    const p = d.persen;
    ctx.fillStyle = c.ink; ctx.font = font(800, 120);
    ctx.fillText(p === null ? T('Bulan pertama') : Math.abs(p) < 0.05 ? T('Stabil') + ' ⚖️' : p < 0 ? T('Hemat {p}', { p: pct(-p) }) + ' 🎉' : T('Boros {p}', { p: pct(p) }) + ' 🔥', X, y + px(120), cw);
    y += px(170);
    ctx.fillStyle = c.soft; ctx.font = font(600, 44);
    const cur = d.bulan[d.bulan.length - 1];
    ctx.fillText(p === null ? T('belum ada bulan pembanding') : opts.hideAmount ? T('dibanding rata-rata bulan sebelumnya') : T('{a} vs rata-rata {b}', { a: short(cur.keluar), b: short(d.rata) }), X, y + px(40), cw);
    y += px(80) + px(100);
    const top = y, base = y + chartH;
    const max = Math.max(1, d.rata, ...d.bulan.map((b) => b.keluar)) * 1.1;
    const slot = cw / d.bulan.length, bw = slot * 0.58;
    ctx.shadowBlur = 0;
    d.bulan.forEach((b, i) => {
      const cx = X + slot * (i + 0.5), last = i === d.bulan.length - 1;
      ctx.fillStyle = last ? c.ink : c.soft; ctx.font = font(last ? 800 : 700, 40); ctx.textAlign = 'center';
      ctx.fillText(b.label, cx, base + px(66));
      if (!b.keluar) { ctx.fillText('–', cx, base - px(20)); ctx.textAlign = 'left'; return; }
      const t = base - b.keluar / max * chartH;
      const grd = ctx.createLinearGradient(0, t, 0, base);
      const rgb = opts.dark ? '20,32,28' : '255,255,255';
      grd.addColorStop(0, 'rgba(' + rgb + ',' + (last ? 0.95 : 0.5) + ')');
      grd.addColorStop(0.7, 'rgba(' + rgb + ',' + (last ? 0.35 : 0.18) + ')');
      grd.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = grd;
      roundRect(ctx, cx - bw / 2, t, bw, base - t, px(28));
      ctx.fill();
      if (!opts.hideAmount) { ctx.fillStyle = last ? c.ink : c.soft; ctx.font = font(last ? 800 : 700, 38); ctx.fillText(short(b.keluar).replace('Rp', ''), cx, t - px(26)); }
      ctx.textAlign = 'left';
    });
    if (d.rata > 0) {
      const ay = base - d.rata / max * chartH;
      ctx.strokeStyle = c.ink; ctx.lineWidth = px(5); ctx.setLineDash([px(18), px(14)]);
      ctx.beginPath(); ctx.moveTo(X, ay); ctx.lineTo(R, ay); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.shadowBlur = px(18);
    y = base + px(110);
    drawFooter(ctx, d.appName, opts, X, y + px(10));
    ctx.restore();
  }

  /** Latar: foto pengguna (dipotong pas 9:16) atau gradasi pastel bila tanpa foto. */
  function drawBackground(ctx, photo, dark) {
    if (photo) {
      const s = Math.max(W / photo.width, H / photo.height);
      const w = photo.width * s, h = photo.height * s;
      ctx.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
      // Bayangan lembut di bagian bawah supaya tulisan tetap terbaca di foto apa pun.
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, dark ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
      g.addColorStop(1, dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      if (dark) { g.addColorStop(0, '#cfeee2'); g.addColorStop(.55, '#e4e0fa'); g.addColorStop(1, '#ffe2d2'); }
      else { g.addColorStop(0, '#2f8a75'); g.addColorStop(.6, '#5a4fb0'); g.addColorStop(1, '#c0603e'); }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  async function ready() {
    try { await document.fonts.load('800 150px "Plus Jakarta Sans"'); await document.fonts.load('600 44px "Plus Jakarta Sans"'); } catch (e) { /* pakai huruf cadangan */ }
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), 'image/png'));
  }

  /**
   * Buat kanvas. mode: 'final' (latar + stiker) atau 'sticker' (transparan).
   * opts.kind: 'rekap' (bawaan), 'hemat' (stiker pencapaian) atau 'tujuan' (progres tujuan).
   */
  async function render(d, opts, mode) {
    await ready();
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (mode === 'final') drawBackground(ctx, opts.photo, opts.dark);
    if (opts.kind === 'hemat') drawAchievement(ctx, d, opts);
    else if (opts.kind === 'tujuan') drawGoal(ctx, d, opts);
    else if (opts.kind === 'kas') drawCash(ctx, d, opts);
    else if (opts.kind === 'banding') drawCompare(ctx, d, opts);
    else drawSticker(ctx, d, opts);
    return c;
  }

  /** Baca file foto dari galeri menjadi gambar. */
  function loadPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = () => reject(new Error('Foto tidak bisa dibaca. Coba foto lain.'));
      img.src = url;
    });
  }

  root.HBShare = { render, toBlob, loadPhoto, funnyLine, praiseLine, W, H };
})(this);
