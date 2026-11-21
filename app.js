'use strict';
/* Sešity – poznámky perem. Vše se ukládá jen v tomto zařízení (IndexedDB). */

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

const NB_COLORS = ['#2f6fed', '#e5484d', '#2e9e5b', '#f08c00', '#8a3fd1', '#0f9aa8', '#d6409f', '#5b6474'];
const PEN_COLORS = ['#1d1d1f', '#1e5bd8', '#d92c2c', '#1d9a4a', '#f08c00', '#8a3fd1'];
const HL_COLORS = ['#ffe14d', '#7ee081', '#ff9ecb', '#7cc7ff', '#ffb35c'];
const WIDTHS = { pen: [1.2, 2, 3.6], hl: [10, 16, 24], text: [12, 16, 24], shape: [1.2, 2, 3.6] };
const PAPERS = [['lined', 'Linkovaný'], ['grid', 'Čtverečkovaný'], ['dots', 'Tečkovaný'], ['blank', 'Čistý']];
const A4 = { w: 595, h: 842 };
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const ICONS = {
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/>',
  hl: '<path d="M14 4l6 6-8.5 8.5H7L5.5 17 14 4z"/><path d="M4 21h7"/><path d="M11 8l5 5"/>',
  eraser: '<path d="M8 20h12"/><path d="M5.5 14.5l8-8a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L12 20H8l-2.5-2.5a2 2 0 010-3z"/><path d="M10 10l6 6"/>',
  lasso: '<ellipse cx="12" cy="10" rx="8.5" ry="6" stroke-dasharray="3.2 3"/><path d="M7 15c-1 2 0 4 2 5"/>',
  text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
  shape: '<rect x="3" y="3" width="11" height="11" rx="1"/><circle cx="15.5" cy="15.5" r="5.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  finger: '<path d="M9 12V5a1.5 1.5 0 013 0v5"/><path d="M12 10a1.5 1.5 0 013 0v1.5"/><path d="M15 11.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-.5a6 6 0 01-5-2.7L5 15a1.5 1.5 0 012.5-1.6L9 15"/>',
  pages: '<rect x="4" y="3" width="7" height="8" rx="1"/><rect x="13" y="3" width="7" height="8" rx="1"/><rect x="4" y="13" width="7" height="8" rx="1"/><rect x="13" y="13" width="7" height="8" rx="1"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = n => `<svg viewBox="0 0 24 24">${ICONS[n]}</svg>`;

/* ---------- pomocné ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

let toastT;
function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); if (ms) toastT = setTimeout(() => (t.hidden = true), ms);
}

const scripts = {};
function loadScript(url) {
  return scripts[url] || (scripts[url] = new Promise((res, rej) => {
    const s = h('script', { src: url }); s.onload = res;
    s.onerror = () => { delete scripts[url]; rej(new Error('Nepodařilo se načíst ' + url)); };
    document.head.append(s);
  }));
}

function closeMenu() { document.querySelectorAll('.menu,.backdrop').forEach(e => e.remove()); }
function showMenu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu' });
  for (const it of items) {
    if (!it) { m.append(h('hr')); continue; }
    m.append(h('button', { class: it.danger ? 'danger' : '', onclick: () => { closeMenu(); it.fn(); } }, it.label));
  }
  document.body.append(h('div', { class: 'backdrop', onpointerdown: closeMenu }), m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let top = r.bottom + 6; if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  m.style.left = clamp(r.right - mw, 8, innerWidth - mw - 8) + 'px';
  m.style.top = top + 'px';
}

function swatchRow(colors, value, onpick) {
  const row = h('div', { class: 'swatches' });
  colors.forEach(c => row.append(h('button', {
    type: 'button', class: 'swatch' + (c === value ? ' on' : ''),
    onclick: e => { row.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); e.currentTarget.classList.add('on'); onpick(c); },
  }, h('i', { style: 'background:' + c }))));
  return row;
}

function formDialog({ title, text, html, fields = [], ok = 'Uložit', danger = false, cancel = 'Zrušit' }) {
  return new Promise(res => {
    const form = h('form', { class: 'dlg' }, h('h2', {}, title));
    if (text) form.append(h('p', {}, text));
    if (html) form.append(h('div', { html }));
    const get = {};
    for (const f of fields) {
      if (f.type === 'color') {
        let val = f.value;
        form.append(h('div', { class: 'row' }, h('span', {}, f.label), swatchRow(NB_COLORS, val, c => (val = c))));
        get[f.key] = () => val; continue;
      }
      const row = h('label', { class: 'row' }, h('span', {}, f.label));
      if (f.type === 'text') {
        const i = h('input', { type: 'text', value: f.value || '', autocomplete: 'off' });
        row.append(i); get[f.key] = () => i.value.trim();
      } else if (f.type === 'select') {
        const s = h('select', {}, f.options.map(o => h('option', { value: o[0] }, o[1])));
        s.value = f.value; row.append(s); get[f.key] = () => s.value;
      } else if (f.type === 'group') {
        const s = h('select', {}, state.groups.map(g => h('option', { value: g }, g)),
          h('option', { value: '' }, 'Bez složky'), h('option', { value: '__new' }, '+ Nová složka…'));
        s.value = state.groups.includes(f.value) ? f.value : '';
        const i = h('input', { type: 'text', placeholder: 'Název nové složky', hidden: true });
        s.addEventListener('change', () => { i.hidden = s.value !== '__new'; if (!i.hidden) i.focus(); });
        row.append(s, i);
        get[f.key] = () => (s.value === '__new' ? i.value.trim() : s.value);
      }
      form.append(row);
    }
    const ov = h('div', { class: 'overlay' }, form);
    const done = v => { ov.remove(); res(v); };
    form.append(h('div', { class: 'actions' },
      cancel && h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, cancel),
      h('button', { type: 'submit', class: 'btn ' + (danger ? 'danger' : 'primary') }, ok)));
    form.addEventListener('submit', e => {
      e.preventDefault(); const out = {}; for (const k in get) out[k] = get[k](); done(out);
    });
    ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
    document.body.append(ov);
    const first = form.querySelector('input[type=text]'); if (first) { first.focus(); first.select(); }
  });
}
const confirmDialog = (title, text, ok) => formDialog({ title, text, ok, danger: true });

async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  const touch = navigator.maxTouchPoints > 0;
  if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function pickFile(input) {
  return new Promise(res => {
    input.value = '';
    input.onchange = () => res(input.files[0] || null);
    input.click();
  });
}

/* ---------- databáze ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('sesity', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('notebooks', { keyPath: 'id' });
        d.createObjectStore('pages', { keyPath: 'id' }).createIndex('nb', 'nb');
        d.createObjectStore('files', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = DB.db.transaction(store, mode);
      let out; const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => (out = rq.result);
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  get: (s, k) => DB.tx(s, 'readonly', o => o.get(k)),
  all: s => DB.tx(s, 'readonly', o => o.getAll()),
  byNb: nb => DB.tx('pages', 'readonly', o => o.index('nb').getAll(nb)),
  put: (s, v) => DB.tx(s, 'readwrite', o => { o.put(v); }),
  putMany: (s, arr) => DB.tx(s, 'readwrite', o => { arr.forEach(v => o.put(v)); }),
  del: (s, k) => DB.tx(s, 'readwrite', o => { o.delete(k); }),
  delMany: (s, keys) => DB.tx(s, 'readwrite', o => { keys.forEach(k => o.delete(k)); }),
};

const state = { groups: [] };
const prefs = Object.assign({ finger: false, scratch: true, tool: 'pen', shape: 'line',
  color: { pen: PEN_COLORS[0], hl: HL_COLORS[0], text: PEN_COLORS[0], shape: PEN_COLORS[1] },
  wi: { pen: 1, hl: 1, text: 1, shape: 1 } }, (() => { try { return JSON.parse(localStorage.getItem('sesity-prefs')) || {}; } catch { return {}; } })());
const savePrefs = () => { try { localStorage.setItem('sesity-prefs', JSON.stringify(prefs)); } catch {} };
const saveGroups = () => DB.put('meta', { key: 'groups', value: state.groups });

/* ---------- PDF ---------- */
let pdfReady;
function ensurePdfjs() {
  return pdfReady || (pdfReady = (async () => {
    await loadScript(PDFJS);
    try {
      const txt = await (await fetch(PDFW)).text();
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    } catch { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW; }
  })().catch(e => { pdfReady = null; throw e; }));
}
const pdfDocs = new Map();
function getPdf(fileId) {
  if (!pdfDocs.has(fileId)) {
    const p = (async () => {
      await ensurePdfjs();
      const f = await DB.get('files', fileId);
      if (!f) throw new Error('Soubor chybí');
      return pdfjsLib.getDocument({ data: new Uint8Array(f.data.slice(0)) }).promise;
    })();
    p.catch(() => pdfDocs.delete(fileId));
    pdfDocs.set(fileId, p);
  }
  return pdfDocs.get(fileId);
}
async function pdfInto(canvas, pg) {
  const doc = await getPdf(pg.bg.f);
  const p = await doc.getPage(pg.bg.n);
  const v1 = p.getViewport({ scale: 1 });
  await p.render({ canvasContext: canvas.getContext('2d'), viewport: p.getViewport({ scale: canvas.width / v1.width }) }).promise;
}
/* Načte PDF soubor, uloží ho a vrátí záznamy stránek (zatím neuložené). */
async function pdfToPages(file, nbId) {
  await ensurePdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const fileId = uid();
  await DB.put('files', { id: fileId, name: file.name, type: 'application/pdf', data });
  pdfDocs.set(fileId, Promise.resolve(doc));
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const v = (await doc.getPage(n)).getViewport({ scale: 1 });
    pages.push({ id: uid(), nb: nbId, w: r2(v.width), h: r2(v.height), bg: { type: 'pdf', f: fileId, n }, items: [] });
  }
  return pages;
}

