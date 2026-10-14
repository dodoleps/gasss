/*
 * Animasi layar login: 4 babak berganti mulus (catat lewat suara -> posisi kas -> perbandingan -> tujuan tercapai)
 * dengan slogan masing-masing. Berjalan hanya selama layar login tampil (HBLogin.start / HBLogin.stop).
 * "Kurangi Gerakan" aktif -> babak grafik ditampilkan diam.
 */
(function (root) {
  const DUR = 4800;
  let interval = null, timers = [], idx = 0, ready = false;
  const $ = (sel) => document.querySelector(sel);
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function setup() {
    if (ready) return;
    ready = true;
    const line = $('#lg-cash-line');
    if (line) line.style.setProperty('--len', Math.ceil(line.getTotalLength()));
  }

  function play(n) {
    timers.forEach(clearTimeout);
    timers = [];
    const scenes = document.querySelectorAll('#login-screen .lg-scene');
    scenes.forEach((s, k) => {
      if (k === n) { s.classList.remove('on'); void s.getBoundingClientRect(); s.classList.add('on'); } else s.classList.remove('on');
    });
    document.querySelectorAll('#login-screen .lg-slogan h1').forEach((h, k) => h.classList.toggle('on', k === n));
    document.querySelectorAll('#login-screen .lg-dots i').forEach((d, k) => d.classList.toggle('on', k === n));
    $('#lg-cap').textContent = scenes[n].dataset.cap;
    if (n === 0) {
      const t = root.HBI18n ? root.HBI18n.t('“kopi dua puluh lima ribu”') : '“kopi dua puluh lima ribu”', typed = $('#lg-typed');
      typed.textContent = '';
      for (let k = 1; k <= t.length; k++) later(() => { typed.textContent = t.slice(0, k); }, 300 + k * 55);
    }
    if (n === 3) {
      const count = $('#lg-count');
      count.textContent = '0%';
      const t0 = performance.now() + 300;
      const step = (now) => {
        const p = Math.min(1, Math.max(0, (now - t0) / 2400));
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        count.textContent = Math.round(e * 100) + '%';
        if (p < 1 && scenes[3].classList.contains('on')) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      later(() => {
        const st = $('#login-screen .lg-stage');
        if (!st || !window.HBScenes || $('#login-screen').hidden) return;
        const b = st.getBoundingClientRect();
        window.HBScenes.burst(b.left + b.width / 2, b.top + b.height * 0.42, 110, true);
      }, 2600);
    }
  }

  function start() {
    setup();
    stop();
    if (reduce()) { play(1); return; }
    idx = 0;
    play(0);
    interval = setInterval(() => { idx = (idx + 1) % 4; play(idx); }, DUR);
  }
  function stop() {
    clearInterval(interval);
    interval = null;
    timers.forEach(clearTimeout);
    timers = [];
  }

  root.HBLogin = { start, stop };
})(this);
