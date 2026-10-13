/*
 * Ilustrasi bergerak untuk kartu tujuan (SVG + animasi CSS, tanpa pustaka).
 * Setiap tema menggambar adegan 340×210; progres 0..1 menggerakkan "penjalan" di lintasan (race, liburan, nikah,
 * kendaraan, umum) atau mengisi wadah (gadget = baterai, darurat = perisai).
 * Checkpoint = rincian biaya (kumulatif) + 25/50/75%. Bayangan/garis putus-putus = posisi "seharusnya".
 *
 * HBScenes.mount(svg, { tema, checkpoints: [{ f, nama }], seharusnya }) -> { draw(p, dir), point(f) }
 * HBScenes.burst(x, y, n, big) -> confetti di layar.
 */
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = '"Plus Jakarta Sans", -apple-system, sans-serif';
  const PCT = [0.25, 0.5, 0.75];
  let uid = 0;

  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function emoji(parent, x, y, size, ch, cls, delay) {
    const t = el('text', { x, y, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: cls || '' }, parent, ch);
    if (delay) t.style.animationDelay = delay + 's';
    return t;
  }
  function label(parent, x, y, text, opts) {
    return el('text', { x, y, 'font-size': (opts && opts.size) || 9, 'font-weight': 800, fill: (opts && opts.fill) || 'var(--sc-ink)',
      'text-anchor': (opts && opts.anchor) || 'middle', 'dominant-baseline': 'central', 'font-family': FONT }, parent, text);
  }
  function drifting(parent, y, size, ch, dur, delay) {
    const g = el('g', { class: 'sc-drift', style: 'animation-duration:' + dur + 's;animation-delay:-' + delay + 's' }, parent);
    emoji(g, 0, y, size, ch);
    return g;
  }
  function bg(svg, fill) { el('rect', { x: 0, y: 0, width: 340, height: 210, fill }, svg); }
  function gradient(svg, id, a, b) {
    const defs = el('defs', {}, svg);
    const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': a }, g);
    el('stop', { offset: 1, 'stop-color': b }, g);
    return 'url(#' + id + ')';
  }

  // ---------- Tema berbasis lintasan ----------

  const PATH_THEMES = {
    race(svg) {
      bg(svg, 'var(--sc-grass)');
      el('path', { d: 'M0 160 Q 90 130 170 165 T 340 150 V210 H0Z', fill: 'var(--sc-grass-2)' }, svg);
      emoji(svg, 34, 30, 26, '☀️', 'sc-spin');
      drifting(svg, 22, 26, '☁️', 34, 0); drifting(svg, 62, 20, '☁️', 46, 20);
      [[300, 150], [26, 120], [196, 182], [110, 70], [326, 92]].forEach(([x, y]) => emoji(svg, x, y, 18, '🌳'));
      const d = 'M22 186 C 92 186, 64 128, 140 128 S 236 158, 252 108 S 196 56, 262 46 S 312 40, 322 30';
      el('path', { d, fill: 'none', stroke: 'var(--sc-road-edge)', 'stroke-width': 22, 'stroke-linecap': 'round' }, svg);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-road)', 'stroke-width': 18, 'stroke-linecap': 'round' }, svg);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 18, 'stroke-linecap': 'round', opacity: 0.85 }, svg);
      el('path', { d, fill: 'none', stroke: 'var(--sc-lane)', 'stroke-width': 2, class: 'sc-lane', opacity: 0.9 }, svg);
      label(svg, 22, 202, 'START');
      [[296, 18, '📣'], [312, 52, '👏'], [282, 34, '👏']].forEach(([x, y, c], i) => emoji(svg, x, y, 14, c, 'sc-cheer', i * 0.15));
      emoji(svg, 326, 20, 20, '🏁');
      return { path, done, mover: '🏃', size: 26, faceLeft: true, dy: -15, pin: '🚩' };
    },

    liburan(svg) {
      bg(svg, gradient(svg, 'sea' + uid, 'var(--sc-sea)', 'var(--sc-sea-2)'));
      for (let r = 0; r < 4; r++) {
        const row = el('g', { transform: 'translate(0 ' + (70 + r * 38) + ')' }, svg);
        el('path', { d: 'M-40 0 ' + 'q 10 -5 20 0 t 20 0 '.repeat(12), fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.5, 'stroke-width': 1.4,
          class: 'sc-wave', style: 'animation-duration:' + (3 + r) + 's' }, row);
      }
      el('path', { d: 'M-10 150 C 20 120, 70 128, 104 146 S 120 196, 70 204 S -10 200, -10 180Z', fill: 'var(--sc-land)' }, svg);
      el('path', { d: 'M-10 172 C 30 160, 70 166, 96 176 S 80 206, 40 210 H-10Z', fill: 'var(--sc-land-2)' }, svg);
      el('path', { d: 'M262 128 C 290 112, 336 116, 344 136 V182 C 320 196, 270 184, 258 162 S 248 136, 262 128Z', fill: 'var(--sc-land)' }, svg);
      el('path', { d: 'M270 150 C 296 140, 330 144, 344 158 V182 C 320 192, 284 184, 270 168Z', fill: 'var(--sc-land-2)' }, svg);
      emoji(svg, 46, 154, 22, '🏙️'); emoji(svg, 300, 136, 22, '🌴'); emoji(svg, 324, 160, 18, '🏝️');
      label(svg, 46, 184, 'BERANGKAT'); label(svg, 300, 180, 'TUJUAN');
      const boat = el('g', { class: 'sc-boat' }, svg); emoji(boat, 150, 186, 16, '⛵');
      const d = 'M56 140 C 110 20, 236 10, 298 122';
      const path = el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-dasharray': '3 6', opacity: 0.85 }, svg);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, svg);
      drifting(svg, 30, 30, '☁️', 26, 0); drifting(svg, 74, 22, '☁️', 34, 11); drifting(svg, 108, 26, '☁️', 40, 22);
      return { path, done, mover: '✈️', size: 26, rotate: true, dy: 0, pin: '📍' };
    },

    nikah(svg) {
      bg(svg, gradient(svg, 'pink' + uid, 'var(--sc-pink)', 'var(--sc-pink-2)'));
      for (let i = 0; i < 8; i++) emoji(svg, 20 + i * 42, 214, 12 + (i % 3) * 3, i % 2 ? '💗' : '🤍', 'sc-rise', i * 0.7);
      [[30, 40, '🌸'], [90, 24, '🌷'], [210, 30, '🌸'], [24, 120, '🌷'], [320, 178, '🌸'], [180, 196, '🌷']].forEach(([x, y, c]) => emoji(svg, x, y, 16, c));
      const d = 'M20 176 C 80 196, 120 150, 160 152 S 220 186, 250 140 S 260 80, 300 64';
      el('path', { d, fill: 'none', stroke: 'var(--sc-aisle-edge)', 'stroke-width': 18, 'stroke-linecap': 'round' }, svg);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-aisle)', 'stroke-width': 14, 'stroke-linecap': 'round' }, svg);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 14, 'stroke-linecap': 'round', opacity: 0.8 }, svg);
      el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-dasharray': '1 7', 'stroke-linecap': 'round', class: 'sc-lane', opacity: 0.9 }, svg);
      emoji(svg, 304, 40, 34, '💒');
      emoji(svg, 276, 26, 14, '✨', 'sc-twinkle'); emoji(svg, 330, 26, 14, '✨', 'sc-twinkle', 0.5);
      return { path, done, mover: '💑', size: 26, dy: -14, pin: '🎀' };
    },

    kendaraan(svg) {
      bg(svg, gradient(svg, 'sky' + uid, 'var(--sc-sky)', 'var(--sc-sky-2)'));
      drifting(svg, 22, 22, '☁️', 40, 0); drifting(svg, 46, 18, '☁️', 52, 25);
      [[20, 96, '🏢', 34], [60, 92, '🏬', 30], [116, 98, '🏢', 26], [210, 96, '🏬', 28], [250, 92, '🏢', 34]].forEach(([x, y, c, s]) => emoji(svg, x, y, s, c));
      el('rect', { x: 0, y: 112, width: 340, height: 98, fill: 'var(--sc-grass)' }, svg);
      const d = 'M10 176 C 70 176, 90 146, 150 150 S 230 178, 270 150 S 300 122, 318 120';
      el('path', { d, fill: 'none', stroke: 'var(--sc-road-edge)', 'stroke-width': 24, 'stroke-linecap': 'round' }, svg);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-asphalt)', 'stroke-width': 20, 'stroke-linecap': 'round' }, svg);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.9 }, svg);
      el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.6, class: 'sc-lane', opacity: 0.8 }, svg);
      emoji(svg, 318, 100, 30, '🏪');
      emoji(svg, 300, 74, 16, '🔑', 'sc-bounce');
      emoji(svg, 120, 124, 16, '🚦'); emoji(svg, 36, 140, 16, '🌳'); emoji(svg, 210, 200, 16, '🌳');
      return { path, done, mover: '🏍️', size: 24, faceLeft: true, dy: -10, pin: '⛽' };
    },

    umum(svg) {
      bg(svg, gradient(svg, 'sky' + uid, 'var(--sc-sky)', 'var(--sc-sky-2)'));
      emoji(svg, 300, 28, 24, '☀️', 'sc-spin');
      drifting(svg, 30, 22, '☁️', 36, 0); drifting(svg, 70, 18, '🐦', 24, 8); drifting(svg, 52, 14, '🐦', 30, 18);
      el('path', { d: 'M-20 210 L 90 70 L 140 120 L 200 22 L 360 210Z', fill: 'var(--sc-mount)' }, svg);
      el('path', { d: 'M178 58 L 200 22 L 222 58 L 210 52 L 200 62 L 190 52Z', fill: '#ffffff', opacity: 0.9 }, svg);
      el('path', { d: 'M-20 210 L 60 150 L 120 182 L 190 140 L 360 210Z', fill: 'var(--sc-grass-2)' }, svg);
      const d = 'M24 196 L 96 170 L 70 146 L 150 124 L 124 96 L 176 76 L 160 54 L 200 30';
      el('path', { d, fill: 'none', stroke: 'var(--sc-road-edge)', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-road)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      emoji(svg, 208, 14, 20, '🚩');
      [[270, 170], [300, 190], [30, 170]].forEach(([x, y]) => emoji(svg, x, y, 16, '🌲'));
      return { path, done, mover: '🚶', size: 22, faceLeft: true, dy: -11, pin: '⛺' };
    },
  };

  function mountPath(svg, sc, cps, seharusnya) {
    const L = sc.path.getTotalLength();
    const at = (f) => sc.path.getPointAtLength(Math.max(0, Math.min(1, f)) * L);
    sc.done.setAttribute('stroke-dasharray', '0 ' + (L + 1));
    const marks = el('g', {}, svg);
    PCT.forEach((f) => {
      const p = at(f);
      el('circle', { cx: p.x, cy: p.y, r: 4, fill: 'var(--card)', stroke: 'var(--sc-ink)', 'stroke-width': 1.5 }, marks);
      label(marks, p.x, p.y + 12, Math.round(f * 100) + '%', { size: 8.5 });
    });
    const flags = cps.filter((c) => c.f < 0.999).map((c) => {
      const p = at(c.f);
      const g = el('g', { transform: 'translate(' + p.x + ' ' + (p.y - 14) + ')' }, marks);
      const ring = el('circle', { cx: 0, cy: 0, r: 9, fill: 'var(--sc-done)', opacity: 0, class: 'sc-pulse' }, g);
      const t = emoji(g, 0, 0, 15, sc.pin);
      return { c, t, ring };
    });
    const ghost = el('g', { opacity: 0.35 }, svg);
    emoji(ghost, 0, 0, sc.size - 4, sc.mover);
    const gp = at(seharusnya);
    ghost.setAttribute('transform', 'translate(' + gp.x + ' ' + (gp.y + sc.dy) + ')');
    const mover = el('g', {}, svg);
    const inner = el('g', {}, mover);
    emoji(inner, 0, 0, sc.size, sc.mover, 'sc-bob');
    return {
      draw(p, dir) {
        sc.done.setAttribute('stroke-dasharray', (L * p) + ' ' + (L + 1));
        const pt = at(p), ahead = at(Math.min(1, p + 0.01)), back = at(Math.max(0, p - 0.01));
        const ang = Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180 / Math.PI;
        mover.setAttribute('transform', 'translate(' + pt.x + ' ' + (pt.y + sc.dy) + ')');
        if (sc.rotate) inner.setAttribute('transform', 'rotate(' + (ang + 45) + ')');
        else inner.setAttribute('transform', sc.faceLeft && ahead.x >= back.x === dir >= 0 ? 'scale(-1 1)' : '');
        flags.forEach((fl) => {
          const ok = p >= fl.c.f - 1e-6;
          fl.t.textContent = ok ? '✅' : sc.pin;
          fl.ring.setAttribute('opacity', ok ? 0 : 0.5);
        });
      },
      point(f) { const p = at(f); return { x: p.x, y: p.y - 14 }; },
    };
  }

  // ---------- Tema berbasis wadah yang terisi ----------

  function mountFill(svg, kind, cps, seharusnya) {
    const id = 'clip' + uid;
    let B, shape, deco;
    if (kind === 'gadget') {
      bg(svg, 'var(--sc-soft)');
      [[60, 40], [282, 60], [70, 170], [292, 176], [40, 104]].forEach(([x, y], i) => emoji(svg, x, y, 14, '✨', 'sc-twinkle', i * 0.3));
      el('rect', { x: 118, y: 10, width: 104, height: 192, rx: 20, fill: 'var(--sc-phone)' }, svg);
      el('rect', { x: 124, y: 16, width: 92, height: 180, rx: 15, fill: 'var(--sc-screen)' }, svg);
      el('rect', { x: 154, y: 21, width: 32, height: 8, rx: 4, fill: 'var(--sc-phone)' }, svg);
      el('rect', { x: 160, y: 39, width: 20, height: 8, rx: 3, fill: 'var(--sc-road-edge)' }, svg);
      B = { x: 140, y: 46, w: 60, h: 132, top: 49, bottom: 175 };
      el('rect', { x: B.x, y: B.y, width: B.w, height: B.h, rx: 12, fill: 'var(--sc-cell)', stroke: 'var(--sc-road-edge)', 'stroke-width': 2 }, svg);
      shape = (p) => el('rect', { x: B.x + 3, y: B.y + 3, width: B.w - 6, height: B.h - 6, rx: 9 }, p);
      deco = '⚡';
    } else {
      bg(svg, gradient(svg, 'storm' + uid, 'var(--sc-storm)', 'var(--sc-storm-2)'));
      emoji(svg, 50, 26, 30, '🌧️'); emoji(svg, 290, 30, 28, '🌧️');
      for (let i = 0; i < 16; i++) {
        const x = 12 + i * 21;
        if (x > 96 && x < 244) continue;
        const ln = el('line', { x1: x, y1: 40, x2: x - 4, y2: 52, stroke: 'var(--sc-rain)', 'stroke-width': 2, 'stroke-linecap': 'round', class: 'sc-rain' }, svg);
        ln.style.animationDelay = (i % 5) * 0.17 + 's';
      }
      const d = 'M170 14 L232 36 V96 C232 146 204 178 170 196 C136 178 108 146 108 96 V36 Z';
      el('path', { d, fill: 'var(--sc-cell)', stroke: 'var(--sc-road-edge)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
      B = { x: 108, y: 14, w: 124, h: 182, top: 18, bottom: 192 };
      shape = (p) => el('path', { d }, p);
      deco = '☂️';
      emoji(svg, 50, 192, 18, '🏠'); emoji(svg, 292, 192, 18, '👨‍👩‍👧');
    }
    const clip = el('clipPath', { id }, el('defs', {}, svg));
    shape(clip);
    const g = el('g', { 'clip-path': 'url(#' + id + ')' }, svg);
    const lvl = el('g', {}, g);
    const wave = 'M0 0 ' + 'q 15 -7 30 0 t 30 0 '.repeat(8) + 'V 220 H 0 Z';
    el('path', { d: wave, fill: 'var(--sc-done)', class: 'sc-liquid' }, lvl);
    el('path', { d: wave, fill: 'var(--sc-done)', opacity: 0.45, class: 'sc-liquid', style: 'animation-duration:3.4s;animation-direction:reverse' }, lvl);
    for (let i = 0; i < 8; i++) {
      const c = el('circle', { cx: 24 + (i * 13) % (B.w - 10), cy: 30, r: 1.5 + (i % 3), fill: '#ffffff', class: 'sc-bubble' }, lvl);
      c.style.animationDuration = 2.2 + (i % 4) * 0.6 + 's';
      c.style.animationDelay = i * 0.45 + 's';
    }
    const cx = B.x + B.w / 2, midY = (B.top + B.bottom) / 2;
    const icon = emoji(svg, cx, midY - 10, 28, deco, 'sc-zap');
    const pct = label(svg, cx, midY + 22, '0%', { size: 15, fill: 'var(--sc-ink)' });
    const yOf = (f) => B.bottom - (B.bottom - B.top) * f;
    const leftX = B.x - (kind === 'gadget' ? 9 : 6), rightX = B.x + B.w + (kind === 'gadget' ? 14 : 10);
    PCT.forEach((f) => {
      el('line', { x1: leftX + 3, x2: B.x + 2, y1: yOf(f), y2: yOf(f), stroke: 'var(--sc-ink)', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }, svg);
      label(svg, leftX, yOf(f), Math.round(f * 100) + '%', { anchor: 'end', size: 9 });
    });
    const gy = yOf(seharusnya);
    el('line', { x1: B.x, x2: B.x + B.w, y1: gy, y2: gy, stroke: 'var(--sc-ink)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: 0.5 }, svg);
    let last = 999;
    const names = cps.map((c) => {
      let y = yOf(c.f);
      if (y > last - 12) y = last - 12;
      last = y;
      el('line', { x1: B.x + B.w - 2, x2: rightX - 4, y1: yOf(c.f), y2: yOf(c.f), stroke: 'var(--sc-ink)', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }, svg);
      const nm = c.nama.length > 16 ? c.nama.slice(0, 15) + '…' : c.nama;
      return { c, nm, t: label(svg, rightX, y, nm, { anchor: 'start', size: 9.5 }) };
    });
    return {
      draw(p) {
        lvl.setAttribute('transform', 'translate(' + (B.x - 30) + ' ' + (yOf(p) - 3) + ')');
        pct.textContent = Math.round(p * 100) + '%';
        icon.style.opacity = p >= 1 ? 0 : 1;
        names.forEach((n) => {
          const ok = p >= n.c.f - 1e-6;
          n.t.textContent = (ok ? '✓ ' : '') + n.nm;
          n.t.setAttribute('fill', ok ? 'var(--sc-done)' : 'var(--sc-ink)');
        });
      },
      point(f) { return { x: cx, y: yOf(f) }; },
    };
  }

  function mount(svg, opts) {
    uid++;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const tema = opts.tema;
    const cps = opts.checkpoints || [];
    const s = Math.max(0, Math.min(1, opts.seharusnya || 0));
    if (tema === 'gadget' || tema === 'darurat') return mountFill(svg, tema, cps, s);
    const build = PATH_THEMES[tema] || PATH_THEMES.umum;
    return mountPath(svg, build(svg), cps, s);
  }

  // ---------- Confetti ----------
  let cv = null, ctx = null, parts = [], running = false;
  const COLORS = ['#22c55e', '#facc15', '#f97316', '#e11d48', '#38bdf8', '#a78bfa', '#ffffff'];
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.className = 'sc-fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    const size = () => { const r = window.devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; ctx.setTransform(r, 0, 0, r, 0, 0); };
    window.addEventListener('resize', size);
    size();
  }
  function burst(x, y, n, big) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensureCanvas();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (big ? 6 : 3.5) * (0.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (big ? 5 : 3), r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.3,
        w: 4 + Math.random() * 5, h: 3 + Math.random() * 4, c: COLORS[i % COLORS.length], life: 1 });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0);
    parts.forEach((p) => {
      p.vy += 0.18; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.011;
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (parts.length) requestAnimationFrame(tick);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /** Titik adegan (koordinat SVG) -> posisi di layar, untuk confetti. */
  function toScreen(svg, pt) {
    const m = svg.getScreenCTM();
    if (!m) return { x: innerWidth / 2, y: innerHeight / 3 };
    const q = svg.createSVGPoint(); q.x = pt.x; q.y = pt.y;
    const r = q.matrixTransform(m);
    return { x: r.x, y: r.y };
  }

  root.HBScenes = { mount, burst, toScreen };
})(this);