/* ---------- obrázky ---------- */
const imgs = new Map();
function loadImg(fileId) {
  if (!imgs.has(fileId)) {
    const rec = { img: null };
    rec.promise = DB.get('files', fileId).then(f => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { rec.img = im; res(im); };
      im.onerror = rej;
      im.src = URL.createObjectURL(new Blob([f.data], { type: f.type }));
    }));
    rec.promise.catch(() => {});
    imgs.set(fileId, rec);
  }
  return imgs.get(fileId).promise;
}
function getImg(fileId) {
  const rec = imgs.get(fileId);
  if (rec) return rec.img;
  loadImg(fileId).then(() => req('ink', 'live'));
  return null;
}

/* ---------- geometrie položek ---------- */
const mctx = document.createElement('canvas').getContext('2d');
const bboxCache = new WeakMap(), sampCache = new WeakMap();
const textFont = s => `${s}px ${FONT}`;

function bbox(it) {
  let b = bboxCache.get(it); if (b) return b;
  if (it.t === 's') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const p = it.p;
    for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const m = it.w / 2; b = { x: x0 - m, y: y0 - m, w: x1 - x0 + it.w, h: y1 - y0 + it.w };
  } else if (it.t === 't') {
    mctx.font = textFont(it.s); const lines = it.text.split('\n');
    b = { x: it.x, y: it.y, w: Math.max(...lines.map(l => mctx.measureText(l).width), 4), h: lines.length * it.s * 1.25 };
  } else b = { x: it.x, y: it.y, w: it.w, h: it.h };
  bboxCache.set(it, b); return b;
}
/* Body tahu zahuštěné na rozestup ≤ 4 jednotky: [x,y,x,y…] */
function samples(it) {
  let s = sampCache.get(it); if (s) return s;
  s = []; const p = it.p;
  for (let i = 0; i < p.length; i += 3) {
    if (i) {
      const ax = p[i - 3], ay = p[i - 2], d = Math.hypot(p[i] - ax, p[i + 1] - ay), n = Math.floor(d / 4);
      for (let k = 1; k <= n; k++) s.push(ax + (p[i] - ax) * k / (n + 1), ay + (p[i + 1] - ay) * k / (n + 1));
    }
    s.push(p[i], p[i + 1]);
  }
  sampCache.set(it, s); return s;
}
const inBox = (x, y, b, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
const boxesHit = (a, b, pad = 0) => a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  const ex = px - ax - t * dx, ey = py - ay - t * dy; return ex * ex + ey * ey;
}
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    if ((poly[i + 1] > y) !== (poly[j + 1] > y) && x < (poly[j] - poly[i]) * (y - poly[i + 1]) / (poly[j + 1] - poly[i + 1]) + poly[i]) c = !c;
  }
  return c;
}
function transformItem(it, dx, dy, k, ox, oy) {
  const fx = x => r2(ox + (x - ox) * k + dx), fy = y => r2(oy + (y - oy) * k + dy);
  if (it.t === 's') {
    const p = it.p.slice();
    for (let i = 0; i < p.length; i += 3) { p[i] = fx(p[i]); p[i + 1] = fy(p[i + 1]); }
    return { ...it, p, w: r2(it.w * k) };
  }
  if (it.t === 't') return { ...it, x: fx(it.x), y: fy(it.y), s: r2(it.s * k) };
  return { ...it, x: fx(it.x), y: fy(it.y), w: r2(it.w * k), h: r2(it.h * k) };
}

/* ---------- rozpoznání škrtnutí ---------- */
function sweeps(p, axis, minLen) {
  let dir = 0, pivot = p[axis], n = 0;
  for (let i = 3; i < p.length; i += 3) {
    const v = p[i + axis];
    if (dir === 0) { if (Math.abs(v - pivot) > minLen) { dir = Math.sign(v - pivot); pivot = v; n = 1; } }
    else if (dir > 0) { if (v > pivot) pivot = v; else if (pivot - v > minLen) { dir = -1; pivot = v; n++; } }
    else { if (v < pivot) pivot = v; else if (v - pivot > minLen) { dir = 1; pivot = v; n++; } }
  }
  return n;
}
/* Škrtnutí = rychlé čmárání tam a zpět (cik-cak) přes celou šířku nebo výšku tahu. */
function isScribble(it) {
  const p = it.p; if (p.length < 36) return false;
  const b = bbox(it), W = b.w - it.w, H = b.h - it.w;
  return (W > 12 && sweeps(p, 0, W * 0.45) >= 5) || (H > 12 && sweeps(p, 1, H * 0.45) >= 6);
}
function scratchTargets(sc, items) {
  const b = bbox(sc), pad = 4, hits = new Set(), sp = samples(sc);
  for (const it of items) {
    if (it.t === 'i') continue;
    const ib = bbox(it); if (!boxesHit(b, ib, pad)) continue;
    if (it.t === 't') {
      const ow = Math.min(b.x + b.w, ib.x + ib.w) - Math.max(b.x, ib.x), oh = Math.min(b.y + b.h, ib.y + ib.h) - Math.max(b.y, ib.y);
      if (ow > 0 && oh > 0 && ow * oh >= 0.5 * ib.w * ib.h) hits.add(it.id);
      continue;
    }
    const s = samples(it); let inside = 0;
    for (let i = 0; i < s.length; i += 2) if (inBox(s[i], s[i + 1], b, pad)) inside++;
    if (inside / (s.length / 2) < 0.6) continue;
    const tol = (it.w / 2 + sc.w / 2 + 5) ** 2; let near = false;
    for (let i = 0; i < s.length && !near; i += 2)
      for (let j = 0; j < sp.length; j += 2) {
        const dx = s[i] - sp[j], dy = s[i + 1] - sp[j + 1];
        if (dx * dx + dy * dy <= tol) { near = true; break; }
      }
    if (near) hits.add(it.id);
  }
  return hits;
}

/* ---------- kreslení ---------- */
function drawStroke(ctx, it) {
  const p = it.p, n = p.length / 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = it.c;
  if (it.tool === 'hl' || it.u || n < 3) {
    if (it.tool === 'hl') ctx.globalAlpha = 0.4;
    ctx.lineWidth = it.u || it.tool === 'hl' ? it.w : it.w * (0.6 + 0.8 * p[2]);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    if (n === 1) ctx.lineTo(p[0] + 0.01, p[1]);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  let mx = (p[0] + p[3]) / 2, my = (p[1] + p[4]) / 2;
  ctx.lineWidth = it.w * (0.6 + 0.8 * p[2]);
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(mx, my); ctx.stroke();
  for (let i = 3; i < p.length - 3; i += 3) {
    const nx = (p[i] + p[i + 3]) / 2, ny = (p[i + 1] + p[i + 4]) / 2;
    ctx.lineWidth = it.w * (0.6 + 0.8 * (p[i + 2] + p[i + 5]) / 2);
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(p[i], p[i + 1], nx, ny); ctx.stroke();
    mx = nx; my = ny;
  }
  const e = p.length - 3;
  ctx.lineWidth = it.w * (0.6 + 0.8 * p[e + 2]);
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(p[e], p[e + 1]); ctx.stroke();
}
function drawItem(ctx, it) {
  if (it.t === 's') drawStroke(ctx, it);
  else if (it.t === 't') {
    ctx.font = textFont(it.s); ctx.fillStyle = it.c; ctx.textBaseline = 'top';
    it.text.split('\n').forEach((l, i) => ctx.fillText(l, it.x, it.y + i * it.s * 1.25 + it.s * 0.12));
  } else {
    const im = getImg(it.f);
    if (im) ctx.drawImage(im, it.x, it.y, it.w, it.h);
    else { ctx.fillStyle = '#eef0f4'; ctx.fillRect(it.x, it.y, it.w, it.h); }
  }
}
/* Pořadí: obrázky dole, pak zvýrazňovač, navrch pero a text. */
function drawItems(ctx, items, hide) {
  for (let pass = 0; pass < 3; pass++)
    for (const it of items) {
      if (hide && hide.has(it.id)) continue;
      const layer = it.t === 'i' ? 0 : it.tool === 'hl' ? 1 : 2;
      if (layer === pass) drawItem(ctx, it);
    }
}
function drawPaper(ctx, pg) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h);
  const t = pg.bg.type; ctx.lineWidth = 0.6; ctx.strokeStyle = '#cdd8ea';
  if (t === 'lined') {
    ctx.beginPath(); for (let y = 70; y < pg.h - 20; y += 26) { ctx.moveTo(0, y); ctx.lineTo(pg.w, y); } ctx.stroke();
    ctx.strokeStyle = '#f0b4b4'; ctx.beginPath(); ctx.moveTo(56, 0); ctx.lineTo(56, pg.h); ctx.stroke();
  } else if (t === 'grid') {
    ctx.beginPath();
    for (let y = 20; y < pg.h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(pg.w, y); }
    for (let x = 20; x < pg.w; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, pg.h); }
    ctx.stroke();
  } else if (t === 'dots') {
    ctx.fillStyle = '#b4bfd2';
    for (let y = 20; y < pg.h; y += 20) for (let x = 20; x < pg.w; x += 20) ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
  }
}
/* Vykreslí celou stránku do nového plátna (náhledy, export). */
async function renderPage(pg, scale) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(pg.w * scale)); c.height = Math.max(1, Math.round(pg.h * scale));
  const ctx = c.getContext('2d');
  if (pg.bg.type === 'pdf') {
    try { await pdfInto(c, pg); } catch { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.setTransform(c.width / pg.w, 0, 0, c.height / pg.h, 0, 0);
  } else { ctx.setTransform(c.width / pg.w, 0, 0, c.height / pg.h, 0, 0); drawPaper(ctx, pg); }
  await Promise.all(pg.items.filter(i => i.t === 'i').map(i => loadImg(i.f).catch(() => {})));
  drawItems(ctx, pg.items);
  return c;
}

