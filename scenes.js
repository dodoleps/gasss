/*
 * Ilustrasi kartu tujuan versi MOTION GRAPHIC (uji coba): semua gambar vektor datar (tanpa emoji), 9 tema, adegan 340×210.
 * - Animasi pembuka: lapisan muncul bergantian, jalur tergambar, tokoh berjalan dari START ke posisi progres.
 * - Latar hidup: awan/ombak/bintang/lampu bergerak berlapis (kecepatan beda = kesan kedalaman).
 * - Tokoh beranimasi: kaki & tangan melangkah saat bergerak, melambai saat diam; pesawat meninggalkan jejak asap.
 * - Checkpoint tercapai: bendera berubah warna + letupan cincin & percikan.
 * - Jeda otomatis (hemat baterai): animasi berhenti saat kartu tidak terlihat di layar atau aplikasi sedang di latar belakang.
 * API sama dengan scenes.js: HBScenes.mount(svg, { tema, checkpoints:[{f,nama}], seharusnya }) -> { draw(p, dir), point(f) }
 */
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = '"Plus Jakarta Sans", -apple-system, sans-serif';
  const PCT = [0.25, 0.5, 0.75];
  let uid = 0;

  // ---------- Alat gambar ----------
  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const g = (parent, attrs) => el('g', attrs || {}, parent);
  /** Grup di posisi x,y (posisi lewat atribut; animasi CSS dipasang di grup DALAM supaya tidak menimpa posisi). */
  const at = (parent, x, y, s) => g(parent, { transform: 'translate(' + x + ' ' + y + ')' + (s && s !== 1 ? ' scale(' + s + ')' : '') });
  /** Animasi berulang pada grup dalam. */
  function anim(parent, cls, dur, delay, extra) {
    const e = g(parent, { class: cls });
    if (dur) e.style.animationDuration = dur + 's';
    if (delay) e.style.animationDelay = delay + 's';
    if (extra) Object.assign(e.style, extra);
    return e;
  }
  /** Lapisan yang muncul saat pembukaan (berurutan menurut delay). */
  function layer(parent, d, kind) {
    const e = g(parent, { class: 'v-in' + (kind ? ' v-in-' + kind : '') });
    e.style.setProperty('--d', (d || 0) + 's');
    return e;
  }
  function label(parent, x, y, text, o) {
    o = o || {};
    return el('text', { x, y, 'font-size': o.size || 9, 'font-weight': 800, fill: o.fill || 'var(--sc-ink)', 'text-anchor': o.anchor || 'middle',
      'dominant-baseline': 'central', 'font-family': FONT, 'letter-spacing': o.ls,
      stroke: o.halo === false ? undefined : 'var(--v-halo, var(--card))', 'stroke-width': o.halo === false ? undefined : 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, parent, text);
  }
  function grad(svg, a, b, vertical) {
    const id = 'vg' + uid + '_' + (grad.n = (grad.n || 0) + 1);
    const lg = el('linearGradient', { id, x1: 0, y1: 0, x2: vertical === false ? 1 : 0, y2: vertical === false ? 0 : 1 }, defs(svg));
    el('stop', { offset: 0, 'stop-color': a }, lg);
    el('stop', { offset: 1, 'stop-color': b }, lg);
    return 'url(#' + id + ')';
  }
  function radial(svg, color, op) {
    const id = 'vr' + uid + '_' + (grad.n = (grad.n || 0) + 1);
    const rg = el('radialGradient', { id }, defs(svg));
    el('stop', { offset: 0, 'stop-color': color, 'stop-opacity': op === undefined ? 0.8 : op }, rg);
    el('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }, rg);
    return 'url(#' + id + ')';
  }
  function defs(svg) { return svg.querySelector('defs') || el('defs', {}, svg); }
  const bg = (svg, fill) => el('rect', { x: 0, y: 0, width: 340, height: 210, fill }, svg);

  // ---------- Elemen dekorasi vektor ----------
  function cloud(parent, s, op) {
    const c = g(parent, { fill: 'var(--v-cloud)', opacity: op === undefined ? 1 : op, transform: 'scale(' + s + ')' });
    el('circle', { cx: 0, cy: 0, r: 9 }, c); el('circle', { cx: 12, cy: -6, r: 12 }, c); el('circle', { cx: 26, cy: -2, r: 9 }, c);
    el('rect', { x: -2, y: -3, width: 32, height: 10, rx: 5 }, c);
    return c;
  }
  /** Benda melayang melintasi adegan (parallax: jauh = kecil, pelan, pudar). */
  function drift(parent, y, dur, delayFrac, build) {
    const p = at(parent, 0, y);
    const a = anim(p, 'v-drift', dur, -dur * delayFrac);
    build(a);
    return a;
  }
  function bird(parent, x, y, s) {
    const p = at(parent, x, y, s || 1);
    const w = anim(p, 'v-flap v-fb', 0.5 + Math.random() * 0.2);
    el('path', { d: 'M-7 0 Q-3.5 -5 0 0 Q3.5 -5 7 0', fill: 'none', stroke: 'var(--v-bird)', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, w);
  }
  function sun(parent, x, y, r) {
    const p = at(parent, x, y);
    const rays = anim(p, 'v-spin v-fb', 24);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      el('line', { x1: Math.cos(a) * (r + 4), y1: Math.sin(a) * (r + 4), x2: Math.cos(a) * (r + 9), y2: Math.sin(a) * (r + 9),
        stroke: 'var(--v-sun)', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.8 }, rays);
    }
    const core = anim(p, 'v-glow v-fb', 3);
    el('circle', { r: r + 5, fill: 'var(--v-sun)', opacity: 0.25 }, core);
    el('circle', { r, fill: 'var(--v-sun)' }, core);
  }
  function tree(parent, x, y, s, delay) {
    const p = at(parent, x, y, s);
    const sw = anim(p, 'v-sway v-base', 3 + (x % 3) * 0.6, -(x % 5) * 0.4);
    el('rect', { x: -1.6, y: -10, width: 3.2, height: 10, rx: 1, fill: 'var(--v-trunk)' }, sw);
    el('circle', { cx: 0, cy: -16, r: 8, fill: 'var(--v-tree)' }, sw);
    el('circle', { cx: -4, cy: -13, r: 5, fill: 'var(--v-tree-2)' }, sw);
    return p;
  }
  function pine(parent, x, y, s) {
    const p = at(parent, x, y, s);
    const sw = anim(p, 'v-sway v-base', 3.6, -(x % 7) * 0.3);
    el('rect', { x: -1.5, y: -5, width: 3, height: 5, fill: 'var(--v-trunk)' }, sw);
    el('path', { d: 'M0 -26 L9 -12 H5 L11 -4 H-11 L-5 -12 H-9 Z', fill: 'var(--v-pine)' }, sw);
  }
  function palm(parent, x, y, s) {
    const p = at(parent, x, y, s);
    el('path', { d: 'M0 0 Q2 -12 -2 -26', fill: 'none', stroke: 'var(--v-trunk)', 'stroke-width': 3, 'stroke-linecap': 'round' }, p);
    const top = at(p, -2, -26);
    const sw = anim(top, 'v-sway', 2.6);
    [[-14, -2], [-10, -9], [12, -8], [14, 1], [2, -12]].forEach(([dx, dy]) =>
      el('path', { d: 'M0 0 Q' + dx / 2 + ' ' + (dy - 6) + ' ' + dx + ' ' + dy, fill: 'none', stroke: 'var(--v-tree)', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, sw));
  }
  function sparkle(parent, x, y, s, delay, color) {
    const p = at(parent, x, y, s || 1);
    const a = anim(p, 'v-twinkle v-fb', 1.8, delay);
    el('path', { d: 'M0 -6 Q0.8 -0.8 6 0 Q0.8 0.8 0 6 Q-0.8 0.8 -6 0 Q-0.8 -0.8 0 -6Z', fill: color || '#fff8d6' }, a);
  }
  function heart(parent, s, color) {
    return el('path', { d: 'M0 3 C-6 -1 -6 -6 -3 -6 C-1.5 -6 0 -5 0 -3.5 C0 -5 1.5 -6 3 -6 C6 -6 6 -1 0 3Z', fill: color, transform: 'scale(' + s + ')' }, parent);
  }

  // ---------- Tokoh ----------
  /**
   * Orang berdiri, kaki di (0,0), menghadap kanan, tinggi ±28. Anggota badan di grup sendiri supaya bisa melangkah.
   * o: { shirt, pants, skin, hair, run, band, pack, robe, dress, veil, arms:'up' }
   */
  function person(parent, o) {
    const P = g(parent, { class: 'v-person' + (o.run ? ' v-run' : '') });
    const body = g(P, { class: 'v-body' });
    const skin = o.skin || '#e0a878', shirt = o.shirt || '#2f8a75', pants = o.pants || '#334155';
    const limb = (x, y, cls, color, len, w) => {
      const j = at(body, x, y);
      const k = g(j, { class: cls });
      el('line', { x1: 0, y1: 0, x2: 0, y2: len, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, k);
      return k;
    };
    if (o.pack) el('rect', { x: -9, y: -21, width: 6, height: 9, rx: 2, fill: o.pack }, body);
    limb(0, -19, 'v-armB', shade(o.robe ? '#f4f1ea' : shirt), 8, 2.6);
    if (!o.dress) limb(0, -11, 'v-legB', shade(o.robe ? '#f4f1ea' : pants), 11, 3.2);
    if (o.dress) {
      limb(-1.2, -9, 'v-legB', shade(skin), 9, 2.4); limb(1.2, -9, 'v-legA', skin, 9, 2.4);
      el('path', { d: 'M-2 -19 L2 -19 L8 -1 Q0 1 -8 -1 Z', fill: o.dress }, body);
    }
    if (o.robe) el('path', { d: 'M-3.4 -20 L3.4 -20 L4.4 -6 L-4.4 -6 Z', fill: '#f4f1ea', stroke: '#d8d2c4', 'stroke-width': 0.6 }, body);
    else if (!o.dress) el('line', { x1: 0, y1: -11, x2: 0, y2: -20, stroke: shirt, 'stroke-width': 6.4, 'stroke-linecap': 'round' }, body);
    if (!o.dress) limb(0, -11, 'v-legA', o.robe ? '#f4f1ea' : pants, 11, 3.2);
    if (o.robe) el('path', { d: 'M-3.4 -20 L3.6 -13', stroke: '#d8d2c4', 'stroke-width': 1 }, body);
    el('circle', { cx: 0.6, cy: -25, r: 4.3, fill: skin }, body);
    if (o.hair) el('path', { d: 'M-3.9 -25.6 Q-3 -30.4 1.2 -29.6 Q4.6 -29 4.8 -26.2 Q1.5 -27.6 -0.6 -26.6 Q-1.6 -24 -3.9 -25.6Z', fill: o.hair }, body);
    if (o.band) el('path', { d: 'M-3.9 -26.4 Q0.6 -28.6 4.9 -26.4', fill: 'none', stroke: o.band, 'stroke-width': 1.8 }, body);
    if (o.veil) el('path', { d: 'M-1 -29.6 Q-7 -26 -9 -12 Q-5 -14 -3 -20 Z', fill: o.veil, opacity: 0.9 }, body);
    if (o.kopiah) el('rect', { x: -3.6, y: -31, width: 8.4, height: 3.6, rx: 1, fill: o.kopiah }, body);
    limb(0, -19, o.arms === 'up' ? 'v-armA v-armUp' : 'v-armA', o.robe ? '#f4f1ea' : shirt, 8, 2.6);
    return P;
  }
  function shade(c) { return 'color-mix(in srgb, ' + c + ' 72%, #000)'; }

  function plane(parent) {
    const P = g(parent, { class: 'v-plane' });
    const trail = g(P);
    for (let i = 0; i < 4; i++) {
      const pf = anim(at(trail, -17, 0), 'v-puff', 1.2, -i * 0.3);
      el('circle', { r: 2.6, fill: '#ffffff' }, pf);
    }
    el('path', { d: 'M-1 -1 L-7 -13 L-2.5 -13 L6 -1Z', fill: '#c9d6e3' }, P);
    el('path', { d: 'M-13 -1 L-17 -8 L-13.5 -8 L-8 -1Z', fill: 'var(--v-accent)' }, P);
    el('path', { d: 'M-15 0 Q-14 -4 -2 -4 L9 -3.4 Q15 -2 15 0 Q15 2 9 3.4 L-2 4 Q-14 4 -15 0Z', fill: '#ffffff', stroke: '#c9d6e3', 'stroke-width': 0.6 }, P);
    el('path', { d: 'M-12 1.2 H10', stroke: 'var(--v-accent)', 'stroke-width': 1.3 }, P);
    [-7, -3, 1, 5].forEach((x) => el('circle', { cx: x, cy: -1, r: 0.9, fill: '#5b7a99' }, P));
    el('path', { d: 'M-1 1 L-7 12 L-2.5 12 L6 1Z', fill: '#dfe7ef' }, P);
    return P;
  }

  // ---------- Tema berbasis lintasan ----------
  const PATH_THEMES = {
    sport(svg) {
      bg(svg, grad(svg, 'var(--v-sky)', 'var(--v-sky-2)'));
      const L0 = layer(svg, 0);
      sun(L0, 40, 32, 11);
      drift(L0, 26, 70, 0.1, (a) => cloud(a, 0.6, 0.6));
      drift(L0, 48, 44, 0.55, (a) => cloud(a, 0.9));
      drift(L0, 18, 32, 0.8, (a) => cloud(a, 1.1));
      const birds = drift(L0, 40, 30, 0.3, (a) => { bird(a, 0, 0, 0.8); bird(a, 12, 6, 0.6); });
      void birds;
      const L1 = layer(svg, 0.08, 'up');
      el('path', { d: 'M0 120 Q80 84 160 104 T300 62 Q324 58 340 64 V210 H0Z', fill: 'var(--v-hill-far)' }, L1);
      const L2 = layer(svg, 0.16, 'up');
      el('path', { d: 'M0 152 Q90 124 176 150 T340 132 V210 H0Z', fill: 'var(--sc-grass-2)' }, L2);
      [[120, 106, 0.8], [196, 94, 0.7], [326, 128, 0.9], [30, 140, 1]].forEach(([x, y, s]) => tree(L2, x, y, s));
      const L3 = layer(svg, 0.24, 'up');
      el('path', { d: 'M0 180 Q120 166 220 182 T340 174 V210 H0Z', fill: 'var(--sc-grass)' }, L3);
      tree(L3, 104, 200, 1.1); tree(L3, 330, 196, 1);
      // penonton bersorak
      const crowd = layer(svg, 0.9, 'pop');
      [[282, 134, '#f97316'], [294, 138, '#3b82f6'], [306, 133, '#e11d48'], [320, 137, '#8b5cf6']].forEach(([x, y, c], i) => {
        const p = at(crowd, x, y);
        el('rect', { x: -4, y: -9, width: 8, height: 10, rx: 4, fill: c }, p);
        el('circle', { cx: 0, cy: -12, r: 3.4, fill: '#e0a878' }, p);
        const arm = anim(at(p, 3, -7), 'v-cheer', 0.5, -i * 0.15);
        el('line', { x1: 0, y1: 0, x2: 4, y2: -6, stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round' }, arm);
        const arm2 = anim(at(p, -3, -7), 'v-cheer v-cheer-2', 0.5, -i * 0.15 - 0.25);
        el('line', { x1: 0, y1: 0, x2: -4, y2: -6, stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round' }, arm2);
      });
      const d = 'M20 190 C90 190, 70 140, 140 138 S230 160, 250 118 S220 76, 270 66 S300 58, 306 56';
      const track = layer(svg, 0.3);
      el('path', { d, fill: 'none', stroke: 'var(--sc-road-edge)', 'stroke-width': 20, 'stroke-linecap': 'round', class: 'v-draw' }, track);
      const path = el('path', { d, fill: 'none', stroke: 'var(--v-track)', 'stroke-width': 16, 'stroke-linecap': 'round', class: 'v-draw' }, track);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 16, 'stroke-linecap': 'round', opacity: 0.9 }, svg);
      const lane = layer(svg, 1.1, 'fade');
      el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.6, class: 'sc-lane', opacity: 0.85 }, lane);
      label(layer(svg, 0.5, 'pop'), 26, 202, 'START');
      // gapura finish
      const fin = layer(svg, 0.8, 'pop');
      el('rect', { x: 290, y: 30, width: 3, height: 28, fill: '#475569' }, fin);
      el('rect', { x: 320, y: 30, width: 3, height: 28, fill: '#475569' }, fin);
      const ban = anim(at(fin, 306, 30), 'v-flag-banner', 2.2);
      el('rect', { x: -20, y: -8, width: 40, height: 11, rx: 2, fill: '#1e2a27' }, ban);
      for (let i = 0; i < 10; i++) el('rect', { x: -20 + i * 4, y: (i % 2) * 2.75 - 8, width: 4, height: 2.75, fill: '#fff' }, ban);
      label(ban, 0, -1.2, 'FINISH', { size: 5.4, fill: '#fff', ls: 0.6, halo: false });
      return { path, done, dy: 0, make: (p) => person(p, { shirt: '#f97316', pants: '#1e293b', hair: '#2b1d14', band: '#e11d48', run: true }) };
    },

    traveling(svg) {
      bg(svg, grad(svg, 'var(--v-sky)', 'var(--v-sky-2)'));
      const L0 = layer(svg, 0);
      const sunG = at(L0, 176, 108);
      el('circle', { r: 34, fill: radial(svg, '#ffd166', 0.6) }, sunG);
      el('circle', { r: 16, fill: 'var(--v-sun)' }, sunG);
      drift(L0, 24, 80, 0.2, (a) => cloud(a, 0.55, 0.55));
      drift(L0, 60, 52, 0.65, (a) => cloud(a, 0.8, 0.8));
      drift(L0, 36, 38, 0.05, (a) => cloud(a, 1.1));
      drift(L0, 80, 28, 0.4, (a) => { bird(a, 0, 0, 0.7); bird(a, 10, 4, 0.55); });
      const sea = layer(svg, 0.1, 'up');
      el('rect', { x: 0, y: 108, width: 340, height: 102, fill: grad(svg, 'var(--sc-sea-2)', 'var(--sc-sea)') }, sea);
      el('rect', { x: 150, y: 110, width: 52, height: 3, rx: 1.5, fill: '#fff3c4', opacity: 0.7, class: 'v-shimmer' }, sea);
      el('rect', { x: 160, y: 118, width: 32, height: 2.4, rx: 1.2, fill: '#fff3c4', opacity: 0.5, class: 'v-shimmer', style: 'animation-delay:-.8s' }, sea);
      for (let r = 0; r < 4; r++) {
        const row = at(sea, 0, 128 + r * 22);
        el('path', { d: 'M-40 0 ' + 'q 10 -4 20 0 t 20 0 '.repeat(12), fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.45, 'stroke-width': 1.3,
          class: 'sc-wave', style: 'animation-duration:' + (3 + r) + 's' }, row);
      }
      const boatP = at(sea, 120, 182);
      const boat = anim(boatP, 'sc-boat', 10);
      const rock = anim(boat, 'v-rock v-fb', 2.4);
      el('path', { d: 'M-10 0 H10 L7 5 H-7Z', fill: '#8b5e3c' }, rock);
      el('path', { d: 'M0 -1 V-16 L9 -2Z', fill: '#ffffff' }, rock);
      el('path', { d: 'M-1 -2 V-13 L-7 -2Z', fill: 'var(--v-accent)' }, rock);
      const left = layer(svg, 0.25, 'up');
      el('path', { d: 'M-10 150 C20 124, 70 128, 104 146 S120 196, 70 204 S-10 200, -10 180Z', fill: 'var(--sc-land)' }, left);
      [[10, 150, 12, 26], [24, 150, 10, 36], [36, 150, 12, 22], [50, 150, 9, 30], [62, 150, 11, 18]].forEach(([x, y, w, h], i) => {
        el('rect', { x, y: y - h, width: w, height: h, rx: 1.5, fill: i % 2 ? 'var(--v-city)' : 'var(--v-city-2)' }, left);
        for (let k = 0; k < Math.floor(h / 7); k++) {
          const wdw = el('rect', { x: x + 2.5, y: y - h + 3 + k * 7, width: w - 5, height: 2.2, fill: '#ffe08a', class: 'v-blink' }, left);
          wdw.style.animationDelay = -((i * 3 + k) % 7) * 0.7 + 's';
        }
      });
      el('path', { d: 'M-10 166 C30 156, 70 162, 100 172 S80 206, 40 210 H-10Z', fill: 'var(--sc-land-2)' }, left);
      label(left, 48, 186, 'BERANGKAT');
      const right = layer(svg, 0.35, 'up');
      el('path', { d: 'M262 128 C290 112, 336 116, 344 136 V182 C320 196, 270 184, 258 162 S248 136, 262 128Z', fill: 'var(--sc-land)' }, right);
      el('path', { d: 'M270 150 C296 140, 330 144, 344 158 V182 C320 192, 284 184, 270 168Z', fill: 'var(--sc-land-2)' }, right);
      palm(right, 312, 134, 1); palm(right, 330, 140, 0.8);
      el('path', { d: 'M280 140 L290 128 L300 140Z', fill: '#c2410c' }, right);
      el('rect', { x: 282, y: 140, width: 16, height: 9, fill: '#fde68a' }, right);
      label(right, 300, 176, 'TUJUAN');
      const d = 'M56 140 C110 20, 236 10, 298 122';
      const route = layer(svg, 0.5, 'fade');
      const path = el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-dasharray': '3 6', opacity: 0.9 }, route);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, svg);
      return { path, done, dy: 0, rotate: true, scale: 1.15, make: (p) => plane(p) };
    },

    nikah(svg) {
      bg(svg, grad(svg, 'var(--sc-pink)', 'var(--sc-pink-2)'));
      const L0 = layer(svg, 0);
      for (let i = 0; i < 7; i++) {
        const b = el('circle', { cx: 20 + i * 50, cy: 30 + (i * 37) % 120, r: 10 + (i % 3) * 6, fill: '#ffffff', opacity: 0.18, class: 'v-bokeh' }, L0);
        b.style.animationDelay = -i * 0.9 + 's';
      }
      for (let i = 0; i < 9; i++) {
        const p = at(L0, 16 + i * 38, 216);
        const r = anim(p, 'v-rise', 6 + (i % 3), -i * 0.8);
        heart(r, 1 + (i % 3) * 0.35, i % 2 ? '#fb7185' : '#ffffff');
      }
      for (let i = 0; i < 8; i++) {
        const p = at(L0, 10 + i * 44, -8);
        const f = anim(p, 'v-petal', 5 + (i % 4), -i * 0.9);
        el('ellipse', { rx: 2.6, ry: 1.5, fill: '#f9a8d4' }, f);
      }
      const L1 = layer(svg, 0.15, 'up');
      el('path', { d: 'M0 196 Q60 176 120 192 T240 186 T340 192 V210 H0Z', fill: 'var(--v-pink-ground)' }, L1);
      const flower = (x, y, c, s) => {
        const p = at(L1, x, y, s);
        const sw = anim(p, 'v-sway v-base', 3, -x % 3);
        el('line', { x1: 0, y1: 0, x2: 0, y2: -10, stroke: '#4d9a5b', 'stroke-width': 1.4 }, sw);
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; el('circle', { cx: Math.cos(a) * 3, cy: -12 + Math.sin(a) * 3, r: 2.4, fill: c }, sw); }
        el('circle', { cx: 0, cy: -12, r: 1.6, fill: '#fde68a' }, sw);
      };
      [[22, 70, '#f472b6'], [40, 110, '#ffffff'], [90, 40, '#fb7185'], [200, 54, '#ffffff'], [150, 196, '#f472b6'], [210, 200, '#fb7185'], [30, 196, '#ffffff'], [330, 190, '#f472b6']].forEach(([x, y, c]) => flower(x, y, c, 1.1));
      const d = 'M20 176 C80 196, 120 150, 160 152 S220 186, 250 140 S260 80, 300 72';
      const aisle = layer(svg, 0.3);
      el('path', { d, fill: 'none', stroke: 'var(--sc-aisle-edge)', 'stroke-width': 18, 'stroke-linecap': 'round', class: 'v-draw' }, aisle);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-aisle)', 'stroke-width': 14, 'stroke-linecap': 'round', class: 'v-draw' }, aisle);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 14, 'stroke-linecap': 'round', opacity: 0.8 }, svg);
      el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-dasharray': '1 7', 'stroke-linecap': 'round', class: 'sc-lane', opacity: 0.9 }, layer(svg, 1.1, 'fade'));
      // gapura pelaminan
      const arch = layer(svg, 0.8, 'pop');
      el('path', { d: 'M284 74 V40 A16 16 0 0 1 316 40 V74', fill: 'none', stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round' }, arch);
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const p = at(arch, 300 + Math.cos(a) * 16, 40 + Math.sin(a) * 16);
        const b = anim(p, 'v-twinkle-soft v-fb', 2.4, -i * 0.3);
        el('circle', { r: 3, fill: i % 2 ? '#f472b6' : '#fda4af' }, b);
      }
      [[284, 58], [316, 52], [284, 68], [316, 66]].forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 2.6, fill: '#f9a8d4' }, arch));
      const hp = at(arch, 300, 24);
      heart(anim(hp, 'v-beat v-fb', 1.1), 1.3, '#e11d48');
      sparkle(arch, 276, 30, 0.8, 0); sparkle(arch, 326, 26, 0.9, 0.6);
      return { path, done, dy: 0, make: (p) => {
        const c = g(p);
        person(at(c, -5, 0), { shirt: '#1e293b', pants: '#1e293b', hair: '#1f1611', skin: '#d9a273' });
        person(at(c, 5, 0), { dress: '#ffffff', veil: '#ffffff', hair: '#3b2416', skin: '#e8b48c' });
        el('path', { d: 'M-2 -12 Q0 -10 2 -12', fill: 'none', stroke: '#e8b48c', 'stroke-width': 2, 'stroke-linecap': 'round' }, c);
        return c;
      } };
    },

    ibadah(svg) {
      bg(svg, grad(svg, 'var(--sc-night)', 'var(--sc-dusk)'));
      const L0 = layer(svg, 0);
      for (let i = 0; i < 22; i++) {
        const p = at(L0, 8 + (i * 53) % 330, 8 + (i * 29) % 80);
        const s = anim(p, 'v-twinkle v-fb', 1.4 + (i % 4) * 0.5, -(i % 6) * 0.4);
        el('circle', { r: 0.8 + (i % 3) * 0.5, fill: '#fff8e1' }, s);
      }
      const mid = 'm' + uid;
      const mask = el('mask', { id: mid }, defs(svg));
      el('rect', { x: 0, y: 0, width: 340, height: 210, fill: '#fff' }, mask);
      el('circle', { cx: 46, cy: 28, r: 12, fill: '#000' }, mask);
      const moon = at(L0, 0, 0);
      el('circle', { cx: 40, cy: 32, r: 30, fill: radial(svg, '#fff3b0', 0.35), class: 'v-glow-soft' }, moon);
      el('circle', { cx: 40, cy: 32, r: 13, fill: '#fff3b0', mask: 'url(#' + mid + ')' }, moon);
      const shoot = anim(at(L0, 230, 14), 'v-shoot', 7, -2);
      el('line', { x1: 0, y1: 0, x2: 18, y2: -6, stroke: '#ffffff', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, shoot);
      drift(L0, 54, 70, 0.4, (a) => cloud(a, 0.7, 0.25));
      const L1 = layer(svg, 0.1, 'up');
      el('path', { d: 'M-10 140 Q70 108 150 132 T350 120 V210 H-10Z', fill: 'var(--sc-sand-2)' }, L1);
      // kafilah unta di bukit jauh
      const car = at(L1, 0, 126);
      const walk = anim(car, 'v-caravan', 40, -12);
      [0, 26].forEach((x) => {
        const c = at(walk, x, 0, 0.7);
        el('path', { d: 'M-10 -10 Q-8 -20 -2 -16 Q2 -24 8 -14 L12 -14 L16 -24 L20 -24 L19 -20 L15 -10 Q2 -6 -10 -10Z', fill: 'var(--v-camel)' }, c);
        [[-7, 'v-legA'], [-3, 'v-legB'], [6, 'v-legB'], [10, 'v-legA']].forEach(([lx, cls]) => {
          const k = g(at(c, lx, -10), { class: cls + ' v-camel-leg' });
          el('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: 'var(--v-camel)', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, k);
        });
      });
      // masjid
      const msj = layer(svg, 0.2, 'up');
      const m = at(msj, 236, 128);
      el('rect', { x: -22, y: -18, width: 44, height: 18, fill: 'var(--v-mosque)' }, m);
      el('path', { d: 'M-14 -18 Q-14 -36 0 -40 Q14 -36 14 -18Z', fill: 'var(--v-mosque)' }, m);
      el('rect', { x: -0.8, y: -46, width: 1.6, height: 7, fill: 'var(--v-mosque)' }, m);
      el('rect', { x: -32, y: -42, width: 6, height: 42, fill: 'var(--v-mosque)' }, m);
      el('path', { d: 'M-32 -42 L-29 -50 L-26 -42Z', fill: 'var(--v-mosque)' }, m);
      el('rect', { x: 26, y: -42, width: 6, height: 42, fill: 'var(--v-mosque)' }, m);
      el('path', { d: 'M26 -42 L29 -50 L32 -42Z', fill: 'var(--v-mosque)' }, m);
      [-14, -6, 2, 10].forEach((x, i) => {
        const w = el('path', { d: 'M' + x + ' -3 V-10 Q' + (x + 2) + ' -13 ' + (x + 4) + ' -10 V-3Z', fill: '#ffd88a', class: 'v-blink' }, m);
        w.style.animationDelay = -i * 1.3 + 's';
      });
      const L2 = layer(svg, 0.2, 'up');
      el('path', { d: 'M-10 172 Q90 146 190 172 T350 156 V210 H-10Z', fill: 'var(--sc-sand)' }, L2);
      const d = 'M20 192 C80 196, 100 162, 150 168 S220 190, 256 160 S286 120, 306 112';
      const road = layer(svg, 0.3);
      el('path', { d, fill: 'none', stroke: 'var(--sc-sand-edge)', 'stroke-width': 14, 'stroke-linecap': 'round', class: 'v-draw' }, road);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-sand-path)', 'stroke-width': 10, 'stroke-linecap': 'round', class: 'v-draw' }, road);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 10, 'stroke-linecap': 'round', opacity: 0.85 }, svg);
      el('path', { d, fill: 'none', stroke: '#fff8e1', 'stroke-width': 1.5, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', class: 'sc-lane', opacity: 0.8 }, layer(svg, 1.1, 'fade'));
      // Ka'bah bercahaya
      const kb = layer(svg, 0.8, 'pop');
      const k = at(kb, 318, 108);
      el('circle', { cx: 0, cy: -10, r: 28, fill: radial(svg, '#ffe08a', 0.55), class: 'v-glow-soft' }, k);
      el('path', { d: 'M-12 0 V-20 L-4 -24 L12 -20 V0 L-4 3Z', fill: '#111' }, k);
      el('path', { d: 'M-4 3 V-17 L12 -20 V0Z', fill: '#262626' }, k);
      el('path', { d: 'M-12 -20 L-4 -24 L12 -20 L-4 -17Z', fill: '#333' }, k);
      el('path', { d: 'M-12 -14 L-4 -11 L12 -14 V-12 L-4 -9 L-12 -12Z', fill: '#d4a62a' }, k);
      sparkle(kb, 300, 80, 0.8, 0, '#ffe08a'); sparkle(kb, 334, 84, 0.7, 0.7, '#ffe08a');
      return { path, done, dy: 0, make: (p) => person(p, { robe: true, skin: '#c98e62', kopiah: '#ffffff' }) };
    },

    event(svg) {
      bg(svg, grad(svg, 'var(--sc-stage)', 'var(--sc-stage-2)'));
      svg.style.setProperty('--sc-ink', '#f1f5f9'); svg.style.setProperty('--v-halo', '#1b1530');
      const L0 = layer(svg, 0);
      [[250, '#fff6c2', 0], [310, '#a78bfa', 0.8], [190, '#38bdf8', 1.6], [130, '#f472b6', 2.4]].forEach(([x, c, delay]) => {
        const p = at(L0, x, 0);
        const b = anim(p, 'v-beam', 4, -delay);
        el('polygon', { points: '0,0 -40,210 40,210', fill: grad(svg, c, 'transparent'), opacity: 0.5 }, b);
      });
      const L1 = layer(svg, 0.15, 'down');
      el('rect', { x: 226, y: 56, width: 114, height: 12, rx: 3, fill: 'var(--sc-stage-floor)' }, L1);
      el('rect', { x: 236, y: 12, width: 92, height: 40, rx: 4, fill: '#0b0b14', stroke: 'var(--sc-stage-floor)', 'stroke-width': 2 }, L1);
      for (let i = 0; i < 11; i++) {
        const p = at(L1, 242 + i * 8, 48);
        const b = anim(p, 'v-eq', 0.5 + (i % 4) * 0.13, -i * 0.11);
        el('rect', { x: -2.5, y: -30, width: 5, height: 30, rx: 1.5, fill: ['#f472b6', '#a78bfa', '#38bdf8', '#4ade80'][i % 4] }, b);
      }
      [[230, 30], [334, 30]].forEach(([x, y]) => {
        el('rect', { x: x - 7, y: y - 4, width: 14, height: 30, rx: 2, fill: '#1f1b2e' }, L1);
        const sp = anim(at(L1, x, y + 6), 'v-thump v-fb', 0.45);
        el('circle', { r: 4.5, fill: '#3b3552' }, sp); el('circle', { r: 2, fill: '#0b0b14' }, sp);
        el('circle', { cx: x, cy: y + 18, r: 3, fill: '#3b3552' }, L1);
      });
      const cols = ['#f472b6', '#facc15', '#38bdf8', '#a78bfa', '#4ade80', '#fb923c'];
      const conf = layer(svg, 0.4, 'fade');
      for (let i = 0; i < 20; i++) {
        const p = at(conf, 8 + (i * 37) % 330, -8);
        const c = anim(p, 'sc-fall', 3 + (i % 5) * 0.7, -(i * 0.45));
        el('rect', { x: -1.5, y: -2.5, width: 3, height: 5, rx: 1, fill: cols[i % cols.length] }, c);
      }
      const d = 'M18 176 L80 150 L60 120 L140 112 L120 86 L210 80 L246 70';
      const road = layer(svg, 0.3);
      el('path', { d, fill: 'none', stroke: 'var(--sc-stage-edge)', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'v-draw' }, road);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-stage-path)', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'v-draw' }, road);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.4, class: 'sc-lane', opacity: 0.5 }, layer(svg, 1.1, 'fade'));
      // penonton (siluet) dengan lightstick
      const crowd = layer(svg, 0.6, 'up');
      for (let i = 0; i < 12; i++) {
        const x = 120 + i * 19 + (i % 2) * 4, y = 204 + (i % 3) * 3;
        const p = at(crowd, x, y);
        const b = anim(p, 'v-jump', 0.6, -i * 0.17);
        el('rect', { x: -6, y: -14, width: 12, height: 16, rx: 6, fill: '#0b0814' }, b);
        el('circle', { cx: 0, cy: -18, r: 4.6, fill: '#0b0814' }, b);
        if (i % 2 === 0) {
          const arm = anim(at(b, 4, -12), 'v-wave-stick', 0.9, -i * 0.2);
          el('line', { x1: 0, y1: 0, x2: 3, y2: -12, stroke: '#0b0814', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, arm);
          el('line', { x1: 3, y1: -12, x2: 5, y2: -19, stroke: cols[i % cols.length], 'stroke-width': 2.6, 'stroke-linecap': 'round', class: 'v-neon' }, arm);
        }
      }
      return { path, done, dy: 0, make: (p) => person(p, { shirt: '#a78bfa', pants: '#1e293b', hair: '#111827', arms: 'up' }) };
    },

    umum(svg) {
      bg(svg, grad(svg, 'var(--v-sky)', 'var(--v-sky-2)'));
      const L0 = layer(svg, 0);
      sun(L0, 298, 30, 10);
      drift(L0, 26, 74, 0.3, (a) => cloud(a, 0.6, 0.6));
      drift(L0, 62, 40, 0.75, (a) => cloud(a, 0.9));
      drift(L0, 50, 26, 0.1, (a) => { bird(a, 0, 0, 0.8); bird(a, 12, 5, 0.6); bird(a, 22, -2, 0.5); });
      const L1 = layer(svg, 0.08, 'up');
      el('path', { d: 'M-20 210 L50 110 L90 140 L140 90 L210 210Z', fill: 'var(--v-mount-far)' }, L1);
      el('path', { d: 'M180 210 L270 96 L360 210Z', fill: 'var(--v-mount-far)' }, L1);
      const L2 = layer(svg, 0.16, 'up');
      el('path', { d: 'M-20 210 L90 70 L140 120 L200 22 L360 210Z', fill: 'var(--sc-mount)' }, L2);
      el('path', { d: 'M178 58 L200 22 L222 58 L212 52 L204 60 L196 52 L188 60Z', fill: '#ffffff', opacity: 0.95 }, L2);
      el('path', { d: 'M76 88 L90 70 L104 88 L96 84 L90 90 L84 84Z', fill: '#ffffff', opacity: 0.9 }, L2);
      const L3 = layer(svg, 0.24, 'up');
      el('path', { d: 'M-20 210 L60 150 L120 182 L190 140 L360 210Z', fill: 'var(--sc-grass-2)' }, L3);
      [[260, 176, 1], [284, 190, 1.2], [310, 186, 0.9], [26, 176, 1], [44, 190, 1.2], [232, 194, 0.9]].forEach(([x, y, s]) => pine(L3, x, y, s));
      const d = 'M24 196 L96 170 L70 146 L150 124 L124 96 L176 76 L160 54 L198 32';
      const trail = layer(svg, 0.3);
      el('path', { d, fill: 'none', stroke: 'var(--sc-road-edge)', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'v-draw' }, trail);
      const path = el('path', { d, fill: 'none', stroke: 'var(--sc-road)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'v-draw' }, trail);
      const done = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      const top = layer(svg, 0.8, 'pop');
      el('line', { x1: 206, y1: 34, x2: 206, y2: 6, stroke: '#475569', 'stroke-width': 1.6 }, top);
      const fl = anim(at(top, 206, 7), 'v-flagwave', 1.4);
      el('path', { d: 'M0 0 Q7 -2 14 1 Q7 3 0 8Z', fill: '#e11d48' }, fl);
      return { path, done, dy: 0, make: (p) => person(p, { shirt: '#0ea5e9', pants: '#475569', hair: '#2b1d14', pack: '#f59e0b' }) };
    },
  };

  /** Bendera checkpoint: tiang + bendera berkibar; tercapai -> warna "selesai" + letupan. */
  function checkFlag(parent, x, y) {
    const p = at(parent, x, y);
    const ring = anim(p, 'v-pulse v-fb', 1.6);
    el('circle', { r: 5, fill: 'none', stroke: 'var(--sc-ink)', 'stroke-width': 1.2, opacity: 0.5 }, ring);
    el('line', { x1: 0, y1: 0, x2: 0, y2: -18, stroke: 'var(--sc-ink)', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, p);
    const fw = anim(at(p, 0, -18), 'v-flagwave', 1.2, -(x % 7) * 0.2);
    const flag = el('path', { d: 'M0 0 Q6 -1.5 12 1 Q6 3 0 7Z', fill: '#ffffff', stroke: 'var(--sc-ink)', 'stroke-width': 0.8 }, fw);
    const check = el('path', { d: 'M2.6 2.6 L4.6 4.4 L8.4 0.8', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0 }, fw);
    const hit = at(p, 0, -10);
    const fx = g(hit, { class: 'v-hit' });
    el('circle', { r: 6, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 2, class: 'v-hit-ring' }, fx);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 360;
      const ray = g(g(fx, { transform: 'rotate(' + a + ')' }), { class: 'v-hit-ray' });
      el('line', { x1: 8, y1: 0, x2: 13, y2: 0, stroke: i % 2 ? '#facc15' : 'var(--sc-done)', 'stroke-width': 2, 'stroke-linecap': 'round' }, ray);
    }
    return {
      set(ok, celebrate) {
        flag.setAttribute('fill', ok ? 'var(--sc-done)' : '#ffffff');
        flag.setAttribute('stroke', ok ? 'var(--sc-done)' : 'var(--sc-ink)');
        check.setAttribute('opacity', ok ? 1 : 0);
        ring.style.display = ok ? 'none' : '';
        if (celebrate) { fx.classList.remove('go'); void fx.getBoundingClientRect(); fx.classList.add('go'); }
      },
    };
  }

  function mountPath(svg, sc, cps, seharusnya) {
    const L = sc.path.getTotalLength();
    sc.path.parentNode.querySelectorAll('.v-draw').forEach((p) => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));
    const pt = (f) => sc.path.getPointAtLength(Math.max(0, Math.min(1, f)) * L);
    sc.done.setAttribute('stroke-dasharray', '0 ' + (L + 1));
    const marks = layer(svg, 0.9, 'pop');
    PCT.forEach((f) => {
      const p = pt(f);
      el('circle', { cx: p.x, cy: p.y, r: 3.6, fill: '#ffffff', stroke: 'var(--sc-ink)', 'stroke-width': 1.4 }, marks);
      label(marks, p.x, p.y + 11, Math.round(f * 100) + '%', { size: 8.5 });
    });
    const flagLayer = layer(svg, 1.0, 'pop');
    const flags = cps.filter((c) => c.f < 0.999).map((c) => { const p = pt(c.f); return { c, ok: null, api: checkFlag(flagLayer, p.x, p.y - 2) }; });
    // penjalan
    const moverL = layer(svg, 0.4, 'pop');
    const mover = g(moverL, { class: 'v-mover' });
    const face = g(g(mover, { transform: 'scale(' + (sc.scale || 1.3) + ')' }));
    sc.make(face);
    let last = null, stopT = 0, facing = 1;
    return {
      draw(p, dir) {
        sc.done.setAttribute('stroke-dasharray', (L * p) + ' ' + (L + 1));
        const q = pt(p), ahead = pt(Math.min(1, p + 0.01)), back = pt(Math.max(0, p - 0.01));
        mover.setAttribute('transform', 'translate(' + q.x + ' ' + (q.y + sc.dy) + ')');
        if (sc.rotate) face.setAttribute('transform', 'rotate(' + Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180 / Math.PI * (dir < 0 ? 1 : 1) + ')' + (dir < 0 ? ' scale(-1 1)' : ''));
        else {
          const dx = (ahead.x - back.x) * (dir < 0 ? -1 : 1);
          if (Math.abs(dx) > 0.05) facing = dx >= 0 ? 1 : -1;
          face.setAttribute('transform', facing < 0 ? 'scale(-1 1)' : '');
        }
        if (last !== null && Math.abs(p - last) > 1e-5) {
          face.classList.add('v-moving');
          clearTimeout(stopT);
          stopT = setTimeout(() => face.classList.remove('v-moving'), 220);
        }
        flags.forEach((fl) => {
          const ok = p >= fl.c.f - 1e-6;
          if (ok !== fl.ok) { fl.api.set(ok, ok && fl.ok === false); fl.ok = ok; }
        });
        last = p;
      },
      point(f) { const p = pt(f); return { x: p.x, y: p.y - 14 }; },
    };
  }

  // ---------- Tema berbasis wadah yang terisi ----------
  function coin(parent) {
    const f = g(parent, { class: 'v-flip v-fb' });
    el('circle', { r: 6.5, fill: '#f5b301', stroke: '#c98a00', 'stroke-width': 1.2 }, f);
    el('circle', { r: 4.3, fill: 'none', stroke: '#ffe08a', 'stroke-width': 0.9 }, f);
    label(f, 0, 0.3, 'Rp', { size: 4.6, fill: '#8a5a00', halo: false });
    return f;
  }
  function moneyBag(parent) {
    const b = g(parent);
    el('path', { d: 'M-5 -15 L5 -15 L2.6 -10 Q14 -4 13 7 Q12 14 0 14 Q-12 14 -13 7 Q-14 -4 -2.6 -10Z', fill: '#d4a24c', stroke: '#9a6b1f', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, b);
    el('path', { d: 'M-4 -10.4 Q0 -8.6 4 -10.4', fill: 'none', stroke: '#7a4f12', 'stroke-width': 2, 'stroke-linecap': 'round' }, b);
    el('path', { d: 'M-5 -15 Q-8 -20 -3 -18 L0 -16 L3 -18 Q8 -20 5 -15Z', fill: '#e6b860', stroke: '#9a6b1f', 'stroke-width': 1 }, b);
    label(b, 0, 3, 'Rp', { size: 8.5, fill: '#5c3a08', halo: false });
    return b;
  }
  function umbrella(parent) {
    const u = g(parent);
    el('path', { d: 'M-15 0 Q-15 -15 0 -16 Q15 -15 15 0 Q12 -3 7.5 0 Q4 -3 0 0 Q-4 -3 -7.5 0 Q-12 -3 -15 0Z', fill: '#e11d48' }, u);
    el('path', { d: 'M0 -16 Q-6 -10 -7.5 0 M0 -16 Q6 -10 7.5 0', fill: 'none', stroke: '#9f1239', 'stroke-width': 0.9 }, u);
    el('path', { d: 'M0 0 V12 Q0 15 -3 15 Q-5 15 -5 13', fill: 'none', stroke: '#334155', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, u);
    return u;
  }
  function bolt(parent, fill) {
    return el('path', { d: 'M3 -14 L-7 2 H-1 L-3 14 L7 -2 H1Z', fill: fill || '#facc15', stroke: '#a16207', 'stroke-width': 1, 'stroke-linejoin': 'round' }, parent);
  }

  function mountFill(svg, kind, cps, seharusnya) {
    const id = 'clip' + uid;
    let B, shape, icon, base;
    if (kind === 'gadget') {
      bg(svg, grad(svg, 'var(--sc-soft)', 'var(--v-soft-2)'));
      const L0 = layer(svg, 0, 'fade');
      // jalur sirkuit dengan arus mengalir
      ['M0 40 H40 V70 H80', 'M0 150 H30 V120 H90', 'M340 50 H300 V90 H262', 'M340 170 H306 V140 H250', 'M60 210 V180 H100', 'M290 210 V188 H246'].forEach((d, i) => {
        el('path', { d, fill: 'none', stroke: 'var(--v-circuit)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, L0);
        const f = el('path', { d, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-dasharray': '6 60', class: 'v-flow' }, L0);
        f.style.animationDelay = -i * 0.5 + 's';
      });
      [[80, 70], [90, 120], [262, 90], [250, 140], [100, 180], [246, 188]].forEach(([x, y], i) => {
        const n = anim(at(L0, x, y), 'v-node v-fb', 1.6, -i * 0.3);
        el('circle', { r: 3, fill: 'var(--sc-done)' }, n);
      });
      // notifikasi melayang
      [[46, 200, 0], [292, 200, 1.6], [56, 200, 3.2], [286, 200, 4.8]].forEach(([x, y, dl]) => {
        const n = anim(at(L0, x, y), 'v-notif', 6.4, -dl);
        el('rect', { x: -18, y: -7, width: 36, height: 14, rx: 7, fill: '#ffffff', opacity: 0.92 }, n);
        el('circle', { cx: -11, cy: 0, r: 3.4, fill: ['#22c55e', '#3b82f6', '#f97316', '#e11d48'][Math.round(dl / 1.6)] }, n);
        el('rect', { x: -5, y: -2.4, width: 18, height: 2, rx: 1, fill: '#cbd5e1' }, n);
        el('rect', { x: -5, y: 1.2, width: 12, height: 2, rx: 1, fill: '#e2e8f0' }, n);
      });
      base = layer(svg, 0.15, 'pop');
      el('rect', { x: 118, y: 10, width: 104, height: 192, rx: 20, fill: 'var(--sc-phone)' }, base);
      el('rect', { x: 124, y: 16, width: 92, height: 180, rx: 15, fill: 'var(--sc-screen)' }, base);
      el('rect', { x: 154, y: 21, width: 32, height: 8, rx: 4, fill: 'var(--sc-phone)' }, base);
      el('rect', { x: 160, y: 38, width: 20, height: 8, rx: 3, fill: 'var(--sc-road-edge)' }, base);
      const shine = el('rect', { x: 118, y: 10, width: 30, height: 192, fill: '#ffffff', opacity: 0.12, class: 'v-sheen' }, base);
      shine.setAttribute('clip-path', 'inset(0 round 20px)');
      B = { x: 140, y: 46, w: 60, h: 132, top: 49, bottom: 175 };
      el('rect', { x: B.x, y: B.y, width: B.w, height: B.h, rx: 12, fill: 'var(--sc-cell)', stroke: 'var(--sc-road-edge)', 'stroke-width': 2 }, base);
      shape = (p) => el('rect', { x: B.x + 3, y: B.y + 3, width: B.w - 6, height: B.h - 6, rx: 9 }, p);
      icon = (p) => bolt(anim(p, 'v-zap v-fb', 1.1));
    } else if (kind === 'saving') {
      bg(svg, grad(svg, 'var(--sc-cream)', 'var(--sc-cream-2)'));
      const L0 = layer(svg, 0, 'fade');
      for (let i = 0; i < 8; i++) {
        const b = el('circle', { cx: 20 + i * 44, cy: 30 + (i * 41) % 150, r: 6 + (i % 3) * 5, fill: '#f5b301', opacity: 0.1, class: 'v-bokeh' }, L0);
        b.style.animationDelay = -i + 's';
      }
      [[48, 40], [292, 52], [60, 160], [284, 170], [36, 100], [306, 112]].forEach(([x, y], i) => sparkle(L0, x, y, 0.9, i * 0.35, '#f5b301'));
      // tumpukan koin di kiri-kanan
      [[60, 196], [282, 196]].forEach(([x, y], k) => {
        for (let i = 0; i < 4 + k; i++) {
          el('ellipse', { cx: x, cy: y - i * 4, rx: 11, ry: 3.6, fill: '#f5b301', stroke: '#c98a00', 'stroke-width': 1 }, L0);
        }
      });
      base = layer(svg, 0.15, 'pop');
      const d = 'M138 30 H202 V44 C226 52 236 70 236 96 V170 C236 186 224 196 208 196 H132 C116 196 104 186 104 170 V96 C104 70 114 52 138 44 Z';
      el('rect', { x: 132, y: 16, width: 76, height: 14, rx: 5, fill: 'var(--sc-lid)' }, base);
      el('rect', { x: 158, y: 20, width: 24, height: 4, rx: 2, fill: '#5c3a08', opacity: 0.6 }, base);
      el('path', { d, fill: 'var(--sc-glass)', stroke: 'var(--sc-glass-edge)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, base);
      B = { x: 104, y: 30, w: 132, h: 166, top: 48, bottom: 192 };
      shape = (p) => el('path', { d }, p);
      icon = (p) => moneyBag(anim(p, 'v-bob-soft v-fb', 1.6));
      // koin jatuh berputar masuk ke celah tutup
      const drop = layer(svg, 0.6, 'fade');
      for (let i = 0; i < 3; i++) {
        const c = anim(at(drop, 170 + (i - 1) * 6, -10), 'v-coin', 2.7, -i * 0.9);
        coin(c);
      }
    } else {
      bg(svg, grad(svg, 'var(--sc-storm)', 'var(--sc-storm-2)'));
      const flash = el('rect', { x: 0, y: 0, width: 340, height: 210, fill: '#ffffff', class: 'v-flash' }, svg);
      void flash;
      const L0 = layer(svg, 0, 'fade');
      const darkCloud = (x, y, s, dur, frac) => {
        const p = at(L0, x, y);
        const a = anim(p, 'v-hover', dur, -dur * frac);
        const c = g(a, { fill: 'var(--v-storm-cloud)', transform: 'scale(' + s + ')' });
        el('circle', { cx: 0, cy: 0, r: 10 }, c); el('circle', { cx: 13, cy: -7, r: 13 }, c); el('circle', { cx: 28, cy: -2, r: 10 }, c);
        el('rect', { x: -4, y: -2, width: 38, height: 12, rx: 6 }, c);
        return a;
      };
      darkCloud(26, 26, 1.2, 6, 0); darkCloud(262, 30, 1.3, 7, 0.5); darkCloud(120, 4, 0.8, 8, 0.3);
      const bl = anim(at(L0, 60, 46), 'v-bolt', 5, -1);
      bolt(bl, '#fde047');
      const bl2 = anim(at(L0, 292, 52), 'v-bolt', 5, -3.4);
      bolt(bl2, '#fde047');
      for (let i = 0; i < 22; i++) {
        const x = 8 + i * 15;
        if (x > 100 && x < 240) continue;
        const r = anim(at(L0, x, 44), 'sc-rain', 0.7 + (i % 3) * 0.12, -(i % 5) * 0.17);
        el('line', { x1: 0, y1: 0, x2: -3, y2: 10, stroke: 'var(--sc-rain)', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, r);
      }
      // rumah tetap aman + pohon tertiup angin
      const h = at(L0, 52, 196);
      el('rect', { x: -16, y: -18, width: 32, height: 18, fill: '#f1f5f9' }, h);
      el('path', { d: 'M-20 -18 L0 -34 L20 -18Z', fill: '#64748b' }, h);
      el('rect', { x: -4, y: -11, width: 8, height: 11, fill: '#94a3b8' }, h);
      el('rect', { x: 7, y: -14, width: 6, height: 6, fill: '#fde68a', class: 'v-blink' }, h);
      const t = at(L0, 296, 198);
      const sw = anim(t, 'v-gust v-base', 2.2);
      el('rect', { x: -2, y: -16, width: 4, height: 16, fill: 'var(--v-trunk)' }, sw);
      el('circle', { cx: 0, cy: -24, r: 11, fill: 'var(--v-tree)' }, sw);
      const leaf = anim(at(L0, 300, 170), 'v-leaf', 3.4);
      el('ellipse', { rx: 3, ry: 1.6, fill: 'var(--v-tree)' }, leaf);
      base = layer(svg, 0.15, 'pop');
      const d = 'M170 14 L232 36 V96 C232 146 204 178 170 196 C136 178 108 146 108 96 V36 Z';
      el('path', { d, fill: 'var(--sc-cell)', stroke: 'var(--sc-road-edge)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, base);
      B = { x: 108, y: 14, w: 124, h: 182, top: 18, bottom: 192 };
      shape = (p) => el('path', { d }, p);
      icon = (p) => umbrella(anim(p, 'v-rock v-fb', 2.6));
    }
    const clip = el('clipPath', { id }, defs(svg));
    shape(clip);
    const liquid = layer(svg, 0.35, 'fade');
    const gC = g(liquid, { 'clip-path': 'url(#' + id + ')' });
    const lvl = g(gC);
    const wave = 'M0 0 ' + 'q 15 -7 30 0 t 30 0 '.repeat(8) + 'V 220 H 0 Z';
    el('path', { d: wave, fill: 'var(--sc-done)', class: 'sc-liquid' }, lvl);
    el('path', { d: wave, fill: 'var(--sc-done)', opacity: 0.45, class: 'sc-liquid', style: 'animation-duration:3.4s;animation-direction:reverse' }, lvl);
    for (let i = 0; i < 8; i++) {
      const c = el('circle', { cx: 24 + (i * 13) % (B.w - 10), cy: 30, r: 1.5 + (i % 3), fill: '#ffffff', class: 'sc-bubble' }, lvl);
      c.style.animationDuration = 2.2 + (i % 4) * 0.6 + 's';
      c.style.animationDelay = i * 0.45 + 's';
    }
    if (kind === 'saving') el('path', { d: 'M116 100 C116 80 122 66 134 58', fill: 'none', stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.6 }, liquid);
    const cx = B.x + B.w / 2, midY = (B.top + B.bottom) / 2;
    const iconL = layer(svg, 0.7, 'pop');
    const iconP = at(iconL, cx, midY - 12);
    icon(iconP);
    const pct = label(layer(svg, 0.8, 'pop'), cx, midY + 22, '0%', { size: 15 });
    const yOf = (f) => B.bottom - (B.bottom - B.top) * f;
    const leftX = B.x - (kind === 'gadget' ? 9 : 6), rightX = B.x + B.w + (kind === 'gadget' ? 30 : 10);
    const marks = layer(svg, 0.9, 'fade');
    PCT.forEach((f) => {
      el('line', { x1: leftX + 3, x2: B.x + 2, y1: yOf(f), y2: yOf(f), stroke: 'var(--sc-ink)', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }, marks);
      label(marks, leftX, yOf(f), Math.round(f * 100) + '%', { anchor: 'end', size: 9 });
    });
    let lastY = 999;
    const names = cps.map((c) => {
      let y = yOf(c.f);
      if (y > lastY - 12) y = lastY - 12;
      lastY = y;
      el('line', { x1: B.x + B.w - 2, x2: rightX - 4, y1: yOf(c.f), y2: yOf(c.f), stroke: 'var(--sc-ink)', 'stroke-opacity': 0.5, 'stroke-width': 1.5 }, marks);
      const nm = c.nama.length > 16 ? c.nama.slice(0, 15) + '…' : c.nama;
      const lp = at(marks, rightX, y);
      const pop = g(lp, { class: 'v-label' });
      const t = label(pop, 0, 0, nm, { anchor: 'start', size: 9.5 });
      const fx = g(at(lp, -3, 0), { class: 'v-hit' });
      el('circle', { r: 5, fill: 'none', stroke: 'var(--sc-done)', 'stroke-width': 2, class: 'v-hit-ring' }, fx);
      return { c, nm, t, pop, fx, ok: null };
    });
    let lastP = null;
    return {
      draw(p) {
        lvl.setAttribute('transform', 'translate(' + (B.x - 30) + ' ' + (yOf(p) - 3) + ')');
        pct.textContent = Math.round(p * 100) + '%';
        iconP.style.opacity = p >= 1 ? 0 : 1;
        if (lastP !== null && p > lastP + 1e-5) { iconP.classList.remove('v-boost'); void iconP.getBoundingClientRect(); iconP.classList.add('v-boost'); }
        lastP = p;
        names.forEach((n) => {
          const ok = p >= n.c.f - 1e-6;
          if (ok === n.ok) return;
          n.t.textContent = (ok ? '✓ ' : '') + n.nm;
          n.t.setAttribute('fill', ok ? 'var(--sc-done)' : 'var(--sc-ink)');
          if (ok && n.ok === false) {
            [n.pop, n.fx].forEach((e, k) => { const c = k ? 'go' : 'v-label-pop'; e.classList.remove(c); void e.getBoundingClientRect(); e.classList.add(c); });
          }
          n.ok = ok;
        });
      },
      point(f) { return { x: cx, y: yOf(f) }; },
    };
  }

  // ---------- Jeda otomatis ----------
  let io = null;
  function watchVisibility(svg) {
    if (!('IntersectionObserver' in window)) return;
    io = io || new IntersectionObserver((list) => list.forEach((e) => {
      e.target.classList.toggle('v-paused', !e.isIntersecting);
      if (!e.target.isConnected) io.unobserve(e.target); // kartu lama sudah diganti
    }));
    io.unobserve(svg);
    io.observe(svg);
  }
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('v-bg', document.hidden));

  const LEGACY = { race: 'sport', liburan: 'traveling', kendaraan: 'saving' };
  const FILL = { gadget: 1, darurat: 1, saving: 1 };

  function mount(svg, opts) {
    uid++;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.classList.add('v-scene');
    svg.style.removeProperty('--sc-ink'); svg.style.removeProperty('--v-halo');
    watchVisibility(svg);
    svg.classList.remove('v-play'); void svg.getBoundingClientRect(); svg.classList.add('v-play');
    const tema = LEGACY[opts.tema] || opts.tema;
    const cps = opts.checkpoints || [];
    const s = Math.max(0, Math.min(1, opts.seharusnya || 0));
    if (FILL[tema]) return mountFill(svg, tema, cps, s);
    const build = PATH_THEMES[tema] || PATH_THEMES.umum;
    return mountPath(svg, build(svg), cps, s);
  }

  // ---------- Confetti (sama seperti scenes.js) ----------
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
  function toScreen(svg, pt) {
    const m = svg.getScreenCTM();
    if (!m) return { x: innerWidth / 2, y: innerHeight / 3 };
    const q = svg.createSVGPoint(); q.x = pt.x; q.y = pt.y;
    const r = q.matrixTransform(m);
    return { x: r.x, y: r.y };
  }

  root.HBScenes = { mount, burst, toScreen, LEGACY };
})(this);
