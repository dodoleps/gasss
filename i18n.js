/*
 * Dua bahasa (Indonesia / English).
 * - Kode & teks asli aplikasi tetap bahasa Indonesia. Pengguna Indonesia tidak mengunduh apa pun tambahan.
 * - English: kamus web/en.js dimuat (hanya saat English dipilih), lalu penerjemah mengganti teks yang tampil di layar
 *   (simpul teks + placeholder/aria-label/title/alt) secara otomatis, termasuk yang muncul belakangan.
 * - Kamus berisi teks persis ("Bagi uang": "Split money") dan pola dengan isian ("kurang {x}": "{x} to go").
 *   Isian ikut diterjemahkan lagi (mis. nama bulan, nama kategori bawaan).
 * - Bahasa awal: pilihan tersimpan (gs_lang), atau mengikuti bahasa HP (English -> en, selain itu -> id).
 */
(function (root) {
  const KEY = 'gs_lang';
  let lang = null;
  try { lang = localStorage.getItem(KEY); } catch (e) { /* abaikan */ }
  if (lang !== 'id' && lang !== 'en') {
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    lang = /^en/i.test(nav) ? 'en' : 'id';
  }
  document.documentElement.lang = lang;

  const exact = new Map();
  const patterns = [];
  const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  function add(dict) {
    Object.keys(dict).forEach((k) => {
      if (/\{\w+\}/.test(k)) {
        const names = [];
        const src = esc(k).replace(/\\?\{(\w+)\\?\}/g, (m, n) => { names.push(n); return '([\\s\\S]+?)'; });
        patterns.push({ re: new RegExp('^' + src + '$'), names, out: dict[k], lit: k.replace(/\{\w+\}/g, '').length });
      } else exact.set(k, dict[k]);
    });
    // Pola paling spesifik (teks tetap terpanjang) dicoba dulu, supaya "{a} · {b}" tidak mendahului pola yang lebih persis.
    patterns.sort((a, b) => b.lit - a.lit);
  }

  /** Terjemahkan satu teks utuh (spasi di depan/belakang dipertahankan). Tidak dikenal -> teks asli. */
  function tr(s) {
    if (lang === 'id' || !s) return s;
    const core = s.trim();
    if (!core) return s;
    let r = exact.get(core);
    if (r === undefined) {
      for (const p of patterns) {
        const m = core.match(p.re);
        if (!m) continue;
        const vals = {};
        p.names.forEach((n, i) => { vals[n] = tr(m[i + 1]); });
        r = p.out.replace(/\{(\w+)\}/g, (x, n) => (n in vals ? vals[n] : x));
        break;
      }
    }
    if (r === undefined) {
      // Ikon/emoji di depan nama, mis. "💳 Utama" -> "💳 Main".
      const m = core.match(/^([^\p{L}\p{N}\s]+\s+)(.+)$/u);
      if (m) { const x = tr(m[2]); if (x !== m[2]) r = m[1] + x; }
    }
    if (r === undefined) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + r + trail;
  }

  /** Untuk kode: t('Tersimpan {n}', { n: 3 }) -> teks sesuai bahasa, isian dimasukkan. */
  function t(s, vars) {
    let out = tr(s);
    if (vars) out = out.replace(/\{(\w+)\}/g, (x, n) => (n in vars ? vars[n] : x));
    return out;
  }

  // ---------- Penerjemah layar ----------
  const SKIP = 'script,style,textarea,input,select option[data-raw],[data-no-t],.tx-title,.goal-name,#lg-typed';
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  function skip(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest(SKIP);
  }
  function translateText(node) {
    if (skip(node)) return;
    const v = node.nodeValue, n = tr(v);
    if (n !== v) node.nodeValue = n;
  }
  function translateEl(el) {
    if (el.closest && el.closest('[data-no-t]')) return;
    ATTRS.forEach((a) => {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      const v = el.getAttribute(a), n = tr(v);
      if (n !== v) el.setAttribute(a, n);
    });
  }
  function translateTree(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) { translateText(rootNode); return; }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9) return;
    if (rootNode.nodeType === 1) translateEl(rootNode);
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walker.nextNode())) { if (n.nodeType === 3) translateText(n); else translateEl(n); }
  }
  let observer = null;
  function watch() {
    if (lang === 'id' || observer) return;
    translateTree(document.body);
    observer = new MutationObserver((list) => {
      list.forEach((m) => {
        if (m.type === 'characterData') translateText(m.target);
        else if (m.type === 'attributes') translateEl(m.target);
        else m.addedNodes.forEach(translateTree);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // ---------- Muat kamus English bila perlu ----------
  const ready = new Promise((resolve) => {
    if (lang === 'id') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'en.js';
    s.onload = () => resolve();
    s.onerror = () => { lang = 'id'; document.documentElement.lang = 'id'; resolve(); }; // kamus gagal dimuat -> tetap Indonesia
    document.head.appendChild(s);
  }).then(() => { if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch); });

  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) { /* abaikan */ }
    location.reload();
  }

  root.HBI18n = {
    get lang() { return lang; },
    get locale() { return lang === 'en' ? 'en-US' : 'id-ID'; },
    add, t, tr, ready, setLang, translateTree,
  };
})(this);