/* ====================================================================== */
/* Knihovna                                                               */
/* ====================================================================== */
const fmtDate = t => new Date(t).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
const pagesWord = n => (n === 1 ? 'strana' : n >= 2 && n <= 4 ? 'strany' : 'stran');

async function renderLibrary() {
  const nbs = (await DB.all('notebooks')).sort((a, b) => b.updated - a.updated);
  const q = $('#search').value.trim().toLowerCase();
  const shown = q ? nbs.filter(n => n.name.toLowerCase().includes(q)) : nbs;
  const shelf = $('#shelf'); shelf.innerHTML = '';
  if (!nbs.length) shelf.append(h('div', { class: 'welcome' }, h('h2', {}, 'Vítejte!'),
    h('p', {}, 'Založte si první sešit tlačítkem „+ Nový sešit“, nebo nahrajte prezentaci v PDF a pište přímo do ní.')));
  const groups = [...state.groups];
  nbs.forEach(n => { if (n.group && !groups.includes(n.group)) groups.push(n.group); });
  const sections = groups.map(g => [g, shown.filter(n => n.group === g)]);
  const rest = shown.filter(n => !n.group);
  if (rest.length) sections.push(['', rest]);
  for (const [g, list] of sections) {
    if (q && !list.length) continue;
    shelf.append(h('div', { class: 'grouphead' }, h('h2', {}, g || 'Ostatní'),
      g && h('button', { class: 'iconbtn', html: icon('more'), 'aria-label': 'Možnosti složky', onclick: e => groupMenu(e.currentTarget, g) })));
    if (!list.length) { shelf.append(h('div', { class: 'empty' }, 'Zatím žádné sešity.')); continue; }
    shelf.append(h('div', { class: 'cards' }, list.map(n => h('div', { class: 'card' },
      h('button', { style: 'display:block;width:100%;text-align:left', onclick: () => openNotebook(n.id) },
        h('div', { class: 'cover', style: 'background:' + n.color }, h('div', { class: 'label' }, n.name)),
        h('div', { class: 'meta' }, `${n.pages.length} ${pagesWord(n.pages.length)} · ${fmtDate(n.updated)}`)),
      h('button', { class: 'iconbtn cardmore', html: icon('more'), 'aria-label': 'Možnosti sešitu', onclick: e => nbMenu(e.currentTarget, n) })))));
  }
}

function groupMenu(anchor, g) {
  showMenu(anchor, [
    { label: 'Přejmenovat složku', fn: async () => {
      const v = await formDialog({ title: 'Přejmenovat složku', fields: [{ key: 'name', label: 'Název', type: 'text', value: g }] });
      if (!v || !v.name || v.name === g) return;
      const nbs = (await DB.all('notebooks')).filter(n => n.group === g);
      nbs.forEach(n => (n.group = v.name)); await DB.putMany('notebooks', nbs);
      state.groups = state.groups.map(x => (x === g ? v.name : x)).filter((x, i, a) => a.indexOf(x) === i);
      await saveGroups(); renderLibrary();
    } },
    { label: 'Odstranit složku', danger: true, fn: async () => {
      if (!await confirmDialog('Odstranit složku?', `Sešity ze složky „${g}“ zůstanou a přesunou se do „Ostatní“.`, 'Odstranit')) return;
      const nbs = (await DB.all('notebooks')).filter(n => n.group === g);
      nbs.forEach(n => (n.group = '')); await DB.putMany('notebooks', nbs);
      state.groups = state.groups.filter(x => x !== g); await saveGroups(); renderLibrary();
    } },
  ]);
}
async function useGroup(name) {
  if (name && !state.groups.includes(name)) { state.groups.push(name); await saveGroups(); }
  return name || '';
}
const nbFields = nb => [
  { key: 'name', label: 'Název', type: 'text', value: nb.name },
  { key: 'group', label: 'Složka', type: 'group', value: nb.group },
  { key: 'color', label: 'Barva', type: 'color', value: nb.color },
];
async function editNotebook(nb) {
  const v = await formDialog({ title: 'Upravit sešit', fields: nbFields(nb) });
  if (!v) return false;
  nb.name = v.name || nb.name; nb.color = v.color; nb.group = await useGroup(v.group);
  await DB.put('notebooks', nb); return true;
}
function nbMenu(anchor, nb) {
  showMenu(anchor, [
    { label: 'Upravit (název, složka, barva)', fn: async () => { if (await editNotebook(nb)) renderLibrary(); } },
    { label: 'Uložit jako PDF', fn: () => exportPdf(nb) },
    null,
    { label: 'Smazat sešit', danger: true, fn: async () => {
      if (!await confirmDialog('Smazat sešit?', `Sešit „${nb.name}“ a všechny poznámky v něm se nenávratně smažou.`, 'Smazat')) return;
      const pages = await DB.byNb(nb.id); const files = new Set();
      pages.forEach(p => { if (p.bg.f) files.add(p.bg.f); p.items.forEach(i => i.f && files.add(i.f)); });
      await DB.delMany('pages', pages.map(p => p.id)); await DB.delMany('files', [...files]); await DB.del('notebooks', nb.id);
      renderLibrary();
    } },
  ]);
}
const lastGroup = () => prefs.lastGroup && state.groups.includes(prefs.lastGroup) ? prefs.lastGroup : state.groups[0] || '';

async function newNotebook() {
  const v = await formDialog({ title: 'Nový sešit', ok: 'Vytvořit', fields: [
    { key: 'name', label: 'Název (např. předmět)', type: 'text', value: '' },
    { key: 'group', label: 'Složka', type: 'group', value: lastGroup() },
    { key: 'color', label: 'Barva', type: 'color', value: NB_COLORS[Math.floor(Math.random() * NB_COLORS.length)] },
    { key: 'paper', label: 'Papír', type: 'select', value: 'lined', options: PAPERS },
  ] });
  if (!v) return;
  const id = uid(), pg = { id: uid(), nb: id, ...A4, bg: { type: v.paper }, items: [] };
  const nb = { id, name: v.name || 'Sešit', color: v.color, group: await useGroup(v.group), paper: v.paper, pages: [pg.id], created: Date.now(), updated: Date.now(), last: 0 };
  prefs.lastGroup = nb.group; savePrefs();
  await DB.put('pages', pg); await DB.put('notebooks', nb);
  openNotebook(id);
}
function checkPdf(file) {
  if (!file) return false;
  if (/\.pptx?$/i.test(file.name)) { formDialog({ title: 'Tohle je PowerPoint', text: 'Prezentaci nejdřív uložte jako PDF (v PowerPointu: Soubor → Uložit jako → PDF) a pak ji nahrajte znovu.', ok: 'Rozumím', cancel: '' }); return false; }
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('Vyberte prosím soubor PDF.'); return false; }
  return true;
}
async function importPdfAsNotebook(file) {
  if (!checkPdf(file)) return;
  const v = await formDialog({ title: 'Nahrát PDF', ok: 'Nahrát', fields: [
    { key: 'name', label: 'Název sešitu', type: 'text', value: file.name.replace(/\.pdf$/i, '') },
    { key: 'group', label: 'Složka', type: 'group', value: lastGroup() },
    { key: 'color', label: 'Barva', type: 'color', value: NB_COLORS[0] },
  ] });
  if (!v) return;
  toast('Nahrávám PDF…', 0);
  try {
    const id = uid(), pages = await pdfToPages(file, id);
    const nb = { id, name: v.name || file.name, color: v.color, group: await useGroup(v.group), paper: 'lined', pages: pages.map(p => p.id), created: Date.now(), updated: Date.now(), last: 0 };
    prefs.lastGroup = nb.group; savePrefs();
    await DB.putMany('pages', pages); await DB.put('notebooks', nb);
    $('#toast').hidden = true;
    openNotebook(id);
  } catch (e) { console.error(e); toast('PDF se nepodařilo načíst.'); }
}

