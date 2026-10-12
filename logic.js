/* Perhitungan murni (tanpa tampilan): saldo dompet, ringkasan, laporan, dan parser mode demo. */
(function (root) {
  const UTAMA_ID = 'utama';
  const KATEGORI_PINDAH = 'Pindah dana';
  const KATEGORI_SALDO_AWAL = 'Saldo awal'; // sisa uang yang dibawa saat mulai pencatatan baru
  const MENIPIS = 0.2; // dompet "mendekati habis" jika sisa <= 20% dari jumlah setelah pengisian terakhir

  function sortTx(txs) {
    return txs.slice().sort((a, b) =>
      a.tanggal === b.tanggal ? String(a.dibuat).localeCompare(String(b.dibuat)) : a.tanggal.localeCompare(b.tanggal));
  }

  /** Hitung saldo, acuan (jumlah setelah pengisian terakhir), dan status warna tiap dompet. */
  function computeWallets(wallets, txs) {
    const map = {};
    wallets.forEach((w) => { map[w.id] = { ...w, saldo: 0, acuan: 0, pernahDiisi: false }; });
    const get = (id) => map[id] || (map[id] = { id, nama: '(dompet terhapus)', arsip: '1', saldo: 0, acuan: 0 });
    sortTx(txs).forEach((t) => {
      const n = Number(t.nominal) || 0;
      if (t.jenis === 'keluar') {
        get(t.dompet_id).saldo -= n;
      } else if (t.jenis === 'masuk') {
        const w = get(t.dompet_id);
        w.saldo += n; w.acuan = w.saldo; w.pernahDiisi = true;
      } else if (t.jenis === 'pindah') {
        get(t.dompet_id).saldo -= n;
        const w = get(t.dompet_tujuan_id);
        w.saldo += n; w.acuan = w.saldo; w.pernahDiisi = true;
      }
    });
    return Object.values(map).map((w) => {
      let status = 'aman';
      if (w.saldo < 0 || (w.saldo === 0 && w.pernahDiisi)) status = 'habis';
      else if (w.saldo === 0) status = 'kosong';
      else if (w.acuan > 0 && w.saldo <= w.acuan * MENIPIS) status = 'menipis';
      const persen = w.acuan > 0 ? Math.max(0, Math.min(1, w.saldo / w.acuan)) : (w.saldo > 0 ? 1 : 0);
      return { ...w, status, persen };
    });
  }

  function monthOf(tanggal) { return String(tanggal).slice(0, 7); }

  /** Total masuk & keluar dalam satu bulan (pindah antar dompet dan saldo awal tidak dihitung). */
  function monthSummary(txs, bulan) {
    let masuk = 0, keluar = 0;
    txs.forEach((t) => {
      if (monthOf(t.tanggal) !== bulan) return;
      if (t.jenis === 'masuk' && t.kategori !== KATEGORI_SALDO_AWAL) masuk += Number(t.nominal);
      if (t.jenis === 'keluar') keluar += Number(t.nominal);
    });
    return { masuk, keluar, selisih: masuk - keluar };
  }

  /**
   * Pencapaian hemat satu bulan: sisa = pemasukan − pengeluaran bulan itu.
   * null kalau bulan itu tidak ada pemasukan atau tidak ada sisa.
   */
  function monthAchievement(txs, bulan) {
    const s = monthSummary(txs, bulan);
    if (!(s.masuk > 0) || !(s.selisih > 0)) return null;
    return { bulan, masuk: s.masuk, keluar: s.keluar, sisa: s.selisih, persen: s.selisih / s.masuk };
  }

  /**
   * Transaksi "Saldo awal" untuk mulai pencatatan baru sambil membawa sisa uang tiap dompet.
   * Sisa di dompet yang sudah dihapus masuk ke dompet utama; saldo minus tidak dibawa.
   */
  function openingBalances(wallets, txs, tanggal) {
    const sisa = {};
    computeWallets(wallets, txs).forEach((w) => {
      if (!(w.saldo > 0)) return;
      const id = w.arsip ? UTAMA_ID : w.id;
      sisa[id] = (sisa[id] || 0) + w.saldo;
    });
    return Object.keys(sisa).map((id) => ({ tanggal, jenis: 'masuk', nominal: sisa[id], kategori: KATEGORI_SALDO_AWAL,
      dompet_id: id, dompet_tujuan_id: '', keterangan: 'Sisa saldo saat mulai pencatatan baru' }));
  }

  /** Pengeluaran per kategori dalam satu bulan, urut terbesar. */
  function categoryReport(txs, bulan) {
    const sums = {};
    let total = 0;
    txs.forEach((t) => {
      if (t.jenis !== 'keluar' || monthOf(t.tanggal) !== bulan) return;
      sums[t.kategori] = (sums[t.kategori] || 0) + Number(t.nominal);
      total += Number(t.nominal);
    });
    const rows = Object.keys(sums).map((k) => ({ kategori: k, total: sums[k], persen: total ? sums[k] / total : 0 }));
    rows.sort((a, b) => b.total - a.total);
    return { total, rows };
  }

  /**
   * Posisi kas harian dalam satu bulan.
   * persen = saldo semua dompet di akhir hari ÷ uang tersedia bulan itu
   * (saldo awal bulan + pemasukan bulan itu sampai hari tersebut). Pindah antar dompet tidak berpengaruh.
   * sampai: tanggal terakhir yang dihitung (YYYY-MM-DD), mis. hari ini untuk bulan berjalan.
   */
  function cashPosition(txs, bulan, sampai) {
    const [y, m] = bulan.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    let saldo = 0;
    const perDay = {};
    txs.forEach((t) => {
      const n = Number(t.nominal) || 0;
      const delta = t.jenis === 'masuk' ? n : t.jenis === 'keluar' ? -n : 0;
      if (t.tanggal < bulan + '-01') { saldo += delta; return; }
      if (monthOf(t.tanggal) !== bulan) return;
      const d = perDay[t.tanggal] || (perDay[t.tanggal] = { masuk: 0, keluar: 0 });
      if (t.jenis === 'masuk') d.masuk += n;
      if (t.jenis === 'keluar') d.keluar += n;
    });
    const saldoAwal = saldo;
    let tersedia = saldoAwal;
    const out = [];
    for (let day = 1; day <= lastDay; day++) {
      const tanggal = bulan + '-' + String(day).padStart(2, '0');
      if (sampai && tanggal > sampai) break;
      const d = perDay[tanggal] || { masuk: 0, keluar: 0 };
      saldo += d.masuk - d.keluar;
      tersedia += d.masuk;
      const persen = tersedia > 0 ? Math.max(0, Math.min(1, saldo / tersedia)) : null;
      out.push({ tanggal, saldo, tersedia, masuk: d.masuk, keluar: d.keluar, persen });
    }
    return { saldoAwal, days: out };
  }

  /** Zona posisi kas: 'hijau' (> 75%), 'kuning' (50–75%), 'oranye' (25–50%), 'merah' (< 25%). */
  const CASH_LEVELS = [0.75, 0.5, 0.25];
  function cashZone(persen) {
    if (persen > 0.75) return 'hijau';
    if (persen >= 0.5) return 'kuning';
    if (persen >= 0.25) return 'oranye';
    return 'merah';
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /**
   * Bandingkan pengeluaran bulan `bulan` dengan `n` bulan sebelumnya (n = 1..3).
   * Bulan sebelum transaksi pertama pengguna tidak ikut dihitung (ditandai adaData: false).
   * Hasil: { bulan: [{ bulan, keluar, adaData, kategori: {nama: total} }...] (lama -> baru), dibanding (jumlah bulan yang dihitung),
   *          rataSebelum, selisih (bulan ini - rata-rata), persen (selisih ÷ rata-rata, null kalau rata-rata 0),
   *          kategori: [{ kategori, ini, rata, selisih }] urut dari yang terbesar }.
   */
  function compareMonths(txs, bulan, n) {
    const months = [];
    for (let i = n; i >= 0; i--) months.push(shiftMonth(bulan, -i));
    const first = txs.reduce((m, t) => (t.tanggal && (!m || t.tanggal < m) ? t.tanggal : m), '');
    const firstMonth = first ? monthOf(first) : bulan;
    const data = months.map((b) => ({ bulan: b, keluar: 0, kategori: {}, adaData: b >= firstMonth }));
    const idx = Object.fromEntries(months.map((b, i) => [b, i]));
    txs.forEach((t) => {
      if (t.jenis !== 'keluar') return;
      const i = idx[monthOf(t.tanggal)];
      if (i === undefined) return;
      const v = Number(t.nominal) || 0;
      data[i].keluar += v;
      data[i].kategori[t.kategori] = (data[i].kategori[t.kategori] || 0) + v;
    });
    const sekarang = data[data.length - 1];
    const sebelum = data.slice(0, -1).filter((d) => d.adaData);
    const rataSebelum = sebelum.length ? sebelum.reduce((s, d) => s + d.keluar, 0) / sebelum.length : 0;
    const names = new Set();
    data.forEach((d) => Object.keys(d.kategori).forEach((k) => names.add(k)));
    const kategori = Array.from(names).map((k) => {
      const ini = sekarang.kategori[k] || 0;
      const rata = sebelum.length ? sebelum.reduce((s, d) => s + (d.kategori[k] || 0), 0) / sebelum.length : 0;
      return { kategori: k, ini, rata, selisih: ini - rata };
    }).sort((a, b) => Math.max(b.ini, b.rata) - Math.max(a.ini, a.rata));
    const selisih = sekarang.keluar - rataSebelum;
    return { bulan: data, dibanding: sebelum.length, rataSebelum, selisih,
      persen: sebelum.length && rataSebelum > 0 ? selisih / rataSebelum : null, kategori };
  }

  // ---------- Tujuan (One Active Goal) ----------

  const dayNum = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  /** Selisih hari b − a (YYYY-MM-DD). */
  function daysBetween(a, b) { return Math.round(dayNum(b) - dayNum(a)); }
  function addDays(ymd, n) {
    const d = new Date((dayNum(ymd) + n) * 86400000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  const ceilTo = (n, step) => Math.ceil(n / step) * step;

  /** Saldo satu dompet dari transaksi sebelum tanggal `sebelum` (tanpa batas kalau kosong). */
  function walletBalance(id, txs, sebelum) {
    let s = 0;
    txs.forEach((t) => {
      if (sebelum && t.tanggal >= sebelum) return;
      const n = Number(t.nominal) || 0;
      if (t.dompet_id === id && (t.jenis === 'keluar' || t.jenis === 'pindah')) s -= n;
      if ((t.jenis === 'masuk' && t.dompet_id === id) || (t.jenis === 'pindah' && t.dompet_tujuan_id === id)) s += n;
    });
    return s;
  }

  /**
   * Progres tujuan. goal = { target, tenggat, mulai, awal, dompet_id }.
   * - terkumpul = saldo dompet tujuan; seharusnya = garis lurus dari `awal` (saat mulai) ke target (saat tenggat)
   * - targetBulanIni dihitung dari saldo awal bulan, jadi tidak mengecil saat pengguna menyisihkan
   * - perkiraan tanggal tercapai dari ritme menabung sejak mulai (minimal dibagi 30 hari supaya tidak melonjak di awal)
   */
  function goalProgress(goal, txs, today) {
    const target = Math.max(0, Number(goal.target) || 0);
    const awal = Math.max(0, Number(goal.awal) || 0);
    const terkumpul = Math.max(0, walletBalance(goal.dompet_id, txs));
    const sisa = Math.max(0, target - terkumpul);
    const persen = target > 0 ? Math.min(1, terkumpul / target) : 0;
    const sisaHari = daysBetween(today, goal.tenggat);
    const total = Math.max(1, daysBetween(goal.mulai, goal.tenggat));
    const lewat = Math.min(total, Math.max(0, daysBetween(goal.mulai, today)));
    const seharusnya = Math.min(target, awal + (target - awal) * (lewat / total));
    const persenSeharusnya = target > 0 ? Math.max(0, Math.min(1, seharusnya / target)) : 0;

    const awalBulan = monthOf(today) + '-01';
    // Tujuan yang baru dimulai bulan ini: tabungan awal bukan setoran bulan ini.
    let saldoAwalBulan = Math.max(0, walletBalance(goal.dompet_id, txs, awalBulan));
    if (String(goal.mulai) >= awalBulan) saldoAwalBulan = Math.max(saldoAwalBulan, Math.min(awal, terkumpul));
    const sisaBulan = Math.max(1, Math.round(daysBetween(awalBulan, goal.tenggat) / 30.44));
    const targetBulanIni = sisaHari < 0 ? sisa : ceilTo(Math.max(0, target - saldoAwalBulan) / sisaBulan, 1000);
    const masukBulanIni = terkumpul - saldoAwalBulan;
    const kurangBulanIni = Math.max(0, Math.min(sisa, targetBulanIni - Math.max(0, masukBulanIni)));
    const perMinggu = sisa > 0 ? ceilTo(sisa / Math.max(1, sisaHari / 7), 1000) : 0;

    const ritme = (terkumpul - awal) / Math.max(lewat, 30); // rupiah per hari
    let perkiraan = null;
    if (terkumpul >= target) perkiraan = today;
    else if (ritme > 0) perkiraan = addDays(today, Math.ceil(sisa / ritme));

    let status;
    const tertinggal = seharusnya - terkumpul;
    if (target > 0 && terkumpul >= target) status = 'tercapai';
    else if (sisaHari < 0) status = 'lewat';
    else if (tertinggal <= target * 0.03) status = 'sesuai';
    else if (tertinggal <= target * 0.1) status = 'sedikit';
    else status = 'kejar';

    // Kecepatan menabung yang dipakai untuk "tujuan mundur N hari": ritme nyata, atau ritme yang dibutuhkan.
    const lajuHarian = ritme > 0 ? ritme : (sisaHari > 0 ? sisa / sisaHari : 0);
    return { target, awal, terkumpul, sisa, persen, sisaHari, seharusnya, persenSeharusnya, status, sisaBulan,
      targetBulanIni, masukBulanIni, kurangBulanIni, perMinggu, perkiraan, lajuHarian };
  }

  /** Berapa hari tujuan mundur (atau maju) karena uang sebesar `nominal`. null kalau tidak bisa dihitung. */
  function goalDelayDays(prog, nominal) {
    if (!prog || !(prog.lajuHarian > 0) || prog.sisa <= 0) return null;
    return Math.round(nominal / prog.lajuHarian);
  }

  /**
   * Jatah aman belanja hari ini.
   * (pemasukan − tagihan rutin yang belum dibayar − porsi tujuan bulan ini − pengeluaran bulan ini sebelum hari ini) ÷ sisa hari.
   * Pemasukan = yang lebih besar antara pemasukan bulan ini dan rata-rata 3 bulan sebelumnya (pemasukan tidak tetap).
   * Belanja dari dompet tujuan tidak dihitung (itu memang uang tujuan). null kalau belum ada data pemasukan.
   */
  function safeDaily(txs, today, opts) {
    const o = opts || {};
    const goalWallet = o.goalWallet || '';
    const porsiTujuan = Math.max(0, Number(o.porsiTujuan) || 0);
    const bulan = monthOf(today);
    const [y, m] = bulan.split('-').map(Number);
    const hariSisa = new Date(y, m, 0).getDate() - Number(today.slice(8)) + 1;
    const first = txs.reduce((a, t) => (t.tanggal && (!a || t.tanggal < a) ? t.tanggal : a), '');
    const prev = [1, 2, 3].map((i) => shiftMonth(bulan, -i)).filter((b) => first && b >= monthOf(first));
    const per = {};
    [bulan].concat(prev).forEach((b) => { per[b] = { masuk: 0, tagihan: 0 }; });
    let keluar = 0, hariIni = 0;
    txs.forEach((t) => {
      const b = per[monthOf(t.tanggal)];
      if (!b) return;
      const n = Number(t.nominal) || 0;
      if (t.jenis === 'masuk' && t.kategori !== KATEGORI_SALDO_AWAL) b.masuk += n;
      if (t.jenis !== 'keluar' || t.dompet_id === goalWallet) return;
      if (t.kategori === 'Tagihan') b.tagihan += n;
      if (monthOf(t.tanggal) !== bulan) return;
      if (t.tanggal < today) keluar += n; else if (t.tanggal === today) hariIni += n;
    });
    const withIncome = prev.filter((b) => per[b].masuk > 0);
    const rata = withIncome.length ? withIncome.reduce((s, b) => s + per[b].masuk, 0) / withIncome.length : 0;
    const pemasukan = Math.max(per[bulan].masuk, rata);
    if (!(pemasukan > 0)) return null;
    const tagihanRata = prev.length ? prev.reduce((s, b) => s + per[b].tagihan, 0) / prev.length : 0;
    const sisaTagihan = Math.max(0, tagihanRata - per[bulan].tagihan);
    const bebas = pemasukan - sisaTagihan - porsiTujuan - keluar;
    const perHari = Math.max(0, Math.floor(bebas / hariSisa / 500) * 500);
    return { perHari, terpakai: hariIni, sisaHariIni: perHari - hariIni, bebas, pemasukan,
      sumber: per[bulan].masuk >= rata ? 'bulan ini' : 'rata-rata', pengeluaran: keluar, sisaTagihan, porsiTujuan, hariSisa };
  }

  /** Zona posisi kas hari ini (untuk nada bicara Gasss). null kalau belum ada uang tercatat bulan ini. */
  function currentZone(txs, today) {
    const days = cashPosition(txs, monthOf(today), today).days.filter((d) => d.persen !== null);
    if (!days.length) return null;
    const p = days[days.length - 1].persen;
    return { zona: cashZone(p), persen: p };
  }

  // ---------- Komentar Gasss tanpa AI (mode demo / AI tidak menjawab) ----------
  // Galak tapi sayang: makin tegas saat kas menipis, tanpa menghina. Hanya soal kebiasaan belanja & menabung.
  const COMMENTS = {
    keluar: {
      hijau: ['Santuy, {ket} {rp} tercatat. Kas masih adem, {goal} aman 😎', 'Oke bos, {rp} buat {ket}. Masih di atas awan ☁️'],
      kuning: ['{ket} {rp}, dicatat. Masih aman, tapi jangan keseringan ya, {goal} nungguin 👀', 'Noted {rp}. Pelan-pelan aja belanjanya, kas udah lewat setengah jalan 🙂'],
      oranye: ['{ket} {rp}? Hmm. {goal} jadi mundur {hari}. Rem dikit, bos ✋', 'Kas tinggal {kas}. {ket} lagi? Tahan dulu yang nggak penting 😤'],
      merah: ['HEH! {ket} {rp}?! Kas tinggal {kas}, {goal} mundur {hari}! Aku galak karena sayang 😤🔥', 'STOP dulu belanjanya! Kas tinggal {kas}. Mode survival ON, {goal} jangan dikorbanin 🆘'],
    },
    masuk: ['Cuan masuk {rp}! Sisihkan dulu buat {goal} sebelum khilaf 💸', 'Mantap, {rp} masuk! Jatah {goal} duluan ya, baru jajan 😉'],
    tujuan: ['Gasss! {rp} masuk ke {goal}, maju {hari} lebih dekat 🚀', 'Keren! {goal} makin dekat, {rp} sudah disisihkan 💪'],
  };

  /**
   * Kalimat komentar setelah mencatat. c = { saved: [tx], zona, persenKas, goalName, goalWallet, prog, pick }.
   * pick (0..1) dipakai memilih variasi kalimat; bawaan acak.
   */
  function localComment(c) {
    const saved = c.saved || [];
    const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor((c.pick === undefined ? Math.random() : c.pick) * arr.length))];
    const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
    const goal = c.goalName || 'tabunganmu';
    const keTujuan = saved.filter((t) => t.jenis === 'pindah' && c.goalWallet && t.dompet_tujuan_id === c.goalWallet);
    const keluar = saved.filter((t) => t.jenis === 'keluar' && t.dompet_id !== c.goalWallet);
    const masuk = saved.filter((t) => t.jenis === 'masuk' && t.kategori !== KATEGORI_SALDO_AWAL);
    const sum = (list) => list.reduce((s, t) => s + Number(t.nominal), 0);
    const hariTxt = (n) => { const d = goalDelayDays(c.prog, n); return d === null ? 'lagi' : daysText(d); };
    let tpl, n, ket = '';
    if (keTujuan.length) { n = sum(keTujuan); tpl = pick(COMMENTS.tujuan); }
    else if (keluar.length) {
      n = sum(keluar);
      ket = keluar.length === 1 ? (keluar[0].keterangan || keluar[0].kategori) : keluar.length + ' pengeluaran';
      tpl = pick(COMMENTS.keluar[c.zona || 'kuning']);
    } else if (masuk.length) { n = sum(masuk); tpl = pick(COMMENTS.masuk); }
    else return '';
    return tpl.replace('{ket}', ket).replace('{rp}', rp(n)).replace('{goal}', goal).replace('{hari}', hariTxt(n))
      .replace('{kas}', c.persenKas == null ? 'sedikit' : Math.round(c.persenKas * 100) + '%').replace(/^./, (s) => s.toUpperCase());
  }

  /** Isi token {hari} dari jawaban AI dengan jumlah hari tujuan mundur/maju yang dihitung aplikasi. */
  function fillDays(text, days) {
    const s = String(text || '');
    if (days === null || days === undefined) return s.replace(/\s*\{hari\}\s*(hari)?/g, ' lagi');
    return s.replace(/\{hari\}(\s*hari)?/g, daysText(days));
  }
  /** "3 hari", "±2 bulan" (di atas 60 hari), atau "sedikit" (di bawah sehari). */
  function daysText(d) { return d < 1 ? 'sedikit' : d < 60 ? d + ' hari' : '±' + Math.round(d / 30) + ' bulan'; }

  // ---------- Merapikan transaksi & hasil AI ----------

  /** Rapikan & periksa satu transaksi. Melempar Error kalau tidak valid. */
  function cleanTx(tx, today) {
    const jenis = ['keluar', 'masuk', 'pindah'].indexOf(tx.jenis) >= 0 ? tx.jenis : 'keluar';
    const nominal = Math.round(Number(tx.nominal));
    if (!(nominal > 0)) throw new Error('Nominal harus lebih dari 0');
    const out = {
      ...tx,
      jenis,
      nominal,
      tanggal: /^\d{4}-\d{2}-\d{2}$/.test(tx.tanggal || '') ? tx.tanggal : today,
      kategori: jenis === 'pindah' ? KATEGORI_PINDAH : String(tx.kategori || 'Lainnya'),
      dompet_id: String(tx.dompet_id || UTAMA_ID),
      dompet_tujuan_id: jenis === 'pindah' ? String(tx.dompet_tujuan_id || '') : '',
      keterangan: String(tx.keterangan || '').slice(0, 200),
      sumber: String(tx.sumber || 'manual'),
      transkrip: String(tx.transkrip || '').slice(0, 1000),
    };
    if (jenis === 'pindah' && (!out.dompet_tujuan_id || out.dompet_tujuan_id === out.dompet_id)) {
      throw new Error('Dompet asal dan tujuan harus berbeda');
    }
    return out;
  }

  /**
   * Ubah jawaban AI ({ transkrip, transaksi: [{ jenis, nominal, kategori, dompet, dompet_tujuan, ... }] })
   * menjadi transaksi siap simpan: nama dompet -> id, kategori harus ada di daftar. Item yang tidak valid dibuang.
   */
  function mapAiResult(result, wallets, categories, opts) {
    const active = wallets.filter((w) => !w.arsip);
    const findWallet = (nama) => {
      const n = String(nama || '').trim().toLowerCase();
      const w = active.find((x) => x.nama.toLowerCase() === n);
      return w ? w.id : '';
    };
    const out = [];
    (result.transaksi || []).forEach((t) => {
      const jenis = t.jenis;
      let kategori = String(t.kategori || '');
      if (jenis !== 'pindah') {
        const match = categories.find((c) => c.jenis === jenis && c.nama.toLowerCase() === kategori.toLowerCase());
        kategori = match ? match.nama : 'Lainnya';
      }
      try {
        out.push(cleanTx({
          tanggal: t.tanggal, jenis, nominal: t.nominal, kategori,
          dompet_id: findWallet(t.dompet) || UTAMA_ID,
          dompet_tujuan_id: jenis === 'pindah' ? findWallet(t.dompet_tujuan) : '',
          keterangan: t.keterangan, sumber: opts.sumber, transkrip: opts.transkrip,
        }, opts.today));
      } catch (e) { /* lewati item yang tidak valid */ }
    });
    return out;
  }

  // ---------- Parser sederhana untuk MODE DEMO (tanpa AI) ----------

  const SLANG = { gopek: 500, seceng: 1000, goceng: 5000, ceban: 10000, gocap: 50000, cepek: 100000 };
  const KATA_KATEGORI = [
    ['Makan & Minum', /makan|minum|kopi|bakso|nasi|sarapan|jajan|snack|gofood|warung|teh|mie/],
    ['Transportasi', /parkir|bensin|ojek|gojek|grab|tol|bus|kereta|krl|taksi|angkot|pertalite|pertamax/],
    ['Tagihan', /listrik|pulsa|internet|wifi|pln|pdam|tagihan|cicilan|kos|sewa|kuota/],
    ['Kesehatan', /obat|dokter|apotek|vitamin|klinik|rumah sakit/],
    ['Hiburan', /nonton|film|game|netflix|spotify|liburan|karaoke/],
    ['Belanja', /belanja|beli|baju|sepatu|sabun|indomaret|alfamart|shopee|tokopedia/],
    ['Keluarga', /anak|ortu|orang tua|ibu|ayah|istri|suami|keluarga/],
  ];

  function parseAmount(s) {
    for (const k in SLANG) if (new RegExp('\\b' + k + '\\b').test(s)) return SLANG[k];
    const m = s.match(/(\d+(?:[.,]\d+)*)\s*(ribu|rebu|rb|k|juta|jt)?\b/);
    if (!m) return 0;
    let num = m[1];
    const unit = m[2];
    if (unit) num = num.replace(',', '.');
    else num = num.replace(/[.,]/g, '');
    let v = parseFloat(num);
    if (/ribu|rebu|rb|k/.test(unit || '')) v *= 1000;
    if (/juta|jt/.test(unit || '')) v *= 1000000;
    return Math.round(v);
  }

  function findWalletIn(text, wallets) {
    // Nama terpanjang dulu, supaya "uang makan" tidak kalah oleh "makan".
    const sorted = wallets.filter((w) => !w.arsip).slice().sort((a, b) => b.nama.length - a.nama.length);
    return sorted.find((w) => text.indexOf(w.nama.toLowerCase()) >= 0);
  }

  function guessWalletForCategory(kategori, keterangan, wallets) {
    const kata = (kategori + ' ' + keterangan).toLowerCase().split(/[^a-z]+/).filter((k) => k.length > 3);
    const w = wallets.find((x) => !x.arsip && x.id !== UTAMA_ID && kata.some((k) => x.nama.toLowerCase().indexOf(k) >= 0));
    return w ? w.id : UTAMA_ID;
  }

  /** Ubah kalimat ketikan menjadi transaksi (perkiraan sederhana, hanya untuk mode demo). */
  function parseDemo(text, wallets, categories, today) {
    const s = String(text).toLowerCase();
    const pindah = s.match(/(?:pindah(?:kan)?|isi|sisihkan|nabung|transfer)\s+(.+?)\s+(?:dari\s+(?:dompet\s+)?(.+?)\s+)?ke\s+(?:dompet\s+)?(.+)/);
    if (pindah) {
      const asal = pindah[2] ? findWalletIn(pindah[2], wallets) : null;
      const tujuan = findWalletIn(pindah[3], wallets);
      const n = parseAmount(pindah[1]);
      if (tujuan && n > 0) {
        return [{ tanggal: today, jenis: 'pindah', nominal: n, kategori: 'Pindah dana',
          dompet_id: asal ? asal.id : UTAMA_ID, dompet_tujuan_id: tujuan.id, keterangan: 'Isi dompet ' + tujuan.nama }];
      }
    }
    // "ambil dari dompet X" / "pakai X" berlaku untuk seluruh kalimat
    let dompetDisebut = null;
    const sumber = s.match(/(?:ambil\s+)?(?:dari|pakai)\s+(?:dompet\s+)?(.+)$/);
    let body = s;
    if (sumber) {
      dompetDisebut = findWalletIn(sumber[1], wallets);
      if (dompetDisebut) body = s.slice(0, sumber.index);
    }
    const pieces = body.split(/,|\bsama\b|\bdan\b|\bterus\b|\blalu\b|\+/).map((p) => p.trim()).filter(Boolean);
    const out = [];
    pieces.forEach((p) => {
      const n = parseAmount(p);
      if (!(n > 0)) return;
      const masuk = /gaji|gajian|bonus|terima|dapat|dikasih|dibayar|thr|pemasukan/.test(p);
      const jenis = masuk ? 'masuk' : 'keluar';
      let kategori = 'Lainnya';
      if (masuk) kategori = /gaji|gajian/.test(p) ? 'Gaji' : (/bonus|thr/.test(p) ? 'Bonus' : 'Lainnya');
      else {
        const hit = KATA_KATEGORI.find(([, re]) => re.test(p));
        if (hit) kategori = hit[0];
      }
      if (!categories.some((c) => c.nama === kategori && c.jenis === jenis)) kategori = 'Lainnya';
      let ket = p.replace(/(\d+(?:[.,]\d+)*)\s*(ribu|rebu|rb|k|juta|jt)?\b/, '')
        .replace(/\b(tadi|habis|abis|buat|untuk|bayar|seharga|harganya)\b/g, '').replace(/\s+/g, ' ').trim();
      for (const k in SLANG) ket = ket.replace(new RegExp('\\b' + k + '\\b'), '').trim();
      ket = ket ? ket.charAt(0).toUpperCase() + ket.slice(1) : kategori;
      const dompet_id = masuk ? (dompetDisebut ? dompetDisebut.id : UTAMA_ID)
        : (dompetDisebut ? dompetDisebut.id : guessWalletForCategory(kategori, ket, wallets));
      out.push({ tanggal: today, jenis, nominal: n, kategori, dompet_id, dompet_tujuan_id: '', keterangan: ket });
    });
    return out;
  }

  // ---------- Rencana tujuan ----------

  const BULAN = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
  /** Template tujuan (dipakai tombol template & rencana mode demo). Angka = perkiraan kasar, bisa dikoreksi pengguna. */
  const GOAL_TEMPLATES = [
    { key: 'race', label: 'Event / race', emoji: '🏃', contoh: 'Ikut race lari half marathon', bulan: 8,
      re: /marathon|maraton|lari|race|run\b|triathlon|gran ?fondo|konser|festival|event/,
      rincian: [['Registrasi', 750000], ['Sepatu & perlengkapan', 1500000], ['Transport', 800000], ['Penginapan 2 malam', 1000000], ['Makan & lain-lain', 500000]] },
    { key: 'liburan', label: 'Liburan', emoji: '🏖️', contoh: 'Liburan 4 hari ke Bali', bulan: 6,
      re: /liburan|libur|trip|jalan-jalan|travel|wisata|bali|jepang|lombok|honeymoon/,
      rincian: [['Tiket pesawat PP', 3000000], ['Penginapan', 2500000], ['Makan', 1500000], ['Transport lokal', 800000], ['Oleh-oleh & lain-lain', 700000]] },
    { key: 'gadget', label: 'Gadget', emoji: '📱', contoh: 'Beli HP baru', bulan: 6,
      re: /\bhp\b|iphone|samsung|laptop|gadget|kamera|ipad|macbook|ps5|konsol|tablet/,
      rincian: [['Harga barang', 8000000], ['Aksesori & pelindung', 500000]] },
    { key: 'darurat', label: 'Dana darurat', emoji: '🛟', contoh: 'Dana darurat 3 bulan biaya hidup', bulan: 12,
      re: /darurat|emergency|jaga-jaga/,
      rincian: [['3 bulan biaya hidup', 15000000]] },
    { key: 'nikah', label: 'Nikah', emoji: '💍', contoh: 'Biaya menikah sederhana', bulan: 18,
      re: /nikah|menikah|wedding|lamaran|resepsi/,
      rincian: [['Lamaran & seserahan', 10000000], ['Gedung & katering', 40000000], ['Busana & rias', 8000000], ['Dokumentasi', 5000000], ['Undangan & suvenir', 4000000]] },
    { key: 'kendaraan', label: 'Kendaraan', emoji: '🏍️', contoh: 'Beli motor baru tunai', bulan: 12,
      re: /motor|mobil|sepeda|kendaraan/,
      rincian: [['Harga kendaraan', 20000000], ['Surat-surat & asuransi', 1500000], ['Helm & aksesori', 700000]] },
  ];

  /** Cari "Juni 2027" / "juni" / "6/2027" di teks. Hasil tanggal 1 bulan itu (YYYY-MM-DD) atau null. */
  function findMonthDate(s, today) {
    const m = s.match(/\b(januari|jan|februari|feb|maret|mar|april|apr|mei|juni|jun|juli|jul|agustus|agu|agt|september|sept|sep|oktober|okt|november|nov|desember|des)\b\.?\s*(\d{4})?/);
    if (!m) return null;
    const idx = m[1] === 'agt' ? 7 : BULAN.indexOf(m[1].slice(0, 3));
    let y = m[2] ? Number(m[2]) : Number(today.slice(0, 4));
    const ym = y + '-' + String(idx + 1).padStart(2, '0');
    if (!m[2] && ym <= monthOf(today)) y++;
    return y + '-' + String(idx + 1).padStart(2, '0') + '-01';
  }

  /** Rencana tujuan sederhana untuk MODE DEMO (tanpa AI): tebak template dari kata kunci. */
  function planDemo(text, today) {
    const s = String(text || '').toLowerCase();
    const tpl = GOAL_TEMPLATES.find((t) => t.re.test(s)) || { emoji: '🎯', bulan: 6, rincian: [['Perkiraan total', 5000000]] };
    let nama = String(text || '').replace(/\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|sep|okt|nov|des)\b\.?\s*(\d{4})?/gi, '')
      .replace(/\b(aku|saya|mau|ingin|pengen|pingin|bulan|tahun|depan|di|pada)\b/gi, ' ').replace(/\d+(?:[.,]\d+)*\s*(ribu|rb|k|juta|jt)\b|\b\d{5,}\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    nama = nama ? (nama.charAt(0).toUpperCase() + nama.slice(1)).slice(0, 40) : (tpl.label || 'Tujuanku');
    const nominal = parseAmount(s);
    const rincian = nominal >= 10000 ? [{ nama: 'Perkiraan total', nominal }] : tpl.rincian.map(([n, v]) => ({ nama: n, nominal: v }));
    let tenggat = findMonthDate(s, today);
    if (!tenggat) {
      const [y, m] = today.split('-').map(Number);
      const d = new Date(y, m - 1 + tpl.bulan, 1);
      tenggat = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    }
    return cleanPlan({ nama, emoji: tpl.emoji, tenggat, rincian,
      catatan: 'Mode demo: angka di atas perkiraan kasar. Koreksi sesuai kebutuhanmu ya.' }, today);
  }

  /** Rapikan rencana tujuan (dari AI atau demo). Tenggat minimal besok; target = jumlah rincian kalau ada. */
  function cleanPlan(p, today) {
    const rincian = (Array.isArray(p.rincian) ? p.rincian : []).slice(0, 12)
      .map((r) => ({ nama: String(r.nama || '').trim().slice(0, 60), nominal: Math.round(Number(r.nominal)) || 0 }))
      .filter((r) => r.nama && r.nominal > 0);
    const sum = rincian.reduce((s, r) => s + r.nominal, 0);
    let tenggat = /^\d{4}-\d{2}-\d{2}$/.test(p.tenggat || '') ? p.tenggat : '';
    if (!tenggat || tenggat <= today) {
      const [y, m] = today.split('-').map(Number);
      const d = new Date(y, m - 1 + 6, 1);
      tenggat = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    }
    const emoji = Array.from(String(p.emoji || '').trim()).slice(0, 4).join('') || '🎯';
    return { nama: String(p.nama || '').trim().slice(0, 60) || 'Tujuanku', emoji, tenggat, rincian,
      target: sum || Math.max(0, Math.round(Number(p.target)) || 0), catatan: String(p.catatan || '').slice(0, 300),
      transkrip: String(p.transkrip || '').slice(0, 500) };
  }

  const api = { GOAL_TEMPLATES, UTAMA_ID, KATEGORI_PINDAH, KATEGORI_SALDO_AWAL, computeWallets, monthSummary, monthAchievement, openingBalances, categoryReport, cashPosition, cashZone, CASH_LEVELS,
    cleanTx, mapAiResult, compareMonths, shiftMonth, parseDemo, parseAmount, sortTx, monthOf,
    daysBetween, addDays, walletBalance, goalProgress, goalDelayDays, safeDaily, currentZone, localComment, fillDays, planDemo, cleanPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HBLogic = api;
})(this);