/* ---------- export a záloha ---------- */
async function exportPdf(nb) {
  try {
    toast('Připravuji PDF…', 0);
    await flush(); await loadScript(JSPDF);
    const byId = new Map((await DB.byNb(nb.id)).map(p => [p.id, p]));
    const pages = nb.pages.map(id => byId.get(id)).filter(Boolean);
    let doc;
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i]; toast(`Připravuji PDF… ${i + 1} / ${pages.length}`, 0);
      const c = await renderPage(pg, Math.min(2, Math.sqrt(6e6 / (pg.w * pg.h))));
      const o = pg.w > pg.h ? 'l' : 'p';
      if (!doc) doc = new jspdf.jsPDF({ unit: 'pt', format: [pg.w, pg.h], orientation: o, compress: true });
      else doc.addPage([pg.w, pg.h], o);
      doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pg.w, pg.h);
      c.width = c.height = 0;
    }
    $('#toast').hidden = true;
    await saveFile(doc.output('blob'), nb.name.replace(/[\\/:*?"<>|]/g, '_') + '.pdf');
  } catch (e) { console.error(e); toast('Export se nepodařil.'); }
}
function ab2b64(buf) {
  let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function b642ab(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
async function backup() {
  try {
    toast('Připravuji zálohu…', 0);
    const files = (await DB.all('files')).map(f => ({ id: f.id, name: f.name, type: f.type, b64: ab2b64(f.data) }));
    const data = { app: 'sesity', v: 1, groups: state.groups, notebooks: await DB.all('notebooks'), pages: await DB.all('pages'), files };
    $('#toast').hidden = true;
    await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `sesity-zaloha-${new Date().toISOString().slice(0, 10)}.json`);
  } catch (e) { console.error(e); toast('Zálohu se nepodařilo vytvořit.'); }
}
async function restore(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'sesity') throw new Error('Neznámý soubor');
    if (!await formDialog({ title: 'Obnovit ze zálohy?', text: `Záloha obsahuje ${d.notebooks.length} sešitů. Přidají se k těm, které tu už jsou; stejné sešity se přepíšou verzí ze zálohy.`, ok: 'Obnovit' })) return;
    toast('Obnovuji…', 0);
    await DB.putMany('files', d.files.map(f => ({ id: f.id, name: f.name, type: f.type, data: b642ab(f.b64) })));
    await DB.putMany('pages', d.pages); await DB.putMany('notebooks', d.notebooks);
    (d.groups || []).forEach(g => { if (!state.groups.includes(g)) state.groups.push(g); });
    await saveGroups(); toast('Hotovo, záloha je obnovená.'); renderLibrary();
  } catch (e) { console.error(e); toast('Tento soubor není záloha Sešitů.'); }
}
function showHelp() {
  formDialog({ title: 'Jak na to', ok: 'Rozumím', cancel: '', html: `<ul>
    <li><b>Škrtnutí maže.</b> Co napíšete perem a pak rychle přeškrtáte tam a zpět (cik-cak), to zmizí. Když se to stane omylem, klepněte na šipku Zpět.</li>
    <li><b>Tlačítko na peru = guma.</b> Držte tlačítko na S Penu a přejeďte přes to, co chcete smazat.</li>
    <li><b>Podržte pero na konci tahu</b> a čára se narovná; nakreslené kolečko nebo obdélník se vyhladí.</li>
    <li><b>Prst posouvá, pero píše.</b> Dvěma prsty stránku přiblížíte, dvojitým klepnutím prstem zvětšíte a vrátíte.</li>
    <li><b>Klepnutí dvěma prsty = zpět</b>, třemi prsty = znovu.</li>
    <li><b>Švih prstem do strany</b> otočí na další nebo předchozí stránku.</li>
    <li><b>Prezentace.</b> Nahrajte PDF a pište přímo do něj. PowerPoint je potřeba nejdřív uložit jako PDF.</li>
    <li><b>Laso</b> vybere, co obkroužíte. Výběr jde přesunout, zvětšit za roh, přebarvit nebo smazat.</li>
    <li><b>Zvýrazňovač</b> rovnou čáru sám narovná.</li>
    <li><b>Záloha.</b> Poznámky jsou uložené jen v tomto tabletu. Občas si v nabídce ⋯ udělejte zálohu.</li>
  </ul>` });
}

/* ====================================================================== */
/* Editor                                                                 */
/* ====================================================================== */
const ed = { nb: null, pages: [], idx: 0, page: null, sel: null, hide: null, textEdit: null, bmp: null };
const view = { s: 1, tx: 0, ty: 0 };
const hist = new WeakMap();
const cBg = $('#cBg'), cInk = $('#cInk'), cLive = $('#cLive'), stage = $('#stage');
let SR = { left: 0, top: 0, width: 1, height: 1 }, DPR = 1;
let act = null, lastPen = -1e9;
const ptrs = new Map(), ignored = new Set();
let gest = null;

const H = pg => { let x = hist.get(pg); if (!x) hist.set(pg, (x = { u: [], r: [] })); return x; };

/* --- ukládání --- */
const dirty = new Set(); let saveT;
function markDirty(pg) { dirty.add(pg); clearTimeout(saveT); saveT = setTimeout(flush, 500); }
async function flush() {
  clearTimeout(saveT);
  const arr = [...dirty]; dirty.clear();
  if (!arr.length) return;
  try {
    await DB.putMany('pages', arr);
    if (ed.nb) { ed.nb.updated = Date.now(); await DB.put('notebooks', ed.nb); }
  } catch (e) { console.error(e); arr.forEach(p => dirty.add(p)); toast('Nepodařilo se uložit – v tabletu možná dochází místo.'); }
}
const saveNb = () => { ed.nb.updated = Date.now(); return DB.put('notebooks', ed.nb); };

/* --- překreslování --- */
const need = { bg: false, ink: false, live: false }; let raf = 0;
function req(...k) { k.forEach(x => (need[x] = true)); if (!raf) raf = requestAnimationFrame(frame); }
function frame() {
  raf = 0; if (!ed.page) return;
  if (need.bg) { need.bg = false; drawBg(); }
  if (need.ink) { need.ink = false; drawInk(); }
  if (need.live) { need.live = false; drawLive(); }
}
function setView(ctx) { ctx.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * view.tx, DPR * view.ty); }
function clear(c) { const ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); return ctx; }
function drawBg() {
  const ctx = clear(cBg), pg = ed.page; setView(ctx);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 10 * DPR; ctx.shadowOffsetY = 2 * DPR;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pg.w, pg.h); ctx.restore();
  if (pg.bg.type === 'pdf') { if (ed.bmp && ed.bmp.pid === pg.id) ctx.drawImage(ed.bmp.canvas, 0, 0, pg.w, pg.h); }
  else drawPaper(ctx, pg);
}
function inkCtx() {
  const ctx = cInk.getContext('2d'); setView(ctx); ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, ed.page.w, ed.page.h); ctx.clip(); return ctx;
}
function drawInk() {
  clear(cInk); const ctx = inkCtx(); drawItems(ctx, ed.page.items, ed.hide);
  if (act && act.direct) drawStroke(ctx, act.item);
  ctx.restore();
}
/* Přikreslí k rozepsanému tahu jen nové body (od indexu `from`), bez překreslování celého plátna. */
function inkAppend(it, from) {
  const p = it.p, n = p.length / 3, ctx = inkCtx(), W = pr => it.w * (0.6 + 0.8 * pr);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = it.c;
  const X = k => p[k * 3], Y = k => p[k * 3 + 1], Pr = k => p[k * 3 + 2];
  for (let k = Math.max(from, 1); k < n; k++) {
    const mx = (X(k - 1) + X(k)) / 2, my = (Y(k - 1) + Y(k)) / 2;
    ctx.beginPath();
    if (k === 1) { ctx.lineWidth = W(Pr(0)); ctx.moveTo(X(0), Y(0)); ctx.lineTo(mx, my); }
    else { ctx.lineWidth = W((Pr(k - 1) + Pr(k)) / 2); ctx.moveTo((X(k - 2) + X(k - 1)) / 2, (Y(k - 2) + Y(k - 1)) / 2); ctx.quadraticCurveTo(X(k - 1), Y(k - 1), mx, my); }
    ctx.stroke();
    if (k === n - 1) { ctx.lineWidth = W(Pr(k)); ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(X(k), Y(k)); ctx.stroke(); }
  }
  if (n === 1) { ctx.lineWidth = W(Pr(0)); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0) + 0.01, Y(0)); ctx.stroke(); }
  ctx.restore();
}
function drawLive() {
  const ctx = clear(cLive); setView(ctx); const s = view.s;
  const a = act;
  if (a) {
    if (a.kind === 'stroke' && !a.direct) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ed.page.w, ed.page.h); ctx.clip(); drawStroke(ctx, a.item); ctx.restore(); }
    else if (a.kind === 'shape') drawStroke(ctx, shapeItem(a));
    else if (a.kind === 'erase' && a.last) {
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1 / s; ctx.beginPath(); ctx.arc(a.last.x, a.last.y, 9 / s, 0, 7); ctx.stroke();
    } else if (a.kind === 'lasso') {
      ctx.strokeStyle = '#2f6fed'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([5 / s, 4 / s]); ctx.beginPath();
      for (let i = 0; i < a.pts.length; i += 2) i ? ctx.lineTo(a.pts[i], a.pts[i + 1]) : ctx.moveTo(a.pts[0], a.pts[1]);
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  if (!a && hover) {
    const t = hover.erase ? 'eraser' : prefs.tool;
    if (t === 'eraser') { ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1 / s; ctx.beginPath(); ctx.arc(hover.x, hover.y, 9 / s, 0, 7); ctx.stroke(); }
    else if (t === 'pen' || t === 'hl') {
      ctx.fillStyle = prefs.color[t]; ctx.globalAlpha = t === 'hl' ? 0.4 : 0.7;
      ctx.beginPath(); ctx.arc(hover.x, hover.y, Math.max(WIDTHS[t][prefs.wi[t]] / 2, 1.5 / s), 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  if (ed.sel) {
    const b = ed.sel.box; let k = 1, dx = 0, dy = 0;
    if (a && a.kind === 'move') { dx = a.dx; dy = a.dy; } else if (a && a.kind === 'scale') k = a.k;
    if (ed.hide) {
      ctx.save(); ctx.translate(dx, dy); ctx.translate(b.x, b.y); ctx.scale(k, k); ctx.translate(-b.x, -b.y);
      drawItems(ctx, ed.page.items.filter(i => ed.sel.ids.has(i.id))); ctx.restore();
    }
    const x = b.x + dx - 4 / s, y = b.y + dy - 4 / s, w = b.w * k + 8 / s, hh = b.h * k + 8 / s;
    ctx.strokeStyle = '#2f6fed'; ctx.lineWidth = 1.5 / s; ctx.setLineDash([5 / s, 4 / s]); ctx.strokeRect(x, y, w, hh); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w, y + hh, 8 / s, 0, 7); ctx.fill(); ctx.stroke();
  }
}

/* --- pohled --- */
function resizeStage() {
  const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
  SR = r; DPR = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [cBg, cInk, cLive]) { c.width = Math.round(r.width * DPR); c.height = Math.round(r.height * DPR); }
  if (ed.page) { clampView(); req('bg', 'ink', 'live'); }
}
function fitScale() {
  const pg = ed.page;
  return Math.max(0.1, Math.min((SR.width - 24) / pg.w, pg.w > pg.h ? (SR.height - 100) / pg.h : Infinity));
}
function toggleZoom(p) {
  if (view.s > fitScale() * 1.15) fitView(); else { zoomAt(p.sx, p.sy, 2); viewSettled(); }
}
function fitView() {
  const pg = ed.page; if (!pg) return;
  view.s = fitScale();
  view.tx = (SR.width - pg.w * view.s) / 2;
  view.ty = pg.h * view.s < SR.height - 24 ? Math.max(12, (SR.height - 70 - pg.h * view.s) / 2) : 12;
  req('bg', 'ink', 'live'); viewSettled();
}
function clampView() {
  const pg = ed.page, m = 80;
  view.tx = clamp(view.tx, m - pg.w * view.s, SR.width - m);
  view.ty = clamp(view.ty, m - pg.h * view.s, SR.height - m);
}
let bmpToken = 0;
async function viewSettled() {
  const pg = ed.page; if (!pg || pg.bg.type !== 'pdf') return;
  const target = Math.min(view.s * DPR, Math.sqrt(12e6 / (pg.w * pg.h)), 6);
  if (ed.bmp && ed.bmp.pid === pg.id && Math.abs(ed.bmp.scale - target) / target < 0.15) return;
  const token = ++bmpToken;
  try {
    const c = document.createElement('canvas');
    c.width = Math.round(pg.w * target); c.height = Math.round(pg.h * target);
    await pdfInto(c, pg);
    if (token !== bmpToken || ed.page !== pg) return;
    ed.bmp = { pid: pg.id, scale: target, canvas: c }; req('bg');
  } catch (e) { console.error(e); if (token === bmpToken) toast('Stránku PDF se nepodařilo zobrazit.'); }
}
function zoomAt(sx, sy, k) {
  const s = clamp(view.s * k, 0.15, 8), kk = s / view.s;
  view.tx = sx - (sx - view.tx) * kk; view.ty = sy - (sy - view.ty) * kk; view.s = s;
  clampView(); req('bg', 'ink', 'live');
}

/* --- změny obsahu, zpět/znovu --- */
function commit(items, added, drawn) {
  const pg = ed.page, hh = H(pg);
  hh.u.push(pg.items); if (hh.u.length > 100) hh.u.shift(); hh.r.length = 0;
  pg.items = items; markDirty(pg); updateUndoUi();
  if (drawn) return;
  if (added && added.tool !== 'hl' && !ed.hide) { const ctx = inkCtx(); drawItem(ctx, added); ctx.restore(); req('live'); }
  else req('ink', 'live');
}
function undo() {
  commitText(); const pg = ed.page, hh = H(pg); if (!hh.u.length) return false;
  clearSel(); hh.r.push(pg.items); pg.items = hh.u.pop(); markDirty(pg); updateUndoUi(); req('ink', 'live'); return true;
}
function redo() {
  commitText(); const pg = ed.page, hh = H(pg); if (!hh.r.length) return false;
  clearSel(); hh.u.push(pg.items); pg.items = hh.r.pop(); markDirty(pg); updateUndoUi(); req('ink', 'live'); return true;
}
function updateUndoUi() { const hh = H(ed.page); $('#btnUndo').disabled = !hh.u.length; $('#btnRedo').disabled = !hh.r.length; }

/* --- výběr --- */
function setSel(ids) {
  const its = ed.page.items.filter(i => ids.has(i.id));
  if (!its.length) return clearSel();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  its.forEach(i => { const b = bbox(i); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
  ed.sel = { ids: new Set(its.map(i => i.id)), box: { x: x0, y: y0, w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1) } };
  $('#selbar').hidden = false; req('live');
}
function clearSel() { if (!ed.sel) return; ed.sel = null; ed.hide = null; $('#selbar').hidden = true; req('ink', 'live'); }
function replaceSel(fn) {
  const ids = new Set();
  const items = ed.page.items.map(i => { if (!ed.sel.ids.has(i.id)) return i; const n = fn(i); ids.add(n.id); return n; });
  ed.hide = null; commit(items); setSel(ids);
}

/* --- tvary --- */
function shapeItem(a) {
  const { x0, y0, x1, y1 } = a, w = WIDTHS.shape[prefs.wi.shape]; let pts = [];
  const kind = prefs.shape;
  if (kind === 'rect') pts = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
  else if (kind === 'ellipse') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    for (let i = 0; i <= 48; i++) pts.push(cx + rx * Math.cos(i / 48 * 2 * Math.PI), cy + ry * Math.sin(i / 48 * 2 * Math.PI));
  } else {
    pts = [x0, y0, x1, y1];
    if (kind === 'arrow') {
      const ang = Math.atan2(y1 - y0, x1 - x0), L = Math.min(8 + w * 3, Math.hypot(x1 - x0, y1 - y0) * 0.5);
      pts.push(x1 - L * Math.cos(ang - 0.45), y1 - L * Math.sin(ang - 0.45), x1, y1, x1 - L * Math.cos(ang + 0.45), y1 - L * Math.sin(ang + 0.45));
    }
  }
  const p = []; for (let i = 0; i < pts.length; i += 2) p.push(r2(pts[i]), r2(pts[i + 1]), 0.5);
  return { id: uid(), t: 's', tool: 'pen', u: 1, c: prefs.color.shape, w, p };
}

/* --- text --- */
const tb = $('#textbox');
function openText(x, y, existing) {
  ed.textEdit = { x, y, it: existing || null };
  if (existing) { x = existing.x; y = existing.y; ed.textEdit.x = x; ed.textEdit.y = y; ed.hide = new Set([existing.id]); req('ink'); }
  const size = existing ? existing.s : WIDTHS.text[prefs.wi.text];
  ed.textEdit.s = size; ed.textEdit.c = existing ? existing.c : prefs.color.text;
  tb.value = existing ? existing.text : '';
  tb.style.left = view.tx + x * view.s + 'px'; tb.style.top = view.ty + y * view.s + 'px';
  tb.style.fontSize = size * view.s + 'px'; tb.style.color = ed.textEdit.c;
  tb.style.width = Math.max(140, Math.min((ed.page.w - x) * view.s, SR.width - (view.tx + x * view.s) - 4)) + 'px';
  tb.hidden = false; sizeText(); setTimeout(() => tb.focus(), 0);
}
function sizeText() { tb.style.height = 'auto'; tb.style.height = Math.max(tb.scrollHeight, 1.25 * parseFloat(tb.style.fontSize)) + 3 + 'px'; }
tb.addEventListener('input', sizeText);
function commitText() {
  const te = ed.textEdit; if (!te) return;
  ed.textEdit = null; tb.hidden = true; ed.hide = null; tb.blur();
  const text = tb.value.replace(/\s+$/, ''); let items = ed.page.items;
  if (te.it) {
    if (text === te.it.text) return req('ink');
    items = items.filter(i => i !== te.it);
    if (text) items = [...items, { ...te.it, text }];
  } else if (text) items = [...items, { id: uid(), t: 't', x: r2(te.x), y: r2(te.y), s: te.s, c: te.c, text }];
  else return;
  commit(items);
}

/* --- guma --- */
function eraseAt(a, b) {
  const rr = 9 / view.s, items = ed.page.items;
  const sb = { x: Math.min(a.x, b.x) - rr, y: Math.min(a.y, b.y) - rr, w: Math.abs(a.x - b.x) + 2 * rr, h: Math.abs(a.y - b.y) + 2 * rr };
  let out = null;
  for (const it of items) {
    if (it.t === 'i') continue;
    const ib = bbox(it); if (!boxesHit(sb, ib)) continue;
    let hit = false;
    if (it.t === 't') hit = inBox(b.x, b.y, ib, rr);
    else {
      const s = samples(it), tol = (rr + it.w / 2) ** 2;
      for (let i = 0; i < s.length; i += 2) if (segDist2(s[i], s[i + 1], a.x, a.y, b.x, b.y) <= tol) { hit = true; break; }
    }
    if (hit) (out || (out = new Set())).add(it.id);
  }
  if (out) { ed.page.items = items.filter(i => !out.has(i.id)); req('ink'); }
}

/* --- ukazatel (pero, prst, myš) --- */
function pos(e) {
  const sx = e.clientX - SR.left, sy = e.clientY - SR.top;
  return { sx, sy, x: (sx - view.tx) / view.s, y: (sy - view.ty) / view.s };
}
const pressure = e => (e.pointerType === 'pen' ? r2(clamp(e.pressure || 0.5, 0.05, 1)) : 0.5);

function gSnap() {
  const ps = [...ptrs.values()], n = ps.length;
  const cx = ps.reduce((a, p) => a + p.x, 0) / n, cy = ps.reduce((a, p) => a + p.y, 0) / n;
  gest = { n, cx, cy, d: n > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, v: { ...view }, moved: gest ? gest.moved : false };
}
function gMove() {
  const ps = [...ptrs.values()], n = ps.length; if (!n) return;
  if (n !== gest.n) gSnap();
  const cx = ps.reduce((a, p) => a + p.x, 0) / n, cy = ps.reduce((a, p) => a + p.y, 0) / n;
  const dNow = n > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
  if (!gest.moved && Math.hypot(cx - gest.cx, cy - gest.cy) < 8 && (n === 1 || Math.abs(dNow - gest.d) < 14)) return;
  gest.moved = true;
  let k = 1;
  if (n > 1 && gest.d > 10) k = clamp(gest.v.s * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / gest.d, 0.15, 8) / gest.v.s;
  view.s = gest.v.s * k;
  view.tx = cx - (gest.cx - gest.v.tx) * k; view.ty = cy - (gest.cy - gest.v.ty) * k;
  clampView(); req('bg', 'ink', 'live');
}
/* Konec gesta prsty: klepnutí dvěma prsty = zpět, třemi = znovu, dvojité klepnutí = lupa, švih do strany = další stránka. */
let lastTap = { t: 0, x: 0, y: 0 };
function endGesture(a, e) {
  const now = performance.now(), dt = now - a.t0, p = pos(e), pg = ed.page;
  if (!gest.moved && dt < 350) {
    if (now - lastPen < 1500) return; // těsně po psaní to byla nejspíš dlaň
    if (a.maxN === 2) { if (undo()) toast('Zpět', 900); }
    else if (a.maxN >= 3) { if (redo()) toast('Znovu', 900); }
    else if (now - lastTap.t < 350 && Math.hypot(p.sx - lastTap.x, p.sy - lastTap.y) < 40) { lastTap.t = 0; toggleZoom(p); }
    else lastTap = { t: now, x: p.sx, y: p.sy };
    return;
  }
  if (a.maxN === 1 && dt < 450 && pg.w * a.v0.s <= SR.width + 2) {
    const dx = p.sx - a.p0.x, dy = p.sy - a.p0.y, j = ed.idx + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2.5 * Math.abs(dy) && j >= 0 && j < ed.pages.length) return gotoPage(j);
  }
  viewSettled();
}

/* Podržení pera na konci tahu: rovná čára se narovná, uzavřený tvar se změní na obdélník nebo elipsu. */
function armHold(a) {
  clearTimeout(a.hold);
  if (a.item.tool !== 'pen' || a.snap) return;
  a.hold = setTimeout(() => { if (act === a) snapStroke(a); }, 650);
}
function snapStroke(a) {
  const it = a.item, p = it.p, n = p.length / 3; if (n < 8) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0, dev = 0;
  const e = p.length - 3;
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
    if (i) len += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
    dev = Math.max(dev, segDist2(p[i], p[i + 1], p[0], p[1], p[e], p[e + 1]));
  }
  const D = Math.hypot(x1 - x0, y1 - y0), L = Math.hypot(p[e] - p[0], p[e + 1] - p[1]);
  if (D * view.s < 60) return; // malá písmena nenarovnávat
  let pts;
  if (L > 0.6 * D && Math.sqrt(dev) < Math.max(4 / view.s, 0.1 * L) && len < 1.4 * L) { pts = [p[0], p[1], p[e], p[e + 1]]; a.snap = 'line'; }
  else if (L < 0.3 * D && len > 2 * D) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1; let eE = 0, eR = 0;
    for (let i = 0; i < p.length; i += 3) {
      const ux = Math.abs(p[i] - cx) / rx, uy = Math.abs(p[i + 1] - cy) / ry;
      eE += Math.abs(Math.hypot(ux, uy) - 1); eR += Math.min(1 - ux, 1 - uy);
    }
    if (eE < eR) { pts = []; for (let i = 0; i <= 48; i++) pts.push(cx + rx * Math.cos(i / 24 * Math.PI), cy + ry * Math.sin(i / 24 * Math.PI)); }
    else pts = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
    a.snap = 'fixed';
  } else return;
  const q = []; for (let i = 0; i < pts.length; i += 2) q.push(r2(pts[i]), r2(pts[i + 1]), 0.5);
  a.item = { ...it, u: 1, p: q }; a.direct = false; req('ink');
  if (navigator.vibrate) navigator.vibrate(12);
  req('live');
}

let hover = null;
function cancelAct() {
  const a = act; act = null; if (!a) return;
  clearTimeout(a.hold);
  if (a.kind === 'erase') ed.page.items = a.orig;
  if (a.kind === 'move' || a.kind === 'scale') ed.hide = null;
  req('ink', 'live');
}

function onDown(e) {
  e.preventDefault(); closeMenu();
  const now = performance.now();
  if (ed.textEdit) { commitText(); if (prefs.tool === 'text' && e.pointerType !== 'touch') return; }
  if (e.pointerType === 'pen') {
    lastPen = now; ptrs.forEach((_, id) => ignored.add(id)); ptrs.clear();
    if (act && act.kind === 'gesture') {
      // dlaň stihla stránkou pohnout dřív, než dosedlo pero: vrátit pohled zpět
      if (gest && gest.moved) { Object.assign(view, act.v0); req('bg', 'ink', 'live'); }
      act = null;
    } else if (act && act.pid !== e.pointerId) {
      // předchozí tah neskončil korektně: uložit ho, ať nový tah nepropadne
      const a = act; clearTimeout(a.hold);
      if (a.kind === 'stroke') { act = null; finishStroke(a.item, a.direct); } else cancelAct();
    }
  }
  if (e.pointerType === 'touch') {
    // opřená dlaň: dotyk těsně po peru, během psaní perem nebo s velkou plochou
    if ((act && act.pen) || now - lastPen < 700 || e.width > 45 || e.height > 45) { ignored.add(e.pointerId); return; }
    const p = pos(e); ptrs.set(e.pointerId, { x: p.sx, y: p.sy });
    try { cLive.setPointerCapture(e.pointerId); } catch {}
    if (!prefs.finger || ptrs.size > 1) {
      if (act && act.kind === 'gesture') { act.maxN = Math.max(act.maxN, ptrs.size); gSnap(); return; }
      if (act) cancelAct();
      act = { kind: 'gesture', t0: now, maxN: ptrs.size, v0: { ...view }, p0: { x: p.sx, y: p.sy } }; gest = null; gSnap(); return;
    }
  }
  if (act) return;
  try { cLive.setPointerCapture(e.pointerId); } catch {}
  const p = pos(e), base = { pid: e.pointerId, pen: e.pointerType === 'pen' };
  // tlačítko na peru (S Pen) nebo opačný konec pera = guma
  const tool = base.pen && (e.button === 5 || e.button === 2 || (e.buttons & 34)) ? 'eraser' : prefs.tool;
  hover = null;
  if (tool !== 'lasso' && ed.sel) clearSel();
  if (tool === 'pen' || tool === 'hl') {
    act = { ...base, kind: 'stroke', item: { id: uid(), t: 's', tool, c: prefs.color[tool], w: WIDTHS[tool][prefs.wi[tool]], p: [r2(p.x), r2(p.y), pressure(e)] }, anchor: p, fx: p.x, fy: p.y, fp: pressure(e), direct: tool === 'pen' };
    armHold(act);
    if (act.direct) { inkAppend(act.item, 0); return; }
  } else if (tool === 'eraser') { act = { ...base, kind: 'erase', orig: ed.page.items, last: p }; eraseAt(p, p); }
  else if (tool === 'shape') act = { ...base, kind: 'shape', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  else if (tool === 'text') act = { ...base, kind: 'text', p };
  else if (tool === 'lasso') {
    if (ed.sel) {
      const b = ed.sel.box;
      if (Math.hypot(p.x - (b.x + b.w), p.y - (b.y + b.h)) < 20 / view.s) { act = { ...base, kind: 'scale', k: 1 }; ed.hide = ed.sel.ids; req('ink', 'live'); return; }
      if (inBox(p.x, p.y, b, 6 / view.s)) { act = { ...base, kind: 'move', x0: p.x, y0: p.y, dx: 0, dy: 0 }; ed.hide = ed.sel.ids; req('ink', 'live'); return; }
      clearSel();
    }
    act = { ...base, kind: 'lasso', pts: [p.x, p.y], s0: p };
  }
  req('live');
}
function onMove(e) {
  if (e.pointerType === 'pen') lastPen = performance.now();
  if (ignored.has(e.pointerId)) return;
  if (ptrs.has(e.pointerId)) { const p = pos(e); ptrs.set(e.pointerId, { x: p.sx, y: p.sy }); }
  if (act && act.kind === 'gesture') { gMove(); return; }
  if (!act || act.pid !== e.pointerId) return;
  const a = act, p = pos(e);
  if (a.kind === 'stroke' && a.snap) {
    if (a.snap === 'line') { const q = a.item.p; a.item = { ...a.item, p: [q[0], q[1], 0.5, r2(p.x), r2(p.y), 0.5] }; }
  } else if (a.kind === 'stroke') {
    if (Math.hypot(p.sx - a.anchor.sx, p.sy - a.anchor.sy) > 5) { a.anchor = p; armHold(a); }
    let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null; if (!evs || !evs.length) evs = [e];
    const pts = a.item.p, min = 0.25 / (view.s * view.s), from = pts.length / 3;
    for (const ev of evs) {
      const q = pos(ev), n = pts.length;
      a.fx += (q.x - a.fx) * 0.75; a.fy += (q.y - a.fy) * 0.75; a.fp += (pressure(ev) - a.fp) * 0.35;
      const dx = a.fx - pts[n - 3], dy = a.fy - pts[n - 2];
      if (dx * dx + dy * dy < min) continue;
      pts.push(r2(a.fx), r2(a.fy), r2(a.fp));
    }
    if (a.direct) { if (pts.length / 3 > from) inkAppend(a.item, from); return; }
  } else if (a.kind === 'erase') { eraseAt(a.last, p); a.last = p; }
  else if (a.kind === 'shape') { a.x1 = p.x; a.y1 = p.y; }
  else if (a.kind === 'lasso') { a.pts.push(p.x, p.y); a.far = Math.max(a.far || 0, Math.hypot(p.sx - a.s0.sx, p.sy - a.s0.sy)); }
  else if (a.kind === 'move') { a.dx = p.x - a.x0; a.dy = p.y - a.y0; }
  else if (a.kind === 'scale') { const b = ed.sel.box; a.k = clamp(Math.max((p.x - b.x) / b.w, (p.y - b.y) / b.h), 0.1, 10); }
  req('live');
}
function onUp(e) {
  if (ignored.delete(e.pointerId)) return;
  if (ptrs.delete(e.pointerId) && act && act.kind === 'gesture') {
    if (!ptrs.size) { const g = act; act = null; endGesture(g, e); } else gSnap();
    return;
  }
  if (!act || act.pid !== e.pointerId) return;
  if (e.type === 'pointercancel') return cancelAct();
  const a = act; act = null; const pg = ed.page; clearTimeout(a.hold);
  if (a.kind === 'stroke') {
    if (!a.snap) {
      const q = pos(e), pts = a.item.p, n = pts.length;
      if (Math.hypot(q.x - pts[n - 3], q.y - pts[n - 2]) * view.s > 0.5) { pts.push(r2(q.x), r2(q.y), r2(a.fp)); if (a.direct) inkAppend(a.item, n / 3); }
    }
    finishStroke(a.item, a.direct);
  }
  else if (a.kind === 'erase') { if (pg.items !== a.orig) { const cur = pg.items; pg.items = a.orig; commit(cur); } }
  else if (a.kind === 'shape') { if (Math.hypot(a.x1 - a.x0, a.y1 - a.y0) * view.s > 6) { const it = shapeItem(a); commit([...pg.items, it], it); } }
  else if (a.kind === 'text') {
    const hit = [...pg.items].reverse().find(i => i.t === 't' && inBox(a.p.x, a.p.y, bbox(i), 4));
    if (hit || inBox(a.p.x, a.p.y, { x: 0, y: 0, w: pg.w, h: pg.h })) openText(a.p.x, a.p.y - WIDTHS.text[prefs.wi.text] * 0.6, hit);
  } else if (a.kind === 'lasso') finishLasso(a, pos(e));
  else if (a.kind === 'move') { if (a.dx || a.dy) replaceSel(i => transformItem(i, a.dx, a.dy, 1, 0, 0)); else ed.hide = null; }
  else if (a.kind === 'scale') { const b = ed.sel.box; if (a.k !== 1) replaceSel(i => transformItem(i, 0, 0, a.k, b.x, b.y)); else ed.hide = null; }
  req('ink', 'live');
}
function finishStroke(it, direct) {
  const pg = ed.page, p = it.p;
  if (it.tool === 'hl' && p.length >= 6) {
    // rovnou čáru zvýrazňovače narovnáme
    const e = p.length - 3, L = Math.hypot(p[e] - p[0], p[e + 1] - p[1]); let dev = 0;
    for (let i = 3; i < e; i += 3) dev = Math.max(dev, segDist2(p[i], p[i + 1], p[0], p[1], p[e], p[e + 1]));
    if (L > 15 && Math.sqrt(dev) < Math.max(5, L * 0.04)) {
      const y1 = Math.abs(p[e + 1] - p[1]) < L * 0.08 ? p[1] : p[e + 1];
      it.p = [p[0], p[1], 0.5, p[e], y1, 0.5];
    }
  }
  if (it.tool === 'pen' && !it.u && prefs.scratch && isScribble(it)) {
    const hits = scratchTargets(it, pg.items);
    if (hits.size) { if (navigator.vibrate) navigator.vibrate(12); commit(pg.items.filter(i => !hits.has(i.id))); return; }
  }
  commit([...pg.items, it], it, direct && !it.u);
}
function finishLasso(a, p) {
  const pg = ed.page, ids = new Set();
  if ((a.far || 0) < 8) {
    const tol = (10 / view.s) ** 2;
    const hit = [...pg.items].reverse().find(it => {
      if (it.t !== 's') return inBox(p.x, p.y, bbox(it));
      const s = samples(it), t2 = tol + it.w * it.w / 4;
      for (let i = 0; i < s.length; i += 2) if ((s[i] - p.x) ** 2 + (s[i + 1] - p.y) ** 2 <= t2) return true;
      return false;
    });
    if (hit) ids.add(hit.id);
  } else {
    for (const it of pg.items) {
      const b = bbox(it);
      if (it.t === 's') {
        const s = samples(it); let n = 0;
        for (let i = 0; i < s.length; i += 2) if (inPoly(s[i], s[i + 1], a.pts)) n++;
        if (n / (s.length / 2) >= 0.7) ids.add(it.id);
      } else if (it.t === 't') { if (inPoly(b.x + b.w / 2, b.y + b.h / 2, a.pts)) ids.add(it.id); }
      else if ([[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(c => inPoly(c[0], c[1], a.pts))) ids.add(it.id);
    }
  }
  if (ids.size) setSel(ids);
}

cLive.addEventListener('pointerdown', onDown);
cLive.addEventListener('pointermove', onMove);
cLive.addEventListener('pointerup', onUp);
cLive.addEventListener('pointercancel', onUp);
cLive.addEventListener('pointerleave', () => { if (hover) { hover = null; req('live'); } });
cLive.addEventListener('contextmenu', e => e.preventDefault());
cLive.addEventListener('wheel', e => {
  e.preventDefault(); commitText();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - SR.left, e.clientY - SR.top, Math.exp(-e.deltaY * 0.01));
  else { view.tx -= e.deltaX; view.ty -= e.deltaY; clampView(); req('bg', 'ink', 'live'); }
  clearTimeout(zoomAt.t); zoomAt.t = setTimeout(viewSettled, 200);
}, { passive: false });
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault()));

/* --- panel nástrojů --- */
const TOOLS = [['pen', 'Pero'], ['hl', 'Zvýrazňovač'], ['eraser', 'Guma'], ['lasso', 'Laso (výběr)'], ['text', 'Text'], ['shape', 'Tvary']];
const SHAPES = [['line', 'Čára'], ['arrow', 'Šipka'], ['rect', 'Obdélník'], ['ellipse', 'Elipsa']];
function setTool(t, anchor) {
  commitText();
  if (t === 'shape' && prefs.tool === 'shape' && anchor) {
    showMenu(anchor, SHAPES.map(([k, l]) => ({ label: (prefs.shape === k ? '✓ ' : '') + l, fn: () => { prefs.shape = k; savePrefs(); } })));
    return;
  }
  if (t !== 'lasso') clearSel();
  prefs.tool = t; savePrefs(); renderToolbar();
}
function setColor(c) {
  if (ed.sel) { replaceSel(i => (i.t === 'i' ? i : { ...i, c })); return; }
  const t = prefs.tool; if (!prefs.color[t]) return;
  prefs.color[t] = c; savePrefs();
  if (ed.textEdit) { ed.textEdit.c = c; tb.style.color = c; }
  renderToolbar();
}
function renderToolbar() {
  const tools = $('#tools'); tools.innerHTML = '';
  TOOLS.forEach(([t, label]) => tools.append(h('button', {
    class: 'iconbtn' + (prefs.tool === t ? ' on' : ''), html: icon(t), 'aria-label': label, title: label,
    onclick: e => setTool(t, e.currentTarget),
  })));
  const t = prefs.tool, colors = $('#colors'), widths = $('#widths'); colors.innerHTML = ''; widths.innerHTML = '';
  const ct = prefs.color[t] ? t : 'pen', palette = t === 'hl' ? HL_COLORS : PEN_COLORS, cur = prefs.color[ct];
  const dim = !prefs.color[t] && !ed.sel;
  palette.forEach(c => colors.append(h('button', { class: 'swatch' + (c === cur && !dim ? ' on' : ''), 'aria-label': 'Barva', onclick: () => setColor(c) }, h('i', { style: 'background:' + c }))));
  const custom = h('input', { type: 'color', value: cur, 'aria-label': 'Vlastní barva' });
  custom.addEventListener('input', () => setColor(custom.value));
  colors.append(h('label', { class: 'swatch custom' + (!palette.includes(cur) && !dim ? ' on' : ''), style: 'position:relative' }, h('i'), custom));
  colors.style.opacity = dim ? 0.35 : 1;
  if (WIDTHS[t]) [0, 1, 2].forEach(i => widths.append(h('button', {
    class: 'wbtn' + (prefs.wi[t] === i ? ' on' : ''), 'aria-label': 'Tloušťka ' + (i + 1),
    onclick: () => { prefs.wi[t] = i; savePrefs(); renderToolbar(); },
  }, h('i', { style: `width:${6 + i * 6}px;height:${6 + i * 6}px` }))));
  $('#btnFinger').classList.toggle('on', prefs.finger);
}

/* --- stránky --- */
function updatePager() {
  $('#pgNum').textContent = `${ed.idx + 1} / ${ed.pages.length}`;
  $('#pgPrev').disabled = ed.idx === 0; $('#pgNext').disabled = ed.idx >= ed.pages.length - 1;
}
function gotoPage(i) {
  commitText(); cancelAct(); clearSel();
  ed.idx = clamp(i, 0, ed.pages.length - 1); ed.page = ed.pages[ed.idx]; ed.bmp = null; ed.hide = null;
  if (ed.nb.last !== ed.idx) { ed.nb.last = ed.idx; DB.put('notebooks', ed.nb); }
  updatePager(); updateUndoUi(); fitView();
  if (!$('#thumbs').hidden) document.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('cur', k === ed.idx));
}
async function insertPages(pages, at) {
  ed.pages.splice(at, 0, ...pages); ed.nb.pages = ed.pages.map(p => p.id);
  await DB.putMany('pages', pages); await saveNb();
  gotoPage(at); refreshThumbs();
}
function addPage() {
  const cur = ed.page, type = ed.nb.paper || 'lined';
  const size = cur.bg.type === 'pdf' ? { w: cur.w, h: cur.h } : { w: cur.w, h: cur.h };
  return insertPages([{ id: uid(), nb: ed.nb.id, ...size, bg: { type }, items: [] }], ed.idx + 1);
}
function duplicatePage() {
  const cur = ed.page;
  return insertPages([{ ...cur, id: uid(), bg: { ...cur.bg }, items: cur.items.map(i => ({ ...i, id: uid() })) }], ed.idx + 1);
}
async function deletePage() {
  if (!await confirmDialog('Smazat stránku?', `Stránka ${ed.idx + 1} se smaže i se vším, co je na ní napsáno.`, 'Smazat')) return;
  const pg = ed.page; dirty.delete(pg);
  ed.pages.splice(ed.idx, 1);
  if (!ed.pages.length) { const n = { id: uid(), nb: ed.nb.id, ...A4, bg: { type: ed.nb.paper || 'lined' }, items: [] }; ed.pages.push(n); await DB.put('pages', n); }
  ed.nb.pages = ed.pages.map(p => p.id);
  await DB.del('pages', pg.id); await saveNb();
  gotoPage(Math.min(ed.idx, ed.pages.length - 1)); refreshThumbs();
}
async function movePage(d) {
  const j = ed.idx + d; if (j < 0 || j >= ed.pages.length) return;
  [ed.pages[ed.idx], ed.pages[j]] = [ed.pages[j], ed.pages[ed.idx]];
  ed.nb.pages = ed.pages.map(p => p.id); await saveNb();
  ed.idx = j; ed.nb.last = j; updatePager(); refreshThumbs();
}
function setPaper(type) {
  ed.nb.paper = type; saveNb();
  if (ed.page.bg.type !== 'pdf') { ed.page.bg = { type }; markDirty(ed.page); req('bg'); refreshThumbs(); }
}
async function insertPdfHere() {
  const file = await pickFile($('#filePdf')); if (!checkPdf(file)) return;
  toast('Nahrávám PDF…', 0);
  try { const pages = await pdfToPages(file, ed.nb.id); await insertPages(pages, ed.idx + 1); $('#toast').hidden = true; }
  catch (e) { console.error(e); toast('PDF se nepodařilo načíst.'); }
}
async function insertImage() {
  const file = await pickFile($('#fileImg')); if (!file) return;
  try {
    const url = URL.createObjectURL(file);
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1800 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.88));
    const id = uid(); await DB.put('files', { id, name: file.name, type: 'image/jpeg', data: await blob.arrayBuffer() });
    const pg = ed.page, w = Math.min(pg.w * 0.6, c.width), hh = w * c.height / c.width;
    const it = { id: uid(), t: 'i', f: id, x: r2((pg.w - w) / 2), y: r2(clamp((SR.height / 2 - view.ty) / view.s - hh / 2, 10, Math.max(10, pg.h - hh - 10))), w: r2(w), h: r2(hh) };
    await loadImg(id);
    commit([...pg.items, it]); prefs.tool = 'lasso'; renderToolbar(); setSel(new Set([it.id]));
    toast('Obrázek můžete přesunout nebo zvětšit za roh.');
  } catch (e) { console.error(e); toast('Obrázek se nepodařilo vložit.'); }
}

/* --- přehled stránek --- */
let thumbChain = Promise.resolve(), thumbGen = 0;
function refreshThumbs() { if (!$('#thumbs').hidden) openThumbs(); }
function openThumbs() {
  const panel = $('#thumbs'), gen = ++thumbGen; panel.innerHTML = ''; panel.hidden = false;
  $('#btnThumbs').classList.add('on');
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return; io.unobserve(en.target);
    const pg = ed.pages[+en.target.dataset.i], cv = en.target.querySelector('canvas');
    thumbChain = thumbChain.then(async () => {
      if (gen !== thumbGen || !pg) return;
      const c = await renderPage(pg, 320 / pg.w); cv.getContext('2d').drawImage(c, 0, 0, cv.width, cv.height);
    }).catch(() => {});
  }), { root: panel, rootMargin: '300px' });
  ed.pages.forEach((pg, i) => {
    const cv = h('canvas'); cv.width = 320; cv.height = Math.round(320 * pg.h / pg.w);
    const b = h('button', { class: 'thumb' + (i === ed.idx ? ' cur' : ''), 'data-i': i, onclick: () => gotoPage(i) }, cv, String(i + 1));
    panel.append(b); io.observe(b);
  });
  const cur = panel.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
}
function closeThumbs() { thumbGen++; $('#thumbs').hidden = true; $('#btnThumbs').classList.remove('on'); }

/* --- otevření a zavření sešitu --- */
async function openNotebook(id) {
  const nb = await DB.get('notebooks', id); if (!nb) return;
  const byId = new Map((await DB.byNb(id)).map(p => [p.id, p]));
  ed.nb = nb; ed.pages = nb.pages.map(pid => byId.get(pid)).filter(Boolean);
  if (!ed.pages.length) { const n = { id: uid(), nb: id, ...A4, bg: { type: nb.paper || 'lined' }, items: [] }; ed.pages.push(n); nb.pages = [n.id]; await DB.put('pages', n); await DB.put('notebooks', nb); }
  $('#library').hidden = true; $('#editor').hidden = false; closeThumbs();
  if (!(history.state && history.state.nb)) history.pushState({ nb: 1 }, '');
  $('#nbTitle').textContent = nb.name;
  renderToolbar(); resizeStage(); gotoPage(nb.last || 0);
}
async function closeNotebook() {
  commitText(); cancelAct(); clearSel(); closeThumbs(); await flush();
  ed.nb = null; ed.page = null; ed.pages = []; ed.bmp = null;
  $('#editor').hidden = true; $('#library').hidden = false; renderLibrary();
}
function editorMenu(anchor) {
  const isPdf = ed.page.bg.type === 'pdf';
  showMenu(anchor, [
    { label: 'Vložit obrázek nebo fotku', fn: insertImage },
    { label: 'Vložit PDF za tuto stránku', fn: insertPdfHere },
    null,
    { label: 'Přidat stránku', fn: addPage },
    { label: 'Duplikovat stránku', fn: duplicatePage },
    { label: 'Posunout stránku dopředu', fn: () => movePage(-1) },
    { label: 'Posunout stránku dozadu', fn: () => movePage(1) },
    !isPdf && { label: 'Změnit papír…', fn: () => showMenu(anchor, PAPERS.map(([k, l]) => ({ label: (ed.page.bg.type === k ? '✓ ' : '') + l, fn: () => setPaper(k) }))) },
    { label: 'Smazat stránku', danger: true, fn: deletePage },
    null,
    { label: 'Přizpůsobit na šířku', fn: fitView },
    { label: (prefs.scratch ? '✓ ' : '') + 'Mazat škrtnutím', fn: () => { prefs.scratch = !prefs.scratch; savePrefs(); toast(prefs.scratch ? 'Škrtnutí teď maže.' : 'Mazání škrtnutím je vypnuté.'); } },
    { label: 'Uložit sešit jako PDF', fn: () => exportPdf(ed.nb) },
    { label: 'Nápověda', fn: showHelp },
  ].filter(x => x !== false));
}

/* ====================================================================== */
/* Start                                                                  */
/* ====================================================================== */
function wire() {
  const set = (id, name) => ($(id).innerHTML = icon(name));
  set('#btnLibMore', 'more'); set('#btnBack', 'back'); set('#btnUndo', 'undo'); set('#btnRedo', 'redo'); set('#btnFinger', 'finger');
  set('#btnThumbs', 'pages'); set('#btnMore', 'more'); set('#pgPrev', 'back'); set('#pgNext', 'next'); set('#pgAdd', 'plus');

  $('#btnNew').onclick = newNotebook;
  $('#btnImport').onclick = async () => importPdfAsNotebook(await pickFile($('#filePdf')));
  $('#search').oninput = renderLibrary;
  $('#btnLibMore').onclick = e => showMenu(e.currentTarget, [
    { label: 'Nová složka', fn: async () => {
      const v = await formDialog({ title: 'Nová složka', ok: 'Vytvořit', fields: [{ key: 'name', label: 'Název', type: 'text' }] });
      if (v && v.name) { await useGroup(v.name); renderLibrary(); }
    } },
    null,
    { label: 'Zálohovat všechny sešity', fn: backup },
    { label: 'Obnovit ze zálohy', fn: async () => restore(await pickFile($('#fileBackup'))) },
    null,
    { label: 'Nápověda', fn: showHelp },
  ]);

  $('#btnBack').onclick = () => (history.state && history.state.nb ? history.back() : closeNotebook());
  addEventListener('popstate', () => { closeMenu(); if (ed.nb) closeNotebook(); });
  $('#nbTitle').onclick = async () => { if (await editNotebook(ed.nb)) $('#nbTitle').textContent = ed.nb.name; };
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnFinger').onclick = () => { prefs.finger = !prefs.finger; savePrefs(); renderToolbar(); toast(prefs.finger ? 'Prst teď kreslí. Posouvejte dvěma prsty.' : 'Prst posouvá stránku, píše jen pero.'); };
  $('#btnThumbs').onclick = () => ($('#thumbs').hidden ? openThumbs() : closeThumbs());
  $('#btnMore').onclick = e => { commitText(); editorMenu(e.currentTarget); };
  $('#pgPrev').onclick = () => gotoPage(ed.idx - 1);
  $('#pgNext').onclick = () => gotoPage(ed.idx + 1);
  $('#pgNum').onclick = () => ($('#thumbs').hidden ? openThumbs() : closeThumbs());
  $('#pgAdd').onclick = addPage;
  $('#selDel').onclick = () => { if (!ed.sel) return; const ids = ed.sel.ids; clearSel(); commit(ed.page.items.filter(i => !ids.has(i.id))); };
  $('#selDup').onclick = () => {
    if (!ed.sel) return;
    const copies = ed.page.items.filter(i => ed.sel.ids.has(i.id)).map(i => ({ ...transformItem(i, 14, 14, 1, 0, 0), id: uid() }));
    commit([...ed.page.items, ...copies]); setSel(new Set(copies.map(c => c.id)));
  };

  new ResizeObserver(resizeStage).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { commitText(); flush(); } });
  addEventListener('pagehide', flush);
  addEventListener('keydown', e => {
    if (!ed.page || e.target.matches('input,textarea,select') || $('.overlay')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') gotoPage(ed.idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') gotoPage(ed.idx - 1);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel) $('#selDel').click();
  });
}

(async function init() {
  wire();
  if (history.state && history.state.nb) history.replaceState(null, '');
  try { await DB.open(); } catch (e) { console.error(e); document.body.textContent = 'Aplikaci se nepodařilo spustit: prohlížeč nepovolil ukládání dat. Zkuste vypnout anonymní režim.'; return; }
  const g = await DB.get('meta', 'groups');
  if (g) state.groups = g.value; else { state.groups = ['ČVUT MÚVS', 'Základní škola']; await saveGroups(); }
  await renderLibrary();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

// pro ladění
window.__app = { ed, view, prefs, DB, isScribble, importPdfAsNotebook, pdfToPages, insertPages };
